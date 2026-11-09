import type { FastifyPluginAsync } from "fastify";
import { ApiError } from "../app.js";
import { hashPassword, verifyPassword } from "../password.js";
import { credentials } from "../schemas.js";
import { toUser, type UserRow } from "../users.js";

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = await hashPassword("dummy-password-for-timing");

export const authRoutes: FastifyPluginAsync<{ rateLimit: number }> = async (app, opts) => {
  const limit = { config: { rateLimit: { max: opts.rateLimit, timeWindow: "1 minute" } } };

  app.post("/register", limit, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    const hash = await hashPassword(password);
    const { rows } = await app.pool.query<UserRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [email, hash],
    );
    if (!rows[0]) throw new ApiError(409, "EMAIL_TAKEN");
    const token = app.jwt.sign({ sub: rows[0].id });
    return reply.status(201).send({ token, user: toUser(rows[0]) });
  });

  app.post("/login", limit, async (req) => {
    const { email, password } = credentials.parse(req.body);
    const { rows } = await app.pool.query<UserRow & { password_hash: string }>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email],
    );
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw new ApiError(401, "INVALID_CREDENTIALS");
    return { token: app.jwt.sign({ sub: row.id }), user: toUser(row) };
  });
};
