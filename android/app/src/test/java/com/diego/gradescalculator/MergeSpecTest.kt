package com.diego.gradescalculator

import com.diego.gradescalculator.calc.mergeClasses
import com.diego.gradescalculator.data.StoredClass
import com.diego.gradescalculator.data.json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class MergeSpecTest {
    @Test
    fun mergeCases() {
        val specFile = File(System.getProperty("specFile")!!).resolveSibling("merge-cases.json")
        val cases = json.parseToJsonElement(specFile.readText()).jsonObject["cases"]!!.jsonArray
        for (c in cases) {
            val o = c.jsonObject
            fun list(key: String) = o[key]!!.jsonArray.map {
                val e = it.jsonObject
                StoredClass(
                    id = e["id"]!!.jsonPrimitive.content, name = e["name"]!!.jsonPrimitive.content, examWeight = 30.0,
                    updatedAt = e["updatedAt"]!!.jsonPrimitive.long, deleted = e["deleted"]!!.jsonPrimitive.boolean,
                )
            }
            val got = mergeClasses(list("local"), list("remote")).map { listOf(it.id, it.updatedAt, it.deleted, it.name) }
            val want = o["expected"]!!.jsonArray.map { row ->
                val r = row.jsonArray
                listOf(r[0].jsonPrimitive.content, r[1].jsonPrimitive.long, r[2].jsonPrimitive.boolean, r[3].jsonPrimitive.content)
            }
            assertEquals(o["name"]!!.jsonPrimitive.content, want, got)
        }
    }
}
