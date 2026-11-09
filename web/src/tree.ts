import { newId, type Evaluation } from "@grades/calc";

export function mapNode(items: Evaluation[], id: string, fn: (e: Evaluation) => Evaluation): Evaluation[] {
  return items.map((e) => {
    if (e.id === id) return fn(e);
    if (e.children) return { ...e, children: mapNode(e.children, id, fn) };
    return e;
  });
}

export function removeNode(items: Evaluation[], id: string): Evaluation[] {
  return items
    .filter((e) => e.id !== id)
    .map((e) => (e.children ? { ...e, children: removeNode(e.children, id) } : e));
}

export function countNodes(items: Evaluation[]): number {
  return items.reduce((n, e) => n + 1 + (e.children ? countNodes(e.children) : 0), 0);
}

export function weightSum(items: Evaluation[]): number {
  return items.reduce((s, e) => s + e.weight, 0);
}

export function newEvaluation(name: string, weight: number): Evaluation {
  return { id: newId(), name, weight: Math.max(0, Math.round(weight * 100) / 100), grade: null };
}

/** Adds a sub-evaluation. A plain evaluation becomes a group whose first child keeps its grade. */
export function addChild(items: Evaluation[], parentId: string, name: (n: number) => string): Evaluation[] {
  return mapNode(items, parentId, (e) => {
    const children = e.children?.length
      ? e.children
      : [{ ...newEvaluation(name(1), 100), grade: e.grade }];
    const remaining = 100 - weightSum(children);
    const next = e.children?.length ? [...children, newEvaluation(name(children.length + 1), remaining)] : [
      { ...children[0], weight: 50 },
      newEvaluation(name(2), 50),
    ];
    return { ...e, grade: null, children: next };
  });
}

export function findNode(items: Evaluation[], id: string): Evaluation | undefined {
  for (const e of items) {
    if (e.id === id) return e;
    const found = e.children && findNode(e.children, id);
    if (found) return found;
  }
  return undefined;
}
