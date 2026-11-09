package com.diego.gradescalculator.ui

import com.diego.gradescalculator.calc.Evaluation
import java.util.UUID

fun List<Evaluation>.mapNode(id: String, fn: (Evaluation) -> Evaluation): List<Evaluation> = map {
    when {
        it.id == id -> fn(it)
        it.children != null -> it.copy(children = it.children.mapNode(id, fn))
        else -> it
    }
}

fun List<Evaluation>.removeNode(id: String): List<Evaluation> =
    filter { it.id != id }.map { if (it.children != null) it.copy(children = it.children.removeNode(id)) else it }

fun List<Evaluation>.countNodes(): Int = sumOf { 1 + (it.children?.countNodes() ?: 0) }

fun List<Evaluation>.findNode(id: String): Evaluation? {
    for (e in this) {
        if (e.id == id) return e
        e.children?.findNode(id)?.let { return it }
    }
    return null
}

fun newEvaluation(name: String, weight: Double) =
    Evaluation(id = UUID.randomUUID().toString(), name = name, weight = maxOf(0.0, Math.round(weight * 100) / 100.0))

/** Adds a sub-evaluation. A plain evaluation becomes a group whose first child keeps its grade. */
fun List<Evaluation>.addChild(parentId: String, name: (Int) -> String): List<Evaluation> = mapNode(parentId) { e ->
    val children = e.children
    val next = if (children.isNullOrEmpty()) {
        listOf(newEvaluation(name(1), 50.0).copy(grade = e.grade), newEvaluation(name(2), 50.0))
    } else {
        children + newEvaluation(name(children.size + 1), 100 - children.sumOf { it.weight })
    }
    e.copy(grade = null, children = next)
}
