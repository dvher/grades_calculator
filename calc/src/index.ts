// Grade calculation engine. Ported 1:1 to Kotlin (android) and Swift (ios);
// all three implementations must pass spec/calc-cases.json.

export interface Scale {
  min: number;
  max: number;
  pass: number;
}

export const DEFAULT_SCALE: Scale = { min: 1, max: 7, pass: 4 };

export interface Evaluation {
  id: string;
  name: string;
  /** Percentage weight relative to its siblings. */
  weight: number;
  /** Entered grade, or null if still pending. Ignored for groups with children. */
  grade: number | null;
  children?: Evaluation[] | null;
}

export interface ClassInput {
  examWeight: number;
  minExamGrade: number | null;
  examGrade: number | null;
  items: Evaluation[];
}

export type Status = "passed" | "failed" | "needed" | "secured" | "impossible";

export type WarningCode = "WEIGHT_SUM" | "GRADE_OUT_OF_RANGE" | "MIN_EXAM_OUT_OF_RANGE";

export interface Warning {
  code: WarningCode;
  /** Node id the warning refers to; null for the top level / the exam. */
  id: string | null;
}

export interface NodeResult {
  grade: number;
  /** True when the grade is (partly) projected from needed grades. */
  pending: boolean;
}

export interface Result {
  status: Status;
  /** Projected final grade, using needed grades for pending evaluations. */
  finalGrade: number;
  /** Grade needed on every pending non-exam evaluation, or null if none pending. */
  neededGrade: number | null;
  /** Grade needed on the exam, or null if the exam is graded. */
  examNeeded: number | null;
  /** Actual or projected exam grade. */
  examGrade: number;
  nodes: Record<string, NodeResult>;
  warnings: Warning[];
}

const EPS = 1e-9;

interface Leaf {
  id: string | null; // null = exam
  weight: number;
  grade: number | null;
}

function isGroup(e: Evaluation): boolean {
  return !!e.children && e.children.length > 0;
}

function sumWeights(weights: number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}

function collectLeaves(
  items: Evaluation[],
  factor: number,
  levelSum: number,
  leaves: Leaf[],
  scale: Scale,
  warnings: Warning[],
): void {
  for (const item of items) {
    const w = levelSum > 0 ? (factor * item.weight) / levelSum : 0;
    if (isGroup(item)) {
      const children = item.children!;
      const childSum = sumWeights(children.map((c) => c.weight));
      if (Math.abs(childSum - 100) > EPS) warnings.push({ code: "WEIGHT_SUM", id: item.id });
      collectLeaves(children, w, childSum, leaves, scale, warnings);
    } else {
      if (item.grade !== null && (item.grade < scale.min - EPS || item.grade > scale.max + EPS)) {
        warnings.push({ code: "GRADE_OUT_OF_RANGE", id: item.id });
      }
      leaves.push({ id: item.id, weight: w, grade: item.grade });
    }
  }
}

