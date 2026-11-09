import { validScale, type Evaluation, type Scale, type StoredClass } from "@grades/calc";

/** File format shared by the web, Android and iOS export/import. */
export interface BackupFile {
  app: "grades-calculator";
  version: 1;
  exportedAt: string;
  scale: Scale;
  classes: StoredClass[];
}

export function makeBackup(classes: StoredClass[], scale: Scale): BackupFile {
  return {
    app: "grades-calculator",
    version: 1,
    exportedAt: new Date().toISOString(),
    scale,
    classes: classes.filter((c) => !c.deleted),
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

function isEvaluation(e: unknown, depth = 1): e is Evaluation {
  if (typeof e !== "object" || e === null || depth > 5) return false;
  const o = e as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && isNum(o.weight) && isNumOrNull(o.grade) &&
    (o.children == null || (Array.isArray(o.children) && o.children.every((c) => isEvaluation(c, depth + 1))));
}

/** Parses an exported file; returns null if it is not a valid backup. */
export function parseBackup(text: string): BackupFile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const o = data as Partial<BackupFile>;
  if (o?.app !== "grades-calculator" || !Array.isArray(o.classes) || !o.scale || !validScale(o.scale)) return null;
  const ok = o.classes.every((c) =>
    typeof c?.id === "string" && typeof c.name === "string" && isNum(c.examWeight) &&
    isNumOrNull(c.minExamGrade) && isNumOrNull(c.examGrade) &&
    Array.isArray(c.items) && c.items.every((e) => isEvaluation(e)),
  );
  return ok ? (o as BackupFile) : null;
}
