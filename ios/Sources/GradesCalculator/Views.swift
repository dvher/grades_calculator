import GradesCore
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Shared

extension Localizer {
    func error(_ code: String) -> String {
        let key = "errors_\(code)"
        let text = t(key)
        return text == key ? t("errors_UNKNOWN") : text
    }

    func status(_ s: Status) -> String { t("status_\(s.rawValue)") }
}

extension Status {
    var color: Color {
        switch self {
        case .passed, .secured: .green
        case .needed: .accentColor
        case .failed, .impossible: .red
        }
    }
}

/// Decimal text field accepting "5,5" or "5.5"; keeps partial input while typing.
struct NumberField: View {
    let label: String
    let value: Double?
    var placeholder: String?
    var range: ClosedRange<Double>?
    /// Grade field: insert the decimal separator automatically based on the range max (e.g. "54" → "5.4").
    var grade = false
    let onChange: (Double?) -> Void

    @Environment(Localizer.self) private var l
    @State private var text = ""

    private var invalid: Bool {
        switch parseNumber(text) {
        case .invalid: true
        case .value(let v): range.map { !$0.contains(v) } ?? false
        case .empty: false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            TextField(placeholder ?? "", text: $text)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(invalid ? Color.red : .clear))
                .onChange(of: text) { _, new in
                    if grade, let range {
                        let formatted = autoDecimal(new, max: range.upperBound)
                            .replacingOccurrences(of: ".", with: l.locale.decimalSeparator ?? ".")
                        if formatted != new {
                            text = formatted
                            return
                        }
                    }
                    switch parseNumber(new) {
                    case .empty: if value != nil { onChange(nil) }
                    case .value(let v): if v != value { onChange(v) }
                    case .invalid: break
                    }
                }
        }
        .onAppear { text = format(value) }
        .onChange(of: value) { _, new in
            if case .value(let v) = parseNumber(text), v == new { return }
            if case .empty = parseNumber(text), new == nil { return }
            text = format(new)
        }
    }

    private func format(_ v: Double?) -> String { v.map { l.number($0, maxDecimals: 4) } ?? "" }
}

// MARK: - Classes

