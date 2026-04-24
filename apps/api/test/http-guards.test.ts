import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import Fastify from "fastify";
import { registerRoutes } from "../src/routes.ts";
import { createInMemoryStoreForTests, issueInstallSession } from "../src/store.ts";

describe("http guards", () => {
  test("rejects content-type headers with leading or trailing whitespace", async () => {
    const app = Fastify({ logger: false });
    await registerRoutes(app, createInMemoryStoreForTests());
    await app.ready();

    try {
      const response = await app.inject({
        headers: {
          "content-type": " application/json",
        },
        method: "POST",
        payload: JSON.stringify({ betaInviteCode: "TEST" }),
        url: "/beta/invite/check",
      });
      const body = response.json();

      assert.equal(response.statusCode, 400);
      assert.equal(body.error.code, "BAD_REQUEST");
      assert.equal(body.error.message, "Invalid Content-Type header.");
    } finally {
      await app.close();
    }
  });

  test("media uploads prefer configured public API origins and forwarded proxy headers", async () => {
    const previousApiPublicBaseUrl = process.env.API_PUBLIC_BASE_URL;
    const previousNuudlApiBaseUrl = process.env.NUUDL_API_BASE_URL;
    const previousUploadsDir = process.env.API_UPLOADS_DIR;
    const store = createInMemoryStoreForTests();
    const session = issueInstallSession(store, store.installIdentity.id);
    const app = Fastify({ logger: false });
    const uploadsDir = await mkdtemp(join(tmpdir(), "nuudl-media-"));
    await registerRoutes(app, store);
    await app.ready();

    try {
      process.env.API_UPLOADS_DIR = uploadsDir;
      process.env.API_PUBLIC_BASE_URL = "https://api.example.test";
      delete process.env.NUUDL_API_BASE_URL;

      const configuredOriginResponse = await app.inject({
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          "content-type": "image/png",
          host: "internal-api:4000",
        },
        method: "POST",
        payload: Buffer.from("fake-image"),
        url: "/media/uploads",
      });
      assert.equal(configuredOriginResponse.statusCode, 201);
      assert.match(configuredOriginResponse.json().asset.url, /^https:\/\/api\.example\.test\/media\//);

      delete process.env.API_PUBLIC_BASE_URL;

      const forwardedOriginResponse = await app.inject({
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          "content-type": "image/png",
          host: "internal-api:4000",
          "x-forwarded-host": "api.public.test",
          "x-forwarded-proto": "https",
        },
        method: "POST",
        payload: Buffer.from("fake-image-2"),
        url: "/media/uploads",
      });
      assert.equal(forwardedOriginResponse.statusCode, 201);
      assert.match(forwardedOriginResponse.json().asset.url, /^https:\/\/api\.public\.test\/media\//);
    } finally {
      if (previousApiPublicBaseUrl === undefined) {
        delete process.env.API_PUBLIC_BASE_URL;
      } else {
        process.env.API_PUBLIC_BASE_URL = previousApiPublicBaseUrl;
      }

      if (previousNuudlApiBaseUrl === undefined) {
        delete process.env.NUUDL_API_BASE_URL;
      } else {
        process.env.NUUDL_API_BASE_URL = previousNuudlApiBaseUrl;
      }

      if (previousUploadsDir === undefined) {
        delete process.env.API_UPLOADS_DIR;
      } else {
        process.env.API_UPLOADS_DIR = previousUploadsDir;
      }

      await app.close();
      await rm(uploadsDir, { force: true, recursive: true });
    }
  });

  test("rejects uploads above the configured size limit", async () => {
    const previousUploadsDir = process.env.API_UPLOADS_DIR;
    const previousMaxUploadBytes = process.env.MEDIA_UPLOAD_MAX_BYTES;
    const store = createInMemoryStoreForTests();
    const session = issueInstallSession(store, store.installIdentity.id);
    const app = Fastify({ logger: false });
    const uploadsDir = await mkdtemp(join(tmpdir(), "nuudl-media-limit-"));
    await registerRoutes(app, store);
    await app.ready();

    try {
      process.env.API_UPLOADS_DIR = uploadsDir;
      process.env.MEDIA_UPLOAD_MAX_BYTES = "4";

      const response = await app.inject({
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          "content-type": "image/png",
        },
        method: "POST",
        payload: Buffer.from("12345"),
        url: "/media/uploads",
      });
      const body = response.json();

      assert.equal(response.statusCode, 400);
      assert.equal(body.error.code, "BAD_REQUEST");
      assert.match(body.error.message, /size limit/i);
    } finally {
      if (previousUploadsDir === undefined) {
        delete process.env.API_UPLOADS_DIR;
      } else {
        process.env.API_UPLOADS_DIR = previousUploadsDir;
      }

      if (previousMaxUploadBytes === undefined) {
        delete process.env.MEDIA_UPLOAD_MAX_BYTES;
      } else {
        process.env.MEDIA_UPLOAD_MAX_BYTES = previousMaxUploadBytes;
      }

      await app.close();
      await rm(uploadsDir, { force: true, recursive: true });
    }
  });
});
