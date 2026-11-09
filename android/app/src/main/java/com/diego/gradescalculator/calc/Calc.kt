// Grade calculation engine. 1:1 port of calc/src/index.ts; must pass spec/calc-cases.json.
package com.diego.gradescalculator.calc

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

@Serializable
data class Scale(val min: Double, val max: Double, val pass: Double) {
    val isValid: Boolean get() = min < max && pass > min && pass <= max

    companion object {
        val DEFAULT = Scale(1.0, 7.0, 4.0)
    }
}

@Serializable
data class Evaluation(
    val id: String,
    val name: String,
    /** Percentage weight relative to its siblings. */
    val weight: Double,
    /** Entered grade, or null if pending. Ignored for groups with children. */
    val grade: Double? = null,
    val children: List<Evaluation>? = null,
) {
    val isGroup: Boolean get() = !children.isNullOrEmpty()
}

interface ClassInput {
    val examWeight: Double
    val minExamGrade: Double?
    val examGrade: Double?
    val items: List<Evaluation>
}

@Serializable
enum class Status {
    @SerialName("passed") PASSED,
    @SerialName("failed") FAILED,
    @SerialName("needed") NEEDED,
    @SerialName("secured") SECURED,
    @SerialName("impossible") IMPOSSIBLE,
}

enum class WarningCode { WEIGHT_SUM, GRADE_OUT_OF_RANGE, MIN_EXAM_OUT_OF_RANGE }

/** [id] is null for the top level / the exam. */
data class Warning(val code: WarningCode, val id: String?)

data class NodeResult(val grade: Double, val pending: Boolean)

data class CalcResult(
    val status: Status,
    val finalGrade: Double,
    val neededGrade: Double?,
    val examNeeded: Double?,
    val examGrade: Double,
    val nodes: Map<String, NodeResult>,
    val warnings: List<Warning>,
)

private const val EPS = 1e-9

private class Leaf(val weight: Double, val grade: Double?)

private fun collectLeaves(
    items: List<Evaluation>,
    factor: Double,
    levelSum: Double,
    leaves: MutableList<Leaf>,
    scale: Scale,
    warnings: MutableList<Warning>,
) {
    for (item in items) {
        val w = if (levelSum > 0) factor * item.weight / levelSum else 0.0
        if (item.isGroup) {
            val children = item.children!!
            val childSum = children.sumOf { it.weight }
            if (abs(childSum - 100) > EPS) warnings += Warning(WarningCode.WEIGHT_SUM, item.id)
            collectLeaves(children, w, childSum, leaves, scale, warnings)
        } else {
            val g = item.grade
            if (g != null && (g < scale.min - EPS || g > scale.max + EPS)) {
                warnings += Warning(WarningCode.GRADE_OUT_OF_RANGE, item.id)
            }
            leaves += Leaf(w, g)
        }
    }
}

private fun projectNodes(items: List<Evaluation>, leafGrade: Double, nodes: MutableMap<String, NodeResult>) {
    for (item in items) {
        if (item.isGroup) {
            val children = item.children!!
            projectNodes(children, leafGrade, nodes)
            val childSum = children.sumOf { it.weight }
            var grade = 0.0
            var pending = false
            for (c in children) {
                val r = nodes.getValue(c.id)
                grade += if (childSum > 0) r.grade * c.weight / childSum else 0.0
                pending = pending || r.pending
            }
            nodes[item.id] = NodeResult(grade, pending)
        } else {
            nodes[item.id] = item.grade?.let { NodeResult(it, false) } ?: NodeResult(leafGrade, true)
        }
    }
}

fun calculate(cls: ClassInput, scale: Scale = Scale.DEFAULT): CalcResult {
    val warnings = mutableListOf<Warning>()
    val topSum = cls.items.sumOf { it.weight } + cls.examWeight
    if (abs(topSum - 100) > EPS) warnings += Warning(WarningCode.WEIGHT_SUM, null)

    val leaves = mutableListOf<Leaf>()
    collectLeaves(cls.items, 1.0, topSum, leaves, scale, warnings)
    val examWeight = if (topSum > 0) cls.examWeight / topSum else 0.0
    val examGrade = cls.examGrade
    if (examGrade != null && (examGrade < scale.min - EPS || examGrade > scale.max + EPS)) {
        warnings += Warning(WarningCode.GRADE_OUT_OF_RANGE, null)
    }
    val minExam = cls.minExamGrade
    if (minExam != null && (minExam < scale.min - EPS || minExam > scale.max + EPS)) {
        warnings += Warning(WarningCode.MIN_EXAM_OUT_OF_RANGE, null)
    }

    var known = 0.0
    var pendingWeight = 0.0
    var hasPendingItems = false
    for (l in leaves) {
        if (l.grade != null) known += l.grade * l.weight
        else {
            pendingWeight += l.weight
            hasPendingItems = true
        }
    }
    val examPending = examGrade == null
    if (examGrade != null) known += examGrade * examWeight
    val examFailed = examGrade != null && minExam != null && examGrade < minExam - EPS

    var neededGrade: Double? = null
    var examNeeded: Double? = null
    val totalPending = pendingWeight + if (examPending) examWeight else 0.0

    if (hasPendingItems || examPending) {
        if (totalPending > EPS) {
            val x = (scale.pass - known) / totalPending
            if (examPending && minExam != null && x < minExam - EPS) {
                examNeeded = minExam
                if (hasPendingItems) {
                    neededGrade = if (pendingWeight > EPS) {
                        (scale.pass - known - minExam * examWeight) / pendingWeight
                    } else scale.min
                }
            } else {
                if (examPending) examNeeded = x
                if (hasPendingItems) neededGrade = x
            }
        } else {
            // Pending evaluations carry no weight: they cannot change the outcome.
            if (examPending) examNeeded = minExam ?: scale.min
            if (hasPendingItems) neededGrade = scale.min
        }
        if (neededGrade != null && neededGrade < scale.min) neededGrade = scale.min
        if (examNeeded != null && examNeeded < scale.min) examNeeded = scale.min
    }

    val projectedLeaf = neededGrade?.coerceIn(scale.min, scale.max) ?: scale.min
    val projectedExam = examGrade ?: (examNeeded ?: scale.min).coerceIn(scale.min, scale.max)

    val nodes = mutableMapOf<String, NodeResult>()
    projectNodes(cls.items, projectedLeaf, nodes)

    var finalGrade = projectedExam * examWeight
    for (l in leaves) finalGrade += (l.grade ?: projectedLeaf) * l.weight

    val status = when {
        examFailed -> Status.FAILED
        !hasPendingItems && !examPending -> if (finalGrade >= scale.pass - EPS) Status.PASSED else Status.FAILED
        else -> {
            val values = listOfNotNull(neededGrade, examNeeded)
            when {
                values.any { it > scale.max + EPS } -> Status.IMPOSSIBLE
                values.all { it <= scale.min + EPS } -> Status.SECURED
                else -> Status.NEEDED
            }
        }
    }

    return CalcResult(status, finalGrade, neededGrade, examNeeded, projectedExam, nodes, warnings)
}

/** Round a needed grade up to one decimal, so reaching the shown value is always enough. */
fun roundNeeded(x: Double): Double = ceil(x * 10 - 1e-6) / 10

/** Round an obtained/projected grade to one decimal (half up). */
fun roundGrade(x: Double): Double = floor(x * 10 + 0.5 + 1e-6) / 10
