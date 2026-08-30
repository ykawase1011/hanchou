import assert from "node:assert/strict";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { Script } from "node:vm";
import {
  createDashboardServer,
  type DashboardSnapshot,
} from "../lib/dashboard.ts";

interface ResponseResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface RequestOptions {
  method?: string;
  hostHeader?: string;
  path?: string;
}

function request(url: string, options: RequestOptions = {}): Promise<ResponseResult> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        agent: false,
        hostname: target.hostname,
        port: target.port,
        method: options.method ?? "GET",
        path: options.path ?? `${target.pathname}${target.search}`,
        headers: { Host: options.hostHeader ?? target.host },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

function assertSecurityHeaders(response: ResponseResult): void {
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  const csp = response.headers["content-security-policy"];
  assert.equal(typeof csp, "string");
  assert.match(csp as string, /default-src 'none'/);
  assert.match(csp as string, /frame-ancestors 'none'/);
}

function bounded<T>(promise: Promise<T>, milliseconds = 1000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("operation timed out")), milliseconds).unref();
    }),
  ]);
}

await assert.rejects(
  createDashboardServer({
    host: "0.0.0.0",
    port: 0,
    profile: "work",
    snapshot: () => ({}),
  }),
  /127\.0\.0\.1 or ::1/,
);

await assert.rejects(
  createDashboardServer({
    host: "localhost",
    port: 0,
    profile: "work",
    snapshot: () => ({}),
  }),
  /127\.0\.0\.1 or ::1/,
);

await assert.rejects(
  createDashboardServer({
    host: "127.0.0.1",
    port: -1,
    profile: "work",
    snapshot: () => ({}),
  }),
  /port/,
);

const hostile = `<img src=x onerror="globalThis.pwned=true">&\"'`;
const snapshot: DashboardSnapshot = {
  generated_at: "2026-08-31T00:00:00.000Z",
  profile: "provider-profile",
  system: {
    herdr_running: true,
    herdr_version: "0.8.2",
    orchestrator_status: hostile,
    task_ui_running: false,
    dashboard_url: "http://127.0.0.1/dashboard",
    task_ui_url: "http://127.0.0.1/tasks",
  },
  tasks: {
    active: 1,
    total: 2,
    by_status: { in_progress: 1, closed: 1 },
    items: [{ id: "han-1", title: hostile, status: "in_progress" }],
  },
  agents: [{ name: hostile, role: "implementer", status: "running" }],
  relay: { pending_inbox: 1, pending_deliveries: 0 },
  workspace: {
    registry_configured: true,
    registry_path: `/tmp/${hostile}`,
    roots: [{ id: "work", path: "/tmp/work" }],
    projects: 3,
  },
  herdrm: { installed: false, compatible: false, message: hostile },
  commands: {
    herdr: "hanchou open herdr work",
    orchestrator: "hanchou open orchestrator work",
    tasks: "hanchou open tasks work",
    automations: "hanchou open automations work",
    herdrm: hostile,
  },
};

let calls = 0;
let failSnapshot = false;
let hangSnapshot = false;
let markHangingSnapshotStarted: (() => void) | undefined;
const handle = await createDashboardServer({
  host: "127.0.0.1",
  port: 0,
  profile: `work-${hostile}`,
  snapshot: async () => {
    calls += 1;
    if (failSnapshot) throw new Error("fixture failure");
    if (hangSnapshot) {
      markHangingSnapshotStarted?.();
      return await new Promise<DashboardSnapshot>(() => {});
    }
    return snapshot;
  },
});

