import { useTranslation } from "react-i18next";
import type { ClassInput, Result, Scale } from "@grades/calc";
import { formatGrade, formatNeeded, formatNumber } from "../numbers";
import { findNode } from "../tree";

interface Props {
  cls: ClassInput;
  result: Result;
  scale: Scale;
}

export function ResultsPanel({ cls, result, scale }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const n = (x: number) => formatNumber(x, lang);
  // Without the right to sit the exam, needed grades and the projected final grade don't apply.
  const barred = result.status === "barred";
  const examFailed =
    cls.examGrade !== null && cls.minExamGrade !== null && cls.examGrade < cls.minExamGrade;

  return (
    <section className="card results" aria-live="polite">
      <h2>{t("results.title")}</h2>
      <div className={`status status-${result.status}`}>{t(`results.status.${result.status}`)}</div>
      <p className="muted">
        {examFailed
          ? t("results.examFailed", { min: n(cls.minExamGrade!) })
          : result.status === "barred"
            ? result.presentationNeeded !== null
              ? t("results.explain.barredPending", { max: n(scale.max) })
              : t("results.explain.barred", {
                grade: formatGrade(result.presentationGrade ?? 0, lang),
                min: n(cls.minPresentationGrade ?? scale.pass),
              })
            : t(`results.explain.${result.status}`, { max: n(scale.max) })}
      </p>
      <dl className="stats">
        {!barred && result.neededGrade !== null && (
          <div>
            <dt>{t("results.neededGrade")}</dt>
            <dd className="big">{formatNeeded(result.neededGrade, lang)}</dd>
          </div>
        )}
        {!barred && result.examNeeded !== null && (
          <div>
            <dt>{t("results.examNeeded")}</dt>
            <dd className="big">{formatNeeded(result.examNeeded, lang)}</dd>
          </div>
        )}
        {result.presentationNeeded !== null ? (
          <div>
            <dt>{t("results.presentationNeeded")}</dt>
            <dd className="big">{formatNeeded(result.presentationNeeded, lang)}</dd>
          </div>
        ) : result.presentationGrade !== null && (
          <div>
            <dt>{t("results.presentationGrade")}</dt>
            <dd className="big">{formatGrade(result.presentationGrade, lang)}</dd>
          </div>
        )}
        {!barred && (
          <div>
            <dt>{t("results.finalGrade")}</dt>
            <dd className="big">{formatGrade(result.finalGrade, lang)}</dd>
          </div>
        )}
      </dl>
      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w, i) => {
            const name = w.id ? findNode(cls.items, w.id)?.name ?? "" : t("editor.exam");
            const key = w.code === "WEIGHT_SUM" ? (w.id ? "WEIGHT_SUM_group" : "WEIGHT_SUM_top") : w.code;
            return <li key={i}>{t(`results.warning.${key}`, { name, min: n(scale.min), max: n(scale.max) })}</li>;
          })}
        </ul>
      )}
    </section>
  );
}
