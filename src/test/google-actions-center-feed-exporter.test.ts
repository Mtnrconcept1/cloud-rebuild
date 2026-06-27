import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];

function makeFixture(name: string) {
  const root = path.join(process.cwd(), ".tmp", `${name}-${Date.now()}`);
  fixtures.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

function runNode(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      timeout: 20_000,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("Google Actions Center feed exporter", () => {
  it("downloads authenticated feed endpoints and writes Google-ready gzip shards", async () => {
    const outputDir = makeFixture("google-actions-center-feeds");
    const expectedAuthorization = `Basic ${Buffer.from("tok:secret").toString("base64")}`;
    const capturedUrls: string[] = [];

    const server = createServer((req, res) => {
      capturedUrls.push(req.url || "");
      expect(req.headers.authorization).toBe(expectedAuthorization);

      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const commonHeaders = { "content-type": "application/json" };

      if (pathname === "/v3/feeds/merchants/") {
        res.writeHead(200, commonHeaders);
        res.end(JSON.stringify({
          metadata: {
            generation_timestamp: { seconds: 1800000001 },
            processing_instruction: "PROCESS_AS_COMPLETE",
          },
          merchant: [{ merchant_id: "restaurant-1", name: "TOK Test" }],
        }));
        return;
      }

      if (pathname === "/v3/feeds/services/") {
        res.writeHead(200, commonHeaders);
        res.end(JSON.stringify({
          metadata: {
            generation_timestamp: { seconds: 1800000002 },
            processing_instruction: "PROCESS_AS_COMPLETE",
          },
          service: [{ merchant_id: "restaurant-1", service_id: "tok-table-reservation" }],
        }));
        return;
      }

      if (pathname === "/v3/feeds/availability/") {
        res.writeHead(200, commonHeaders);
        res.end(JSON.stringify({
          metadata: {
            generation_timestamp: { seconds: 1800000003 },
            processing_instruction: "PROCESS_AS_COMPLETE",
          },
          service_availability: [{ merchant_id: "restaurant-1", spots_open: 4 }],
        }));
        return;
      }

      res.writeHead(404, commonHeaders);
      res.end(JSON.stringify({ error: "not_found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local test server port.");

    try {
      const result = await runNode(["scripts/google-actions-center-export-feeds.mjs", "--output", outputDir], {
        GOOGLE_ACTIONS_CENTER_FEED_BASE_URL: `http://127.0.0.1:${address.port}`,
        GOOGLE_ACTIONS_CENTER_USERNAME: "tok",
        GOOGLE_ACTIONS_CENTER_PASSWORD: "secret",
        GOOGLE_ACTIONS_CENTER_FEED_LIMIT: "25",
        GOOGLE_ACTIONS_CENTER_AVAILABILITY_DAYS: "30",
      });

      expect(result.stdout).toContain("merchant_feed_1800000001_001_of_001.json.gz");
      expect(result.stderr).toBe("");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(capturedUrls).toEqual([
      "/v3/feeds/merchants/?limit=25",
      "/v3/feeds/services/?limit=25",
      "/v3/feeds/availability/?limit=25&days=30",
    ]);

    const files = readdirSync(outputDir).sort();
    expect(files).toEqual([
      "availability_feed_1800000003_001_of_001.json.gz",
      "merchant_feed_1800000001_001_of_001.json.gz",
      "service_feed_1800000002_001_of_001.json.gz",
    ]);

    for (const file of files) {
      const payload = JSON.parse(gunzipSync(readFileSync(path.join(outputDir, file))).toString("utf8"));
      expect(payload.metadata.processing_instruction).toBe("PROCESS_AS_COMPLETE");
    }
  });
});
