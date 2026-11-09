// Sync merge rule, 1:1 port of calc/src/sync.ts; must pass spec/merge-cases.json.
package com.diego.gradescalculator.calc

/** Anything that can be merged by id with "newest updatedAt wins". */
interface Versioned {
    val id: String
    val updatedAt: Long
}

/** Per id, keep whichever side has the newer updatedAt (ties keep the local copy). Local order first. */
fun <T : Versioned> mergeClasses(local: List<T>, remote: List<T>): List<T> {
    val merged = LinkedHashMap<String, T>()
    for (c in local) merged[c.id] = c
    for (r in remote) {
        val l = merged[r.id]
        if (l == null || r.updatedAt > l.updatedAt) merged[r.id] = r
    }
    return merged.values.toList()
}
