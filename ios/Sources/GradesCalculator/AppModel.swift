import Foundation
import GradesCore
import Observation

enum SyncState: Equatable {
    case idle, syncing
    case error(String)
}

@MainActor @Observable
final class AppModel {
    var loading = true
    private(set) var data = AppData()
    var selectedID: String?
    var sync: SyncState = .idle
    var busy = false
    /// Error code from signing in (see errors_* strings).
    var signInError: String?

    @ObservationIgnored private let api = APIClient()
    @ObservationIgnored private var syncTask: Task<Void, Never>?
    @ObservationIgnored private var lastStamp: Int64 = 0
    @ObservationIgnored private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("data.json")
    }()

    var scale: Scale { data.scale }

    /// Classes that are not deleted, in display order.
    var classes: [StoredClass] { data.classes.filter { !$0.deleted } }

    var selected: StoredClass? { classes.first { $0.id == selectedID } ?? classes.first }

    func start() async {
        guard loading else { return }
        if let raw = try? Data(contentsOf: fileURL), let saved = try? JSONDecoder().decode(AppData.self, from: raw) {
            data = saved
        }
        loading = false
        syncNow()
    }

    /// Monotonic timestamp so two quick edits never share an updatedAt.
    private func stamp() -> Int64 {
        lastStamp = max(Int64(Date().timeIntervalSince1970 * 1000), lastStamp + 1)
        return lastStamp
    }

    private func save() {
        guard let raw = try? JSONEncoder().encode(data) else { return }
        try? raw.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Applies a local data change, saves it and schedules a sync if signed in.
    private func change(_ transform: (inout AppData) -> Void) {
        transform(&data)
        save()
        guard data.account != nil else { return }
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .milliseconds(1500))
            if !Task.isCancelled { syncNow() }
        }
    }

    func createClass(name: String) {
        let cls = StoredClass(name: name, examWeight: 30, minExamGrade: scale.pass, updatedAt: stamp())
        change { $0.classes.append(cls) }
        selectedID = cls.id
    }

    func deleteSelected() {
        guard let id = selected?.id else { return }
        let now = stamp()
        change { d in
            if let i = d.classes.firstIndex(where: { $0.id == id }) {
                d.classes[i].deleted = true
                d.classes[i].updatedAt = now
            }
        }
        selectedID = nil
    }

    /// Applies an edit to the selected class.
    func edit(_ transform: (inout StoredClass) -> Void) {
        guard let id = selected?.id else { return }
        let now = stamp()
        change { d in
            if let i = d.classes.firstIndex(where: { $0.id == id }) {
                transform(&d.classes[i])
                d.classes[i].updatedAt = now
            }
        }
    }

    func editItems(_ transform: ([Evaluation]) -> [Evaluation]) {
        edit { $0.items = transform($0.items) }
    }

    /// Returns false if the scale is invalid.
    func saveScale(_ scale: Scale) -> Bool {
        guard scale.isValid else { return false }
        let now = stamp()
        change {
            $0.scale = scale
            $0.scaleUpdatedAt = now
        }
        return true
    }

    // MARK: Sync

    func signIn(serverURL: String, email: String, password: String, register: Bool) {
        busy = true
        signInError = nil
        Task {
            defer { busy = false }
            do {
                let url = serverURL.trimmingCharacters(in: .whitespaces)
                let email = email.trimmingCharacters(in: .whitespaces)
                let res = register
                    ? try await api.register(serverURL: url, email: email, password: password)
                    : try await api.login(serverURL: url, email: email, password: password)
                data.account = SyncAccount(serverURL: url, email: res.user.email, token: res.token)
                save()
                syncNow()
            } catch let e as APIError {
                signInError = e.code
            } catch {
                signInError = "UNKNOWN"
            }
        }
    }

    func signOut() {
        syncTask?.cancel()
        data.account = nil
        sync = .idle
        save()
    }

    func syncNow() {
        guard let account = data.account, sync != .syncing else { return }
        sync = .syncing
        let body = SyncBody(classes: data.classes, settings: SyncedSettings(scale: data.scale, scaleUpdatedAt: data.scaleUpdatedAt))
        Task {
            do {
                let res = try await api.sync(serverURL: account.serverURL, token: account.token, body)
                // Merge into the current data so edits made during the request are kept.
                data.classes = mergeClasses(data.classes, res.classes)
                if res.settings.scaleUpdatedAt > data.scaleUpdatedAt {
                    data.scale = res.settings.scale
                    data.scaleUpdatedAt = res.settings.scaleUpdatedAt
                }
                data.account?.lastSyncAt = Date()
                sync = .idle
                save()
            } catch let e as APIError {
                if e.status == 401 {
                    data.account = nil
                    save()
                }
                sync = .error(e.code)
            } catch {
                sync = .error("UNKNOWN")
            }
        }
    }

    // MARK: Backup

    func backup() -> BackupFile {
        BackupFile(exportedAt: ISO8601DateFormatter().string(from: Date()), scale: data.scale, classes: classes)
    }

    /// Imports a backup; returns the number of classes imported, or nil if the file is invalid.
    func importBackup(_ raw: Data) -> Int? {
        guard let file = try? JSONDecoder().decode(BackupFile.self, from: raw), file.isValid else { return nil }
        // Imported classes count as fresh edits so they win over local copies and deletions.
        let imported = file.classes.map { c -> StoredClass in
            var c = c
            c.deleted = false
            c.updatedAt = stamp()
            return c
        }
        let now = stamp()
        change {
            $0.classes = mergeClasses($0.classes, imported)
            $0.scale = file.scale
            $0.scaleUpdatedAt = now
        }
        return imported.count
    }
}
