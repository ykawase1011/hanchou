#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseToml, readToml } from "../lib/toml.ts";
import type { TomlTable, TomlValue } from "../lib/toml.ts";
import { parsePlist } from "./lib/plist.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function bytewiseCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function readText(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

function filesIn(directory: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile() && predicate(path))
    .sort(bytewiseCompare);
}

function filesInSubdirectories(directory: string, filename: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => join(directory, name, filename))
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .sort(bytewiseCompare);
}

function walkFiles(directory: string, skip = new Set<string>()): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory).sort(bytewiseCompare)) {
    if (skip.has(entry)) continue;
    const path = join(directory, entry);
    const metadata = statSync(path);
    if (metadata.isDirectory()) result.push(...walkFiles(path, skip));
    else if (metadata.isFile()) result.push(path);
  }
  return result;
}

function asTable(value: TomlValue | undefined, name: string): TomlTable {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be a TOML table`);
  }
  return value;
}

function validateTypeScriptSource(path: string): void {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(`invalid TypeScript source: ${relative(ROOT, path)}${detail ? `\n${detail}` : ""}`);
  }
}

function validateMigrationInvariants(tools: TomlTable): void {
  const pythonSources = walkFiles(ROOT, new Set([".git", "node_modules"]))
    .filter((path) => path.endsWith(".py"))
    .map((path) => relative(ROOT, path));
  if (pythonSources.length > 0) {
    throw new Error(`Python source remains after the TypeScript migration: ${pythonSources.join(", ")}`);
  }
  if (Object.prototype.hasOwnProperty.call(tools, "python")) {
    throw new Error("mise.toml must not configure a Python runtime");
  }

  const executionReferenceRoots = [join(ROOT, "bin"), join(ROOT, "scripts"), join(ROOT, "tests")];
  const executionReferenceFiles = [join(ROOT, "Makefile"), ...executionReferenceRoots.flatMap((path) => walkFiles(path))];
  const references = executionReferenceFiles
    .filter((path) => path !== fileURLToPath(import.meta.url))
    .filter((path) => /(^|[^A-Za-z0-9_])python(?:3(?:\.\d+)?)?([^A-Za-z0-9_]|$)/i.test(readText(path)))
    .map((path) => relative(ROOT, path));
  if (references.length > 0) {
    throw new Error(`Python execution reference remains after the TypeScript migration: ${references.join(", ")}`);
  }
}

function main(): void {
  const tomlFiles = [
    join(ROOT, "mise.toml"),
    join(ROOT, ".codex", "config.toml"),
    join(ROOT, "herdr-plugin.toml"),
    join(ROOT, "config", "versions.toml"),
    join(ROOT, "config", "model-routing.toml"),
    join(ROOT, "config", "projects.example.toml"),
    ...filesIn(join(ROOT, "config", "skills"), (path) => path.endsWith(".toml")),
    ...filesIn(join(ROOT, "config", "profiles"), (path) => path.endsWith(".toml")),
    ...filesInSubdirectories(join(ROOT, "roles"), "role.toml"),
    ...filesIn(join(ROOT, ".codex", "agents"), (path) => path.endsWith(".toml")),
  ];
  for (const path of tomlFiles) readToml(path);

  const mise = readToml(join(ROOT, "mise.toml"));
  const tools = asTable(mise.tools, "mise.tools");
  if (tools.herdr !== "0.8.2" || tools.node !== "22") {
    throw new Error("mise.toml must pin Herdr 0.8.2 and Node.js 22");
  }
  const versions = readToml(join(ROOT, "config", "versions.toml"));
  const components = asTable(versions.components, "versions.components");
  if (Object.prototype.hasOwnProperty.call(components, "herdr")) {
    throw new Error("Herdr version must have a single source of truth in mise.toml");
  }

  for (const path of filesIn(join(ROOT, "schemas"), (value) => value.endsWith(".json"))) {
    JSON.parse(readText(path));
  }
  JSON.parse(readText(join(ROOT, "config", "usage.example.json")));

  const template = readText(join(ROOT, "config", "herdr", "config.toml.tmpl"));
  const rendered = template
    .replaceAll("{{HEADLESS_COLS}}", "160")
    .replaceAll("{{HEADLESS_ROWS}}", "50")
    .replaceAll("{{WORKTREE_DIR}}", "/tmp/worktrees")
    .replaceAll("{{BEADS_UI_URL}}", "http://127.0.0.1:3737");
  parseToml(rendered);

  const replacements: Record<string, string> = {
    PROFILE: "work",
    HERDR_BIN: "/usr/local/bin/herdr",
    HERDR_SESSION: "work",
    STATE_ROOT: "/tmp/hanchou",
    CONTROL_DIR: "/tmp/hanchou/control",
    BEADS_DIR: "/tmp/hanchou/control/.beads",
    RELAY_DIR: "/tmp/hanchou/relay",
    REPO_ROOT: "/tmp/hanchou-repo",
    CONFIG_ROOT: "/tmp/hanchou-config",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    BDUI_BIN: "/usr/local/bin/bdui",
    BD_BIN: "/usr/local/bin/bd",
    NODE_BIN: "/usr/local/bin/node",
    HANCHOU_ENTRY: "/tmp/hanchou-repo/libexec/hanchou.ts",
    FINGERPRINT: "0123456789abcdef",
    HOST: "127.0.0.1",
    PORT: "3737",
  };
  for (const path of filesIn(join(ROOT, "templates", "launchd"), (value) => value.endsWith(".plist.tmpl"))) {
    let text = readText(path);
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(`{{${key}}}`, value);
    }
    if (text.includes("{{")) throw new Error(`unresolved plist placeholder: ${path}`);
    parsePlist(text);
  }

  const skillNames = new Set<string>();
  for (const path of filesInSubdirectories(join(ROOT, "skills"), "SKILL.md")) {
    const text = readText(path);
    if (!text.startsWith("---\n")) throw new Error(`missing Skill frontmatter: ${path}`);
    const parts = text.split("---\n", 3);
    const header = parts[1] ?? "";
    const metadata = new Map<string, string>();
    for (const line of header.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator >= 0) {
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
        metadata.set(key, value);
      }
    }
    const skillName = dirname(path).split("/").at(-1) as string;
    if (metadata.get("name") !== skillName) throw new Error(`Skill name mismatch: ${path}`);
    if (!metadata.get("description")) throw new Error(`Skill description missing: ${path}`);
    skillNames.add(skillName);
  }
  if (!skillNames.has("hanchou-cli") || skillNames.has("hanchou-mailbox")) {
    throw new Error("invalid Hanchou Skill set");
  }

  for (const rolePath of filesInSubdirectories(join(ROOT, "roles"), "role.toml")) {
    const role = readToml(rolePath);
    const skills = role.skills;
    if (!Array.isArray(skills)) continue;
    for (const skill of skills) {
      if (typeof skill !== "string") throw new TypeError(`role Skill must be a string: ${rolePath}`);
      if (skill !== "herdr" && !skillNames.has(skill)) {
        throw new Error(`role references missing Skill ${skill}: ${rolePath}`);
      }
    }
  }

  const typeScriptFiles = [join(ROOT, "lib"), join(ROOT, "libexec"), join(ROOT, "scripts"), join(ROOT, "tests")]
    .flatMap((path) => walkFiles(path))
    .filter((path) => path.endsWith(".ts"));
  for (const path of typeScriptFiles) validateTypeScriptSource(path);

  validateMigrationInvariants(tools);
  console.log(
    `validated ${tomlFiles.length} TOML files, ${skillNames.size} Skills, JSON inputs/schemas, templates, and TypeScript sources`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
