import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { herdrmCompatibility } from "../libexec/hanchou.ts";

const home = process.env.HANCHOU_TEST_OPERATOR_HOME;
if (!home) throw new Error("HANCHOU_TEST_OPERATOR_HOME is required");
const defaultSocket = join(home, ".config", "herdr", "herdr.sock");
const namedSocket = join(home, ".config", "herdr", "sessions", "work", "herdr.sock");
mkdirSync(join(home, "Applications", "herdrm.app"), { recursive: true });
mkdirSync(join(home, ".config", "herdr", "sessions", "work"), { recursive: true });
const profile = { herdr: { session: "work" } };

function state(): Record<string, any> {
  return herdrmCompatibility("work", profile);
}

function removeSockets(): void {
  rmSync(defaultSocket, { force: true });
  rmSync(namedSocket, { force: true });
}

function listen(path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(path, () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

assert.equal(state().installed, true);
assert.equal(state().compatible, false, "missing sockets must never be treated as compatible");

writeFileSync(namedSocket, "not a socket", { mode: 0o600 });
symlinkSync(namedSocket, defaultSocket);
assert.equal(state().compatible, false, "regular files and symlinks must not impersonate a live socket");
removeSockets();

const shared = await listen(namedSocket);
try {
  symlinkSync(namedSocket, defaultSocket);
  const compatible = state();
  assert.equal(compatible.compatible, true, JSON.stringify(compatible));
  assert.equal(typeof compatible.socket_identity?.device, "string");
  assert.equal(typeof compatible.socket_identity?.inode, "string");
} finally {
  rmSync(defaultSocket, { force: true });
  await close(shared);
  removeSockets();
}

const named = await listen(namedSocket);
const separate = await listen(defaultSocket);
try {
  assert.equal(state().compatible, false, "different live sockets must not be treated as the Hanchou session");
} finally {
  await close(separate);
  await close(named);
  removeSockets();
}

console.log("Herdrm socket compatibility lifecycle ok");
