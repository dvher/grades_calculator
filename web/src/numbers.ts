import { roundGrade, roundNeeded } from "@grades/calc";

/** Parses user input accepting both "5.5" and "5,5". Returns undefined if invalid, null if empty. */
export function parseNumber(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^-?\d*\.?\d*$/.test(t) || t === "." || t === "-") return undefined;
  return Number(t);
}

/**
 * Formats grade input as it is typed so the decimal point is optional: "54" becomes "5.4" on a 1–7 scale.
 * Without a separator, the integer part is the longest digit prefix not exceeding `max`; an explicit "." or ","
 * is honored once and repeated separators are dropped. Always returns "." as the separator.
 */
export function autoDecimal(text: string, max: number): string {
  const t = text.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = t.indexOf(".");
  if (dot >= 0) {
    const int = t.slice(0, dot) || "0";
    return `${int}.${t.slice(dot + 1).replace(/\./g, "")}`;
  }
  if (t === "") return "";
  let intLen = 1;
  if (t[0] !== "0") while (intLen < t.length && Number(t.slice(0, intLen + 1)) <= max) intLen++;
  return intLen < t.length ? `${t.slice(0, intLen)}.${t.slice(intLen)}` : t;
}

export function decimalSeparator(lang: string): string {
  return new Intl.NumberFormat(lang).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
}

export function formatNumber(n: number, lang: string, maxDecimals = 2): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: maxDecimals }).format(n);
}

export function formatGrade(n: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(roundGrade(n));
}

export function formatNeeded(n: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(roundNeeded(n));
}
