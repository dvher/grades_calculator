package com.diego.gradescalculator

import com.diego.gradescalculator.ui.autoDecimal
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class GradeInputSpecTest {
    @Test
    fun allSpecCasesPass() {
        val specFile = File(System.getProperty("specFile")!!).resolveSibling("grade-input-cases.json")
        val cases = Json.parseToJsonElement(specFile.readText()).jsonObject["cases"]!!.jsonArray
        for (c in cases) {
            val o = c.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val max = o["max"]!!.jsonPrimitive.double
            assertEquals("autoDecimal(\"$input\", $max)", o["expected"]!!.jsonPrimitive.content, autoDecimal(input, max))
        }
    }
}
