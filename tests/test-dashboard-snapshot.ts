import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboardServer } from "../lib/dashboard.ts";
import {
  createSnapshotSubprocessProvider,
  runSnapshotSubprocess,
} from "../lib/dashboard-snapshot.ts";

const base = {
  command: process.execPath,
  cwd: process.cwd(),
  env: { ...process.env },
};

const value = await runSnapshotSubprocess({
  ...base,
  args: ["-e", "process.stdout.write(JSON.stringify({profile:'work',ok:true}))"],
});
assert.deepEqual(value, { profile: "work", ok: true });

await assert.rejects(
  runSnapshotSubprocess({
    ...base,
    args: ["-e", "process.stdout.write('not json')"],
  }),
  /invalid JSON/,
);

await assert.rejects(
  runSnapshotSubprocess({
    ...base,
    args: ["-e", "process.stdout.write('x'.repeat(2048))"],
    maxOutputBytes: 1024,
  }),
  /output limit/,
);

const redacted = await runSnapshotSubprocess({
  ...base,
  args: ["-e", "process.stderr.write('private fixture detail');process.exit(7)"],
}).then(() => "", (error: Error) => error.message);
assert.match(redacted, /failed \(7\)/);
assert.doesNotMatch(redacted, /private fixture detail/);

if (process.platform !== "win32") {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "hanchou-snapshot-"));
  const pidFile = join(fixtureRoot, "grandchild.pid");
  try {
    const program = [
      "const {spawn}=require('node:child_process');",
      `const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});`,
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));`,
      "setInterval(()=>{},1000);",
    ].join("");
    await assert.rejects(
      runSnapshotSubprocess({ ...base, args: ["-e", program], timeoutMs: 250 }),
      /timed out/,
    );
    const grandchildPid = Number(readFileSync(pidFile, "utf8"));
    let alive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { process.kill(grandchildPid, 0); }
      catch { alive = false; break; }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    if (alive) {
      try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
    }
    assert.equal(alive, false, "snapshot timeout must terminate descendants in the child process group");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const singleFlight = createSnapshotSubprocessProvider({
  ...base,
  args: ["-e", "setTimeout(()=>process.stdout.write(JSON.stringify({ok:true})),100)"],
});
const first = singleFlight();
const second = singleFlight();
assert.equal(first, second, "overlapping dashboard refreshes must share one snapshot process");
assert.deepEqual(await first, { ok: true });
const third = singleFlight();
assert.notEqual(third, first, "a settled snapshot must not be retained forever");
await third;

const hanging = createSnapshotSubprocessProvider({
  ...base,
  args: ["-e", "setInterval(()=>{},1000)"],
  timeoutMs: 250,
});
const server = await createDashboardServer({
  host: "127.0.0.1",
  port: 0,
  profile: "work",
  snapshot: hanging,
});

function get(path: string): Promise<{ status: number; body: string }> {
  const target = new URL(path, server.url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(target, { agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.once("error", reject);
    request.end();
  });
}

try {
  const statusRequest = get("/api/status");
  await new Promise<void>((resolve) => setTimeout(resolve, 40));
  const health = await Promise.race([
    get("/health"),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("health endpoint was blocked")), 150)),
  ]);
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: "ok" });
  const status = await statusRequest;
  assert.equal(status.status, 503);
  assert.doesNotMatch(status.body, /setInterval|process\.stdout/, "child details must not leak into the dashboard response");
} finally {
  await server.close();
}

console.log("dashboard snapshot subprocess lifecycle ok");
