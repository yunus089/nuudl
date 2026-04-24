import { createClient } from "redis";
import type { ApiStore, RateLimitCounterRecord } from "./store.js";

export type RateLimitBackend = "memory" | "redis";
export type ActiveRateLimitBackend = "memory" | "redis";

export type RateLimitHitOptions = {
  blockMs?: number;
  key: string;
  limit: number;
  nowIso: string;
  windowMs: number;
};

export type RateLimitHitResult = {
  backend: ActiveRateLimitBackend;
  blocked: boolean;
  count: number;
  counter: RateLimitCounterRecord;
  exceeded: boolean;
  fallbackReason?: string;
  retryAfterSeconds: number;
};

export type RateLimitReadiness = {
  activeBackend: ActiveRateLimitBackend;
  lastRedisError?: string;
  note: string;
  ready: boolean;
  redisAdapterImplemented: boolean;
  redisConfigured: boolean;
  requestedBackend: RateLimitBackend;
  status:
    | "memory_active"
    | "redis_active"
    | "redis_configured_but_inactive"
    | "redis_configured_pending"
    | "redis_missing_url"
    | "redis_unavailable_memory_fallback";
};

type RedisClient = ReturnType<typeof createClient>;

type RedisState = {
  client: RedisClient | null;
  connected: boolean;
  connecting: Promise<RedisClient | null> | null;
  lastError?: string;
};

const redisState: RedisState = {
  client: null,
  connected: false,
  connecting: null,
};

const REDIS_HIT_SCRIPT = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local nowIso = ARGV[2]
local windowMs = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
local blockMs = tonumber(ARGV[5])

local count = tonumber(redis.call("HGET", key, "count") or "0")
local windowEndsAtMs = tonumber(redis.call("HGET", key, "windowEndsAtMs") or "0")
local windowEndsAt = redis.call("HGET", key, "windowEndsAt") or ""
local blockedUntilMs = tonumber(redis.call("HGET", key, "blockedUntilMs") or "0")
local blockedUntil = redis.call("HGET", key, "blockedUntil") or ""
local lastExceededAt = redis.call("HGET", key, "lastExceededAt") or ""

if windowEndsAtMs <= nowMs then
  count = 0
  windowEndsAtMs = nowMs + windowMs
  windowEndsAt = ARGV[6]
  blockedUntilMs = 0
  blockedUntil = ""
  lastExceededAt = ""
  redis.call("HSET", key, "count", count, "windowEndsAtMs", windowEndsAtMs, "windowEndsAt", windowEndsAt)
  redis.call("HDEL", key, "blockedUntilMs", "blockedUntil", "lastExceededAt")
end

if blockedUntilMs > nowMs then
  return {1, count, 0, blockedUntilMs - nowMs, windowEndsAt, blockedUntil, lastExceededAt}
end

count = count + 1
redis.call("HSET", key, "count", count, "windowEndsAtMs", windowEndsAtMs, "windowEndsAt", windowEndsAt)

if count <= limit then
  redis.call("PEXPIRE", key, math.max(1, windowEndsAtMs - nowMs))
  return {0, count, 0, 0, windowEndsAt, blockedUntil, lastExceededAt}
end

lastExceededAt = nowIso
if blockMs > 0 then
  blockedUntilMs = nowMs + blockMs
  blockedUntil = ARGV[7]
  redis.call("HSET", key, "blockedUntilMs", blockedUntilMs, "blockedUntil", blockedUntil)
end

