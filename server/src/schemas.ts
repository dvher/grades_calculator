import { z } from "zod";
import type { Evaluation } from "@grades/calc";

const MAX_DEPTH = 5;
const MAX_NODES = 300;

const grade = z.number().finite().min(-1000).max(1000);

const evaluation: z.ZodType<Evaluation> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    name: z.string().max(100),
    weight: z.number().finite().min(0).max(100),
    grade: grade.nullable(),
    children: z.array(evaluation).max(50).nullish(),
  }),
);

function depthAndCount(items: Evaluation[], depth = 1): { depth: number; count: number } {
  let maxDepth = items.length ? depth : 0;
  let count = 0;
  for (const i of items) {
    count++;
    if (i.children?.length) {
      const sub = depthAndCount(i.children, depth + 1);
      maxDepth = Math.max(maxDepth, sub.depth);
      count += sub.count;
    }
  }
  return { depth: maxDepth, count };
}

function uniqueIds(items: Evaluation[], seen = new Set<string>()): boolean {
  for (const i of items) {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    if (i.children && !uniqueIds(i.children, seen)) return false;
  }
  return true;
}

const classFields = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  examWeight: z.number().finite().min(0).max(100),
  minExamGrade: grade.nullable(),
  /** Absent from older clients; stored as the user's passing grade then. */
  minPresentationGrade: grade.nullable().optional(),
  examGrade: grade.nullable(),
  items: z.array(evaluation).max(100),
  /** Last local modification, ms since epoch (set by the device). */
  updatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  deleted: z.boolean(),
});

export const syncClass = classFields
  .refine((c) => {
    const { depth, count } = depthAndCount(c.items);
    return depth <= MAX_DEPTH && count <= MAX_NODES;
  }, { message: `At most ${MAX_DEPTH} levels and ${MAX_NODES} evaluations`, path: ["items"] })
  .refine((c) => uniqueIds(c.items), { message: "Evaluation ids must be unique", path: ["items"] });

export const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
});

export const scaleSchema = z
  .object({
    min: z.number().finite().min(-1000).max(1000),
    max: z.number().finite().min(-1000).max(1000),
    pass: z.number().finite().min(-1000).max(1000),
  })
  .refine((s) => s.min < s.max && s.pass > s.min && s.pass <= s.max, { message: "INVALID_SCALE" });

export const syncBody = z.object({
  classes: z.array(syncClass).max(1000),
  settings: z
    .object({
      scale: scaleSchema,
      scaleUpdatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .optional(),
});

export type SyncBody = z.infer<typeof syncBody>;
