// Grade calculation engine. 1:1 port of calc/src/index.ts; must pass spec/calc-cases.json.
import Foundation

public struct Scale: Codable, Equatable, Hashable, Sendable {
    public var min: Double
    public var max: Double
    public var pass: Double

    public init(min: Double, max: Double, pass: Double) {
        self.min = min
        self.max = max
        self.pass = pass
    }

    public static let `default` = Scale(min: 1, max: 7, pass: 4)

    public var isValid: Bool {
        min.isFinite && max.isFinite && pass.isFinite && min < max && pass > min && pass <= max
    }
}

public struct Evaluation: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    /// Percentage weight relative to its siblings.
    public var weight: Double
    /// Entered grade, or nil if pending. Ignored for groups with children.
    public var grade: Double?
    public var children: [Evaluation]?

    public init(id: String = UUID().uuidString, name: String, weight: Double, grade: Double? = nil, children: [Evaluation]? = nil) {
        self.id = id
        self.name = name
        self.weight = weight
        self.grade = grade
        self.children = children
    }

    public var isGroup: Bool { !(children ?? []).isEmpty }

    enum CodingKeys: String, CodingKey { case id, name, weight, grade, children }

    // The server requires `grade` to be present (null when pending).
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(weight, forKey: .weight)
        try c.encode(grade, forKey: .grade)
        try c.encodeIfPresent(children, forKey: .children)
    }
}

public protocol ClassInput {
    var examWeight: Double { get }
    var minExamGrade: Double? { get }
    /// Minimum average of the non-exam evaluations needed to take the exam (nota de presentación); nil = off.
    var minPresentationGrade: Double? { get }
    var examGrade: Double? { get }
    var items: [Evaluation] { get }
}

public extension ClassInput {
    var minPresentationGrade: Double? { nil }
}

public enum Status: String, Codable, Sendable {
    case passed, failed, needed, secured, impossible, barred
}

public enum WarningCode: String, Sendable {
    case weightSum = "WEIGHT_SUM"
    case gradeOutOfRange = "GRADE_OUT_OF_RANGE"
    case minExamOutOfRange = "MIN_EXAM_OUT_OF_RANGE"
    case minPresentationOutOfRange = "MIN_PRESENTATION_OUT_OF_RANGE"
}

public struct CalcWarning: Equatable, Hashable, Sendable {
    public let code: WarningCode
    /// nil for the top level / the exam.
    public let id: String?
}

public struct NodeResult: Equatable, Sendable {
    public let grade: Double
    /// True when the grade is (partly) projected from needed grades.
    public let pending: Bool
}

public struct CalcResult: Equatable, Sendable {
    public let status: Status
    /// Projected final grade, using needed grades for pending evaluations.
    public let finalGrade: Double
    /// Grade needed on every pending non-exam evaluation, or nil if none pending.
    public let neededGrade: Double?
    /// Grade needed on the exam, or nil if the exam is graded.
    public let examNeeded: Double?
    public let examGrade: Double
    /// Grade needed on every pending non-exam evaluation to be allowed to take the exam, or nil if not checked.
    public let presentationNeeded: Double?
    /// Actual or projected average of the non-exam evaluations, or nil if the presentation check doesn't apply.
    public let presentationGrade: Double?
    public let nodes: [String: NodeResult]
    public let warnings: [CalcWarning]
}

private let eps = 1e-9

private struct Leaf {
    let weight: Double
    let grade: Double?
}

private func collectLeaves(
    _ items: [Evaluation], factor: Double, levelSum: Double,
    leaves: inout [Leaf], scale: Scale, warnings: inout [CalcWarning]
) {
    for item in items {
        let w = levelSum > 0 ? factor * item.weight / levelSum : 0
        if item.isGroup, let children = item.children {
            let childSum = children.reduce(0) { $0 + $1.weight }
            if abs(childSum - 100) > eps { warnings.append(CalcWarning(code: .weightSum, id: item.id)) }
            collectLeaves(children, factor: w, levelSum: childSum, leaves: &leaves, scale: scale, warnings: &warnings)
        } else {
            if let g = item.grade, g < scale.min - eps || g > scale.max + eps {
                warnings.append(CalcWarning(code: .gradeOutOfRange, id: item.id))
            }
            leaves.append(Leaf(weight: w, grade: item.grade))
        }
    }
}

private func projectNodes(_ items: [Evaluation], leafGrade: Double, nodes: inout [String: NodeResult]) {
    for item in items {
        if item.isGroup, let children = item.children {
            projectNodes(children, leafGrade: leafGrade, nodes: &nodes)
            let childSum = children.reduce(0) { $0 + $1.weight }
            var grade = 0.0
            var pending = false
            for c in children {
                guard let r = nodes[c.id] else { continue }
                grade += childSum > 0 ? r.grade * c.weight / childSum : 0
                pending = pending || r.pending
            }
            nodes[item.id] = NodeResult(grade: grade, pending: pending)
        } else if let g = item.grade {
            nodes[item.id] = NodeResult(grade: g, pending: false)
        } else {
            nodes[item.id] = NodeResult(grade: leafGrade, pending: true)
        }
    }
}

private func clamp(_ x: Double, _ lo: Double, _ hi: Double) -> Double { Swift.min(Swift.max(x, lo), hi) }

