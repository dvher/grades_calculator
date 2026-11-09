import type { Pool } from "./db.js";
import { ApiError } from "./app.js";

export interface UserRow {
  id: string;
  email: string;
}

export function toUser(row: UserRow) {
  return { id: row.id, email: row.email };
}

export async function getUser(pool: Pool, id: string): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>("SELECT id, email FROM users WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(401, "UNAUTHORIZED");
  return rows[0];
}
