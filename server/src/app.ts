import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import type { Pool } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { syncRoutes } from "./routes/sync.js";

export interface AppOptions {
  pool: Pool;
  jwtSecret: string;
  corsOrigins: string[] | true;
  logger?: boolean;
  /** Requests per minute per IP on auth routes. */
  authRateLimit?: number;
  /** Directory with the built web app to serve at /, if any. */
  webDir?: string;
}

/** Errors carry a stable `code` that clients translate. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    pool: Pool;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 4 * 1024 * 1024 });

  app.decorate("pool", opts.pool);
  await app.register(cors, { origin: opts.corsOrigins, methods: ["GET", "POST"] });
  await app.register(rateLimit, { global: false });
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: "30d" } });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new ApiError(401, "UNAUTHORIZED");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const invalidScale = err.issues.some((i) => i.message === "INVALID_SCALE");
      return reply.status(400).send({
        error: {
          code: invalidScale ? "INVALID_SCALE" : "VALIDATION",
          message: "Invalid request",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
    if (status < 500) {
      return reply.status(status).send({ error: { code: "BAD_REQUEST", message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  });

  await app.register(async (api) => {
    api.get("/health", async () => ({ ok: true }));
    await api.register(authRoutes, { prefix: "/auth", rateLimit: opts.authRateLimit ?? 20 });
    await api.register(meRoutes, { prefix: "/me" });
    await api.register(syncRoutes, { prefix: "/sync" });
  }, { prefix: "/api" });

  if (opts.webDir) await app.register(fastifyStatic, { root: opts.webDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    // Single-page app: unknown non-API page routes (no file extension) fall back to index.html.
    const pathname = req.url.split("?")[0];
    if (opts.webDir && req.method === "GET" && !pathname.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(pathname)) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  return app;
}
