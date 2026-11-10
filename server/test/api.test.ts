import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { createPool, migrate, type Pool } from "../src/db";

let pool: Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL!);
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  app = await buildApp({ pool, jwtSecret: "test-secret-test-secret-test-secret!", corsOrigins: true, authRateLimit: 1000 });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function register(email: string, password = "password123") {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password } });
  expect(res.statusCode).toBe(201);
  return res.json().token as string;
}

const CLASS_ID = "7d3c1f5e-2b4a-4c1e-9f0a-1b2c3d4e5f60";

function cls(over: Record<string, unknown> = {}) {
  return {
    id: CLASS_ID,
    name: "Cálculo I",
    examWeight: 30,
    minExamGrade: 4,
    examGrade: null,
    items: [
      { id: "c1", name: "Certamen 1", weight: 35, grade: 6 },
      { id: "c2", name: "Certamen 2", weight: 35, grade: null, children: null },
    ],
    updatedAt: 1000,
    deleted: false,
    ...over,
  };
}

async function sync(token: string, body: object) {
  return app.inject({ method: "POST", url: "/api/sync", headers: { authorization: `Bearer ${token}` }, payload: body });
}

describe("auth", () => {
  it("registers, rejects duplicates and logs in case-insensitively", async () => {
    await register("ana@example.com");
    const dup = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "ANA@example.com", password: "password123" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("EMAIL_TAKEN");

    const ok = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "Ana@Example.com", password: "password123" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe("ana@example.com");

    const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@example.com", password: "wrongpass1" } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects requests without a valid token", async () => {
    expect((await app.inject({ method: "POST", url: "/api/sync", payload: { classes: [] } })).statusCode).toBe(401);
    expect((await sync("nope", { classes: [] })).statusCode).toBe(401);
  });
});

describe("sync", () => {
  it("stores classes and returns the merged state with default settings", async () => {
    const token = await register("sync@example.com");
    const res = await sync(token, { classes: [cls()] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.classes).toHaveLength(1);
    expect(body.classes[0]).toMatchObject({ id: CLASS_ID, name: "Cálculo I", updatedAt: 1000, deleted: false });
    expect(body.settings).toEqual({ scale: { min: 1, max: 7, pass: 4 }, scaleUpdatedAt: 0 });
  });

  it("stores the presentation check, defaulting to the passing grade for older clients", async () => {
    const token = await register("presentation@example.com");
    let res = await sync(token, { classes: [cls()] });
    expect(res.json().classes[0].minPresentationGrade).toBe(4);
    res = await sync(token, { classes: [cls({ minPresentationGrade: null, updatedAt: 2000 })] });
    expect(res.json().classes[0].minPresentationGrade).toBeNull();
    res = await sync(token, { classes: [cls({ minPresentationGrade: 3.5, updatedAt: 3000 })] });
    expect(res.json().classes[0].minPresentationGrade).toBe(3.5);
  });

  it("keeps the newest version of each class, including deletions", async () => {
    const token = await register("lww@example.com");
    await sync(token, { classes: [cls({ name: "v2", updatedAt: 2000 })] });

    // An older edit from another device does not overwrite the newer one.
    let res = (await sync(token, { classes: [cls({ name: "v1", updatedAt: 1500 })] })).json();
    expect(res.classes[0]).toMatchObject({ name: "v2", updatedAt: 2000 });

    // A newer tombstone wins.
    res = (await sync(token, { classes: [cls({ updatedAt: 3000, deleted: true })] })).json();
    expect(res.classes[0]).toMatchObject({ deleted: true, updatedAt: 3000 });

    // A device that has nothing yet receives everything.
    res = (await sync(token, { classes: [] })).json();
    expect(res.classes).toHaveLength(1);
  });

  it("syncs the grading scale by newest timestamp", async () => {
    const token = await register("scale@example.com");
    const scale = { min: 0, max: 10, pass: 5 };
    let res = (await sync(token, { classes: [], settings: { scale, scaleUpdatedAt: 50 } })).json();
    expect(res.settings).toEqual({ scale, scaleUpdatedAt: 50 });
    res = (await sync(token, { classes: [], settings: { scale: { min: 1, max: 7, pass: 4 }, scaleUpdatedAt: 10 } })).json();
    expect(res.settings).toEqual({ scale, scaleUpdatedAt: 50 });

    const bad = await sync(token, { classes: [], settings: { scale: { min: 7, max: 1, pass: 4 }, scaleUpdatedAt: 99 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("INVALID_SCALE");
  });

  it("isolates users, even when they use the same class id", async () => {
    const a = await register("alice@example.com");
    const b = await register("bob@example.com");
    await sync(a, { classes: [cls({ name: "Alice's", updatedAt: 1 })] });
    await sync(b, { classes: [cls({ name: "Bob's", updatedAt: 999999 })] });

    const ra = (await sync(a, { classes: [] })).json();
    const rb = (await sync(b, { classes: [] })).json();
    expect(ra.classes).toHaveLength(1);
    expect(ra.classes[0].name).toBe("Alice's");
    expect(rb.classes[0].name).toBe("Bob's");
  });

  it("validates bodies", async () => {
    const token = await register("validate@example.com");
    const badWeight = await sync(token, { classes: [cls({ examWeight: 150 })] });
    expect(badWeight.statusCode).toBe(400);
    expect(badWeight.json().error.code).toBe("VALIDATION");
    const badId = await sync(token, { classes: [cls({ id: "not-a-uuid" })] });
    expect(badId.statusCode).toBe(400);
    const dupIds = await sync(token, { classes: [cls({ items: [{ id: "x", name: "X", weight: 1, grade: null }, { id: "x", name: "Y", weight: 1, grade: null }] })] });
    expect(dupIds.statusCode).toBe(400);
  });
});

describe("misc", () => {
  it("serves health and JSON 404s under /api", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "GET", url: "/api/nope" })).statusCode).toBe(404);
  });
});
