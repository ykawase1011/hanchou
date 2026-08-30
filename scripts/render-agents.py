#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def toml_multiline(value: str) -> str:
    escaped = value.replace('\\', '\\\\').replace('"""', '\\"\\"\\"')
    return f'"""{escaped.rstrip()}\\n"""'


def render_codex(name: str, spec: dict, prompt: str) -> str:
    provider = spec.get("codex", {})
    lines = [
        f'name = {toml_string(name)}',
        f'description = {toml_string(spec["description"])}',
    ]
    candidates = spec.get("nickname_candidates", [])
    if candidates:
        lines.append("nickname_candidates = [" + ", ".join(toml_string(x) for x in candidates) + "]")
    if provider.get("model"):
        lines.append(f'model = {toml_string(provider["model"])}')
    if provider.get("reasoning_effort"):
        lines.append(f'model_reasoning_effort = {toml_string(provider["reasoning_effort"])}')
    lines.append(f'developer_instructions = {toml_multiline(prompt)}')
    return "\n".join(lines) + "\n"


def yaml_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_claude(name: str, spec: dict, prompt: str) -> str:
    provider = spec.get("claude", {})
    lines = ["---", f"name: {name}", f"description: {yaml_scalar(spec['description'])}"]
    if provider.get("model"):
        lines.append(f"model: {provider['model']}")
    if provider.get("permission_mode"):
        lines.append(f"permissionMode: {provider['permission_mode']}")
    tools = provider.get("tools", [])
    if tools:
        lines.append("tools: " + ", ".join(tools))
    if provider.get("max_turns"):
        lines.append(f"maxTurns: {provider['max_turns']}")
    skills = spec.get("skills", [])
    if skills:
        lines.append("skills:")
        lines.extend(f"  - {skill}" for skill in skills)
    if provider.get("color"):
        lines.append(f"color: {provider['color']}")
    lines.extend(["---", "", prompt.rstrip(), ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render provider-specific agent definitions from canonical Hanchou roles")
    parser.add_argument("--check", action="store_true", help="fail if generated files differ")
    args = parser.parse_args()

    outputs: dict[Path, str] = {}
    for role_dir in sorted((ROOT / "roles").iterdir()):
        if not role_dir.is_dir():
            continue
        spec = tomllib.loads((role_dir / "role.toml").read_text())
        prompt = (role_dir / "ROLE.md").read_text()
        name = spec["name"]
        if spec.get("codex", {}).get("enabled", True):
            outputs[ROOT / ".codex" / "agents" / f"{name}.toml"] = render_codex(name, spec, prompt)
        if spec.get("claude", {}).get("enabled", True):
            outputs[ROOT / ".claude" / "agents" / f"{name}.md"] = render_claude(name, spec, prompt)

    generated_roots = (ROOT / ".codex" / "agents", ROOT / ".claude" / "agents")
    stale = [path for base in generated_roots for path in base.glob("*") if path.is_file() and path not in outputs]
    changed = list(stale)
    for path, content in outputs.items():
        current = path.read_text() if path.exists() else None
        if current != content:
            changed.append(path)
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
                print(f"wrote {path.relative_to(ROOT)}")

    if not args.check:
        for path in stale:
            path.unlink()
            print(f"removed {path.relative_to(ROOT)}")

    if args.check and changed:
        print("generated agent definitions are stale:")
        for path in changed:
            print(f"  {path.relative_to(ROOT)}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
