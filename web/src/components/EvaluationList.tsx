import { useTranslation } from "react-i18next";
import type { Evaluation, Result, Scale } from "@grades/calc";
import { NumberInput } from "./NumberInput";
import { formatGrade, formatNeeded, formatNumber } from "../numbers";
import { weightSum } from "../tree";

interface Props {
  items: Evaluation[];
  result: Result;
  scale: Scale;
  depth: number;
  onChange: (id: string, patch: Partial<Evaluation>) => void;
  onRemove: (id: string) => void;
  onAddChild: (id: string) => void;
}

export function EvaluationList({ items, result, scale, depth, onChange, onRemove, onAddChild }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  return (
    <ul className={`evals depth-${Math.min(depth, 4)}`}>
      {items.map((e) => {
        const isGroup = !!e.children?.length;
        const node = result.nodes[e.id];
        const sum = isGroup ? weightSum(e.children!) : 100;
        const needed = !isGroup && e.grade === null && node ? node.grade : null;
        return (
          <li key={e.id} className="eval">
            <div className="eval-row">
              <input
                className="name"
                aria-label={t("editor.name")}
                value={e.name}
                maxLength={100}
                onChange={(ev) => onChange(e.id, { name: ev.target.value })}
              />
              <label className="field-inline">
                <NumberInput
                  className="weight"
                  label={t("editor.weight")}
                  value={e.weight}
                  min={0}
                  max={100}
                  onChange={(v) => onChange(e.id, { weight: v ?? 0 })}
                />
                <span className="unit">%</span>
              </label>
              {isGroup ? (
                <span className={`grade-chip ${node?.pending ? "projected" : ""}`} title={t("editor.groupGrade")}>
                  {node ? formatGrade(node.grade, lang) : "–"}
                </span>
              ) : (
                <NumberInput
                  className="grade"
                  grade
                  label={t("editor.grade")}
                  value={e.grade}
                  min={scale.min}
                  max={scale.max}
                  placeholder={needed !== null ? t("results.need", { grade: formatNeeded(result.neededGrade ?? needed, lang) }) : t("editor.pending")}
                  onChange={(v) => onChange(e.id, { grade: v })}
                />
              )}
              <div className="row-actions">
                {depth < 5 && (
                  <button type="button" className="icon-btn" title={t("editor.addSub")} aria-label={t("editor.addSub")} onClick={() => onAddChild(e.id)}>
                    ⊕
                  </button>
                )}
                <button type="button" className="icon-btn danger" title={t("editor.remove")} aria-label={t("editor.remove")} onClick={() => onRemove(e.id)}>
                  ✕
                </button>
              </div>
            </div>
            {isGroup && (
              <div className="group">
                <EvaluationList
                  items={e.children!}
                  result={result}
                  scale={scale}
                  depth={depth + 1}
                  onChange={onChange}
                  onRemove={onRemove}
                  onAddChild={onAddChild}
                />
                <div className={`weight-sum ${Math.abs(sum - 100) > 1e-9 ? "bad" : ""}`}>
                  {Math.abs(sum - 100) > 1e-9 ? t("editor.weightSum", { sum: formatNumber(sum, lang) }) : t("editor.weightSumOk")}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
