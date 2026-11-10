import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { autoDecimal, decimalSeparator, formatNumber, parseNumber } from "../numbers";

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  label: string;
  className?: string;
  min?: number;
  max?: number;
  /** Grade field: insert the decimal separator automatically based on `max` (e.g. "54" → "5.4"). */
  grade?: boolean;
  /** Show 0 as an empty field with a "0" placeholder (an empty field means 0). */
  zeroAsEmpty?: boolean;
  disabled?: boolean;
}

/** Text-based number field that accepts "5,5" or "5.5" and keeps partial input while typing. */
export function NumberInput({ value, onChange, placeholder, label, className, min, max, grade, zeroAsEmpty, disabled }: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const show = (v: number | null) =>
    v === null || (zeroAsEmpty && v === 0) ? "" : formatNumber(v, lang, 4).replace(/\s/g, "");
  const [text, setText] = useState(() => show(value));

  useEffect(() => {
    const parsed = parseNumber(text);
    if (parsed !== value && !(zeroAsEmpty && parsed === null && value === 0)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lang]);

  const parsed = parseNumber(text);
  const invalid = parsed === undefined || (parsed !== null && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)));

  return (
    <input
      className={`num ${className ?? ""} ${invalid ? "invalid" : ""}`}
      inputMode="decimal"
      aria-label={label}
      title={label}
      placeholder={placeholder ?? (zeroAsEmpty ? "0" : undefined)}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        const next = grade && max !== undefined ? autoDecimal(raw, max).replace(".", decimalSeparator(lang)) : raw;
        setText(next);
        const v = parseNumber(next);
        if (v !== undefined) onChange(v);
      }}
    />
  );
}
