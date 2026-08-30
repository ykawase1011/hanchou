#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { readToml } from "../lib/toml.ts";
import type { TomlTable, TomlValue } from "../lib/toml.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readText(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

function valueAsTable(value: TomlValue | undefined): TomlTable {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : Object.create(null) as TomlTable;
}

function valueAsStrings(value: TomlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlMultiline(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"""', '\\"\\"\\"');
  return `"""${escaped.trimEnd()}\\n"""`;
}

export function renderCodex(name: string, spec: TomlTable, prompt: string): string {
  const provider = valueAsTable(spec.codex);
  const description = spec.description;
  if (typeof description !== "string") throw new TypeError("role description must be a string");
  const lines = [`name = ${tomlString(name)}`, `description = ${tomlString(description)}`];
  const candidates = valueAsStrings(spec.nickname_candidates);
  if (candidates.length > 0) {
    lines.push(`nickname_candidates = [${candidates.map(tomlString).join(", ")}]`);
  }
  if (provider.model) lines.push(`model = ${tomlString(String(provider.model))}`);
  if (provider.reasoning_effort) {
    lines.push(`model_reasoning_effort = ${tomlString(String(provider.reasoning_effort))}`);
  }
  lines.push(`developer_instructions = ${tomlMultiline(prompt)}`);
  return `${lines.join("\n")}\n`;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderClaude(name: string, spec: TomlTable, prompt: string): string {
  const provider = valueAsTable(spec.claude);
  const description = spec.description;
  if (typeof description !== "string") throw new TypeError("role description must be a string");
  const lines = ["---", `name: ${name}`, `description: ${yamlScalar(description)}`];
  if (provider.model) lines.push(`model: ${String(provider.model)}`);
  if (provider.permission_mode) lines.push(`permissionMode: ${String(provider.permission_mode)}`);
  const tools = valueAsStrings(provider.tools);
  if (tools.length > 0) lines.push(`tools: ${tools.join(", ")}`);
  if (provider.max_turns) lines.push(`maxTurns: ${String(provider.max_turns)}`);
  const skills = valueAsStrings(spec.skills);
  if (skills.length > 0) {
    lines.push("skills:");
    lines.push(...skills.map((skill) => `  - ${skill}`));
  }
  if (provider.color) lines.push(`color: ${String(provider.color)}`);
  lines.push("---", "", prompt.trimEnd(), "");
  return lines.join("\n");
}

function bytewiseCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function generatedFiles(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => !name.startsWith("."))
    .map((name) => join(base, name))
    .filter((path) => statSync(path).isFile())
    .sort(bytewiseCompare);
}

function usage(stream: NodeJS.WriteStream): void {
  stream.write("usage: render-agents.ts [-h] [--check]\n");
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument === "-h" || argument === "--help")) {
    if (args.length !== 1) {
      usage(process.stderr);
      return 2;
    }
    usage(process.stdout);
    return 0;
  }
  if (args.some((argument) => argument !== "--check") || args.filter((argument) => argument === "--check").length > 1) {
    usage(process.stderr);
    return 2;
  }
  const check = args.includes("--check");
  const outputs = new Map<string, string>();
  const rolesRoot = join(ROOT, "roles");
  for (const entry of readdirSync(rolesRoot).sort(bytewiseCompare)) {
    const roleDirectory = join(rolesRoot, entry);
    if (!statSync(roleDirectory).isDirectory()) continue;
    const spec = readToml(join(roleDirectory, "role.toml"));
    const prompt = readText(join(roleDirectory, "ROLE.md"));
    const name = spec.name;
    if (typeof name !== "string") throw new TypeError(`role name must be a string: ${entry}`);
    const codex = valueAsTable(spec.codex);
    const claude = valueAsTable(spec.claude);
    if (codex.enabled !== false) {
      outputs.set(join(ROOT, ".codex", "agents", `${name}.toml`), renderCodex(name, spec, prompt));
    }
    if (claude.enabled !== false) {
      outputs.set(join(ROOT, ".claude", "agents", `${name}.md`), renderClaude(name, spec, prompt));
    }
  }

  const generatedRoots = [join(ROOT, ".codex", "agents"), join(ROOT, ".claude", "agents")];
  const stale = generatedRoots.flatMap(generatedFiles).filter((path) => !outputs.has(path));
  const changed = [...stale];
  for (const [path, content] of outputs) {
    const current = existsSync(path) ? readText(path) : undefined;
    if (current !== content) {
      changed.push(path);
      if (!check) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf8");
        console.log(`wrote ${relative(ROOT, path)}`);
      }
    }
  }

  if (!check) {
    for (const path of stale) {
      unlinkSync(path);
      console.log(`removed ${relative(ROOT, path)}`);
    }
  }

  if (check && changed.length > 0) {
    console.log("generated agent definitions are stale:");
    for (const path of changed) console.log(`  ${relative(ROOT, path)}`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
