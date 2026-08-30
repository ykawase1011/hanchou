import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface DashboardSnapshot {
  generated_at?: string;
  profile?: string;
  system?: Readonly<Record<string, unknown>>;
  tasks?: Readonly<Record<string, unknown>>;
  agents?: readonly Readonly<Record<string, unknown>>[];
  relay?: Readonly<Record<string, unknown>>;
  workspace?: Readonly<Record<string, unknown>>;
  herdrm?: Readonly<Record<string, unknown>>;
  commands?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export type DashboardSnapshotProvider =
  () => DashboardSnapshot | Promise<DashboardSnapshot>;

export interface DashboardServerOptions {
  host: string;
  port: number;
  profile: string;
  snapshot: DashboardSnapshotProvider;
}

export interface DashboardServerHandle {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

const LOOPBACK_V4 = /^127(?:\.(?:0|[1-9]\d{0,2})){3}$/;

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized === "::1") return true;
  if (!LOOPBACK_V4.test(normalized)) return false;
  return normalized.split(".").every((part) => Number(part) <= 255);
}

function isAllowedBindHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

function parseHostHeader(value: string): { host: string; port: number } | null {
  const ipv6 = /^\[([^\]]+)]:(\d{1,5})$/.exec(value);
  const plain = /^([^:\s]+):(\d{1,5})$/.exec(value);
  const match = ipv6 ?? plain;
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return { host: match[1] as string, port };
}

function requestHasAllowedHost(request: IncomingMessage, port: number): boolean {
  const header = request.headers.host;
  if (typeof header !== "string") return false;
  const parsed = parseHostHeader(header);
  return parsed !== null && parsed.port === port && isLoopbackHost(parsed.host);
}

