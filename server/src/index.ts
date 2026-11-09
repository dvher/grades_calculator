import { buildApp } from "./app.js";
import { createPool, migrate } from "./db.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return v;
}

const databaseUrl = required("DATABASE_URL");
const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const origins = process.env.CORS_ORIGINS;

const pool = createPool(databaseUrl);
await migrate(pool);

const app = await buildApp({
  pool,
  jwtSecret,
  corsOrigins: !origins || origins === "*" ? true : origins.split(",").map((o) => o.trim()),
  logger: true,
  webDir: process.env.WEB_DIR || undefined,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host });
