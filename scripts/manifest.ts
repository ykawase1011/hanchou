#!/usr/bin/env node
/** Generate and verify the tracked-file release manifest. */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

const MANIFEST_NAME = "MANIFEST.sha256";

class ManifestError extends Error {}

function run(command: string, args: string[], cwd?: string): Buffer {
  const result = spawnSync(command, args, { cwd, encoding: "buffer" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command ${JSON.stringify([command, ...args])} returned non-zero exit status ${result.status ?? "unknown"}.`,
    );
  }
  return result.stdout;
}

function decodeUtf8(value: Buffer, message: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch (error) {
    throw new ManifestError(message, { cause: error });
  }
}

function repositoryRoot(): string {
  return decodeUtf8(run("git", ["rev-parse", "--show-toplevel"]), "repository root must be valid UTF-8").trim();
}

function bytewiseCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function trackedPaths(root: string): string[] {
  const output = run("git", ["ls-files", "--cached", "-z"], root);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const paths: string[] = [];
  for (const rawPath of output.subarray(0, output.length > 0 && output.at(-1) === 0 ? -1 : undefined).toString("binary").split("\0")) {
    if (rawPath === "") continue;
    let path: string;
    try {
      path = decoder.decode(Buffer.from(rawPath, "binary"));
    } catch (error) {
      throw new ManifestError("tracked paths must be valid UTF-8", { cause: error });
    }
    if (path === MANIFEST_NAME) continue;
    if (path.includes("\n") || path.includes("\r")) {
      throw new ManifestError(`tracked path cannot contain a newline: ${JSON.stringify(path)}`);
    }
    if (isAbsolute(path) || path === ".." || path.startsWith("../")) {
      throw new ManifestError(`tracked path is not repository-relative: ${JSON.stringify(path)}`);
    }
    paths.push(path);
  }
  return paths.sort(bytewiseCompare);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function renderManifest(root: string, paths: string[]): string {
  return paths
    .map((path) => {
      const absolutePath = join(root, path);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        throw new ManifestError(`tracked file is missing from the worktree: ${path}`);
      }
      return `${sha256(absolutePath)}  ./${path}\n`;
    })
    .join("");
}

function temporaryPath(destination: string): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = join(dirname(destination), `.${MANIFEST_NAME}.${randomBytes(6).toString("hex")}`);
    try {
      const descriptor = openSync(candidate, "wx", 0o600);
      closeSync(descriptor);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new ManifestError("cannot allocate a temporary manifest file");
}

function generate(root: string): void {
  const paths = trackedPaths(root);
  const rendered = renderManifest(root, paths);
  const destination = join(root, MANIFEST_NAME);
  let temporary: string | undefined;
  try {
    temporary = temporaryPath(destination);
    writeFileSync(temporary, rendered, "utf8");
    chmodSync(temporary, 0o644);
    renameSync(temporary, destination);
    temporary = undefined;
  } finally {
    if (temporary !== undefined) {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  console.log(`generated ${MANIFEST_NAME}: ${paths.length} tracked files`);
}

function splitLines(value: string): string[] {
  const lines = value.split(/\r\n|\n|\r|\v|\f|\x1c|\x1d|\x1e|\x85|\u2028|\u2029/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function parseManifest(root: string): Map<string, string> {
  const manifestPath = join(root, MANIFEST_NAME);
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new ManifestError(`${MANIFEST_NAME} is missing`);
  }
  const source = decodeUtf8(readFileSync(manifestPath), `${MANIFEST_NAME} must be valid UTF-8`);
  const entries = new Map<string, string>();
  for (const [index, line] of splitLines(source).entries()) {
    const lineNumber = index + 1;
    if (line.length < 69 || line.slice(64, 68) !== "  ./") {
      throw new ManifestError(`${MANIFEST_NAME}:${lineNumber}: invalid checksum line`);
    }
    const digest = line.slice(0, 64);
    const path = line.slice(68);
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new ManifestError(`${MANIFEST_NAME}:${lineNumber}: invalid SHA-256 digest`);
    }
    if (path === "" || path.includes("\n") || path.includes("\r")) {
      throw new ManifestError(`${MANIFEST_NAME}:${lineNumber}: invalid tracked path`);
    }
    if (entries.has(path)) {
      throw new ManifestError(`${MANIFEST_NAME}:${lineNumber}: duplicate path: ${path}`);
    }
    entries.set(path, digest);
  }
  return entries;
}

function verify(root: string): void {
  const expectedPaths = trackedPaths(root);
  const expected = new Set(expectedPaths);
  const entries = parseManifest(root);
  const recorded = new Set(entries.keys());
  const problems: string[] = [];

  for (const path of [...expected].filter((value) => !recorded.has(value)).sort(bytewiseCompare)) {
    problems.push(`missing manifest entry: ${path}`);
  }
  for (const path of [...recorded].filter((value) => !expected.has(value)).sort(bytewiseCompare)) {
    problems.push(`manifest entry is not tracked: ${path}`);
  }
  for (const path of [...expected].filter((value) => recorded.has(value)).sort(bytewiseCompare)) {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      problems.push(`tracked file is missing from the worktree: ${path}`);
    } else if (sha256(absolutePath) !== entries.get(path)) {
      problems.push(`checksum mismatch: ${path}`);
    }
  }

  if (problems.length > 0) throw new ManifestError(problems.join("\n"));
  console.log(`validated ${MANIFEST_NAME}: ${expectedPaths.length} tracked files and checksums`);
}

function usage(stream: NodeJS.WriteStream): void {
  stream.write("usage: manifest.ts [-h] {generate,check}\n");
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
    usage(process.stdout);
    return 0;
  }
  if (args.length !== 1 || (args[0] !== "generate" && args[0] !== "check")) {
    usage(process.stderr);
    process.stderr.write("manifest.ts: error: command must be generate or check\n");
    return 2;
  }
  try {
    const root = repositoryRoot();
    if (args[0] === "generate") generate(root);
    else verify(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`manifest error: ${message}`);
    return 1;
  }
  return 0;
}

process.exitCode = main();