function securityHeaders(nonce?: string): Record<string, string> {
  const scriptSource = nonce ? `'nonce-${nonce}'` : "'none'";
  const styleSource = nonce ? `'nonce-${nonce}'` : "'none'";
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src ${scriptSource}`,
      `style-src ${styleSource}`,
      "connect-src 'self'",
      "img-src 'none'",
      "font-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  additionalHeaders: Record<string, string> = {},
  nonce?: string,
): void {
  response.writeHead(status, {
    ...securityHeaders(nonce),
    ...additionalHeaders,
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const serialized = (JSON.stringify(value) ?? "null").replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  send(
    response,
    status,
    "application/json; charset=utf-8",
    `${serialized}\n`,
  );
}

function dashboardHtml(nonce: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hanchou ダッシュボード</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f4f6f8;
      color: #17202a;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 64px; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: clamp(1.7rem, 5vw, 2.5rem); }
    h2 { margin: 0 0 14px; font-size: 1.05rem; }
    p { margin: 0; line-height: 1.65; }
    .lead { color: #52606d; }
    .notice {
      margin-top: 16px;
      padding: 12px 14px;
      border-left: 4px solid #2563eb;
      border-radius: 6px;
      background: #eaf2ff;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card {
      min-width: 0;
      padding: 20px;
      border: 1px solid #d8dee4;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 4px 16px rgb(15 23 42 / 6%);
    }
    .wide { grid-column: 1 / -1; }
    .muted { color: #667085; }
    .status { font-weight: 650; }
    dl { display: grid; grid-template-columns: minmax(7rem, auto) 1fr; gap: 8px 12px; margin: 0; }
    dt { color: #667085; }
    dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    ul { margin: 0; padding-left: 1.25rem; }
    li + li { margin-top: 8px; }
    code { overflow-wrap: anywhere; white-space: normal; }
    a { color: #155eef; text-underline-offset: 0.18em; }
    @media (prefers-color-scheme: dark) {
      :root { background: #111827; color: #e5e7eb; }
      .lead, .muted, dt { color: #aeb8c4; }
      .notice { background: #172554; border-left-color: #60a5fa; }
      .card { background: #1f2937; border-color: #374151; box-shadow: none; }
      a { color: #93c5fd; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Hanchou ダッシュボード</h1>
      <p class="lead">いま動いているものと、次に開く場所をまとめて確認できます。この画面から操作や変更は行いません。</p>
      <p id="page-status" class="notice" role="status" aria-live="polite">最新の状態を読み込んでいます。</p>
    </header>

    <section class="grid" aria-label="Hanchou の状態">
      <article class="card">
        <h2>プロファイル</h2>
        <div id="profile"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card">
        <h2>システム</h2>
        <div id="system"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card wide">
        <h2>タスク</h2>
        <div id="tasks"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card">
        <h2>エージェント</h2>
        <div id="agents"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card">
        <h2>ワークスペース</h2>
        <div id="workspace"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card">
        <h2>クイックリンク</h2>
        <div id="commands"><p class="muted">読み込み中です。</p></div>
      </article>
      <article class="card">
        <h2>HerdrM 互換性</h2>
        <div id="herdrm"><p class="muted">読み込み中です。</p></div>
      </article>
    </section>
  </main>

  <script nonce="${nonce}">
    "use strict";

    const labels = Object.freeze({
      active: "進行中", total: "合計", by_status: "状態別", generated_at: "更新時刻",
      herdr_running: "Herdr", herdr_version: "Herdr バージョン",
      orchestrator_status: "オーケストレーター", task_ui_running: "タスク画面",
      dashboard_url: "ダッシュボード", task_ui_url: "タスク画面 URL",
      pending_inbox: "未処理 Inbox", pending_deliveries: "未配信 Delivery",
      registry_configured: "レジストリ", registry_path: "レジストリの場所",
      projects: "登録プロジェクト", installed: "インストール", compatible: "互換性",
      message: "案内", id: "ID", title: "タイトル", status: "状態",
      name: "名前", role: "役割", path: "場所"
    });

    function labelFor(key) {
      return labels[key] || String(key).replaceAll("_", " ");
    }

    function displayValue(value, key) {
      if (value === null || value === undefined || value === "") return "情報なし";
      if (typeof value === "boolean") {
        if (key === "compatible") return value ? "対応しています" : "対応していません";
        if (key === "installed") return value ? "インストール済み" : "未インストール";
        if (key === "registry_configured") return value ? "設定済み" : "未設定";
        return value ? "稼働中" : "停止中";
      }
      if (Array.isArray(value)) return value.map((item) => displayValue(item)).join(", ");
      if (typeof value === "object") {
        return Object.entries(value).map(([childKey, childValue]) =>
          labelFor(childKey) + ": " + displayValue(childValue, childKey)).join(" / ");
      }
      return String(value);
    }

    function empty(container, message) {
      container.replaceChildren();
      const paragraph = document.createElement("p");
      paragraph.className = "muted";
      paragraph.textContent = message;
      container.append(paragraph);
    }

    function details(container, value, omittedKeys) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        empty(container, "まだ表示できる情報がありません。");
        return;
      }
      const entries = Object.entries(value).filter(([key, item]) =>
        !omittedKeys.includes(key) && item !== undefined);
      if (entries.length === 0) {
        empty(container, "まだ表示できる情報がありません。");
        return;
      }
      const list = document.createElement("dl");
      for (const [key, item] of entries) {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = labelFor(key);
        description.textContent = displayValue(item, key);
        list.append(term, description);
      }
      container.replaceChildren(list);
    }

    function renderProfile(data) {
      const container = document.querySelector("#profile");
      container.replaceChildren();
      const value = document.createElement("p");
      value.className = "status";
      value.textContent = displayValue(data.profile, "profile");
      container.append(value);
      if (data.generated_at) {
        const updated = document.createElement("p");
        updated.className = "muted";
        updated.textContent = "更新: " + displayValue(data.generated_at, "generated_at");
        container.append(updated);
      }
    }

    function renderTasks(data) {
      const container = document.querySelector("#tasks");
      const tasks = data.tasks;
      if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
        empty(container, "タスク情報を取得できませんでした。ほかのカードは引き続き利用できます。");
        return;
      }
      container.replaceChildren();
      const summary = document.createElement("div");
      details(summary, tasks, ["items"]);
      container.append(summary);
      const items = Array.isArray(tasks.items) ? tasks.items : [];
      if (items.length > 0) {
        const heading = document.createElement("p");
        heading.className = "status";
        heading.textContent = "最近のタスク";
        const list = document.createElement("ul");
        for (const item of items) {
          const row = document.createElement("li");
          if (item && typeof item === "object") {
            const id = displayValue(item.id, "id");
            const title = displayValue(item.title, "title");
            const status = displayValue(item.status, "status");
            row.textContent = id + " — " + title + "（" + status + "）";
          } else {
            row.textContent = displayValue(item);
          }
          list.append(row);
        }
        container.append(heading, list);
      }
      if (data.relay && typeof data.relay === "object" && !Array.isArray(data.relay)) {
        const relayHeading = document.createElement("p");
        relayHeading.className = "status";
        relayHeading.textContent = "連絡キュー";
        const relay = document.createElement("div");
        details(relay, data.relay, []);
        container.append(relayHeading, relay);
      }
    }

    function renderAgents(agents) {
      const container = document.querySelector("#agents");
      if (!Array.isArray(agents) || agents.length === 0) {
        empty(container, "表示できるエージェントはありません。");
        return;
      }
      const list = document.createElement("ul");
      for (const agent of agents) {
        const row = document.createElement("li");
        if (agent && typeof agent === "object") {
          const name = displayValue(agent.name, "name");
          const role = displayValue(agent.role, "role");
          const status = displayValue(agent.status, "status");
          row.textContent = name + " / " + role + " / " + status;
        } else {
          row.textContent = displayValue(agent);
        }
        list.append(row);
      }
      container.replaceChildren(list);
    }

    function renderWorkspace(workspace) {
      const container = document.querySelector("#workspace");
      if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
        empty(container, "ワークスペース情報を取得できませんでした。");
        return;
      }
      container.replaceChildren();
      details(container, workspace, ["roots"]);
      const roots = Array.isArray(workspace.roots) ? workspace.roots : [];
      if (roots.length > 0) {
        const heading = document.createElement("p");
        heading.className = "status";
        heading.textContent = "専用ルート";
        const list = document.createElement("ul");
        for (const root of roots) {
          const row = document.createElement("li");
          if (root && typeof root === "object") {
            row.textContent = displayValue(root.id, "id") + ": " + displayValue(root.path, "path");
          } else {
            row.textContent = displayValue(root);
          }
          list.append(row);
        }
        container.append(heading, list);
      }
    }

    function renderCommands(commands) {
      const container = document.querySelector("#commands");
      if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
        empty(container, "利用できるクイックリンクはありません。");
        return;
      }
      const entries = Object.entries(commands).filter(([, value]) => value !== undefined);
      if (entries.length === 0) {
        empty(container, "利用できるクイックリンクはありません。");
        return;
      }
      const list = document.createElement("ul");
      for (const [name, command] of entries) {
        const row = document.createElement("li");
        const label = document.createElement("span");
        const code = document.createElement("code");
        label.textContent = labelFor(name) + ": ";
        code.textContent = displayValue(command, name);
        row.append(label, code);
        list.append(row);
      }
      container.replaceChildren(list);
    }

    function renderUnavailable() {
      const message = "状態を取得できませんでした。しばらく待ってから再読み込みしてください。";
      document.querySelector("#page-status").textContent = message;
      for (const id of ["profile", "system", "tasks", "agents", "workspace", "commands", "herdrm"]) {
        empty(document.querySelector("#" + id), message);
      }
    }

    let loading = false;

    async function load() {
      if (loading) return;
      loading = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch("/api/status", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error("status request failed");
        const data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid status");
        renderProfile(data);
        details(document.querySelector("#system"), data.system, []);
        renderTasks(data);
        renderAgents(data.agents);
        renderWorkspace(data.workspace);
        renderCommands(data.commands);
        details(document.querySelector("#herdrm"), data.herdrm, []);
        document.querySelector("#page-status").textContent = "最新の状態を表示しています。";
      } catch {
        renderUnavailable();
      } finally {
        clearTimeout(timeout);
        loading = false;
      }
    }

    void load();
    setInterval(() => void load(), 5000);
  </script>
</body>
</html>`;
}

