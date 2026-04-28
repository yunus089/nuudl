import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRateLimitStore, getRateLimitReadiness } from "../src/rate-limit-store.ts";
import { createInMemoryStoreForTests } from "../src/store.ts";

describe("rate-limit store seam", () => {
  test("memory backend blocks after the limit and preserves retry metadata", async () => {
    const store = createInMemoryStoreForTests();
    const rateLimits = createRateLimitStore(store);
    const key = "rl:POST /replies:install:install-one:60000";
    const nowIso = "2026-04-16T10:00:00.000Z";

    const first = await rateLimits.hit({ key, limit: 2, nowIso, windowMs: 60_000 });
    const second = await rateLimits.hit({ key, limit: 2, nowIso, windowMs: 60_000 });
    const blocked = await rateLimits.hit({ blockMs: 30_000, key, limit: 2, nowIso, windowMs: 60_000 });
    const blockedAgain = await rateLimits.hit({
      blockMs: 30_000,
      key,
      limit: 2,
      nowIso: "2026-04-16T10:00:10.000Z",
      windowMs: 60_000,
    });

    assert.equal(first.blocked, false);
    assert.equal(second.blocked, false);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.exceeded, true);
    assert.equal(blocked.count, 3);
    assert.equal(blocked.retryAfterSeconds, 30);
    assert.equal(blocked.counter.lastExceededAt, nowIso);
    assert.equal(blocked.counter.blockedUntil, "2026-04-16T10:00:30.000Z");
    assert.equal(blockedAgain.blocked, true);
    assert.equal(blockedAgain.exceeded, false);
    assert.equal(blockedAgain.count, 3);
    assert.equal(blockedAgain.retryAfterSeconds, 20);
  });

  test("memory backend resets expired windows", async () => {
    const store = createInMemoryStoreForTests();
    const rateLimits = createRateLimitStore(store);
    const key = "rl:POST /posts:ip:ip-one:60000";

    const blocked = await rateLimits.hit({
      key,
      limit: 1,
      nowIso: "2026-04-16T10:00:00.000Z",
      windowMs: 60_000,
    });
    const exceeded = await rateLimits.hit({
      key,
      limit: 1,
      nowIso: "2026-04-16T10:00:00.000Z",
      windowMs: 60_000,
    });
    const reset = await rateLimits.hit({
      key,
      limit: 1,
      nowIso: "2026-04-16T10:01:01.000Z",
      windowMs: 60_000,
    });

    assert.equal(blocked.blocked, false);
    assert.equal(exceeded.blocked, true);
    assert.equal(reset.blocked, false);
    assert.equal(reset.count, 1);
    assert.equal(reset.counter.windowEndsAt, "2026-04-16T10:02:01.000Z");
  });

  test("clearByInstall only removes matching install-scoped counters", async () => {
    const store = createInMemoryStoreForTests();
    const rateLimits = createRateLimitStore(store);

    store.rateLimitCounters["rl:POST /posts:install:install-one:60000"] = {
      count: 1,
      key: "rl:POST /posts:install:install-one:60000",
      windowEndsAt: "2026-04-16T10:01:00.000Z",
    };
    store.rateLimitCounters["rl:POST /posts:install:install-two:60000"] = {
      count: 1,
      key: "rl:POST /posts:install:install-two:60000",
      windowEndsAt: "2026-04-16T10:01:00.000Z",
    };

    assert.equal(await rateLimits.clearByInstall("install-one"), 1);
    assert.equal(store.rateLimitCounters["rl:POST /posts:install:install-one:60000"], undefined);
    assert.ok(store.rateLimitCounters["rl:POST /posts:install:install-two:60000"]);
  });

  test("presence memory backend records a heartbeat and reflects the active count", async () => {
    const store = createInMemoryStoreForTests();
    const rateLimits = createRateLimitStore(store);

    await rateLimits.presence.heartbeat("city-pres-001", "install-alpha");
    const count = await rateLimits.presence.getActiveCount("city-pres-001");

    assert.equal(count, 1);
  });

  test("presence memory backend deduplicates the same install and counts distinct ones", async () => {
    const store = createInMemoryStoreForTests();
    const rateLimits = createRateLimitStore(store);

    await rateLimits.presence.heartbeat("city-pres-002", "install-alpha");
    await rateLimits.presence.heartbeat("city-pres-002", "install-beta");
    await rateLimits.presence.heartbeat("city-pres-002", "install-beta");
    const count = await rateLimits.presence.getActiveCount("city-pres-002");

    assert.equal(count, 2);
  });

  test("presence redis mode falls back to memory when redis is unavailable", async () => {
    const previousBackend = process.env.RATE_LIMIT_BACKEND;
    const previousRedisUrl = process.env.REDIS_URL;
    const previousRedisTimeout = process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS;
    try {
      process.env.RATE_LIMIT_BACKEND = "redis";
      process.env.REDIS_URL = "redis://127.0.0.1:1";
      process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS = "50";

      const store = createInMemoryStoreForTests();
      const rateLimits = createRateLimitStore(store);

      await rateLimits.presence.heartbeat("city-pres-003", "install-redis-fallback");
      const count = await rateLimits.presence.getActiveCount("city-pres-003");

      assert.ok(typeof count === "number", "expected a number via memory fallback, not null");
      assert.equal(count, 1);
    } finally {
      if (previousBackend === undefined) {
        delete process.env.RATE_LIMIT_BACKEND;
      } else {
        process.env.RATE_LIMIT_BACKEND = previousBackend;
      }

      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }

      if (previousRedisTimeout === undefined) {
        delete process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS;
      } else {
        process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS = previousRedisTimeout;
      }
    }
  });

  test("redis falls back to memory when unavailable instead of breaking writes", async () => {
    const previousBackend = process.env.RATE_LIMIT_BACKEND;
    const previousRedisUrl = process.env.REDIS_URL;
    const previousRedisTimeout = process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS;
    try {
      process.env.RATE_LIMIT_BACKEND = "redis";
      process.env.REDIS_URL = "redis://127.0.0.1:1";
      process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS = "50";

      const store = createInMemoryStoreForTests();
      const rateLimits = createRateLimitStore(store);
      const hit = await rateLimits.hit({
        key: "rl:POST /posts:install:install-redis-fallback:60000",
        limit: 1,
        nowIso: "2026-04-16T10:00:00.000Z",
        windowMs: 60_000,
      });

      const readiness = getRateLimitReadiness();

      assert.equal(hit.backend, "memory");
      assert.equal(hit.blocked, false);
      assert.ok(hit.fallbackReason);
      assert.equal(readiness.requestedBackend, "redis");
      assert.equal(readiness.activeBackend, "memory");
      assert.equal(readiness.ready, false);
      assert.equal(readiness.redisConfigured, true);
      assert.equal(readiness.redisAdapterImplemented, true);
      assert.equal(readiness.status, "redis_unavailable_memory_fallback");
    } finally {
      if (previousBackend === undefined) {
        delete process.env.RATE_LIMIT_BACKEND;
      } else {
        process.env.RATE_LIMIT_BACKEND = previousBackend;
      }

      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }

      if (previousRedisTimeout === undefined) {
        delete process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS;
      } else {
        process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS = previousRedisTimeout;
      }
    }
  });
});