public func calculate(_ cls: ClassInput, scale: Scale = .default) -> CalcResult {
    var warnings: [CalcWarning] = []
    let topSum = cls.items.reduce(0) { $0 + $1.weight } + cls.examWeight
    if abs(topSum - 100) > eps { warnings.append(CalcWarning(code: .weightSum, id: nil)) }

    var leaves: [Leaf] = []
    collectLeaves(cls.items, factor: 1, levelSum: topSum, leaves: &leaves, scale: scale, warnings: &warnings)
    let examWeight = topSum > 0 ? cls.examWeight / topSum : 0
    if let g = cls.examGrade, g < scale.min - eps || g > scale.max + eps {
        warnings.append(CalcWarning(code: .gradeOutOfRange, id: nil))
    }
    let minExam = cls.minExamGrade
    if let m = minExam, m < scale.min - eps || m > scale.max + eps {
        warnings.append(CalcWarning(code: .minExamOutOfRange, id: nil))
    }
    let minPres = cls.minPresentationGrade
    if let m = minPres, m < scale.min - eps || m > scale.max + eps {
        warnings.append(CalcWarning(code: .minPresentationOutOfRange, id: nil))
    }

    var known = 0.0
    var pendingWeight = 0.0
    var hasPendingItems = false
    var itemWeight = 0.0
    for l in leaves {
        itemWeight += l.weight
        if let g = l.grade {
            known += g * l.weight
        } else {
            pendingWeight += l.weight
            hasPendingItems = true
        }
    }
    let examPending = cls.examGrade == nil
    if let g = cls.examGrade { known += g * examWeight }
    var examFailed = false
    if let g = cls.examGrade, let m = minExam, g < m - eps { examFailed = true }
    let knownItems = known - (cls.examGrade ?? 0) * examWeight
    // The presentation check only matters while the exam is still ahead.
    let presentationApplies = minPres != nil && examPending && examWeight > eps && itemWeight > eps

    var neededGrade: Double?
    var examNeeded: Double?
    let totalPending = pendingWeight + (examPending ? examWeight : 0)

    if hasPendingItems || examPending {
        if totalPending > eps {
            let x = (scale.pass - known) / totalPending
            if examPending, let m = minExam, x < m - eps {
                examNeeded = m
                if hasPendingItems {
                    neededGrade = pendingWeight > eps ? (scale.pass - known - m * examWeight) / pendingWeight : scale.min
                }
            } else {
                if examPending { examNeeded = x }
                if hasPendingItems { neededGrade = x }
            }
        } else {
            // Pending evaluations carry no weight: they cannot change the outcome.
            if examPending { examNeeded = minExam ?? scale.min }
            if hasPendingItems { neededGrade = scale.min }
        }
        if let n = neededGrade, n < scale.min { neededGrade = scale.min }
        if let n = examNeeded, n < scale.min { examNeeded = scale.min }
    }

    var presentationNeeded: Double?
    var barred = false
    if presentationApplies, let m = minPres {
        if !hasPendingItems || pendingWeight <= eps {
            barred = knownItems / itemWeight < m - eps
        } else {
            let p = Swift.max(scale.min, (m * itemWeight - knownItems) / pendingWeight)
            presentationNeeded = p
            if p > scale.max + eps {
                barred = true
            } else if let n = neededGrade, p > n + eps {
                // Qualifying for the exam takes more than passing would: aim for that, and need less on the exam.
                neededGrade = p
                examNeeded = Swift.max((scale.pass - known - pendingWeight * p) / examWeight, minExam ?? scale.min, scale.min)
            }
        }
    }

    let projectedLeaf = neededGrade.map { clamp($0, scale.min, scale.max) } ?? scale.min
    let projectedExam = cls.examGrade ?? clamp(examNeeded ?? scale.min, scale.min, scale.max)

    var nodes: [String: NodeResult] = [:]
    projectNodes(cls.items, leafGrade: projectedLeaf, nodes: &nodes)

    var finalGrade = projectedExam * examWeight
    for l in leaves { finalGrade += (l.grade ?? projectedLeaf) * l.weight }

    let presentationGrade = presentationApplies
        ? (knownItems + (hasPendingItems ? pendingWeight * projectedLeaf : 0)) / itemWeight
        : nil

    let status: Status
    if examFailed {
        status = .failed
    } else if barred {
        status = .barred
    } else if !hasPendingItems && !examPending {
        status = finalGrade >= scale.pass - eps ? .passed : .failed
    } else {
        let values = [neededGrade, examNeeded].compactMap { $0 }
        if values.contains(where: { $0 > scale.max + eps }) {
            status = .impossible
        } else if values.allSatisfy({ $0 <= scale.min + eps }) {
            status = .secured
        } else {
            status = .needed
        }
    }

    return CalcResult(
        status: status, finalGrade: finalGrade, neededGrade: neededGrade, examNeeded: examNeeded,
        examGrade: projectedExam, presentationNeeded: presentationNeeded, presentationGrade: presentationGrade,
        nodes: nodes, warnings: warnings
    )
}

/// Round a needed grade up to one decimal, so reaching the shown value is always enough.
public func roundNeeded(_ x: Double) -> Double { (x * 10 - 1e-6).rounded(.up) / 10 }

/// Round an obtained/projected grade to one decimal (half up).
public func roundGrade(_ x: Double) -> Double { (x * 10 + 0.5 + 1e-6).rounded(.down) / 10 }
