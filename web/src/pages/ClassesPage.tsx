import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { calculate, type Evaluation } from "@grades/calc";
import { EvaluationList } from "../components/EvaluationList";
import { NumberInput } from "../components/NumberInput";
import { ResultsPanel } from "../components/ResultsPanel";
import { SyncBadge } from "../components/SyncBadge";
import { formatGrade, formatNeeded, formatNumber } from "../numbers";
import { useStore } from "../store";
import { addChild, countNodes, mapNode, newEvaluation, removeNode, weightSum } from "../tree";

export function ClassesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const store = useStore();
  const { classes } = store;
  const scale = store.data.scale;
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const selected = classes.find((c) => c.id === routeId) ?? classes[0] ?? null;
  const result = useMemo(() => (selected ? calculate(selected, scale) : null), [selected, scale]);

  const update = (patch: Parameters<typeof store.updateClass>[1]) => selected && store.updateClass(selected.id, patch);
  const setItems = (fn: (items: Evaluation[]) => Evaluation[]) => update({ items: fn(selected!.items) });
  const evalName = (n: number) => t("editor.defaultName", { n });

  function createClass() {
    const created = store.createClass(t("classes.newName"));
    navigate(`/classes/${created.id}`);
  }

  function deleteClass() {
    if (!selected || !confirm(t("classes.confirmDelete", { name: selected.name }))) return;
    store.deleteClass(selected.id);
    navigate("/");
  }

  const topSum = selected ? weightSum(selected.items) + selected.examWeight : 100;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand small">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
          <span>{t("app.title")}</span>
        </div>
        {classes.length > 0 && (
          <label className="class-select">
            <span className="sr-only">{t("classes.select")}</span>
            <select value={selected?.id} onChange={(e) => navigate(`/classes/${e.target.value}`)}>
              {classes.map((c) => {
                const r = calculate(c, scale);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} · {t(`results.status.${r.status}`)} · {formatGrade(r.finalGrade, lang)}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <div className="topbar-actions">
          <SyncBadge />
          <button className="primary" onClick={createClass}>+ {t("classes.new")}</button>
          <Link className="button" to="/settings" aria-label={t("settings.title")} title={t("settings.title")}>⚙</Link>
        </div>
      </header>

      {classes.length === 0 && (
        <div className="card empty">
          <p>{t("classes.empty")}</p>
          <button className="primary" onClick={createClass}>+ {t("classes.new")}</button>
        </div>
      )}

      {selected && result && (
        <main className="content">
          <section className="card editor">
            <div className="class-header">
              <input
                className="class-name"
                aria-label={t("classes.name")}
                value={selected.name}
                maxLength={100}
                onChange={(e) => update({ name: e.target.value })}
                onBlur={(e) => { if (!e.target.value.trim()) update({ name: t("classes.newName") }); }}
              />
              <button className="icon-btn danger" title={t("classes.delete")} aria-label={t("classes.delete")} onClick={deleteClass}>🗑</button>
            </div>

            <h2>{t("editor.evaluations")}</h2>
            <div className="eval-head" aria-hidden>
              <span>{t("editor.name")}</span><span>{t("editor.weight")}</span><span>{t("editor.grade")}</span><span />
            </div>
            <EvaluationList
              items={selected.items}
              result={result}
              scale={scale}
              depth={1}
              onChange={(id, patch) => setItems((items) => mapNode(items, id, (e) => ({ ...e, ...patch })))}
              onRemove={(id) => setItems((items) => removeNode(items, id))}
              onAddChild={(id) => setItems((items) => addChild(items, id, evalName))}
            />
            <button
              className="add"
              onClick={() => setItems((items) => [...items, newEvaluation(evalName(countNodes(items) + 1), 100 - topSum)])}
            >
              + {t("editor.addEvaluation")}
            </button>

            <div className="exam card inset">
              <h3>{t("editor.exam")}</h3>
              <div className="exam-fields">
                <label>
                  {t("editor.examWeight")}
                  <NumberInput label={t("editor.examWeight")} zeroAsEmpty value={selected.examWeight} min={0} max={100} onChange={(v) => update({ examWeight: v ?? 0 })} />
                </label>
                <label>
                  {t("editor.minExamGrade")}
                  <NumberInput label={t("editor.minExamGrade")} grade value={selected.minExamGrade} min={scale.min} max={scale.max} placeholder={t("editor.none")} onChange={(v) => update({ minExamGrade: v })} />
                </label>
                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.minPresentationGrade != null}
                      onChange={(e) => update({ minPresentationGrade: e.target.checked ? scale.pass : null })}
                    />
                    {t("editor.minPresentationGrade")}
                  </label>
                  <NumberInput
                    label={t("editor.minPresentationGrade")}
                    grade
                    disabled={selected.minPresentationGrade == null}
                    value={selected.minPresentationGrade ?? null}
                    min={scale.min}
                    max={scale.max}
                    placeholder={t("editor.none")}
                    onChange={(v) => v !== null && update({ minPresentationGrade: v })}
                  />
                </div>
                <label>
                  {t("editor.examGrade")}
                  <NumberInput
                    label={t("editor.examGrade")}
                    grade
                    value={selected.examGrade}
                    min={scale.min}
                    max={scale.max}
                    placeholder={result.examNeeded !== null ? t("results.need", { grade: formatNeeded(result.examNeeded, lang) }) : t("editor.pending")}
                    onChange={(v) => update({ examGrade: v })}
                  />
                </label>
              </div>
            </div>
            <div className={`weight-sum ${Math.abs(topSum - 100) > 1e-9 ? "bad" : ""}`}>
              {Math.abs(topSum - 100) > 1e-9 ? t("editor.weightSum", { sum: formatNumber(topSum, lang) }) : t("editor.weightSumOk")}
            </div>
          </section>
          <ResultsPanel cls={selected} result={result} scale={scale} />
        </main>
      )}
    </div>
  );
}