struct ClassesView: View {
    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l
    @State private var showSettings = false
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(l.t("app_name"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { showSettings = true } label: { Image(systemName: "gearshape") }
                            .accessibilityLabel(l.t("settings_title"))
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        switch model.sync {
                        case .syncing: ProgressView()
                        case .error: Button { showSettings = true } label: {
                            Image(systemName: "exclamationmark.icloud").foregroundStyle(.red)
                        }.accessibilityLabel(l.t("sync_failed"))
                        case .idle: EmptyView()
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { model.createClass(name: l.t("classes_new_name")) } label: { Image(systemName: "plus") }
                            .accessibilityLabel(l.t("classes_new"))
                    }
                }
                .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    @ViewBuilder private var content: some View {
        if !model.classes.isEmpty, let selected = model.selected {
            let classes = model.classes
            let result = calculate(selected, scale: model.scale)
            Form {
                Section {
                    Picker(l.t("classes_select"), selection: Binding(
                        get: { selected.id },
                        set: { model.selectedID = $0 }
                    )) {
                        ForEach(classes) { c in
                            let r = calculate(c, scale: model.scale)
                            Text(verbatim: "\(c.name) · \(l.status(r.status)) · \(l.grade(r.finalGrade))").tag(c.id)
                        }
                    }
                }
                ResultsSection(cls: selected, result: result)
                Section {
                    HStack {
                        TextField(l.t("classes_name"), text: Binding(
                            get: { selected.name },
                            set: { name in model.edit { $0.name = String(name.prefix(100)) } }
                        ))
                        .font(.headline)
                        Button(role: .destructive) { confirmDelete = true } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(l.t("classes_delete"))
                    }
                }
                Section {
                    EvaluationRows(items: selected.items, result: result, depth: 1)
                    Button {
                        let topSum = selected.items.weightSum + selected.examWeight
                        model.editItems { $0 + [Evaluation(name: l.t("editor_default_name", $0.nodeCount + 1), weight: max(0, 100 - topSum))] }
                    } label: {
                        Label(l.t("editor_add_evaluation"), systemImage: "plus.circle")
                    }
                } header: {
                    Text(l.t("editor_evaluations"))
                }
                ExamSection(cls: selected, result: result)
            }
            .scrollDismissesKeyboard(.interactively)
            .confirmationDialog(
                l.t("classes_confirm_delete", selected.name),
                isPresented: $confirmDelete,
                titleVisibility: .visible
            ) {
                Button(l.t("classes_delete"), role: .destructive) { model.deleteSelected() }
                Button(l.t("cancel"), role: .cancel) {}
            }
        } else {
            ContentUnavailableView {
                Label(l.t("classes_new"), systemImage: "graduationcap")
            } description: {
                Text(l.t("classes_empty"))
            } actions: {
                Button(l.t("classes_new")) { model.createClass(name: l.t("classes_new_name")) }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

struct WeightSumText: View {
    let sum: Double
    @Environment(Localizer.self) private var l

    var body: some View {
        let ok = abs(sum - 100) < 1e-9
        Text(ok ? l.t("editor_weight_sum_ok") : l.t("editor_weight_sum", l.number(sum)))
            .font(.caption)
            .foregroundStyle(ok ? Color.secondary : Color.orange)
    }
}

struct EvaluationRows: View {
    let items: [Evaluation]
    let result: CalcResult
    let depth: Int

    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l

    var body: some View {
        ForEach(items) { e in
            EvaluationRow(evaluation: e, result: result, depth: depth)
            if e.isGroup, let children = e.children {
                EvaluationRows(items: children, result: result, depth: depth + 1)
                WeightSumText(sum: children.weightSum)
                    .padding(.leading, CGFloat(depth) * 16)
            }
        }
    }
}

struct EvaluationRow: View {
    let evaluation: Evaluation
    let result: CalcResult
    let depth: Int

    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l

    var body: some View {
        let e = evaluation
        let node = result.nodes[e.id]
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                TextField(l.t("editor_name"), text: Binding(
                    get: { e.name },
                    set: { name in model.editItems { $0.mapNode(e.id) { var n = $0; n.name = String(name.prefix(100)); return n } } }
                ))
                .font(depth == 1 ? .body.weight(.semibold) : .body)
                if depth < 5 {
                    Button {
                        model.editItems { $0.addChild(e.id) { l.t("editor_default_name", $0) } }
                    } label: { Image(systemName: "plus.square.on.square") }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(l.t("editor_add_sub"))
                }
                Button(role: .destructive) {
                    model.editItems { $0.removeNode(e.id) }
                } label: { Image(systemName: "xmark.circle") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(l.t("editor_remove"))
            }
            HStack(alignment: .bottom, spacing: 12) {
                NumberField(label: l.t("editor_weight"), value: e.weight, range: 0...100) { w in
                    model.editItems { $0.mapNode(e.id) { var n = $0; n.weight = w ?? 0; return n } }
                }
                if e.isGroup {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(l.t("editor_group_grade")).font(.caption).foregroundStyle(.secondary)
                        Text(node.map { l.grade($0.grade) } ?? "–")
                            .font(.title3.bold())
                            .italic(node?.pending == true)
                            .foregroundStyle(node?.pending == true ? Color.accentColor : .primary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    NumberField(
                        label: l.t("editor_grade"),
                        value: e.grade,
                        placeholder: e.grade == nil
                            ? result.neededGrade.map { l.t("results_need", l.needed($0)) } ?? l.t("editor_pending")
                            : nil,
                        range: model.scale.min...model.scale.max,
                        grade: true
                    ) { g in
                        model.editItems { $0.mapNode(e.id) { var n = $0; n.grade = g; return n } }
                    }
                }
            }
        }
        .padding(.leading, CGFloat(depth - 1) * 16)
    }
}

struct ExamSection: View {
    let cls: StoredClass
    let result: CalcResult

    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l

    var body: some View {
        let range = model.scale.min...model.scale.max
        Section {
            NumberField(label: l.t("editor_exam_weight"), value: cls.examWeight, range: 0...100) { v in
                model.edit { $0.examWeight = v ?? 0 }
            }
            NumberField(label: l.t("editor_min_exam_grade"), value: cls.minExamGrade, placeholder: l.t("editor_none"), range: range, grade: true) { v in
                model.edit { $0.minExamGrade = v }
            }
            NumberField(
                label: l.t("editor_exam_grade"),
                value: cls.examGrade,
                placeholder: result.examNeeded.map { l.t("results_need", l.needed($0)) } ?? l.t("editor_pending"),
                range: range,
                grade: true
            ) { v in
                model.edit { $0.examGrade = v }
            }
        } header: {
            Text(l.t("editor_exam"))
        } footer: {
            WeightSumText(sum: cls.items.weightSum + cls.examWeight)
        }
    }
}

struct ResultsSection: View {
    let cls: StoredClass
    let result: CalcResult

    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l

    private var explanation: String {
        if let g = cls.examGrade, let m = cls.minExamGrade, g < m {
            return l.t("results_exam_failed", l.number(m))
        }
        switch result.status {
        case .impossible: return l.t("explain_impossible", l.number(model.scale.max))
        default: return l.t("explain_\(result.status.rawValue)")
        }
    }

    private func warningText(_ w: CalcWarning) -> String {
        let name = w.id.flatMap { cls.items.findNode($0)?.name } ?? l.t("editor_exam")
        let min = l.number(model.scale.min), max = l.number(model.scale.max)
        switch w.code {
        case .weightSum: return w.id == nil ? l.t("warning_weight_sum_top") : l.t("warning_weight_sum_group", name)
        case .gradeOutOfRange: return l.t("warning_grade_out_of_range", name, min, max)
        case .minExamOutOfRange: return l.t("warning_min_exam_out_of_range", min, max)
        }
    }

    var body: some View {
        Section(l.t("results_title")) {
            VStack(alignment: .leading, spacing: 10) {
                Text(l.status(result.status))
                    .font(.headline)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(result.status.color.opacity(0.15), in: Capsule())
                    .foregroundStyle(result.status.color)
                Text(explanation).font(.subheadline).foregroundStyle(.secondary)
                HStack(alignment: .top, spacing: 24) {
                    if let n = result.neededGrade { stat(l.t("results_needed_grade"), l.needed(n)) }
                    if let n = result.examNeeded { stat(l.t("results_exam_needed"), l.needed(n)) }
                    stat(l.t("results_final_grade"), l.grade(result.finalGrade))
                }
                ForEach(Array(result.warnings.enumerated()), id: \.offset) { _, w in
                    Label(warningText(w), systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Text(value).font(.system(size: 30, weight: .heavy, design: .rounded)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Settings


struct BackupDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    var data: Data

    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(Localizer.self) private var l
    @Environment(\.dismiss) private var dismiss
    @AppStorage("language") private var language = ""

    @State private var min: Double?
    @State private var max: Double?
    @State private var pass: Double?
    @State private var scaleMessage: String?
    @State private var serverURL = ""
    @State private var email = ""
    @State private var password = ""
    @State private var exporting = false
    @State private var importing = false
    @State private var exportDoc: BackupDocument?
    @State private var dataMessage: String?
    @State private var loaded = false

    private static let presets: [Scale] = [
        Scale(min: 1, max: 7, pass: 4), Scale(min: 0, max: 10, pass: 5),
        Scale(min: 0, max: 20, pass: 10), Scale(min: 0, max: 100, pass: 60),
    ]

    var body: some View {
        NavigationStack {
            Form {
                scaleSection
                Section(l.t("settings_language")) {
                    Picker(l.t("settings_language"), selection: $language) {
                        Text(l.t("settings_system")).tag("")
                        Text("English").tag("en")
                        Text("Español").tag("es")
                    }
                    .pickerStyle(.segmented)
                }
                syncSection
                backupSection
            }
            .navigationTitle(l.t("settings_title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(l.t("settings_back")) { dismiss() }
                }
            }
            .fileExporter(isPresented: $exporting, document: exportDoc, contentType: .json,
                          defaultFilename: "grades-\(Date().formatted(.iso8601.year().month().day()))") { result in
                if case .success = result { dataMessage = l.t("data_export_done") }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                guard case .success(let url) = result else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                if let raw = try? Data(contentsOf: url), let count = model.importBackup(raw) {
                    dataMessage = l.t("data_import_done", count)
                    loadScale()
                } else {
                    dataMessage = l.t("data_import_failed")
                }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                loadScale()
                serverURL = model.data.account?.serverURL ?? ""
            }
        }
    }

    private func loadScale() {
        min = model.scale.min
        max = model.scale.max
        pass = model.scale.pass
    }

    private var scaleSection: some View {
        Section {
            NumberField(label: l.t("settings_min"), value: min) { min = $0 }
            NumberField(label: l.t("settings_max"), value: max) { max = $0 }
            NumberField(label: l.t("settings_pass"), value: pass) { pass = $0 }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(Self.presets, id: \.self) { p in
                        Button("\(l.number(p.min))–\(l.number(p.max)) (\(l.number(p.pass)))") {
                            min = p.min; max = p.max; pass = p.pass
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            Button(l.t("settings_save")) {
                let ok = model.saveScale(Scale(min: min ?? .nan, max: max ?? .nan, pass: pass ?? .nan))
                scaleMessage = ok ? l.t("settings_saved") : l.t("errors_INVALID_SCALE")
            }
            if let scaleMessage { Text(scaleMessage).font(.footnote) }
        } header: {
            Text(l.t("settings_scale"))
        } footer: {
            Text(l.t("settings_scale_help"))
        }
    }

    @ViewBuilder private var syncSection: some View {
        Section {
            if let account = model.data.account {
                Text(l.t("sync_signed_in_as", account.email, account.serverURL))
                Text(model.sync == .syncing
                     ? l.t("sync_syncing")
                     : l.t("sync_last_synced", account.lastSyncAt?.formatted(.dateTime.locale(l.locale)) ?? l.t("sync_never")))
                    .font(.footnote).foregroundStyle(.secondary)
                if case .error(let code) = model.sync { Text(l.error(code)).foregroundStyle(.red) }
                Button(l.t("sync_now")) { model.syncNow() }.disabled(model.sync == .syncing)
                Button(l.t("sync_sign_out"), role: .destructive) { model.signOut() }
            } else {
                if case .error(let code) = model.sync { Text(l.error(code)).foregroundStyle(.red) }
                TextField(l.t("sync_server"), text: $serverURL, prompt: Text(verbatim: "http://192.168.1.10:3000"))
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField(l.t("auth_email"), text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField(l.t("auth_password"), text: $password)
                if let error = model.signInError { Text(l.error(error)).foregroundStyle(.red) }
                let ready = !model.busy && !serverURL.isEmpty && !email.isEmpty && password.count >= 8
                Button(l.t("auth_login")) {
                    model.signIn(serverURL: serverURL, email: email, password: password, register: false)
                }.disabled(!ready)
                Button(l.t("auth_register")) {
                    model.signIn(serverURL: serverURL, email: email, password: password, register: true)
                }.disabled(!ready)
            }
        } header: {
            Text(l.t("sync_title"))
        } footer: {
            Text(model.data.account == nil ? l.t("sync_help") + " " + l.t("auth_password_hint") : l.t("sync_help"))
        }
    }

    private var backupSection: some View {
        Section {
            Button(l.t("data_export")) {
                exportDoc = (try? JSONEncoder().encode(model.backup())).map(BackupDocument.init(data:))
                exporting = exportDoc != nil
            }
            Button(l.t("data_import")) { importing = true }
            if let dataMessage { Text(dataMessage).font(.footnote) }
        } header: {
            Text(l.t("data_title"))
        } footer: {
            Text(l.t("data_help"))
        }
    }
}