redis.call("HSET", key, "lastExceededAt", lastExceededAt)
redis.call("PEXPIRE", key, math.max(1, windowEndsAtMs - nowMs, blockedUntilMs - nowMs))
return {1, count, 1, math.max(1, math.max(windowEndsAtMs, blockedUntilMs) - nowMs), windowEndsAt, blockedUntil, lastExceededAt}
`;

const addMilliseconds = (iso: string, milliseconds: number) => new Date(Date.parse(iso) + milliseconds).toISOString();

const secondsUntil = (targetIso: string, nowMs: number) =>
  Math.max(1, Math.ceil((Date.parse(targetIso) - nowMs) / 1000));

const millisecondsToSeconds = (milliseconds: number) => Math.max(1, Math.ceil(milliseconds / 1000));

const getRequestedBackend = (): RateLimitBackend =>
  process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase() === "redis" ? "redis" : "memory";

const getRedisUrl = () => process.env.REDIS_URL?.trim() || "";

const getRedisConnectTimeoutMs = () => {
  const parsed = Number.parseInt(process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 750;
};

const ensureMemoryCounter = (
  store: ApiStore,
  key: string,
  nowIso: string,
  nowMs: number,
  windowMs: number,
): RateLimitCounterRecord => {
  const existing = store.rateLimitCounters[key];
  if (existing && Date.parse(existing.windowEndsAt) > nowMs) {
    return existing;
  }

  const counter = {
    count: 0,
    key,
    windowEndsAt: addMilliseconds(nowIso, windowMs),
  };
  store.rateLimitCounters[key] = counter;
  return counter;
};

const hitMemoryRateLimit = (
  store: ApiStore,
  options: RateLimitHitOptions,
  fallbackReason?: string,
): RateLimitHitResult => {
  const nowMs = Date.parse(options.nowIso);
  const counter = ensureMemoryCounter(store, options.key, options.nowIso, nowMs, options.windowMs);

  if (counter.blockedUntil && Date.parse(counter.blockedUntil) > nowMs) {
    return {
      backend: "memory",
      blocked: true,
      count: counter.count,
      counter,
      exceeded: false,
      fallbackReason,
      retryAfterSeconds: secondsUntil(counter.blockedUntil, nowMs),
    };
  }

  counter.count += 1;
  if (counter.count <= options.limit) {
    return {
      backend: "memory",
      blocked: false,
      count: counter.count,
      counter,
      exceeded: false,
      fallbackReason,
      retryAfterSeconds: 0,
    };
  }

  counter.lastExceededAt = options.nowIso;
  if (options.blockMs) {
    counter.blockedUntil = addMilliseconds(options.nowIso, options.blockMs);
  }

  return {
    backend: "memory",
    blocked: true,
    count: counter.count,
    counter,
    exceeded: true,
    fallbackReason,
    retryAfterSeconds: secondsUntil(counter.blockedUntil ?? counter.windowEndsAt, nowMs),
  };
};

const setRedisError = (error: unknown) => {
  redisState.connected = false;
  redisState.lastError = error instanceof Error ? error.message : String(error);
};

const getRedisClient = async () => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    redisState.lastError = "REDIS_URL is not configured.";
    return null;
  }

  if (redisState.client?.isOpen) {
    redisState.connected = true;
    return redisState.client;
  }

  if (redisState.connecting) {
    return redisState.connecting;
  }

  redisState.connecting = (async () => {
    const client = createClient({
      socket: {
        connectTimeout: getRedisConnectTimeoutMs(),
        reconnectStrategy: false,
      },
      url: redisUrl,
    });

    client.on("error", (error) => {
      setRedisError(error);
    });

    try {
      await client.connect();
      redisState.client = client;
      redisState.connected = true;
      redisState.lastError = undefined;
      return client;
    } catch (error) {
      setRedisError(error);
      try {
        await client.disconnect();
      } catch {
        // The connection may already be closed.
      }
      return null;
    } finally {
      redisState.connecting = null;
    }
  })();

  return redisState.connecting;
};

const toRedisNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRedisString = (value: unknown) => (typeof value === "string" ? value : String(value ?? ""));

const parseRedisHit = (
  key: string,
  nowIso: string,
  windowMs: number,
  result: unknown,
): RateLimitHitResult | null => {
  if (!Array.isArray(result) || result.length < 7) {
    return null;
  }

  const blocked = toRedisNumber(result[0]) === 1;
  const count = toRedisNumber(result[1]);
  const exceeded = toRedisNumber(result[2]) === 1;
  const retryMs = toRedisNumber(result[3]);
  const windowEndsAt = toRedisString(result[4]) || addMilliseconds(nowIso, windowMs);
  const blockedUntil = toRedisString(result[5]) || undefined;
  const lastExceededAt = toRedisString(result[6]) || undefined;

  return {
    backend: "redis",
    blocked,
    count,
    counter: {
      blockedUntil,
      count,
      key,
      lastExceededAt,
      windowEndsAt,
    },
    exceeded,
    retryAfterSeconds: retryMs > 0 ? millisecondsToSeconds(retryMs) : 0,
  };
};

const hitRedisRateLimit = async (options: RateLimitHitOptions): Promise<RateLimitHitResult | null> => {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const windowEndsAt = addMilliseconds(options.nowIso, options.windowMs);
  const blockedUntil = options.blockMs ? addMilliseconds(options.nowIso, options.blockMs) : "";

  try {
    const result = await client.eval(REDIS_HIT_SCRIPT, {
      arguments: [
        String(Date.parse(options.nowIso)),
        options.nowIso,
        String(options.windowMs),
        String(options.limit),
        String(options.blockMs ?? 0),
        windowEndsAt,
        blockedUntil,
      ],
      keys: [options.key],
    });

    const parsed = parseRedisHit(options.key, options.nowIso, options.windowMs, result);
    if (!parsed) {
      redisState.connected = false;
      redisState.lastError = "Redis returned an invalid rate-limit response.";
    }

    return parsed;
  } catch (error) {
    setRedisError(error);
    return null;
  }
};

const clearRedisCountersByInstall = async (installIdentityId: string) => {
  const client = await getRedisClient();
  if (!client) {
    return 0;
  }

  const keys: string[] = [];
  try {
    for await (const key of client.scanIterator({
      COUNT: 100,
      MATCH: `rl:*install:${installIdentityId}*`,
    })) {
      if (typeof key === "string") {
        keys.push(key);
      }
    }

    if (keys.length === 0) {
      return 0;
    }

    return await client.del(keys);
  } catch (error) {
    setRedisError(error);
    return 0;
  }
};

export const initializeRateLimitStore = async () => {
  if (getRequestedBackend() !== "redis") {
    return getRateLimitReadiness();
  }

  await getRedisClient();
  return getRateLimitReadiness();
};

export const getRateLimitReadiness = (): RateLimitReadiness => {
  const requestedBackend = getRequestedBackend();
  const redisConfigured = Boolean(getRedisUrl());

  if (requestedBackend === "redis" && !redisConfigured) {
    return {
      activeBackend: "memory",
      lastRedisError: redisState.lastError,
      note: "RATE_LIMIT_BACKEND=redis is requested, but REDIS_URL is missing. The API falls back to process-local memory limits.",
      ready: false,
      redisAdapterImplemented: true,
      redisConfigured,
      requestedBackend,
      status: "redis_missing_url",
    };
  }

  if (requestedBackend === "redis" && redisState.connected) {
    return {
      activeBackend: "redis",
      note: "Redis-backed rate limits are active.",
      ready: true,
      redisAdapterImplemented: true,
      redisConfigured,
      requestedBackend,
      status: "redis_active",
    };
  }

  if (requestedBackend === "redis" && redisState.lastError) {
    return {
      activeBackend: "memory",
      lastRedisError: redisState.lastError,
      note: "Redis-backed rate limits were requested, but Redis is unavailable. The API is using process-local memory fallback.",
      ready: false,
      redisAdapterImplemented: true,
      redisConfigured,
      requestedBackend,
      status: "redis_unavailable_memory_fallback",
    };
  }

  if (requestedBackend === "redis") {
    return {
      activeBackend: "memory",
      note: "Redis-backed rate limits are configured and will connect during API startup or first use.",
      ready: false,
      redisAdapterImplemented: true,
      redisConfigured,
      requestedBackend,
      status: "redis_configured_pending",
    };
  }

  return {
    activeBackend: "memory",
    note: redisConfigured
      ? "REDIS_URL is configured, but RATE_LIMIT_BACKEND=memory keeps rate limits process-local for the current beta deploy."
      : "Process-local memory rate limits are active.",
    ready: true,
    redisAdapterImplemented: true,
    redisConfigured,
    requestedBackend,
    status: redisConfigured ? "redis_configured_but_inactive" : "memory_active",
  };
};

export const createRateLimitStore = (store: ApiStore) => ({
  async clearByInstall(installIdentityId: string) {
    let cleared = 0;

    if (getRequestedBackend() === "redis") {
      cleared += await clearRedisCountersByInstall(installIdentityId);
    }

    for (const key of Object.keys(store.rateLimitCounters)) {
      if (!key.includes(`install:${installIdentityId}`)) {
        continue;
      }

      delete store.rateLimitCounters[key];
      cleared += 1;
    }

    return cleared;
  },
  count() {
    return Object.keys(store.rateLimitCounters).length;
  },
  async hit(options: RateLimitHitOptions): Promise<RateLimitHitResult> {
    if (getRequestedBackend() !== "redis") {
      return hitMemoryRateLimit(store, options);
    }

    const redisResult = await hitRedisRateLimit(options);
    if (redisResult) {
      return redisResult;
    }

    return hitMemoryRateLimit(store, options, redisState.lastError ?? "redis_unavailable");
  },
  readiness: getRateLimitReadiness(),
});
