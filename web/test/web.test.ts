import { describe, expect, it } from "vitest";
import en from "../src/locales/en.json";
import es from "../src/locales/es.json";
import gradeInputSpec from "../../spec/grade-input-cases.json";
import { autoDecimal, parseNumber } from "../src/numbers";
import { addChild, removeNode } from "../src/tree";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();
}

describe("locales", () => {
  it("en and es have the same keys", () => {
    expect(keys(es)).toEqual(keys(en));
  });
});

describe("parseNumber", () => {
  it("accepts dot and comma decimals", () => {
    expect(parseNumber("5.5")).toBe(5.5);
    expect(parseNumber("5,5")).toBe(5.5);
    expect(parseNumber(" ")).toBeNull();
    expect(parseNumber("abc")).toBeUndefined();
    expect(parseNumber("5.")).toBe(5);
  });
});

describe("spec/grade-input-cases.json", () => {
  for (const c of gradeInputSpec.cases) {
    it(`autoDecimal(${JSON.stringify(c.input)}, ${c.max})`, () => {
      expect(autoDecimal(c.input, c.max)).toBe(c.expected);
    });
  }
});

describe("tree", () => {
  it("turns an evaluation into a group keeping its grade", () => {
    const items = [{ id: "a", name: "A", weight: 40, grade: 6 }];
    const out = addChild(items, "a", (n) => `E${n}`);
    expect(out[0].grade).toBeNull();
    expect(out[0].children).toHaveLength(2);
    expect(out[0].children![0]).toMatchObject({ grade: 6, weight: 50 });
    expect(out[0].children![1]).toMatchObject({ grade: null, weight: 50 });
    const more = addChild(out, "a", (n) => `E${n}`);
    expect(more[0].children).toHaveLength(3);
    expect(removeNode(more, more[0].children![2].id)[0].children).toHaveLength(2);
  });
});

import { makeBackup, parseBackup } from "../src/backup";

describe("backup", () => {
  it("round-trips and drops deleted classes", () => {
    const c = { id: "a", name: "A", examWeight: 30, minExamGrade: 4, examGrade: null, items: [{ id: "x", name: "X", weight: 70, grade: 5 }], updatedAt: 1, deleted: false };
    const file = makeBackup([c, { ...c, id: "b", deleted: true }], { min: 1, max: 7, pass: 4 });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed?.classes.map((x) => x.id)).toEqual(["a"]);
  });
  it("rejects invalid files", () => {
    expect(parseBackup("nope")).toBeNull();
    expect(parseBackup(JSON.stringify({ app: "other", classes: [], scale: { min: 1, max: 7, pass: 4 } }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: "grades-calculator", classes: [{ id: 1 }], scale: { min: 1, max: 7, pass: 4 } }))).toBeNull();
  });
});
