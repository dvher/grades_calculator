package com.diego.gradescalculator

import com.diego.gradescalculator.calc.ClassInput
import com.diego.gradescalculator.calc.Evaluation
import com.diego.gradescalculator.calc.Scale
import com.diego.gradescalculator.calc.calculate
import com.diego.gradescalculator.calc.roundGrade
import com.diego.gradescalculator.calc.roundNeeded
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs

@Serializable
private data class SpecClass(
    override val examWeight: Double,
    override val minExamGrade: Double?,
    override val examGrade: Double?,
    override val items: List<Evaluation>,
    override val minPresentationGrade: Double? = null,
) : ClassInput

class CalcSpecTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun close(actual: Double?, expected: Double?, label: String) {
        if (expected == null) {
            assertNull(label, actual)
        } else {
            assertNotNull(label, actual)
            assertTrue("$label: $actual vs $expected", abs(actual!! - expected) < 1e-6)
        }
    }

    @Test
    fun specCases() {
        val file = File(System.getProperty("specFile") ?: "../../spec/calc-cases.json")
        val cases = json.parseToJsonElement(file.readText()).jsonObject["cases"]!!.jsonArray
        assertTrue(cases.size >= 20)
        for (c in cases) {
            val case = c.jsonObject
            val name = case["name"]!!.jsonPrimitive.content
            val scale = json.decodeFromJsonElement<Scale>(case["scale"]!!)
            val cls = json.decodeFromJsonElement<SpecClass>(case["class"]!!)
            val r = calculate(cls, scale)
            val e = case["expected"]!!.jsonObject
            fun num(key: String) = e[key].let { if (it == null || it is JsonNull) null else it.jsonPrimitive.double }

            e["status"]?.let { assertEquals(name, it.jsonPrimitive.content, r.status.name.lowercase()) }
            if ("finalGrade" in e) close(r.finalGrade, num("finalGrade"), "$name finalGrade")
            if ("neededGrade" in e) close(r.neededGrade, num("neededGrade"), "$name neededGrade")
            if ("examNeeded" in e) close(r.examNeeded, num("examNeeded"), "$name examNeeded")
            if ("presentationNeeded" in e) close(r.presentationNeeded, num("presentationNeeded"), "$name presentationNeeded")
            if ("presentationGrade" in e) close(r.presentationGrade, num("presentationGrade"), "$name presentationGrade")
            (e["nodes"] as? JsonObject)?.forEach { (id, g) -> close(r.nodes[id]?.grade, g.jsonPrimitive.double, "$name nodes.$id") }
            (e["warnings"] as? JsonArray)?.let { ws ->
                val want = ws.map { w -> "${w.jsonObject["code"]!!.jsonPrimitive.content}:${w.jsonObject["id"]!!.jsonPrimitive.contentOrNull}" }.sorted()
                val got = r.warnings.map { "${it.code.name}:${it.id}" }.sorted()
                assertEquals(name, want, got)
            }
        }
    }

    @Test
    fun rounding() {
        assertEquals(3.5, roundNeeded(3.4615), 0.0)
        assertEquals(3.0, roundNeeded(3.0000000001), 0.0)
        assertEquals(4.5, roundGrade(4.45), 0.0)
        assertEquals(3.9, roundGrade(3.94), 0.0)
    }
}
