#!/usr/bin/env python3
from __future__ import annotations

import json
import plistlib
import py_compile
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    toml_files = [
        ROOT / "mise.toml",
        ROOT / ".codex" / "config.toml",
        ROOT / "herdr-plugin.toml",
        ROOT / "config" / "versions.toml",
        ROOT / "config" / "model-routing.toml",
        ROOT / "config" / "projects.example.toml",
        *sorted((ROOT / "config" / "skills").glob("*.toml")),
        *sorted((ROOT / "config" / "profiles").glob("*.toml")),
        *sorted((ROOT / "roles").glob("*/role.toml")),
        *sorted((ROOT / ".codex" / "agents").glob("*.toml")),
    ]
    for path in toml_files:
        with path.open("rb") as fh:
            tomllib.load(fh)

    with (ROOT / "mise.toml").open("rb") as fh:
        tools = tomllib.load(fh).get("tools", {})
    if tools.get("herdr") != "0.8.2" or tools.get("node") != "22":
        raise SystemExit("mise.toml must pin Herdr 0.8.2 and Node.js 22")
    if not str(tools.get("python", "")).startswith("3.13"):
        raise SystemExit("mise.toml must pin the Hanchou Python runtime")
    versions = tomllib.loads((ROOT / "config" / "versions.toml").read_text())
    if "herdr" in versions.get("components", {}):
        raise SystemExit("Herdr version must have a single source of truth in mise.toml")

    for path in sorted((ROOT / "schemas").glob("*.json")):
        json.loads(path.read_text())
    json.loads((ROOT / "config" / "usage.example.json").read_text())

    template = (ROOT / "config" / "herdr" / "config.toml.tmpl").read_text()
    rendered = (
        template.replace("{{HEADLESS_COLS}}", "160")
        .replace("{{HEADLESS_ROWS}}", "50")
        .replace("{{WORKTREE_DIR}}", "/tmp/worktrees")
        .replace("{{BEADS_UI_URL}}", "http://127.0.0.1:3737")
    )
    tomllib.loads(rendered)

    for path in sorted((ROOT / "templates" / "launchd").glob("*.plist.tmpl")):
        text = path.read_text()
        replacements = {
            "PROFILE": "work",
            "HERDR_BIN": "/usr/local/bin/herdr",
            "HERDR_SESSION": "work",
            "STATE_ROOT": "/tmp/hanchou",
            "CONTROL_DIR": "/tmp/hanchou/control",
            "BEADS_DIR": "/tmp/hanchou/control/.beads",
            "RELAY_DIR": "/tmp/hanchou/relay",
            "REPO_ROOT": "/tmp/hanchou-repo",
            "CONFIG_ROOT": "/tmp/hanchou-config",
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "BDUI_BIN": "/usr/local/bin/bdui",
            "BD_BIN": "/usr/local/bin/bd",
            "HOST": "127.0.0.1",
            "PORT": "3737",
        }
        for key, value in replacements.items():
            text = text.replace("{{" + key + "}}", value)
        if "{{" in text:
            raise SystemExit(f"unresolved plist placeholder: {path}")
        plistlib.loads(text.encode())


    skill_names = set()
    for path in sorted((ROOT / "skills").glob("*/SKILL.md")):
        text = path.read_text()
        if not text.startswith("---\n"):
            raise SystemExit(f"missing Skill frontmatter: {path}")
        header = text.split("---\n", 2)[1]
        metadata = {}
        for line in header.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                metadata[key.strip()] = value.strip().strip('"')
        if metadata.get("name") != path.parent.name:
            raise SystemExit(f"Skill name mismatch: {path}")
        if not metadata.get("description"):
            raise SystemExit(f"Skill description missing: {path}")
        skill_names.add(path.parent.name)
    if "hanchou-cli" not in skill_names or "hanchou-mailbox" in skill_names:
        raise SystemExit("invalid Hanchou Skill set")

    for role_path in sorted((ROOT / "roles").glob("*/role.toml")):
        with role_path.open("rb") as fh:
            role = tomllib.load(fh)
        for skill in role.get("skills", []):
            if skill == "herdr":
                continue
            if skill not in skill_names:
                raise SystemExit(f"role references missing Skill {skill}: {role_path}")

    py_compile.compile(str(ROOT / "libexec" / "hanchou.py"), doraise=True)
    for path in sorted((ROOT / "scripts").glob("*.py")):
        py_compile.compile(str(path), doraise=True)

    print(f"validated {len(toml_files)} TOML files, {len(skill_names)} Skills, JSON inputs/schemas, templates, and Python sources")


if __name__ == "__main__":
    main()