try {
  const parsedUrl = new URL(handle.url);
  const port = Number(parsedUrl.port);
  assert.equal(parsedUrl.hostname, "127.0.0.1");
  assert.ok(Number.isInteger(port) && port > 0, "port 0 must resolve to the listening port");

  const page = await request(handle.url);
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"] ?? "", /^text\/html; charset=utf-8$/);
  assertSecurityHeaders(page);
  assert.match(page.headers["content-security-policy"] as string, /script-src 'nonce-[^']+'/);
  assert.match(page.headers["content-security-policy"] as string, /connect-src 'self'/);
  assert.match(page.body, /Hanchou ダッシュボード/);
  assert.match(page.body, /プロファイル/);
  assert.match(page.body, /システム/);
  assert.match(page.body, /タスク/);
  assert.match(page.body, /エージェント/);
  assert.match(page.body, /ワークスペース/);
  assert.match(page.body, /クイックリンク/);
  assert.match(page.body, /HerdrM 互換性/);
  assert.match(page.body, /\.textContent\s*=/);
  assert.doesNotMatch(page.body, /\.innerHTML\s*=/);
  assert.doesNotMatch(page.body, new RegExp(hostile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(page.body, /<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/i);
  assert.doesNotMatch(page.body, /telemetry|analytics/i);
  assert.match(page.body, /setInterval\(\(\) => void load\(\), 5000\)/);
  assert.match(page.body, /new AbortController\(\)/);
  const inlineScript = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(page.body)?.[1];
  assert.ok(inlineScript, "the local dashboard script must be present");
  assert.doesNotThrow(() => new Script(inlineScript));
  assert.equal(calls, 0, "the static page must not evaluate the snapshot provider");

  const health = await request(`${handle.url}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: "ok" });
  assertSecurityHeaders(health);
  assert.equal(calls, 0);

  const status = await request(`${handle.url}/api/status`);
  assert.equal(status.status, 200);
  assertSecurityHeaders(status);
  assert.match(status.headers["content-type"] ?? "", /^application\/json; charset=utf-8$/);
  assert.doesNotMatch(status.body, /<img\b/i, "JSON transport must not expose raw HTML delimiters");
  const payload = JSON.parse(status.body) as DashboardSnapshot;
  assert.equal(payload.profile, `work-${hostile}`, "the configured profile is authoritative");
  assert.deepEqual(payload.system, snapshot.system);
  assert.deepEqual(payload.tasks, snapshot.tasks);
  assert.deepEqual(payload.agents, snapshot.agents);
  assert.deepEqual(payload.workspace, snapshot.workspace);
  assert.deepEqual(payload.herdrm, snapshot.herdrm);
  assert.deepEqual(payload.commands, snapshot.commands);
  assert.equal(calls, 1);

  const queryPage = await request(handle.url, { path: "/?refresh=1" });
  assert.equal(queryPage.status, 200);

  const unknown = await request(`${handle.url}/does-not-exist`);
  assert.equal(unknown.status, 404);
  assertSecurityHeaders(unknown);

  const traversal = await request(handle.url, { path: "/ignored/../health" });
  assert.equal(traversal.status, 404, "only the three exact route paths are accepted");

  const post = await request(`${handle.url}/api/status`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET");
  assertSecurityHeaders(post);
  assert.equal(calls, 1, "non-GET requests must not call the provider");

  const head = await request(handle.url, { method: "HEAD" });
  assert.equal(head.status, 405);
  assert.equal(head.headers.allow, "GET");

  const unknownPost = await request(`${handle.url}/unknown`, { method: "DELETE" });
  assert.equal(unknownPost.status, 405);

  const localhostHost = await request(`${handle.url}/health`, {
    hostHeader: `localhost:${String(port)}`,
  });
  assert.equal(localhostHost.status, 200);

  const loopbackAlias = await request(`${handle.url}/health`, {
    hostHeader: `127.0.0.2:${String(port)}`,
  });
  assert.equal(loopbackAlias.status, 200);

  const externalHost = await request(`${handle.url}/health`, {
    hostHeader: `example.invalid:${String(port)}`,
  });
  assert.equal(externalHost.status, 400);
  assertSecurityHeaders(externalHost);

  const wrongPort = await request(`${handle.url}/health`, {
    hostHeader: `127.0.0.1:${String(port + 1)}`,
  });
  assert.equal(wrongPort.status, 400);

  const missingPort = await request(`${handle.url}/health`, {
    hostHeader: "127.0.0.1",
  });
  assert.equal(missingPort.status, 400);

  failSnapshot = true;
  const degraded = await request(`${handle.url}/api/status`);
  assert.equal(degraded.status, 503);
  assert.deepEqual(JSON.parse(degraded.body), { status: "degraded" });
  assertSecurityHeaders(degraded);
  assert.equal(calls, 2);

  failSnapshot = false;
  hangSnapshot = true;
  const hangingStarted = new Promise<void>((resolve) => {
    markHangingSnapshotStarted = resolve;
  });
  const hangingRequest = request(`${handle.url}/api/status`).then(
    () => "responded",
    () => "closed",
  );
  await bounded(hangingStarted);
  const firstClose = handle.close();
  assert.strictEqual(handle.close(), firstClose, "close must be idempotent while in progress");
  await bounded(firstClose);
  assert.equal(await bounded(hangingRequest), "closed", "close must terminate a hanging snapshot request");
  await bounded(handle.close());
} finally {
  await bounded(handle.close());
}

assert.equal(handle.server.listening, false);
console.log("dashboard server tests passed");
