import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { ensureHerdrmCompatibility, herdrmCompatibility } from "../libexec/hanchou.ts";

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
assert.throws(
  () => herdrmCompatibility("work", { herdr: { session: "personal" } }),
  /must exactly match the selected profile/,
  "a custom profile must not redirect Herdrm to a different named session",
);
assert.throws(
  () => herdrmCompatibility("work", { herdr: { session: ".." } }),
  /must exactly match the selected profile/,
  "path traversal must not be accepted as a Herdr session",
);

writeFileSync(namedSocket, "not a socket", { mode: 0o600 });
symlinkSync(namedSocket, defaultSocket);
assert.equal(state().compatible, false, "regular files and symlinks must not impersonate a live socket");
assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false);
assert.equal(readlinkSync(defaultSocket), namedSocket, "an existing default symlink must not be replaced");
removeSockets();

symlinkSync(namedSocket, defaultSocket);
assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false);
assert.equal(readlinkSync(defaultSocket), namedSocket, "a broken default symlink must not be replaced");
removeSockets();

const unsafe = await listen(namedSocket);
try {
  chmodSync(join(home, ".config", "herdr", "sessions", "work"), 0o777);
  assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false, "an unsafe named socket parent must be rejected");
  assert.throws(() => lstatSync(defaultSocket), /ENOENT/, "unsafe parents must not create a compatibility link");
  symlinkSync(namedSocket, defaultSocket);
  assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false, "an existing matching link must not bypass named parent checks");
  assert.equal(readlinkSync(defaultSocket), namedSocket, "unsafe existing links must be preserved without opening Herdrm");
  chmodSync(join(home, ".config", "herdr", "sessions", "work"), 0o700);
  chmodSync(join(home, ".config", "herdr"), 0o777);
  assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false, "an existing matching link must not bypass default parent checks");
  assert.equal(readlinkSync(defaultSocket), namedSocket, "unsafe default parents must not cause path replacement");
} finally {
  chmodSync(join(home, ".config", "herdr"), 0o700);
  chmodSync(join(home, ".config", "herdr", "sessions", "work"), 0o700);
  await close(unsafe);
  removeSockets();
}

const shared = await listen(namedSocket);
try {
  const compatible = ensureHerdrmCompatibility("work", profile);
  assert.equal(compatible.compatible, true, JSON.stringify(compatible));
  assert.equal(lstatSync(defaultSocket).isSymbolicLink(), true);
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
  assert.equal(ensureHerdrmCompatibility("work", profile).compatible, false, "an existing default socket must never be replaced");
} finally {
  await close(separate);
  await close(named);
  removeSockets();
}

console.log("Herdrm socket compatibility lifecycle ok");
