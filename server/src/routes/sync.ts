import type { FastifyPluginAsync } from "fastify";
import type { Evaluation } from "@grades/calc";
import { syncBody } from "../schemas.js";
import { getUser } from "../users.js";

interface ClassRow {
  id: string;
  name: string;
  exam_weight: number;
  min_exam_grade: number | null;
  exam_grade: number | null;
  items: Evaluation[];
  updated_at: string; // bigint comes back as a string
  deleted: boolean;
}

/**
 * Two-way sync. The device sends every class it has (including deletion tombstones) and its
 * grading scale; for each class the newest `updatedAt` wins. The response is the merged state,
 * which the device merges back with the same rule.
 */
export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/", async (req) => {
    const body = syncBody.parse(req.body);
    const userId = req.user.sub;
    await getUser(app.pool, userId);

    const client = await app.pool.connect();
    try {
      await client.query("BEGIN");
      for (const c of body.classes) {
        await client.query(
          `INSERT INTO classes (user_id, id, name, exam_weight, min_exam_grade, exam_grade, items, updated_at, deleted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, id) DO UPDATE SET
             name = EXCLUDED.name, exam_weight = EXCLUDED.exam_weight, min_exam_grade = EXCLUDED.min_exam_grade,
             exam_grade = EXCLUDED.exam_grade, items = EXCLUDED.items, updated_at = EXCLUDED.updated_at,
             deleted = EXCLUDED.deleted
           WHERE classes.updated_at < EXCLUDED.updated_at`,
          [userId, c.id, c.name, c.examWeight, c.minExamGrade, c.examGrade, JSON.stringify(c.items), c.updatedAt, c.deleted],
        );
      }
      if (body.settings) {
        const { scale, scaleUpdatedAt } = body.settings;
        await client.query(
          `UPDATE users SET scale_min = $2, scale_max = $3, pass_grade = $4, scale_updated_at = $5
           WHERE id = $1 AND scale_updated_at < $5`,
          [userId, scale.min, scale.max, scale.pass, scaleUpdatedAt],
        );
      }
      const { rows } = await client.query<ClassRow>(
        `SELECT id, name, exam_weight, min_exam_grade, exam_grade, items, updated_at, deleted
         FROM classes WHERE user_id = $1 ORDER BY id`,
        [userId],
      );
      const settings = (await client.query<{ scale_min: number; scale_max: number; pass_grade: number; scale_updated_at: string }>(
        "SELECT scale_min, scale_max, pass_grade, scale_updated_at FROM users WHERE id = $1",
        [userId],
      )).rows[0];
      await client.query("COMMIT");

      return {
        classes: rows.map((r) => ({
          id: r.id,
          name: r.name,
          examWeight: r.exam_weight,
          minExamGrade: r.min_exam_grade,
          examGrade: r.exam_grade,
          items: r.items,
          updatedAt: Number(r.updated_at),
          deleted: r.deleted,
        })),
        settings: {
          scale: { min: settings.scale_min, max: settings.scale_max, pass: settings.pass_grade },
          scaleUpdatedAt: Number(settings.scale_updated_at),
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
};