function listeningPort(server: Server): number | null {
  const address = server.address();
  if (address === null || typeof address === "string") return null;
  return (address as AddressInfo).port;
}

function closeDashboardServer(server: Server): () => Promise<void> {
  let closePromise: Promise<void> | null = null;
  return () => {
    if (closePromise !== null) return closePromise;
    closePromise = new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        server.closeAllConnections();
        resolve();
        return;
      }
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    return closePromise;
  };
}

function requestPath(request: IncomingMessage): string | null {
  const target = request.url;
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
    return null;
  }
  if (target.includes("#")) return null;
  const query = target.indexOf("?");
  return query === -1 ? target : target.slice(0, query);
}

async function handleRequest(
  server: Server,
  options: DashboardServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const port = listeningPort(server);
  if (port === null || !requestHasAllowedHost(request, port)) {
    send(response, 400, "text/plain; charset=utf-8", "Bad Request\n");
    return;
  }

  if (request.method !== "GET") {
    send(
      response,
      405,
      "text/plain; charset=utf-8",
      "Method Not Allowed\n",
      { Allow: "GET" },
    );
    return;
  }

  const path = requestPath(request);
  if (path === null) {
    send(response, 400, "text/plain; charset=utf-8", "Bad Request\n");
    return;
  }

  if (path === "/") {
    const nonce = randomBytes(18).toString("base64");
    send(
      response,
      200,
      "text/html; charset=utf-8",
      dashboardHtml(nonce),
      {},
      nonce,
    );
    return;
  }

  if (path === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (path === "/api/status") {
    try {
      const supplied = await options.snapshot();
      if (response.destroyed) return;
      const snapshot = supplied !== null && typeof supplied === "object" && !Array.isArray(supplied)
        ? supplied
        : {};
      sendJson(response, 200, { ...snapshot, profile: options.profile });
    } catch {
      sendJson(response, 503, { status: "degraded" });
    }
    return;
  }

  send(response, 404, "text/plain; charset=utf-8", "Not Found\n");
}

export async function createDashboardServer(
  options: DashboardServerOptions,
): Promise<DashboardServerHandle> {
  if (!isAllowedBindHost(options.host)) {
    throw new TypeError("dashboard host must be 127.0.0.1 or ::1");
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new TypeError("dashboard port must be an integer from 0 to 65535");
  }
  if (typeof options.profile !== "string" || options.profile.length === 0) {
    throw new TypeError("dashboard profile must be a non-empty string");
  }
  if (typeof options.snapshot !== "function") {
    throw new TypeError("dashboard snapshot provider must be a function");
  }

  let server: Server;
  server = createServer((request, response) => {
    void handleRequest(server, options, request, response).catch(() => {
      if (response.destroyed) return;
      if (!response.headersSent) {
        try {
          sendJson(response, 500, { status: "error" });
        } catch {
          response.destroy();
        }
      } else {
        response.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: options.host, port: options.port });
  });

  const close = closeDashboardServer(server);
  const address = server.address();
  if (
    address === null
    || typeof address === "string"
    || !isAllowedBindHost(address.address)
  ) {
    await close();
    throw new Error("dashboard server did not bind to a literal loopback address");
  }
  const port = address.port;
  const displayHost = options.host.includes(":") ? `[${options.host}]` : options.host;
  return { server, url: `http://${displayHost}:${String(port)}`, close };
}