function projectNodes(
  items: Evaluation[],
  leafGrade: (id: string) => number,
  nodes: Record<string, NodeResult>,
): void {
  for (const item of items) {
    if (isGroup(item)) {
      const children = item.children!;
      projectNodes(children, leafGrade, nodes);
      const childSum = sumWeights(children.map((c) => c.weight));
      let grade = 0;
      let pending = false;
      for (const c of children) {
        const r = nodes[c.id];
        grade += childSum > 0 ? (r.grade * c.weight) / childSum : 0;
        pending = pending || r.pending;
      }
      nodes[item.id] = { grade, pending };
    } else {
      nodes[item.id] = item.grade !== null
        ? { grade: item.grade, pending: false }
        : { grade: leafGrade(item.id), pending: true };
    }
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

export function calculate(cls: ClassInput, scale: Scale = DEFAULT_SCALE): Result {
  const warnings: Warning[] = [];
  const topSum = sumWeights(cls.items.map((i) => i.weight)) + cls.examWeight;
  if (Math.abs(topSum - 100) > EPS) warnings.push({ code: "WEIGHT_SUM", id: null });

  const leaves: Leaf[] = [];
  collectLeaves(cls.items, 1, topSum, leaves, scale, warnings);
  const examWeight = topSum > 0 ? cls.examWeight / topSum : 0;
  if (cls.examGrade !== null && (cls.examGrade < scale.min - EPS || cls.examGrade > scale.max + EPS)) {
    warnings.push({ code: "GRADE_OUT_OF_RANGE", id: null });
  }
  const minExam = cls.minExamGrade;
  if (minExam !== null && (minExam < scale.min - EPS || minExam > scale.max + EPS)) {
    warnings.push({ code: "MIN_EXAM_OUT_OF_RANGE", id: null });
  }

  let known = 0;
  let pendingWeight = 0;
  let hasPendingItems = false;
  for (const l of leaves) {
    if (l.grade !== null) known += l.grade * l.weight;
    else {
      pendingWeight += l.weight;
      hasPendingItems = true;
    }
  }
  const examPending = cls.examGrade === null;
  if (!examPending) known += cls.examGrade! * examWeight;
  const examFailed = !examPending && minExam !== null && cls.examGrade! < minExam - EPS;

  let neededGrade: number | null = null;
  let examNeeded: number | null = null;
  const totalPending = pendingWeight + (examPending ? examWeight : 0);

  if (hasPendingItems || examPending) {
    if (totalPending > EPS) {
      const x = (scale.pass - known) / totalPending;
      if (examPending && minExam !== null && x < minExam - EPS) {
        examNeeded = minExam;
        if (hasPendingItems) {
          neededGrade = pendingWeight > EPS
            ? (scale.pass - known - minExam * examWeight) / pendingWeight
            : scale.min;
        }
      } else {
        if (examPending) examNeeded = x;
        if (hasPendingItems) neededGrade = x;
      }
    } else {
      // Pending evaluations carry no weight: they cannot change the outcome.
      if (examPending) examNeeded = minExam ?? scale.min;
      if (hasPendingItems) neededGrade = scale.min;
    }
    if (neededGrade !== null && neededGrade < scale.min) neededGrade = scale.min;
    if (examNeeded !== null && examNeeded < scale.min) examNeeded = scale.min;
  }

  const projectedLeaf = neededGrade === null ? scale.min : clamp(neededGrade, scale.min, scale.max);
  const projectedExam = examPending
    ? clamp(examNeeded ?? scale.min, scale.min, scale.max)
    : cls.examGrade!;

  const nodes: Record<string, NodeResult> = {};
  projectNodes(cls.items, () => projectedLeaf, nodes);

  let finalGrade = projectedExam * examWeight;
  for (const l of leaves) finalGrade += (l.grade ?? projectedLeaf) * l.weight;

  let status: Status;
  if (examFailed) status = "failed";
  else if (!hasPendingItems && !examPending) {
    status = finalGrade >= scale.pass - EPS ? "passed" : "failed";
  } else {
    const values = [neededGrade, examNeeded].filter((v): v is number => v !== null);
    if (values.some((v) => v > scale.max + EPS)) status = "impossible";
    else if (values.every((v) => v <= scale.min + EPS)) status = "secured";
    else status = "needed";
  }

  return { status, finalGrade, neededGrade, examNeeded, examGrade: projectedExam, nodes, warnings };
}

/** Round a needed grade up to one decimal, so reaching the shown value is always enough. */
export function roundNeeded(x: number): number {
  return Math.ceil(x * 10 - 1e-6) / 10;
}

/** Round an obtained/projected grade to one decimal (half up). */
export function roundGrade(x: number): number {
  return Math.round(x * 10 + 1e-6) / 10;
}

export function validScale(s: Scale): boolean {
  return Number.isFinite(s.min) && Number.isFinite(s.max) && Number.isFinite(s.pass) &&
    s.min < s.max && s.pass > s.min && s.pass <= s.max;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export * from "./sync";
