import { describe, expect, it } from "vitest";
import spec from "../../spec/calc-cases.json";
import { calculate, roundNeeded, roundGrade, type ClassInput, type Scale } from "../src/index";

const TOL = 1e-6;

function close(actual: number | null, expected: number | null, label: string) {
  if (expected === null) {
    expect(actual, label).toBeNull();
  } else {
    expect(actual, label).not.toBeNull();
    expect(Math.abs(actual! - expected), `${label}: ${actual} vs ${expected}`).toBeLessThan(TOL);
  }
}

describe("spec/calc-cases.json", () => {
  for (const c of spec.cases) {
    it(c.name, () => {
      const r = calculate(c.class as ClassInput, c.scale as Scale);
      const e = c.expected as Record<string, unknown>;
      if ("status" in e) expect(r.status).toBe(e.status);
      if ("finalGrade" in e) close(r.finalGrade, e.finalGrade as number, "finalGrade");
      if ("neededGrade" in e) close(r.neededGrade, e.neededGrade as number | null, "neededGrade");
      if ("examNeeded" in e) close(r.examNeeded, e.examNeeded as number | null, "examNeeded");
      if ("presentationNeeded" in e) close(r.presentationNeeded, e.presentationNeeded as number | null, "presentationNeeded");
      if ("presentationGrade" in e) close(r.presentationGrade, e.presentationGrade as number | null, "presentationGrade");
      if ("nodes" in e) {
        for (const [id, g] of Object.entries(e.nodes as Record<string, number>)) {
          close(r.nodes[id]?.grade ?? null, g, `nodes.${id}`);
        }
      }
      if ("warnings" in e) {
        const got = r.warnings.map((w) => `${w.code}:${w.id}`).sort();
        const want = (e.warnings as { code: string; id: string | null }[]).map((w) => `${w.code}:${w.id}`).sort();
        expect(got).toEqual(want);
      }
    });
  }
});

describe("rounding", () => {
  it("rounds needed grades up", () => {
    expect(roundNeeded(3.4615)).toBe(3.5);
    expect(roundNeeded(3.5)).toBe(3.5);
    expect(roundNeeded(3.0000000001)).toBe(3);
  });
  it("rounds grades half up", () => {
    expect(roundGrade(4.45)).toBe(4.5);
    expect(roundGrade(3.94)).toBe(3.9);
  });
});
