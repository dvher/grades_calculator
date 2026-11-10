import Foundation

/// A class as stored on the device and exchanged with the sync server.
public struct StoredClass: Codable, Equatable, Identifiable, Sendable, ClassInput {
    /// UUID generated on the device.
    public var id: String
    public var name: String
    public var examWeight: Double
    public var minExamGrade: Double?
    /// nil turns the check off; `StoredClass.presentationUnset` (field missing in older data) is replaced on load.
    public var minPresentationGrade: Double?
    public var examGrade: Double?
    public var items: [Evaluation]
    /// Last local modification, ms since epoch. The newest version wins when syncing.
    public var updatedAt: Int64
    /// Deleted classes are kept as tombstones so the deletion syncs to other devices.
    public var deleted: Bool

    public init(
        id: String = UUID().uuidString.lowercased(), name: String, examWeight: Double, minExamGrade: Double?,
        minPresentationGrade: Double? = nil, examGrade: Double? = nil, items: [Evaluation] = [], updatedAt: Int64, deleted: Bool = false
    ) {
        self.id = id
        self.name = name
        self.examWeight = examWeight
        self.minExamGrade = minExamGrade
        self.minPresentationGrade = minPresentationGrade
        self.examGrade = examGrade
        self.items = items
        self.updatedAt = updatedAt
        self.deleted = deleted
    }

    enum CodingKeys: String, CodingKey { case id, name, examWeight, minExamGrade, minPresentationGrade, examGrade, items, updatedAt, deleted }

    /// Marks a class saved before the presentation check existed; see `withPresentationDefault`.
    public static let presentationUnset = Double.nan

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        examWeight = try c.decode(Double.self, forKey: .examWeight)
        minExamGrade = try c.decodeIfPresent(Double.self, forKey: .minExamGrade)
        minPresentationGrade = c.contains(.minPresentationGrade)
            ? try c.decode(Double?.self, forKey: .minPresentationGrade)
            : StoredClass.presentationUnset
        examGrade = try c.decodeIfPresent(Double.self, forKey: .examGrade)
        items = try c.decodeIfPresent([Evaluation].self, forKey: .items) ?? []
        updatedAt = try c.decodeIfPresent(Int64.self, forKey: .updatedAt) ?? 0
        deleted = try c.decodeIfPresent(Bool.self, forKey: .deleted) ?? false
    }

    // The server requires nullable fields to be present.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(examWeight, forKey: .examWeight)
        try c.encode(minExamGrade, forKey: .minExamGrade)
        try c.encode(minPresentationGrade, forKey: .minPresentationGrade)
        try c.encode(examGrade, forKey: .examGrade)
        try c.encode(items, forKey: .items)
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(deleted, forKey: .deleted)
    }
}

public extension Array where Element == StoredClass {
    /// Classes saved before the presentation check existed get it switched on at the passing grade.
    func withPresentationDefault(pass: Double) -> [StoredClass] {
        map { c in
            guard c.minPresentationGrade?.isNaN == true else { return c }
            var c = c
            c.minPresentationGrade = pass
            return c
        }
    }
}

public struct SyncedSettings: Codable, Equatable, Sendable {
    public var scale: Scale
    public var scaleUpdatedAt: Int64

    public init(scale: Scale, scaleUpdatedAt: Int64) {
        self.scale = scale
        self.scaleUpdatedAt = scaleUpdatedAt
    }
}

public struct SyncAccount: Codable, Equatable, Sendable {
    public var serverURL: String
    public var email: String
    public var token: String
    public var lastSyncAt: Date?

    public init(serverURL: String, email: String, token: String, lastSyncAt: Date? = nil) {
        self.serverURL = serverURL
        self.email = email
        self.token = token
        self.lastSyncAt = lastSyncAt
    }
}

/// Everything the app stores, kept in a JSON file on the device.
public struct AppData: Codable, Equatable, Sendable {
    public var classes: [StoredClass] = []
    public var scale: Scale = .default
    public var scaleUpdatedAt: Int64 = 0
    public var account: SyncAccount?

    public init() {}
}

/// Export/import file format, shared with the web and Android apps.
public struct BackupFile: Codable, Sendable {
    public var app = "grades-calculator"
    public var version = 1
    public var exportedAt: String
    public var scale: Scale
    public var classes: [StoredClass]

    public init(exportedAt: String, scale: Scale, classes: [StoredClass]) {
        self.exportedAt = exportedAt
        self.scale = scale
        self.classes = classes
    }

    public var isValid: Bool { app == "grades-calculator" && scale.isValid }
}

/// `code` is a stable server error code (e.g. EMAIL_TAKEN) or NETWORK / UNKNOWN.
public struct APIError: Error, Equatable, Sendable {
    public let code: String
    public let status: Int

    public init(code: String, status: Int) {
        self.code = code
        self.status = status
    }
}

// MARK: - Sync merge (port of calc/src/sync.ts; must pass spec/merge-cases.json)

/// Per id, keep whichever side has the newer `updatedAt` (ties keep the local copy). Local order first.
public func mergeClasses(_ local: [StoredClass], _ remote: [StoredClass]) -> [StoredClass] {
    var merged: [String: StoredClass] = [:]
    var order: [String] = []
    for c in local {
        if merged[c.id] == nil { order.append(c.id) }
        merged[c.id] = c
    }
    for r in remote {
        if let l = merged[r.id] {
            if r.updatedAt > l.updatedAt { merged[r.id] = r }
        } else {
            order.append(r.id)
            merged[r.id] = r
        }
    }
    return order.compactMap { merged[$0] }
}

// MARK: - Tree editing helpers

extension Array where Element == Evaluation {
    public func mapNode(_ id: String, _ fn: (Evaluation) -> Evaluation) -> [Evaluation] {
        map { e in
            if e.id == id { return fn(e) }
            var copy = e
            if let children = e.children { copy.children = children.mapNode(id, fn) }
            return copy
        }
    }

    public func removeNode(_ id: String) -> [Evaluation] {
        filter { $0.id != id }.map { e in
            var copy = e
            if let children = e.children { copy.children = children.removeNode(id) }
            return copy
        }
    }

    public var nodeCount: Int { reduce(0) { $0 + 1 + ($1.children?.nodeCount ?? 0) } }

    public var weightSum: Double { reduce(0) { $0 + $1.weight } }

    public func findNode(_ id: String) -> Evaluation? {
        for e in self {
            if e.id == id { return e }
            if let found = e.children?.findNode(id) { return found }
        }
        return nil
    }

    /// Adds a sub-evaluation. A plain evaluation becomes a group whose first child keeps its grade.
    public func addChild(_ parentId: String, name: (Int) -> String) -> [Evaluation] {
        mapNode(parentId) { e in
            var copy = e
            if let children = e.children, !children.isEmpty {
                copy.children = children + [Evaluation(name: name(children.count + 1), weight: Swift.max(0, 100 - children.weightSum))]
            } else {
                copy.children = [
                    Evaluation(name: name(1), weight: 50, grade: e.grade),
                    Evaluation(name: name(2), weight: 50),
                ]
            }
            copy.grade = nil
            return copy
        }
    }
}
