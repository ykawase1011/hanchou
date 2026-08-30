#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import html
import os
import platform
import shutil
import subprocess
import tempfile
import time
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_ROOT = Path(os.environ.get("HANCHOU_CONFIG_ROOT", str(ROOT / "config"))).expanduser().resolve()


def replace(template: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", html.escape(value, quote=True))
    missing = [part.split("}}", 1)[0] for part in template.split("{{")[1:]]
    if missing:
        raise SystemExit(f"unresolved placeholders: {', '.join(missing)}")
    return template


def command(name: str) -> str:
    value = shutil.which(name)
    if not value:
        raise SystemExit(f"required command not found: {name}")
    return value


def expand(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def backup(path: Path) -> None:
    if not path.exists():
        return
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = path.with_name(f"{path.name}.bak.{stamp}")
    shutil.copy2(path, destination)
    print(f"backup: {destination}")


def load_launch_agent(label: str, plist: Path) -> None:
    if platform.system() != "Darwin" or not shutil.which("launchctl"):
        print(f"launchctl unavailable; not loaded: {label}")
        return
    domain = f"gui/{os.getuid()}"
    service = f"{domain}/{label}"
    loaded = subprocess.run(["launchctl", "print", service], capture_output=True).returncode == 0
    if loaded:
        subprocess.run(["launchctl", "bootout", service], check=True)
        for _ in range(50):
            if subprocess.run(["launchctl", "print", service], capture_output=True).returncode != 0:
                break
            time.sleep(0.1)
    last_error = ""
    for _ in range(20):
        result = subprocess.run(["launchctl", "bootstrap", domain, str(plist)], text=True, capture_output=True)
        if result.returncode == 0:
            break
        last_error = (result.stderr or result.stdout or "").strip()
        time.sleep(0.1)
    else:
        raise SystemExit(f"cannot load {service}: {last_error}")
    print(f"loaded {service}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", choices=["work", "personal"])
    parser.add_argument("--install", action="store_true", help="copy rendered plists into ~/Library/LaunchAgents")
    args = parser.parse_args()

    with (CONFIG_ROOT / "profiles" / f"{args.profile}.toml").open("rb") as fh:
        profile = tomllib.load(fh)
    paths = {key: expand(value) for key, value in profile["state"].items()}
    generated = Path.home() / ".config" / "hanchou" / args.profile / "generated"
    logs = paths["root"] / "logs"
    for path in (generated, paths["control_dir"], logs):
        path.mkdir(parents=True, exist_ok=True)

    default_path = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    path_value = os.environ.get("PATH", default_path)
    common = {
        "PROFILE": args.profile,
        "STATE_ROOT": str(paths["root"]),
        "CONTROL_DIR": str(paths["control_dir"]),
        "BEADS_DIR": str(paths["beads_dir"]),
        "RELAY_DIR": str(paths["relay_dir"]),
        "REPO_ROOT": str(ROOT),
        "CONFIG_ROOT": str(CONFIG_ROOT),
        "PATH": path_value,
    }
    specs = [
        (
            ROOT / "templates" / "launchd" / "herdr.plist.tmpl",
            generated / f"dev.hanchou.{args.profile}.herdr.plist",
            common
            | {
                "HERDR_BIN": command("herdr"),
                "HERDR_SESSION": profile["herdr"]["session"],
            },
        ),
        (
            ROOT / "templates" / "launchd" / "beads-ui.plist.tmpl",
            generated / f"dev.hanchou.{args.profile}.beads-ui.plist",
            common
            | {
                "BDUI_BIN": command("bdui"),
                "BD_BIN": command("bd"),
                "HOST": profile["ui"]["beads_ui_host"],
                "PORT": str(profile["ui"]["beads_ui_port"]),
            },
        ),
    ]

    for source, target, values in specs:
        rendered = replace(source.read_text(), values)
        if target.exists() and target.read_text() != rendered:
            backup(target)
        atomic_write(target, rendered)
        print(f"wrote {target}")
        if args.install:
            dest = Path.home() / "Library" / "LaunchAgents" / target.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and dest.read_text() != rendered:
                backup(dest)
            atomic_write(dest, rendered)
            print(f"installed {dest}")
            load_launch_agent(target.stem, dest)

    if args.install:
        print("LaunchAgents installed and loaded in the current GUI domain.")


if __name__ == "__main__":
    main()
