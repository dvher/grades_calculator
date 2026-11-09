import { expect, it } from "vitest";
import spec from "../../spec/merge-cases.json";
import { mergeClasses, mergeSettings, type StoredClass } from "../src/index";

const full = (c: { id: string; updatedAt: number; deleted: boolean; name: string }): StoredClass => ({
  ...c, examWeight: 30, minExamGrade: null, examGrade: null, items: [],
});

for (const c of spec.cases) {
  it(`merge: ${c.name}`, () => {
    const merged = mergeClasses(c.local.map(full), c.remote.map(full));
    expect(merged.map((m) => [m.id, m.updatedAt, m.deleted, m.name])).toEqual(c.expected);
  });
}

it("settings: newer scale wins", () => {
  const a = { scale: { min: 1, max: 7, pass: 4 }, scaleUpdatedAt: 5 };
  const b = { scale: { min: 0, max: 10, pass: 5 }, scaleUpdatedAt: 6 };
  expect(mergeSettings(a, b)).toBe(b);
  expect(mergeSettings(b, a)).toBe(b);
});
