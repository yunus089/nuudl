import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRoutes } from "../src/routes.ts";
import {
  createInMemoryStoreForTests,
  issueInstallSession,
  type ApiStore,
} from "../src/store.ts";

type TestContext = {
  app: FastifyInstance;
  store: ApiStore;
};

const buildTestContext = async (): Promise<TestContext> => {
  const app = Fastify({ logger: false });
  const store = createInMemoryStoreForTests();
  await registerRoutes(app, store);
  await app.ready();
  return { app, store };
};

describe("city presence endpoint", () => {
  test("GET /city/presence without cityId returns null activeCount", async () => {
    const { app } = await buildTestContext();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/city/presence",
      });
      const body = response.json() as { activeCount: unknown };

      assert.equal(response.statusCode, 200);
      assert.equal(body.activeCount, null);
    } finally {
      await app.close();
    }
  });

  test("GET /city/presence without session returns a count without error", async () => {
    const { app } = await buildTestContext();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/city/presence?cityId=city-endpoint-001",
      });
      const body = response.json() as { activeCount: unknown };

      assert.equal(response.statusCode, 200);
      assert.ok("activeCount" in body, "response should include activeCount");
      assert.ok(
        body.activeCount === null || typeof body.activeCount === "number",
        "activeCount should be a number or null",
      );
    } finally {
      await app.close();
    }
  });

  test("GET /city/presence with valid session records presence and returns count >= 1", async () => {
    const { app, store } = await buildTestContext();
    try {
      const session = issueInstallSession(store, store.installIdentity.id);
      const response = await app.inject({
        headers: { authorization: `Bearer ${session.accessToken}` },
        method: "GET",
        url: "/city/presence?cityId=city-endpoint-002",
      });
      const body = response.json() as { activeCount: number | null };

      assert.equal(response.statusCode, 200);
      assert.ok(
        typeof body.activeCount === "number" && body.activeCount >= 1,
        `expected activeCount >= 1, got ${String(body.activeCount)}`,
      );
    } finally {
      await app.close();
    }
  });
});
