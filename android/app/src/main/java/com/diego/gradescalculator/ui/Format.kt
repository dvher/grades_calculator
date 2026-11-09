package com.diego.gradescalculator.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import com.diego.gradescalculator.calc.roundGrade
import com.diego.gradescalculator.calc.roundNeeded
import java.text.DecimalFormatSymbols
import java.text.NumberFormat
import java.util.Locale

@Composable
fun currentLocale(): Locale = LocalConfiguration.current.locales[0]

fun formatNumber(x: Double, locale: Locale, maxDecimals: Int = 2): String =
    NumberFormat.getNumberInstance(locale).apply {
        maximumFractionDigits = maxDecimals
        isGroupingUsed = false
    }.format(x)

private fun oneDecimal(x: Double, locale: Locale): String =
    NumberFormat.getNumberInstance(locale).apply {
        minimumFractionDigits = 1
        maximumFractionDigits = 1
        isGroupingUsed = false
    }.format(x)

fun formatGrade(x: Double, locale: Locale) = oneDecimal(roundGrade(x), locale)
fun formatNeeded(x: Double, locale: Locale) = oneDecimal(roundNeeded(x), locale)

/** Accepts "5.5" and "5,5". Returns null for empty input; [Invalid] for unparseable input. */
object Invalid

fun parseNumber(text: String): Any? {
    val t = text.trim().replace(',', '.')
    if (t.isEmpty()) return null
    if (!Regex("""^-?\d*\.?\d*$""").matches(t) || t == "." || t == "-") return Invalid
    return t.toDoubleOrNull() ?: Invalid
}

/**
 * Formats grade input as it is typed so the decimal point is optional: "54" becomes "5.4" on a 1–7 scale.
 * Without a separator, the integer part is the longest digit prefix not exceeding [max]; an explicit "." or ","
 * is honored once and repeated separators are dropped. Always returns "." as the separator.
 */
fun autoDecimal(text: String, max: Double): String {
    val t = text.replace(',', '.').filter { it.isDigit() || it == '.' }
    val dot = t.indexOf('.')
    if (dot >= 0) {
        val int = t.substring(0, dot).ifEmpty { "0" }
        return "$int.${t.substring(dot + 1).replace(".", "")}"
    }
    if (t.isEmpty()) return ""
    var intLen = 1
    if (t[0] != '0') while (intLen < t.length && t.substring(0, intLen + 1).toDouble() <= max) intLen++
    return if (intLen < t.length) "${t.substring(0, intLen)}.${t.substring(intLen)}" else t
}

fun decimalSeparator(locale: Locale): Char = DecimalFormatSymbols.getInstance(locale).decimalSeparator
