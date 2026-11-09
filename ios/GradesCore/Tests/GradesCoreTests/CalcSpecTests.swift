import Foundation
import Testing
@testable import GradesCore

private struct SpecFile: Decodable {
    let cases: [SpecCase]
}

private struct SpecClass: Decodable, ClassInput {
    let examWeight: Double
    let minExamGrade: Double?
    let examGrade: Double?
    let items: [Evaluation]
}

private struct SpecWarning: Decodable {
    let code: String
    let id: String?
}

private struct SpecExpected: Decodable {
    let status: String?
    let finalGrade: Double?
    /// Outer nil: key absent (not checked). Inner nil: expected null.
    let neededGrade: Double??
    let examNeeded: Double??
    let nodes: [String: Double]?
    let warnings: [SpecWarning]?

    enum CodingKeys: String, CodingKey { case status, finalGrade, neededGrade, examNeeded, nodes, warnings }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        finalGrade = try c.decodeIfPresent(Double.self, forKey: .finalGrade)
        neededGrade = c.contains(.neededGrade) ? .some(try c.decode(Double?.self, forKey: .neededGrade)) : .none
        examNeeded = c.contains(.examNeeded) ? .some(try c.decode(Double?.self, forKey: .examNeeded)) : .none
        nodes = try c.decodeIfPresent([String: Double].self, forKey: .nodes)
        warnings = try c.decodeIfPresent([SpecWarning].self, forKey: .warnings)
    }
}

private struct SpecCase: Decodable {
    let name: String
    let scale: Scale
    let `class`: SpecClass
    let expected: SpecExpected
}

private func loadSpec() throws -> SpecFile {
    // ios/GradesCore/Tests/GradesCoreTests/CalcSpecTests.swift -> repo root
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("spec/calc-cases.json"))
    return try JSONDecoder().decode(SpecFile.self, from: data)
}

private func close(_ actual: Double?, _ expected: Double?, _ label: String) {
    if let expected {
        guard let actual else {
            Issue.record("\(label): expected \(expected), got nil")
            return
        }
        #expect(abs(actual - expected) < 1e-6, "\(label): \(actual) vs \(expected)")
    } else {
        #expect(actual == nil, "\(label): expected nil, got \(String(describing: actual))")
    }
}

@Test func specCases() throws {
    let spec = try loadSpec()
    #expect(spec.cases.count >= 20)
    for c in spec.cases {
        let r = calculate(c.class, scale: c.scale)
        let e = c.expected
        if let s = e.status { #expect(r.status.rawValue == s, "\(c.name)") }
        if let f = e.finalGrade { close(r.finalGrade, f, "\(c.name) finalGrade") }
        if let n = e.neededGrade { close(r.neededGrade, n, "\(c.name) neededGrade") }
        if let n = e.examNeeded { close(r.examNeeded, n, "\(c.name) examNeeded") }
        for (id, g) in e.nodes ?? [:] { close(r.nodes[id]?.grade, g, "\(c.name) nodes.\(id)") }
        if let ws = e.warnings {
            let want = ws.map { "\($0.code):\($0.id ?? "nil")" }.sorted()
            let got = r.warnings.map { "\($0.code.rawValue):\($0.id ?? "nil")" }.sorted()
            #expect(want == got, "\(c.name)")
        }
    }
}

@Test func rounding() {
    #expect(roundNeeded(3.4615) == 3.5)
    #expect(roundNeeded(3.0000000001) == 3.0)
    #expect(roundGrade(4.45) == 4.5)
    #expect(roundGrade(3.94) == 3.9)
}

@Test func encodesPendingGradeAsNull() throws {
    let data = try JSONEncoder().encode(Evaluation(id: "a", name: "A", weight: 50))
    let json = String(decoding: data, as: UTF8.self)
    #expect(json.contains("\"grade\":null"))
    #expect(!json.contains("children"))
}

@Test func treeAndParsing() {
    let items = [Evaluation(id: "a", name: "A", weight: 40, grade: 6)]
    let grouped = items.addChild("a") { "E\($0)" }
    #expect(grouped[0].grade == nil)
    #expect(grouped[0].children?.count == 2)
    #expect(grouped[0].children?[0].grade == 6)
    let more = grouped.addChild("a") { "E\($0)" }
    #expect(more[0].children?.count == 3)
    #expect(more.removeNode(more[0].children![2].id)[0].children?.count == 2)
    #expect(more.nodeCount == 4)

    #expect(parseNumber("5,5") == .value(5.5))
    #expect(parseNumber("5.5") == .value(5.5))
    #expect(parseNumber("") == .empty)
    #expect(parseNumber("abc") == .invalid)
}

@Test func decodesServerClass() throws {
    let json = #"{"id":"1","name":"X","examWeight":30,"minExamGrade":null,"examGrade":null,"items":[{"id":"a","name":"A","weight":70,"grade":null,"children":null}],"updatedAt":1792827980468,"deleted":false}"#
    let cls = try JSONDecoder().decode(StoredClass.self, from: Data(json.utf8))
    #expect(cls.items.count == 1)
    #expect(cls.updatedAt == 1792827980468)
    let body = String(decoding: try JSONEncoder().encode(cls), as: UTF8.self)
    #expect(body.contains("\"minExamGrade\":null"))
}

private struct MergeEntry: Decodable {
    let id: String
    let updatedAt: Int64
    let deleted: Bool
    let name: String
}

private struct MergeCase: Decodable {
    let name: String
    let local: [MergeEntry]
    let remote: [MergeEntry]
    let expected: [[MergeValue]]
}

private enum MergeValue: Decodable, Equatable {
    case string(String), number(Int64), bool(Bool)
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Int64.self) { self = .number(n) }
        else { self = .string(try c.decode(String.self)) }
    }
}

@Test func mergeCases() throws {
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    struct File: Decodable { let cases: [MergeCase] }
    let file = try JSONDecoder().decode(File.self, from: Data(contentsOf: root.appendingPathComponent("spec/merge-cases.json")))
    func stored(_ e: MergeEntry) -> StoredClass {
        StoredClass(id: e.id, name: e.name, examWeight: 30, minExamGrade: nil, updatedAt: e.updatedAt, deleted: e.deleted)
    }
    for c in file.cases {
        let merged = mergeClasses(c.local.map(stored), c.remote.map(stored))
        let got = merged.map { [MergeValue.string($0.id), .number($0.updatedAt), .bool($0.deleted), .string($0.name)] }
        #expect(got == c.expected, "\(c.name)")
    }
}

@Test func gradeInputCases() throws {
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    struct Case: Decodable { let max: Double; let input: String; let expected: String }
    struct File: Decodable { let cases: [Case] }
    let file = try JSONDecoder().decode(File.self, from: Data(contentsOf: root.appendingPathComponent("spec/grade-input-cases.json")))
    for c in file.cases {
        #expect(autoDecimal(c.input, max: c.max) == c.expected, "autoDecimal(\"\(c.input)\", \(c.max))")
    }
}
