#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.parse
import urllib.request
import uuid
import webbrowser
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator

ROOT = Path(__file__).resolve().parents[1]
MISE_CONFIG = ROOT / "mise.toml"
DEFAULT_CONFIG_ROOT = ROOT / "config"
CONFIG_ROOT = DEFAULT_CONFIG_ROOT
VALID_PROFILES = {"work", "personal"}
RELAY_EVENT_TYPES = {
    "accepted",
    "checkpoint",
    "needs_decision",
    "blocked",
    "completed",
    "failed",
    "discovered_work",
    "schedule_proposal",
    "human_request",
    "schedule_due",
    "delivery_requested",
}
TERMINAL_TYPES = {"completed", "failed"}
REPORTING_POLICIES = {
    "silent",
    "parent_only",
    "on_failure",
    "on_change",
    "on_terminal",
    "always",
    "digest",
    "immediate",
}
DELIVERY_RENDERERS = {"orchestrator", "editor", "producer"}
DELIVERY_KINDS = {
    "task_terminal",
    "decision",
    "schedule_report",
    "daily_digest",
    "alert",
    "manual",
}
NUDGE_TEXT = (
    "[HANCHOU_RELAY] Durable Inbox events are pending. "
    "Run `hanchou inbox claim --json`, read each full event, apply the durable action, "
    "then `hanchou inbox ack <event-id>`. Do not infer completion from this nudge alone."
)



class CommandError(RuntimeError):
    pass


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def expand(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


def load_profile(name: str | None = None) -> tuple[str, dict[str, Any]]:
    selected = name or os.environ.get("HANCHOU_PROFILE") or "work"
    if selected not in VALID_PROFILES:
        raise CommandError(f"unknown profile: {selected}")
    path = CONFIG_ROOT / "profiles" / f"{selected}.toml"
    with path.open("rb") as fh:
        data = tomllib.load(fh)
    return selected, data


def profile_paths(profile: dict[str, Any]) -> dict[str, Path]:
    state = profile["state"]
    return {key: expand(value) for key, value in state.items()}


def mise_tools() -> dict[str, str]:
    if not MISE_CONFIG.exists():
        raise CommandError(f"mise config not found: {MISE_CONFIG}")
    with MISE_CONFIG.open("rb") as fh:
        data = tomllib.load(fh)
    tools = data.get("tools", {})
    if not isinstance(tools, dict):
        raise CommandError(f"invalid [tools] table: {MISE_CONFIG}")
    return {str(key): str(value) for key, value in tools.items()}


def command_path(name: str) -> str:
    # Resolve repository-managed binaries through mise even when the caller's
    # interactive shell has not activated mise shims.
    if name in {"herdr", "node", "npm", "npx"} and MISE_CONFIG.exists():
        mise = shutil.which("mise")
        if mise:
            proc = subprocess.run(
                [mise, "-C", str(ROOT), "which", name],
                text=True,
                capture_output=True,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout.strip()
    path = shutil.which(name)
    if not path:
        raise CommandError(f"required command not found: {name}")
    return path


def run(
    argv: list[str],
    *,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    check: bool = True,
    capture: bool = False,
    timeout: float | None = None,
    display_argv: list[str] | None = None,
    redact_output: bool = False,
) -> subprocess.CompletedProcess[str]:
    rendered_argv = shlex.join(display_argv if display_argv is not None else argv)
    try:
        proc = subprocess.run(
            argv,
            env=env,
            cwd=str(cwd) if cwd else None,
            text=True,
            capture_output=capture,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise CommandError(f"command timed out after {timeout}s: {rendered_argv}") from exc
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        if redact_output and detail:
            detail = "<command output redacted>"
        suffix = f"\n{detail}" if detail else ""
        raise CommandError(f"command failed ({proc.returncode}): {rendered_argv}{suffix}")
    return proc


def profile_env(name: str, profile: dict[str, Any]) -> dict[str, str]:
    paths = profile_paths(profile)
    env = os.environ.copy()
    env.update(
        {
            "HANCHOU_PROFILE": name,
            "HANCHOU_HOME": str(paths["root"]),
            "HANCHOU_CONFIG_HOME": str(Path.home() / ".config" / "hanchou" / name),
            "HANCHOU_CONFIG_ROOT": str(CONFIG_ROOT),
            "HANCHOU_REPO_ROOT": str(ROOT),
            "HANCHOU_BEADS_DIR": str(paths["beads_dir"]),
            "HANCHOU_RELAY_DIR": str(paths["relay_dir"]),
            "BEADS_DIR": str(paths["beads_dir"]),
            "BD_AGENT_PROFILE": profile["beads"].get("agent_profile", "conservative"),
        }
    )
    return env


def herdr_argv(name: str, *args: str) -> list[str]:
    return [command_path("herdr"), "--session", name, *args]


def atomic_write(path: Path, text: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    tmp_path = Path(tmp)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, path)
        dir_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        tmp_path.unlink(missing_ok=True)


def backup_and_write(path: Path, text: str) -> bool:
    current = path.read_text() if path.exists() else None
    if current == text:
        return False
    if path.exists():
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = path.with_name(f"{path.name}.bak.{stamp}")
        shutil.copy2(path, backup)
        print(f"backup: {backup}")
    atomic_write(path, text, 0o600)
    return True


def ensure_state(name: str, profile: dict[str, Any]) -> None:
    paths = profile_paths(profile)
    for key in ("root", "control_dir", "worktree_dir", "report_dir", "relay_dir"):
        paths[key].mkdir(parents=True, exist_ok=True)
    for part in (
        "inbox/pending",
        "inbox/processing",
        "inbox/acknowledged",
        "inbox/dead-letter",
        "deliveries/pending",
        "deliveries/rendered",
        "deliveries/delivered",
        "deliveries/failed",
        "receipts",
        "payloads",
        "locks",
    ):
        (paths["relay_dir"] / part).mkdir(parents=True, exist_ok=True)
    config_home = Path.home() / ".config" / "hanchou" / name
    (config_home / "generated").mkdir(parents=True, exist_ok=True)
    skills_target = config_home / "skills.toml"
    if not skills_target.exists():
        configured = profile.get("skills", {}).get("sources_file")
        candidates = []
        if configured:
            candidate = Path(configured)
            candidates.append(candidate if candidate.is_absolute() else CONFIG_ROOT / candidate)
        candidates.extend([
            CONFIG_ROOT / "skills" / "sources.toml",
            CONFIG_ROOT / "skills" / "sources.example.toml",
            DEFAULT_CONFIG_ROOT / "skills" / "sources.example.toml",
        ])
        source = next((candidate for candidate in candidates if candidate.exists()), None)
        if source is None:
            raise CommandError("no skills source template found")
        shutil.copy2(source, skills_target)


def render_herdr_config(name: str, profile: dict[str, Any]) -> str:
    template_path = CONFIG_ROOT / "herdr" / "config.toml.tmpl"
    if not template_path.exists():
        template_path = DEFAULT_CONFIG_ROOT / "herdr" / "config.toml.tmpl"
    template = template_path.read_text()
    paths = profile_paths(profile)
    replacements = {
        "WORKTREE_DIR": str(paths["worktree_dir"]),
        "HEADLESS_COLS": str(profile["herdr"]["headless_cols"]),
        "HEADLESS_ROWS": str(profile["herdr"]["headless_rows"]),
        "BEADS_UI_URL": f"http://{profile['ui']['beads_ui_host']}:{profile['ui']['beads_ui_port']}",
    }
    for key, value in replacements.items():
        template = template.replace("{{" + key + "}}", value)
    if "{{" in template:
        raise CommandError("unresolved Herdr config template placeholders")
    return template


def render_launchd(name: str, profile: dict[str, Any], install: bool) -> None:
    argv = [sys.executable, str(ROOT / "scripts" / "render-launchd.py"), name]
    if install:
        argv.append("--install")
    run(argv, env=profile_env(name, profile))


def render_agents(check: bool = False) -> None:
    argv = [sys.executable, str(ROOT / "scripts" / "render-agents.py")]
    if check:
        argv.append("--check")
    run(argv)



def usage_snapshot_path(profile: dict[str, Any]) -> Path:
    configured = profile.get("model_routing", {}).get("usage_snapshot")
    if configured:
        return expand(configured)
    return profile_paths(profile)["root"] / "usage.json"


def routing_policy_path(profile: dict[str, Any]) -> Path:
    configured = profile.get("model_routing", {}).get("policy_file", "model-routing.toml")
    candidate = Path(configured)
    candidates = [
        candidate if candidate.is_absolute() else CONFIG_ROOT / candidate,
        candidate if candidate.is_absolute() else DEFAULT_CONFIG_ROOT / candidate,
    ]
    path = next((item for item in candidates if item.exists()), None)
    if path is None:
        raise CommandError(f"model routing policy not found: {configured}")
    return path


def load_routing_policy(profile: dict[str, Any]) -> dict[str, Any]:
    with routing_policy_path(profile).open("rb") as fh:
        return tomllib.load(fh)


def empty_usage_snapshot() -> dict[str, Any]:
    return {
        "schema": "hanchou.usage-snapshot.v1",
        "updated_at": None,
        "providers": {
            "codex": {"source": "unknown", "weekly_remaining_percent": None, "session_remaining_percent": None, "reset_at": None},
            "claude": {"source": "unknown", "weekly_remaining_percent": None, "session_remaining_percent": None, "reset_at": None},
        },
    }


def load_usage_snapshot(profile: dict[str, Any]) -> dict[str, Any]:
    path = usage_snapshot_path(profile)
    if not path.exists():
        return empty_usage_snapshot()
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise CommandError(f"cannot read usage snapshot {path}: {exc}") from exc
    if data.get("schema") != "hanchou.usage-snapshot.v1":
        raise CommandError(f"unsupported usage snapshot schema: {data.get('schema')}")
    return data


def save_usage_snapshot(profile: dict[str, Any], data: dict[str, Any]) -> Path:
    path = usage_snapshot_path(profile)
    data["schema"] = "hanchou.usage-snapshot.v1"
    data["updated_at"] = utcnow()
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return path


def parse_snapshot_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)


def usage_provider_state(snapshot: dict[str, Any], provider: str, policy: dict[str, Any]) -> dict[str, Any]:
    record = snapshot.get("providers", {}).get(provider, {})
    remaining = record.get("weekly_remaining_percent")
    updated = parse_snapshot_time(snapshot.get("updated_at"))
    stale_minutes = int(policy.get("thresholds", {}).get("stale_after_minutes", 180))
    stale = updated is None or (dt.datetime.now(dt.timezone.utc) - updated).total_seconds() > stale_minutes * 60
    if stale or remaining is None:
        state = "unknown"
    else:
        critical = float(policy.get("thresholds", {}).get("critical_remaining_percent", 10))
        pressure = float(policy.get("thresholds", {}).get("pressure_remaining_percent", 25))
        if float(remaining) <= critical:
            state = "critical"
        elif float(remaining) <= pressure:
            state = "pressure"
        else:
            state = "normal"
    return {"state": state, "stale": stale, **record}


def usage_set(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    for label, value in (("weekly remaining", args.weekly_remaining), ("session remaining", args.session_remaining)):
        if value is not None and not 0 <= float(value) <= 100:
            raise CommandError(f"{label} must be between 0 and 100")
    ensure_state(name, profile)
    snapshot = load_usage_snapshot(profile)
    provider = snapshot.setdefault("providers", {}).setdefault(args.provider, {})
    provider.update({
        "source": args.source,
        "weekly_remaining_percent": args.weekly_remaining,
        "session_remaining_percent": args.session_remaining,
        "reset_at": args.reset_at,
    })
    path = save_usage_snapshot(profile, snapshot)
    result = {"profile": name, "path": str(path), "provider": args.provider, "record": provider, "updated_at": snapshot["updated_at"]}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"updated {args.provider} usage: weekly remaining {args.weekly_remaining:.1f}% ({path})")


def usage_show(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    snapshot = load_usage_snapshot(profile)
    policy = load_routing_policy(profile)
    result = {
        "profile": name,
        "path": str(usage_snapshot_path(profile)),
        "updated_at": snapshot.get("updated_at"),
        "providers": {provider: usage_provider_state(snapshot, provider, policy) for provider in ("codex", "claude")},
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    print(f"usage snapshot: {result['path']}")
    print(f"updated:        {result['updated_at'] or 'never'}")
    for provider, state in result["providers"].items():
        remaining = state.get("weekly_remaining_percent")
        rendered = "unknown" if remaining is None else f"{float(remaining):.1f}%"
        print(f"{provider:<8} weekly={rendered:<8} state={state['state']} source={state.get('source', 'unknown')}")


def resolve_route(
    name: str,
    profile: dict[str, Any],
    role: str,
    task_kind: str,
    *,
    japanese: bool = False,
) -> dict[str, Any]:
    policy = load_routing_policy(profile)
    routes = policy.get("routes", {})
    if role not in routes:
        raise CommandError(f"unknown routing role: {role}")
    route = routes[role]
    snapshot = load_usage_snapshot(profile)
    states = {provider: usage_provider_state(snapshot, provider, policy) for provider in ("codex", "claude")}
    primary_provider = route["primary_provider"]
    primary_model = route["primary_model"]
    fallback_provider = route.get("fallback_provider")
    fallback_model = route.get("fallback_model")
    forced = bool(route.get("force_provider")) or japanese or task_kind in {"writing", "japanese", "business-writing", "final-prose-review"}
    chosen_provider, chosen_model = primary_provider, primary_model
    reason = "default route"
    if forced:
        chosen_provider = "codex"
        if task_kind == "high-stakes-writing" or role == "orchestrator":
            chosen_model = "gpt-5.6-sol"
        else:
            chosen_model = primary_model if primary_provider == "codex" else "gpt-5.6-terra"
        reason = "Codex is required for Japanese/final prose policy"
    elif fallback_provider:
        primary_remaining = states[primary_provider].get("weekly_remaining_percent")
        fallback_remaining = states[fallback_provider].get("weekly_remaining_percent")
        primary_pressure = states[primary_provider]["state"] in {"pressure", "critical"}
        fallback_healthier = states[fallback_provider]["state"] == "normal" or (
            primary_remaining is not None and fallback_remaining is not None and float(fallback_remaining) > float(primary_remaining)
        )
        if primary_pressure and fallback_healthier:
            chosen_provider, chosen_model = fallback_provider, fallback_model
            reason = f"{primary_provider} usage is {states[primary_provider]['state']}; shifted to healthier provider"
    pressured = sum(states[p]["state"] in {"pressure", "critical"} for p in ("codex", "claude"))
    policy_cfg = policy.get("policy", {})
    if pressured == 0:
        concurrency = int(policy_cfg.get("max_concurrency_normal", 4))
    elif pressured == 1:
        concurrency = int(policy_cfg.get("max_concurrency_one_provider_pressure", 2))
    else:
        concurrency = int(policy_cfg.get("max_concurrency_both_pressure", 1))
    result = {
        "profile": name,
        "role": role,
        "task_kind": task_kind,
        "provider": chosen_provider,
        "model": chosen_model,
        "reason": reason,
        "max_concurrency": concurrency,
        "usage": states,
        "snapshot_path": str(usage_snapshot_path(profile)),
    }
    return result


def usage_recommend(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    result = resolve_route(name, profile, args.role, args.task_kind, japanese=args.japanese)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"{args.role}: {result['provider']} / {result['model']}")
        print(f"reason: {result['reason']}")
        print(f"recommended max concurrency: {result['max_concurrency']}")


def print_plan(name: str, profile: dict[str, Any]) -> None:
    paths = profile_paths(profile)
    tools = mise_tools()
    print(f"Hanchou apply plan: {name}")
    print(f"  config root: {CONFIG_ROOT}")
    print(f"  orchestrator: {profile['orchestrator']['kind']} / {profile['orchestrator'].get('model') or 'provider-default'} / logical agent {profile['orchestrator']['agent_name']}")
    print(f"  Herdr session: {profile['herdr']['session']}")
    print(f"  state: {paths['root']}")
    print(f"  Beads: {paths['beads_dir']} ({profile['beads']['mode']})")
    print(f"  task UI: http://{profile['ui']['beads_ui_host']}:{profile['ui']['beads_ui_port']}")
    print(f"  install mise tools from {MISE_CONFIG}: Herdr {tools.get('herdr')}, Node.js {tools.get('node')}")
    print("  render canonical roles to .codex/agents and .claude/agents")
    print("  backup + replace generated user Agent definitions and ~/.config/herdr/config.toml")
    print("  install/update explicit public Skills plus optional machine-local overlays")
    print("  install Herdr Claude/Codex integrations")
    print(f"  install pinned herdr-automations; herdr-beads enabled: {profile['ui'].get('herdr_beads_enabled', False)}")
    print("  link this checkout as the Hanchou Herdr plugin")
    print(f"  Relay state: {paths['relay_dir']} (Inbox + Delivery)")
    print("  reporting defaults: root on_terminal, child parent_only, automation on_failure, daily digest always")
    print("  initialize central Beads store and provider integrations")
    print("  backup + render/install ~/Library/LaunchAgents entries for Herdr and beads-ui")
    print(f"  model routing: {routing_policy_path(profile)}")
    print(f"  usage snapshot: {usage_snapshot_path(profile)}")


def install_agent_definitions() -> None:
    """Install generated role files into both provider user libraries."""
    codex_home = expand(os.environ.get("CODEX_HOME", "~/.codex"))
    claude_home = expand(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude"))
    destinations = [
        (ROOT / ".codex" / "agents", codex_home / "agents", "*.toml"),
        (ROOT / ".claude" / "agents", claude_home / "agents", "*.md"),
    ]
    for source_dir, dest_dir, pattern in destinations:
        dest_dir.mkdir(parents=True, exist_ok=True)
        for source in sorted(source_dir.glob(pattern)):
            target = dest_dir / source.name
            changed = backup_and_write(target, source.read_text())
            print(f"agent definition: {target} ({'updated' if changed else 'current'})")


def seed_automations_config(profile: dict[str, Any], env: dict[str, str]) -> None:
    plugin_id = profile["scheduler"]["plugin_id"]
    proc = run([command_path("herdr"), "plugin", "config-dir", plugin_id], env=env, capture=True)
    config_dir = Path(proc.stdout.strip()).expanduser().resolve()
    target = config_dir / "automations.yaml"
    if target.exists():
        print(f"automations config: preserve existing {target}")
        return
    template_ref = Path(profile["scheduler"]["config_template"])
    candidates = [
        template_ref if template_ref.is_absolute() else CONFIG_ROOT / template_ref,
        template_ref if template_ref.is_absolute() else ROOT / template_ref,
    ]
    template_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if template_path is None:
        raise CommandError(f"automation template not found: {template_ref}")
    template = template_path.read_text()
    paths = profile_paths(profile)
    rendered = (
        template.replace("{{REPO_ROOT}}", str(ROOT))
        .replace("{{REPORT_DIR}}", str(paths["report_dir"]))
    )
    atomic_write(target, rendered, 0o600)
    print(f"automations config: seeded disabled examples at {target}")


def install_skill_sources(name: str, profile: dict[str, Any], env: dict[str, str]) -> None:
    config_home = Path.home() / ".config" / "hanchou" / name
    source_file = config_home / "skills.toml"
    source_configs: list[tuple[dict[str, Any], bool]] = []
    with source_file.open("rb") as fh:
        source_configs.append((tomllib.load(fh), False))
    local_overlay = profile.get("skills", {}).get("local_overlay_file")
    if local_overlay:
        local_path = expand(local_overlay)
        if local_path.exists():
            with local_path.open("rb") as fh:
                source_configs.append((tomllib.load(fh), True))
    cli_version = tomllib.loads((ROOT / "config" / "versions.toml").read_text())["components"]["skills_cli"]["version"]
    cache_root = Path.home() / ".cache" / "hanchou" / "skills"
    sources: list[tuple[dict[str, Any], bool]] = []
    for config, machine_local in source_configs:
        sources.extend((source, machine_local) for source in config.get("sources", []))
    for source, machine_local in sources:
        if not source.get("enabled", False):
            continue
        visibility = source.get("visibility", "public")
        if visibility == "private" and not machine_local and not profile.get("skills", {}).get("install_private", False):
            continue
        location = source["location"]
        install_path: Path | str
        if location == ".":
            install_path = ROOT
        elif source.get("ref"):
            dest = cache_root / source["name"] / source["ref"].replace("/", "_")
            if not (dest / ".git").exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                run([command_path("git"), "clone", "--filter=blob:none", location, str(dest)], env=env)
            run([command_path("git"), "-C", str(dest), "fetch", "--depth", "1", "origin", source["ref"]], env=env)
            run([command_path("git"), "-C", str(dest), "checkout", "--detach", "FETCH_HEAD"], env=env)
            install_path = dest
        else:
            local_candidate = Path(location).expanduser()
            if not local_candidate.is_absolute():
                local_candidate = (ROOT / local_candidate).resolve()
            install_path = local_candidate if local_candidate.exists() else location
        argv = ["npx", "-y", f"skills@{cli_version}", "add", str(install_path)]
        for skill in source.get("skills", []):
            argv += ["--skill", skill]
        for agent in source.get("agents", []):
            argv += ["--agent", agent]
        if source.get("scope") == "global":
            argv.append("--global")
        if source.get("copy", True):
            argv.append("--copy")
        argv += ["--yes"]
        run(argv, env=env, cwd=ROOT)


def bootstrap_profile(name: str, profile: dict[str, Any]) -> None:
    mise = shutil.which("mise")
    if not mise:
        raise CommandError("required command not found: mise (install it with `brew install mise`)")
    for prerequisite in ("git", "gh", "bd", "codex", "claude"):
        if not shutil.which(prerequisite):
            raise CommandError(f"required bootstrap prerequisite not found: {prerequisite}")
    run([mise, "-C", str(ROOT), "install"], cwd=ROOT)
    apply_profile(name, profile, yes=True, install_upstream=True)


def apply_profile(name: str, profile: dict[str, Any], yes: bool, install_upstream: bool) -> None:
    if not yes:
        print_plan(name, profile)
        raise CommandError("apply requires --yes; use `hanchou plan <profile>` for preview")
    if install_upstream:
        # Fail before any writes if the standard toolchain is unavailable.
        # Herdr and Node are always resolved through mise.toml.
        for prerequisite in ("mise", "git", "bd", "codex", "claude", "herdr", "node", "npm", "npx"):
            command_path(prerequisite)
    ensure_state(name, profile)
    env = profile_env(name, profile)
    render_agents()
    install_agent_definitions()
    herdr_config = Path.home() / ".config" / "herdr" / "config.toml"
    changed = backup_and_write(herdr_config, render_herdr_config(name, profile))
    print(f"Herdr config: {'updated' if changed else 'current'} ({herdr_config})")

    local_bin = Path.home() / ".local" / "bin" / "hanchou"
    local_bin.parent.mkdir(parents=True, exist_ok=True)
    if local_bin.exists() or local_bin.is_symlink():
        local_bin.unlink()
    local_bin.symlink_to(ROOT / "bin" / "hanchou")
    print(f"linked {local_bin} -> {ROOT / 'bin' / 'hanchou'}")

    if install_upstream:
        run([command_path("herdr"), "integration", "install", "codex"], env=env)
        run([command_path("herdr"), "integration", "install", "claude"], env=env)
        versions = tomllib.loads((ROOT / "config" / "versions.toml").read_text())["components"]
        run([
            command_path("herdr"), "plugin", "install", versions["herdr_automations"]["source"],
            "--ref", f"v{versions['herdr_automations']['version']}", "--yes"
        ], env=env)
        if profile["ui"].get("herdr_beads_enabled"):
            run([
                command_path("herdr"), "plugin", "install", versions["herdr_beads"]["source"],
                "--ref", versions["herdr_beads"]["ref"], "--yes"
            ], env=env)
        # Link local Hanchou plugin so the relay dispatcher follows this checkout.
        run([command_path("herdr"), "plugin", "link", str(ROOT)], env=env)
        seed_automations_config(profile, env)

        beads_ui_version = versions["beads_ui"]["version"]
        run([command_path("npm"), "install", "-g", f"beads-ui@{beads_ui_version}"], env=env)

        control = profile_paths(profile)["control_dir"]
        control.mkdir(parents=True, exist_ok=True)
        run([
            command_path("bd"), "init", "--quiet", "--stealth", "--skip-hooks", "--skip-agents",
            "--init-if-missing", "--prefix", profile["beads"].get("prefix", "hch")
        ], env=env, cwd=control)
        run([command_path("bd"), "setup", "codex"], env=env, cwd=control)
        run([command_path("bd"), "setup", "claude"], env=env, cwd=control)
        install_skill_sources(name, profile, env)
        render_launchd(name, profile, install=True)
    else:
        print("upstream install skipped; run `hanchou bootstrap` or add --install-upstream to install integrations, plugins, Beads UI, skills, and LaunchAgents")

    if changed and shutil.which("herdr"):
        # A live server may not exist yet; reload is best-effort.
        run(herdr_argv(name, "server", "reload-config"), env=env, check=False, capture=True)
    print("apply complete")


def parse_json_output(proc: subprocess.CompletedProcess[str]) -> Any:
    text = (proc.stdout or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise CommandError(f"expected JSON output, received: {text[:500]}") from exc


def find_agent_status(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("status", "state", "agent_status"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate in {"idle", "done", "working", "blocked", "unknown"}:
                return candidate
        for child in value.values():
            status = find_agent_status(child)
            if status:
                return status
    elif isinstance(value, list):
        for child in value:
            status = find_agent_status(child)
            if status:
                return status
    return None


def get_agent_status(profile_name: str, agent: str, *, strict: bool = False) -> str | None:
    try:
        proc = run(herdr_argv(profile_name, "agent", "get", agent), capture=True)
        return find_agent_status(parse_json_output(proc))
    except CommandError as exc:
        if "agent_not_found" in str(exc):
            return None
        if strict:
            raise
        return None
    except FileNotFoundError:
        if strict:
            raise
        return None


def get_agent_info(profile_name: str, agent: str, *, strict: bool = False) -> dict[str, Any] | None:
    try:
        proc = run(herdr_argv(profile_name, "agent", "get", agent), capture=True)
        value = parse_json_output(proc)
        record = value.get("result", {}).get("agent") if isinstance(value, dict) else None
        if isinstance(record, dict):
            return record
        if strict:
            raise CommandError(f"unexpected Herdr agent response for {agent}: {value}")
        return None
    except CommandError as exc:
        if "agent_not_found" in str(exc):
            return None
        if strict:
            raise
        return None
    except FileNotFoundError:
        if strict:
            raise
        return None


def nudge_agent(profile_name: str, agent: str) -> tuple[bool, str | None]:
    status = get_agent_status(profile_name, agent)
    if status not in {"idle", "done"}:
        return False, status
    try:
        run(herdr_argv(profile_name, "agent", "prompt", agent, NUDGE_TEXT), capture=True)
        return True, status
    except CommandError:
        return False, status


def journal(root: Path, record: dict[str, Any]) -> None:
    path = root / "journal.jsonl"
    lock = root / "locks" / "journal.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    with lock.open("a+") as lock_fh:
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)


def relay_root(profile: dict[str, Any]) -> Path:
    return profile_paths(profile)["relay_dir"]


def inbox_root(profile: dict[str, Any]) -> Path:
    return relay_root(profile) / "inbox"


def deliveries_root(profile: dict[str, Any]) -> Path:
    return relay_root(profile) / "deliveries"


def event_path(root: Path, state: str, event_id: str) -> Path:
    return root / "inbox" / state / f"{event_id}.json"


def delivery_path(root: Path, state: str, delivery_id: str) -> Path:
    return root / "deliveries" / state / f"{delivery_id}.json"


def validate_route(event: dict[str, Any]) -> None:
    depth = event.get("delegation_depth", 1)
    from_role = event["from_role"]
    to_role = event["to_role"]
    if depth not in (0, 1, 2):
        raise CommandError("delegation_depth must be 0, 1, or 2")
    leaf_roles = {"worker", "reviewer", "researcher", "implementer", "writer", "editor"}
    if from_role in leaf_roles:
        expected = "mission-lead" if depth == 2 else "orchestrator"
        if to_role != expected:
            raise CommandError(f"leaf event at depth {depth} must route to {expected}, not {to_role}")
    if from_role == "mission-lead" and to_role != "orchestrator":
        raise CommandError("mission-lead events must route to orchestrator")
    if from_role in {"gateway", "scheduler", "relay"} and to_role != "orchestrator":
        raise CommandError(f"{from_role} events must route to orchestrator")
    if from_role == "orchestrator" and to_role not in {
        "mission-lead", "worker", "reviewer", "researcher", "implementer", "writer", "editor"
    }:
        raise CommandError("orchestrator assignments must target an execution role")
    if event["type"] in {"completed", "failed", "needs_decision", "blocked"} and not event.get("task_id"):
        raise CommandError(f"{event['type']} events require --task")


def relay_emit(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    ensure_state(name, profile)
    if args.type not in RELAY_EVENT_TYPES:
        raise CommandError(f"unsupported relay event type: {args.type}")
    event_id = args.event_id or f"evt_{uuid.uuid4().hex}"
    event = {
        "schema": "hanchou.relay-event.v1",
        "event_id": event_id,
        "type": args.type,
        "task_id": args.task,
        "execution_id": args.execution,
        "from_agent": args.from_agent,
        "from_role": args.from_role,
        "to_agent": args.to_agent,
        "to_role": args.to_role,
        "delegation_depth": args.delegation_depth,
        "created_at": utcnow(),
        "summary": args.summary,
        "detail_ref": args.detail_ref,
        "artifacts": args.artifact or [],
        "verification": args.verification or [],
        "origin": json.loads(args.origin) if args.origin else None,
    }
    validate_route(event)
    path = event_path(root, "pending", event_id)
    if path.exists() or any(event_path(root, state, event_id).exists() for state in ("processing", "acknowledged", "dead-letter")):
        raise CommandError(f"event already exists: {event_id}")
    atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
    journal(root, {"at": utcnow(), "action": "enqueued", "event_id": event_id, "to_agent": args.to_agent})
    nudged = False
    status = None
    if not args.no_nudge:
        nudged, status = nudge_agent(name, args.to_agent)
        if nudged:
            journal(root, {"at": utcnow(), "action": "nudged", "event_id": event_id, "to_agent": args.to_agent})
    result = {"ok": True, "event_id": event_id, "path": str(path), "nudged": nudged, "target_status": status}
    print(json.dumps(result, ensure_ascii=False) if args.json else f"queued {event_id} (nudged={nudged}, status={status})")


def load_event(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def iter_records(directory: Path) -> Iterable[tuple[Path, dict[str, Any]]]:
    if not directory.exists():
        return []
    rows = []
    for path in sorted(directory.glob("*.json"), key=lambda item: item.stat().st_mtime):
        try:
            rows.append((path, load_event(path)))
        except Exception:
            continue
    return rows


def iter_events(root: Path, state: str) -> Iterable[tuple[Path, dict[str, Any]]]:
    return iter_records(root / "inbox" / state)


def iter_deliveries(root: Path, state: str) -> Iterable[tuple[Path, dict[str, Any]]]:
    return iter_records(root / "deliveries" / state)


def inbox_list(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    states = [args.state] if args.state else ["pending", "processing", "acknowledged", "dead-letter"]
    rows = []
    for state in states:
        for path, event in iter_events(root, state):
            if args.to and event.get("to_agent") != args.to:
                continue
            rows.append({
                "state": state,
                "event_id": event.get("event_id"),
                "type": event.get("type"),
                "task_id": event.get("task_id"),
                "from": event.get("from_agent"),
                "to": event.get("to_agent"),
                "created_at": event.get("created_at"),
                "summary": event.get("summary"),
                "path": str(path),
            })
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        if not rows:
            print("inbox empty")
        for row in rows:
            print(f"{row['state']:<13} {row['event_id']} {row['type']:<20} {row['task_id'] or '-'} -> {row['to']}  {row['summary']}")


def inbox_claim(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    ensure_state(name, profile)
    target = args.to or profile["orchestrator"]["agent_name"]
    limit = args.limit or profile.get("relay", {}).get("max_batch", 20)
    claimed = []
    lock_path = root / "locks" / f"claim-{target}.lock"
    with lock_path.open("a+") as lock_fh:
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX)
        for path, event in iter_events(root, "pending"):
            if len(claimed) >= limit:
                break
            if event.get("to_agent") != target:
                continue
            event["lease"] = {
                "claimed_by": target,
                "claimed_at": utcnow(),
                "expires_at_epoch": int(time.time()) + int(profile.get("relay", {}).get("lease_seconds", 900)),
            }
            dest = event_path(root, "processing", event["event_id"])
            atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
            os.replace(path, dest)
            claimed.append(event | {"path": str(dest)})
            journal(root, {"at": utcnow(), "action": "claimed", "event_id": event["event_id"], "agent": target})
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)
    if args.json:
        print(json.dumps(claimed, ensure_ascii=False, indent=2))
    else:
        for event in claimed:
            print(f"claimed {event['event_id']}: {event['summary']}")
        if not claimed:
            print("no pending events")


def locate_event(root: Path, event_id: str, states: Iterable[str]) -> tuple[str, Path, dict[str, Any]]:
    for state in states:
        path = event_path(root, state, event_id)
        if path.exists():
            return state, path, load_event(path)
    raise CommandError(f"event not found: {event_id}")


def inbox_ack(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, event = locate_event(root, args.event_id, ("processing", "pending", "acknowledged"))
    if state == "acknowledged":
        result = {"ok": True, "event_id": args.event_id, "already": True}
    else:
        event["ack"] = {"at": utcnow(), "by": args.by or event.get("to_agent"), "note": args.note}
        event.pop("lease", None)
        dest = event_path(root, "acknowledged", args.event_id)
        atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
        os.replace(path, dest)
        receipt = root / "receipts" / f"inbox-{args.event_id}.json"
        atomic_write(receipt, json.dumps({"schema": "hanchou.relay-receipt.v1", "event_id": args.event_id, **event["ack"]}, ensure_ascii=False, indent=2) + "\n")
        journal(root, {"at": utcnow(), "action": "acknowledged", "event_id": args.event_id, "by": event["ack"]["by"]})
        result = {"ok": True, "event_id": args.event_id, "already": False, "path": str(dest)}
    print(json.dumps(result, ensure_ascii=False) if args.json else f"acknowledged {args.event_id}")


def inbox_retry(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, event = locate_event(root, args.event_id, ("processing", "dead-letter"))
    event.pop("lease", None)
    event["retry_count"] = int(event.get("retry_count", 0)) + 1
    dest = event_path(root, "pending", args.event_id)
    atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    journal(root, {"at": utcnow(), "action": "retried", "event_id": args.event_id, "from_state": state})
    print(f"retried {args.event_id}")


def inbox_dead_letter(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, event = locate_event(root, args.event_id, ("processing", "pending"))
    event.pop("lease", None)
    event["dead_letter"] = {"at": utcnow(), "reason": args.reason}
    dest = event_path(root, "dead-letter", args.event_id)
    atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    journal(root, {"at": utcnow(), "action": "dead-lettered", "event_id": args.event_id, "reason": args.reason})
    print(f"dead-lettered {args.event_id}")


def relay_recover(name: str, profile: dict[str, Any], *, quiet: bool = False) -> int:
    root = relay_root(profile)
    recovered = 0
    now = int(time.time())
    for path, event in iter_events(root, "processing"):
        expires = int(event.get("lease", {}).get("expires_at_epoch", 0))
        if expires and expires > now:
            continue
        event.pop("lease", None)
        event["recovery_count"] = int(event.get("recovery_count", 0)) + 1
        dest = event_path(root, "pending", event["event_id"])
        atomic_write(path, json.dumps(event, ensure_ascii=False, indent=2) + "\n")
        os.replace(path, dest)
        journal(root, {"at": utcnow(), "action": "lease-recovered", "event_id": event["event_id"]})
        recovered += 1
    if not quiet:
        print(f"recovered {recovered} event(s)")
    return recovered


def inbox_show(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, event = locate_event(root, args.event_id, ("pending", "processing", "acknowledged", "dead-letter"))
    print(json.dumps({"state": state, "path": str(path), "event": event}, ensure_ascii=False, indent=2))


def pending_signature(root: Path, target: str) -> str:
    ids = [event["event_id"] for _, event in iter_events(root, "pending") if event.get("to_agent") == target]
    return hashlib.sha256("\n".join(ids).encode()).hexdigest() if ids else ""


def relay_dispatch(name: str, profile: dict[str, Any], *, quiet: bool = False) -> dict[str, Any]:
    """Run one idempotent recovery and wake pass for Relay Inbox events."""
    ensure_state(name, profile)
    root = relay_root(profile)
    relay_recover(name, profile, quiet=True)
    state_path = root / "wake-state.json"
    wake_state = json.loads(state_path.read_text()) if state_path.exists() else {}
    targets = sorted({event.get("to_agent") for _, event in iter_events(root, "pending") if event.get("to_agent")})
    result: dict[str, Any] = {"profile": name, "targets": []}
    for target in targets:
        signature = pending_signature(root, target)
        status = get_agent_status(name, target)
        prior = wake_state.get(target, {})
        should_nudge = (
            signature
            and status in set(profile.get("relay", {}).get("nudge_when", ["idle", "done"]))
            and (prior.get("signature") != signature or prior.get("status") not in {"idle", "done"})
        )
        nudged = False
        if should_nudge:
            nudged, _ = nudge_agent(name, target)
            if nudged:
                journal(root, {"at": utcnow(), "action": "event-nudged", "to_agent": target, "signature": signature})
        wake_state[target] = {"signature": signature, "status": status, "nudged": nudged, "observed_at": utcnow()}
        result["targets"].append({"agent": target, "status": status, "pending_signature": signature, "nudged": nudged})
    atomic_write(state_path, json.dumps(wake_state, ensure_ascii=False, indent=2) + "\n")
    if not quiet:
        print(json.dumps(result, ensure_ascii=False))
    return result


def relay_daemon(name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    root = relay_root(profile)
    poll = max(1, int(profile.get("relay", {}).get("poll_seconds", 2)))
    stopping = False

    def stop(_signum: int, _frame: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"hanchou relay daemon started: profile={name} root={root}", flush=True)
    while not stopping:
        relay_dispatch(name, profile, quiet=True)
        time.sleep(poll)
    print("hanchou relay daemon stopped", flush=True)


def validate_destination(destination: dict[str, Any]) -> None:
    kind = destination.get("type")
    allowed = {"local_session", "origin", "slack_channel", "slack_thread", "discord_channel", "discord_thread", "file"}
    if kind not in allowed:
        raise CommandError(f"unsupported destination type: {kind}")
    if kind in {"slack_channel", "slack_thread", "discord_channel", "discord_thread"} and not destination.get("alias") and not destination.get("channel_id"):
        raise CommandError(f"{kind} destination requires alias or channel_id")
    if kind == "file" and not destination.get("path"):
        raise CommandError("file destination requires path")


def locate_delivery(root: Path, delivery_id: str, states: Iterable[str]) -> tuple[str, Path, dict[str, Any]]:
    for state in states:
        path = delivery_path(root, state, delivery_id)
        if path.exists():
            return state, path, load_event(path)
    raise CommandError(f"delivery not found: {delivery_id}")


def delivery_create(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    root = relay_root(profile)
    if args.kind not in DELIVERY_KINDS:
        raise CommandError(f"unsupported delivery kind: {args.kind}")
    if args.policy not in REPORTING_POLICIES:
        raise CommandError(f"unsupported reporting policy: {args.policy}")
    if args.renderer not in DELIVERY_RENDERERS:
        raise CommandError(f"unsupported renderer: {args.renderer}")
    destination = json.loads(args.destination)
    validate_destination(destination)
    delivery_id = args.delivery_id or f"dly_{uuid.uuid4().hex}"
    record = {
        "schema": "hanchou.delivery.v1",
        "delivery_id": delivery_id,
        "kind": args.kind,
        "task_id": args.task,
        "source_event_id": args.source_event,
        "created_at": utcnow(),
        "policy": args.policy,
        "renderer": args.renderer,
        "destination": destination,
        "summary": args.summary,
        "body_ref": args.body_ref,
        "dedupe_key": args.dedupe_key,
        "coalesce_key": args.coalesce_key,
        "not_before": args.not_before,
        "status": "pending",
        "attempts": 0,
    }
    path = delivery_path(root, "pending", delivery_id)
    if any(delivery_path(root, state, delivery_id).exists() for state in ("pending", "rendered", "delivered", "failed")):
        raise CommandError(f"delivery already exists: {delivery_id}")
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    journal(root, {"at": utcnow(), "action": "delivery-created", "delivery_id": delivery_id, "task_id": args.task})
    result = {"ok": True, "delivery_id": delivery_id, "path": str(path)}
    print(json.dumps(result, ensure_ascii=False) if args.json else f"created {delivery_id}")


def delivery_list(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    states = [args.state] if args.state else ["pending", "rendered", "delivered", "failed"]
    rows = []
    for state in states:
        for path, record in iter_deliveries(root, state):
            if args.task and record.get("task_id") != args.task:
                continue
            rows.append({
                "state": state,
                "delivery_id": record.get("delivery_id"),
                "kind": record.get("kind"),
                "task_id": record.get("task_id"),
                "policy": record.get("policy"),
                "renderer": record.get("renderer"),
                "destination": record.get("destination"),
                "summary": record.get("summary"),
                "created_at": record.get("created_at"),
                "path": str(path),
            })
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        if not rows:
            print("delivery queue empty")
        for row in rows:
            dest = row.get("destination", {}).get("type", "?")
            print(f"{row['state']:<10} {row['delivery_id']} {row['kind']:<16} {row['task_id'] or '-'} -> {dest}  {row['summary']}")


def delivery_show(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, record = locate_delivery(root, args.delivery_id, ("pending", "rendered", "delivered", "failed"))
    print(json.dumps({"state": state, "path": str(path), "delivery": record}, ensure_ascii=False, indent=2))


def delivery_rendered(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, record = locate_delivery(root, args.delivery_id, ("pending", "rendered"))
    if state == "rendered":
        print(f"already rendered {args.delivery_id}")
        return
    if args.message and args.message_file:
        raise CommandError("use only one of --message or --message-file")
    message = args.message
    if args.message_file:
        message = Path(args.message_file).read_text()
    record["rendered"] = {"at": utcnow(), "by": args.by, "message": message}
    record["status"] = "rendered"
    dest = delivery_path(root, "rendered", args.delivery_id)
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    journal(root, {"at": utcnow(), "action": "delivery-rendered", "delivery_id": args.delivery_id, "by": args.by})
    print(f"rendered {args.delivery_id}")


def delivery_delivered(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, record = locate_delivery(root, args.delivery_id, ("pending", "rendered", "delivered"))
    if state == "delivered":
        print(f"already delivered {args.delivery_id}")
        return
    record["delivered"] = {
        "at": utcnow(),
        "adapter": args.adapter,
        "external_id": args.external_id,
        "note": args.note,
    }
    record["status"] = "delivered"
    dest = delivery_path(root, "delivered", args.delivery_id)
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    receipt = root / "receipts" / f"delivery-{args.delivery_id}.json"
    atomic_write(receipt, json.dumps({"schema": "hanchou.delivery-receipt.v1", "delivery_id": args.delivery_id, **record["delivered"]}, ensure_ascii=False, indent=2) + "\n")
    journal(root, {"at": utcnow(), "action": "delivery-delivered", "delivery_id": args.delivery_id, "adapter": args.adapter})
    print(f"delivered {args.delivery_id}")


def delivery_fail(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, record = locate_delivery(root, args.delivery_id, ("pending", "rendered"))
    record["failure"] = {"at": utcnow(), "reason": args.reason}
    record["attempts"] = int(record.get("attempts", 0)) + 1
    record["status"] = "failed"
    dest = delivery_path(root, "failed", args.delivery_id)
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    journal(root, {"at": utcnow(), "action": "delivery-failed", "delivery_id": args.delivery_id, "reason": args.reason})
    print(f"failed {args.delivery_id}")


def delivery_retry(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    root = relay_root(profile)
    state, path, record = locate_delivery(root, args.delivery_id, ("failed",))
    record.pop("failure", None)
    record["status"] = "pending"
    dest = delivery_path(root, "pending", args.delivery_id)
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    os.replace(path, dest)
    journal(root, {"at": utcnow(), "action": "delivery-retried", "delivery_id": args.delivery_id})
    print(f"retried {args.delivery_id}")


DEFAULT_TASK_KINDS = {
    "mission-lead": "planning",
    "researcher": "research",
    "implementer": "code",
    "reviewer": "code-review",
    "writer": "writing",
    "editor": "final-prose-review",
}
LEAF_EXECUTION_ROLES = {
    "researcher",
    "implementer",
    "reviewer",
    "writer",
    "editor",
}


def execution_root(profile: dict[str, Any]) -> Path:
    return profile_paths(profile)["control_dir"] / "executions"


def safe_component(value: str, *, limit: int = 48) -> str:
    rendered = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-.")
    if not rendered:
        rendered = hashlib.sha256(value.encode()).hexdigest()[:12]
    return rendered[:limit]


def execution_path(profile: dict[str, Any], task_id: str) -> Path:
    digest = hashlib.sha256(task_id.encode()).hexdigest()[:10]
    return execution_root(profile) / f"{safe_component(task_id, limit=36)}-{digest}.json"


def load_execution(profile: dict[str, Any], task_id: str) -> dict[str, Any] | None:
    path = execution_path(profile, task_id)
    if not path.exists():
        return None
    try:
        record = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise CommandError(f"cannot read execution record {path}: {exc}") from exc
    if not isinstance(record, dict) or record.get("task_id") != task_id:
        raise CommandError(f"invalid execution record: {path}")
    return record


def save_execution(profile: dict[str, Any], record: dict[str, Any]) -> Path:
    record["updated_at"] = utcnow()
    path = execution_path(profile, str(record["task_id"]))
    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return path


def iter_executions(profile: dict[str, Any]) -> Iterable[dict[str, Any]]:
    root = execution_root(profile)
    if not root.exists():
        return []
    records: list[dict[str, Any]] = []
    for path in sorted(root.glob("*.json")):
        try:
            record = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(record, dict) and record.get("task_id"):
            records.append(record)
    return records


@contextmanager
def execution_lock(profile: dict[str, Any], task_id: str) -> Iterator[None]:
    lock_root = relay_root(profile) / "locks"
    lock_root.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(task_id.encode()).hexdigest()[:16]
    with (lock_root / f"execution-{digest}.lock").open("a+") as lock_fh:
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)


def bd_run(
    name: str,
    profile: dict[str, Any],
    argv: list[str],
    *,
    actor: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    command = [command_path("bd")]
    if actor:
        command += ["--actor", actor]
    command += argv
    return run(
        command,
        env=profile_env(name, profile),
        cwd=profile_paths(profile)["control_dir"],
        check=check,
        capture=True,
    )


def find_bead_record(value: Any, task_id: str) -> dict[str, Any] | None:
    if isinstance(value, dict):
        if value.get("id") == task_id:
            return value
        for key in ("issue", "bead", "result", "issues", "data"):
            if key in value:
                record = find_bead_record(value[key], task_id)
                if record is not None:
                    return record
    elif isinstance(value, list):
        for child in value:
            record = find_bead_record(child, task_id)
            if record is not None:
                return record
    return None


def load_bead(name: str, profile: dict[str, Any], task_id: str) -> dict[str, Any]:
    proc = bd_run(name, profile, ["show", task_id, "--json"])
    record = find_bead_record(parse_json_output(proc), task_id)
    if record is None:
        raise CommandError(f"cannot find Bead in JSON response: {task_id}")
    return record


def bead_metadata(bead: dict[str, Any]) -> dict[str, Any]:
    metadata = bead.get("metadata")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError as exc:
            raise CommandError(f"Bead {bead.get('id')} metadata is not valid JSON") from exc
    if not isinstance(metadata, dict):
        raise CommandError(f"Bead {bead.get('id')} requires hanchou.task.v1 metadata")
    return json.loads(json.dumps(metadata))


def validate_task_metadata(metadata: dict[str, Any], name: str, task_id: str) -> None:
    required_strings = ("profile", "project", "owner_role", "owner_agent")
    if metadata.get("schema") != "hanchou.task.v1":
        raise CommandError(f"Bead {task_id} metadata schema must be hanchou.task.v1")
    for key in required_strings:
        if not isinstance(metadata.get(key), str) or not metadata[key].strip():
            raise CommandError(f"Bead {task_id} metadata requires non-empty {key}")
    if metadata["profile"] != name:
        raise CommandError(f"Bead {task_id} belongs to profile {metadata['profile']}, not {name}")
    if metadata.get("execution_mode") != "leaf":
        raise CommandError(f"Bead {task_id} execution_mode must be leaf; mission dispatch is not implemented")
    if not isinstance(metadata.get("repo_path"), str) or not metadata["repo_path"].strip():
        raise CommandError(f"Bead {task_id} metadata requires repo_path")
    role = metadata.get("role")
    if not isinstance(role, str) or role not in LEAF_EXECUTION_ROLES:
        raise CommandError(f"Bead {task_id} has unsupported execution role: {role}")
    role_path = ROOT / "roles" / role / "role.toml"
    if not role_path.exists():
        raise CommandError(f"role definition not found: {role_path}")
    with role_path.open("rb") as fh:
        role_data = tomllib.load(fh)
    if role_data.get("name") != role:
        raise CommandError(f"role definition mismatch: {role_path}")


def update_bead_metadata(
    name: str,
    profile: dict[str, Any],
    task_id: str,
    metadata: dict[str, Any],
    *,
    actor: str,
    claim: bool = False,
    status: str | None = None,
) -> None:
    argv = ["update", task_id]
    if claim:
        argv.append("--claim")
    if status:
        argv += ["--status", status]
    argv += ["--metadata", json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), "--json"]
    bd_run(name, profile, argv, actor=actor)


def validate_repo(repo_value: str) -> Path:
    repo = expand(repo_value)
    if not repo.is_dir():
        raise CommandError(f"repository directory not found: {repo}")
    proc = run([command_path("git"), "-C", str(repo), "rev-parse", "--show-toplevel"], capture=True)
    top = Path(proc.stdout.strip()).resolve()
    if top != repo:
        raise CommandError(f"repo_path must be the Git top level: {repo} (top level is {top})")
    run([command_path("git"), "-C", str(repo), "rev-parse", "--verify", "HEAD"], capture=True)
    status = run([command_path("git"), "-C", str(repo), "status", "--porcelain"], capture=True)
    if status.stdout.strip():
        raise CommandError(f"repository must be clean before dispatch: {repo}")
    return repo


def task_routing_metadata(route: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": route["role"],
        "task_kind": route["task_kind"],
        "provider": route["provider"],
        "model": route["model"],
        "reason": route["reason"],
        "usage_snapshot_updated_at": load_usage_snapshot(profile).get("updated_at"),
    }


def execution_task_metadata(
    metadata: dict[str, Any],
    profile: dict[str, Any],
    *,
    execution_id: str,
    route: dict[str, Any],
    session: str,
    agent_name: str,
    kind: str,
    binding_state: str,
    branch: str,
    worktree_path: Path,
    workspace_id: str | None = None,
    pane_id: str | None = None,
    provider_session_id: str | None = None,
) -> dict[str, Any]:
    result = json.loads(json.dumps(metadata))
    result["execution_id"] = execution_id
    result["routing"] = task_routing_metadata(route, profile)
    result["herdr"] = {
        "session": session,
        "agent_name": agent_name,
        "kind": kind,
        "workspace_id": workspace_id,
        "pane_id": pane_id,
        "provider_session_id": provider_session_id,
        "binding_state": binding_state,
        "worktree_path": str(worktree_path),
        "branch": branch,
    }
    if result.get("reporting") is None:
        result["reporting"] = {
            "policy": profile.get("reporting", {}).get("default_child_task_policy", "parent_only"),
            "renderer": profile.get("reporting", {}).get("default_renderer", "orchestrator"),
            "destination": {"type": "local_session", "agent": result["owner_agent"]},
            "coalesce": "root_task",
            "digest_key": None,
            "origin": {"type": "local_session", "agent": result["owner_agent"]},
        }
    return result


EXECUTION_IDENTITY_FIELDS = (
    "profile",
    "project",
    "repo_path",
    "execution_mode",
    "owner_role",
    "owner_agent",
    "role",
)


def task_execution_identity(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        key: json.loads(json.dumps(metadata.get(key)))
        for key in EXECUTION_IDENTITY_FIELDS
    }


def validate_execution_identity(
    metadata: dict[str, Any], expected: dict[str, Any], task_id: str
) -> None:
    changed = [
        key for key in EXECUTION_IDENTITY_FIELDS
        if metadata.get(key) != expected.get(key)
    ]
    if changed:
        raise CommandError(
            f"Bead {task_id} execution identity changed in: {', '.join(changed)}"
        )


def patch_execution_metadata(
    name: str,
    profile: dict[str, Any],
    task_id: str,
    execution_id: str,
    desired: dict[str, Any],
    expected_identity: dict[str, Any],
    *,
    claim: bool = False,
    status: str | None = None,
) -> dict[str, Any]:
    """Merge only execution-owned fields into the latest Bead metadata."""
    bead = load_bead(name, profile, task_id)
    latest = bead_metadata(bead)
    validate_task_metadata(latest, name, task_id)
    validate_execution_identity(latest, expected_identity, task_id)
    observed = latest.get("execution_id")
    if observed not in (None, "", execution_id):
        raise CommandError(
            f"Bead {task_id} execution ownership conflict: expected {execution_id}, observed {observed}"
        )

    patch: dict[str, Any] = {"execution_id": execution_id}
    for key in ("routing", "herdr"):
        if key in desired:
            patch[key] = json.loads(json.dumps(desired[key]))
    if latest.get("reporting") is None and desired.get("reporting") is not None:
        patch["reporting"] = json.loads(json.dumps(desired["reporting"]))

    update_bead_metadata(
        name,
        profile,
        task_id,
        patch,
        actor=str(latest["owner_agent"]),
        claim=claim,
        status=status,
    )
    merged = json.loads(json.dumps(latest))
    merged.update(patch)
    return merged


def nested_value(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        candidate = value.get(key)
        if candidate is not None:
            return candidate
        for child in value.values():
            candidate = nested_value(child, key)
            if candidate is not None:
                return candidate
    elif isinstance(value, list):
        for child in value:
            candidate = nested_value(child, key)
            if candidate is not None:
                return candidate
    return None


def create_execution_worktree(
    name: str,
    profile: dict[str, Any],
    repo: Path,
    base_commit: str,
    branch: str,
    worktree_path: Path,
    label: str,
) -> tuple[str, str]:
    proc = run(
        herdr_argv(
            name,
            "worktree",
            "create",
            "--cwd",
            str(repo),
            "--base",
            base_commit,
            "--branch",
            branch,
            "--path",
            str(worktree_path),
            "--label",
            label,
            "--no-focus",
        ),
        env=profile_env(name, profile),
        capture=True,
        timeout=120,
    )
    value = parse_json_output(proc)
    workspace_id = nested_value(value, "workspace_id")
    pane_id = nested_value(value, "pane_id")
    if not isinstance(workspace_id, str) or not isinstance(pane_id, str):
        raise CommandError(f"cannot read workspace/pane IDs from Herdr worktree response: {value}")
    return workspace_id, pane_id


def safe_agent_name(task_id: str, execution_id: str, role: str) -> str:
    digest = hashlib.sha256(f"{task_id}:{execution_id}".encode()).hexdigest()[:10]
    role_part = re.sub(r"[^a-z0-9_-]", "-", role.lower())[:15].strip("-_") or "worker"
    return f"hch_{digest}_{role_part}"[:32]


def worker_agent_argv(
    name: str,
    profile: dict[str, Any],
    agent_name: str,
    pane_id: str,
    route: dict[str, Any],
    role: str,
    report_path: Path,
) -> list[str]:
    kind = route["provider"]
    argv = herdr_argv(
        name,
        "agent",
        "start",
        agent_name,
        "--kind",
        kind,
        "--pane",
        pane_id,
        "--timeout",
        "120000",
        "--",
    )
    if kind == "claude":
        role_path = ROOT / "roles" / role / "role.toml"
        with role_path.open("rb") as fh:
            role_data = tomllib.load(fh)
        claude = role_data.get("claude")
        if not isinstance(claude, dict) or claude.get("enabled", True) is False:
            raise CommandError(f"Claude execution is disabled for role: {role}")
        permission_mode = claude.get("permission_mode")
        tools = claude.get("tools")
        if not isinstance(permission_mode, str) or not permission_mode:
            raise CommandError(f"role {role} requires claude.permission_mode")
        # Hanchou's historical role contract used "default" for an autonomous
        # implementer; Claude Code 2.1.x names that mode "auto".
        if permission_mode == "default":
            permission_mode = "auto"
        if not isinstance(tools, list) or not tools or not all(isinstance(tool, str) and tool for tool in tools):
            raise CommandError(f"role {role} requires non-empty claude.tools")
        paths = profile_paths(profile)
        return argv + [
            "--model", route["model"],
            "--permission-mode", permission_mode,
            "--tools", ",".join(tools),
            "--add-dir", str(report_path.parent),
            "--add-dir", str(paths["relay_dir"]),
        ]
    paths = profile_paths(profile)
    session_dir = Path.home() / ".config" / "herdr" / "sessions" / name
    unix_socket_rule = f"network.unix_sockets={{{json.dumps(str(session_dir))}=\"allow\"}}"
    return argv + [
        "-m",
        route["model"],
        "--sandbox",
        "workspace-write",
        "--approve-for-me",
        "--add-dir",
        str(report_path.parent),
        "--add-dir",
        str(paths["relay_dir"]),
        "--add-dir",
        str(session_dir),
        "-c",
        "network.enabled=true",
        "-c",
        unix_socket_rule,
    ]


def provider_session_id(agent: dict[str, Any]) -> str | None:
    session = agent.get("agent_session")
    if not isinstance(session, dict):
        return None
    for key in ("agent_session_id", "session_id", "id", "value"):
        value = session.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def bead_text(bead: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        value = bead.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list) and value:
            return "\n".join(str(item) for item in value)
    return default


def active_bead_blockers(bead: dict[str, Any]) -> list[str]:
    blockers: list[str] = []
    dependencies = bead.get("dependencies")
    if not isinstance(dependencies, list):
        return blockers
    for dependency in dependencies:
        if not isinstance(dependency, dict):
            continue
        if dependency.get("dependency_type") != "blocks" or dependency.get("status") == "closed":
            continue
        blockers.append(str(dependency.get("id") or "unknown"))
    return blockers


def build_worker_prompt(
    name: str,
    bead: dict[str, Any],
    metadata: dict[str, Any],
    record: dict[str, Any],
) -> str:
    task_id = str(bead["id"])
    role = str(metadata["role"])
    owner_agent = str(metadata["owner_agent"])
    owner_role = str(metadata["owner_role"])
    depth = 2 if owner_role == "mission-lead" else 1
    report_path = str(record["report_path"])
    title = bead_text(bead, "title", default=task_id)
    description = bead_text(bead, "description", "body", default="No additional description supplied.")
    acceptance = bead_text(bead, "acceptance_criteria", "acceptance", default="Complete the bounded request and verify the result.")
    role_contract = (ROOT / "roles" / role / "ROLE.md").read_text().strip()
    if role in {"researcher", "reviewer"}:
        task_action = (
            "Do not modify the project worktree. Perform the bounded analysis, run the stated "
            "verification, and write the findings to the durable report path. Use the current "
            "worktree HEAD as the `commit:<sha>` provenance artifact; do not create an empty commit."
        )
    else:
        task_action = (
            "Implement the task, run the stated verification, commit the result, and write a "
            "bounded final report to the durable report path."
        )
    quoted = shlex.quote
    relay_prefix = (
        f"hanchou --profile {quoted(name)} relay emit --task {quoted(task_id)} "
        f"--execution {quoted(str(record['execution_id']))} "
        f"--from-agent {quoted(str(record['agent_name']))} --from-role {quoted(role)} "
        f"--to-agent {quoted(owner_agent)} --to-role {quoted(owner_role)} --delegation-depth {depth}"
    )
    return f"""Execute exactly one bounded Hanchou task as the `{role}` worker.
Load and follow the `hanchou-worker` and `hanchou-relay` Skills before working.

Canonical role contract:
{role_contract}

Task ID: {task_id}
Title: {title}
Description:
{description}

Acceptance criteria:
{acceptance}

Repository/worktree: {record['worktree_path']}
Branch: {record['branch']}
Durable report: {report_path}

Make project changes only in this worktree. Outside it, write only the exact
durable report path above and use the Hanchou CLI for the assigned Relay event.
Never edit Beads, Delivery, schedule, or Relay state directly. Do not contact
the human or spawn another Herdr agent. {task_action}
Then emit exactly one terminal Relay event. For success, run:

{relay_prefix} --type completed --summary '<bounded outcome>' --detail-ref {quoted(report_path)} --artifact commit:<sha> --verification '<command/result>' --json

For an unrecoverable failure, write the diagnosis to the same report path and
run the same command with `--type failed` and an accurate summary/artifact/
verification. The Relay record, not terminal prose, is the completion signal.
"""


def prompt_worker_agent(
    name: str,
    profile: dict[str, Any],
    bead: dict[str, Any],
    metadata: dict[str, Any],
    record: dict[str, Any],
    agent: dict[str, Any],
) -> Path:
    if record.get("prompted_at"):
        return execution_path(profile, str(record["task_id"]))
    prompt = build_worker_prompt(name, bead, metadata, record)
    baseline = agent.get("state_change_seq")
    record["phase"] = "prompting"
    record["prompt_attempted_at"] = utcnow()
    if isinstance(baseline, int):
        record["prompt_baseline_state_change_seq"] = baseline
    save_execution(profile, record)
    prompt_argv = herdr_argv(
        name,
        "agent",
        "prompt",
        str(record["agent_name"]),
        prompt,
        "--wait",
        "--until",
        "working",
        "--until",
        "idle",
        "--until",
        "done",
        "--until",
        "blocked",
        "--timeout",
        "10000",
    )
    display_argv = ["<redacted-prompt>" if value == prompt else value for value in prompt_argv]
    run(
        prompt_argv,
        capture=True,
        timeout=15,
        display_argv=display_argv,
        redact_output=True,
    )
    record["phase"] = "prompted"
    record["prompted_at"] = utcnow()
    return save_execution(profile, record)


def execution_events(profile: dict[str, Any], task_id: str) -> list[dict[str, Any]]:
    root = relay_root(profile)
    rows: list[dict[str, Any]] = []
    for state in ("pending", "processing", "acknowledged", "dead-letter"):
        for path, event in iter_events(root, state):
            if event.get("task_id") == task_id:
                rows.append({"state": state, "path": str(path), "event": event})
    return rows


def event_matches_execution(event: dict[str, Any], record: dict[str, Any]) -> bool:
    expected_depth = 2 if record.get("owner_role") == "mission-lead" else 1
    return (
        event.get("task_id") == record.get("task_id")
        and event.get("execution_id") == record.get("execution_id")
        and event.get("from_agent") == record.get("agent_name")
        and event.get("from_role") == record.get("role")
        and event.get("to_agent") == record.get("owner_agent")
        and event.get("to_role") == record.get("owner_role")
        and event.get("delegation_depth") == expected_depth
    )


def completion_evidence_anomalies(event: dict[str, Any], record: dict[str, Any]) -> list[str]:
    event_id = str(event.get("event_id") or "unknown")
    prefix = f"terminal event {event_id}"
    anomalies: list[str] = []

    report_value = record.get("report_path")
    detail_ref = event.get("detail_ref")
    if not isinstance(report_value, str) or not report_value:
        anomalies.append(f"{prefix} has no execution report path")
    else:
        report_path = Path(report_value).expanduser()
        if not isinstance(detail_ref, str) or not detail_ref:
            anomalies.append(f"{prefix} has no detail_ref")
        elif detail_ref != report_value:
            anomalies.append(f"{prefix} detail_ref does not match the execution report path")
        if not report_path.is_file():
            anomalies.append(f"{prefix} execution report does not exist")

    verification = event.get("verification")
    if not isinstance(verification, list) or not verification or not all(
        isinstance(item, str) and item.strip() for item in verification
    ):
        anomalies.append(f"{prefix} has no valid verification evidence")

    if event.get("type") != "completed":
        return anomalies

    artifacts = event.get("artifacts")
    commit_refs = [
        item.removeprefix("commit:")
        for item in artifacts
        if isinstance(item, str) and item.startswith("commit:")
    ] if isinstance(artifacts, list) else []
    if len(commit_refs) != 1:
        anomalies.append(f"{prefix} must have exactly one commit artifact")
        return anomalies
    commit_ref = commit_refs[0]
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", commit_ref):
        anomalies.append(f"{prefix} has an invalid commit artifact")
        return anomalies

    worktree_value = record.get("worktree_path")
    if not isinstance(worktree_value, str) or not worktree_value:
        anomalies.append(f"{prefix} has no execution worktree path")
        return anomalies
    worktree_path = Path(worktree_value).expanduser().resolve()
    if not worktree_path.is_dir():
        anomalies.append(f"{prefix} execution worktree does not exist")
        return anomalies
    try:
        head = run(
            [command_path("git"), "-C", str(worktree_path), "rev-parse", "--verify", "HEAD^{commit}"],
            capture=True,
        ).stdout.strip()
        reported = run(
            [command_path("git"), "-C", str(worktree_path), "rev-parse", "--verify", f"{commit_ref}^{{commit}}"],
            capture=True,
        ).stdout.strip()
    except (CommandError, FileNotFoundError) as exc:
        anomalies.append(f"{prefix} commit artifact cannot be verified: {exc}")
        return anomalies
    if reported != head:
        anomalies.append(f"{prefix} commit artifact does not match worktree HEAD")
    return anomalies


def execution_deliveries(profile: dict[str, Any], task_id: str) -> list[dict[str, Any]]:
    root = relay_root(profile)
    rows: list[dict[str, Any]] = []
    for state in ("pending", "rendered", "delivered", "failed"):
        for path, record in iter_deliveries(root, state):
            if record.get("task_id") == task_id:
                rows.append({"state": state, "path": str(path), "delivery": record})
    return rows


def execution_dispatch(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    execution_root(profile).mkdir(parents=True, exist_ok=True)
    task_id = args.task_id
    with execution_lock(profile, task_id):
        if load_execution(profile, task_id) is not None:
            raise CommandError(f"execution already exists for {task_id}; use execution inspect/reconcile")
        bead = load_bead(name, profile, task_id)
        metadata = bead_metadata(bead)
        validate_task_metadata(metadata, name, task_id)
        if metadata.get("execution_id") not in (None, ""):
            raise CommandError(
                f"Bead {task_id} is already owned by execution {metadata['execution_id']}"
            )
        if bead.get("status") != "open":
            raise CommandError(f"Bead {task_id} must be open before dispatch (status={bead.get('status')})")
        blockers = active_bead_blockers(bead)
        if blockers:
            raise CommandError(f"Bead {task_id} has active blockers: {', '.join(blockers)}")
        repo = validate_repo(str(metadata["repo_path"]))
        base_commit = run(
            [command_path("git"), "-C", str(repo), "rev-parse", "--verify", "HEAD^{commit}"],
            capture=True,
        ).stdout.strip()
        if not base_commit:
            raise CommandError(f"cannot resolve repository HEAD commit: {repo}")
        role = str(metadata["role"])
        task_kind = str((metadata.get("routing") or {}).get("task_kind") or DEFAULT_TASK_KINDS[role])
        route = resolve_route(name, profile, role, task_kind, japanese=role in {"writer", "editor"})
        execution_id = f"exe_{uuid.uuid4().hex}"
        agent_name = safe_agent_name(task_id, execution_id, role)
        branch = f"hanchou/{safe_component(task_id, limit=28).lower()}-{execution_id[-8:]}"
        worktree_path = profile_paths(profile)["worktree_dir"] / safe_component(task_id) / execution_id
        report_path = profile_paths(profile)["report_dir"] / safe_component(task_id) / f"{execution_id}.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        kind = str(route["provider"])
        task_identity = task_execution_identity(metadata)
        record: dict[str, Any] = {
            "schema": "hanchou.execution.v1",
            "execution_id": execution_id,
            "task_id": task_id,
            "phase": "created",
            "created_at": utcnow(),
            "repo_path": str(repo),
            "base_commit": base_commit,
            "worktree_path": str(worktree_path),
            "branch": branch,
            "report_path": str(report_path),
            "role": role,
            "owner_role": metadata["owner_role"],
            "owner_agent": metadata["owner_agent"],
            "task_identity": task_identity,
            "route": task_routing_metadata(route, profile),
            "herdr_session": name,
            "agent_name": agent_name,
            "kind": kind,
            "workspace_id": None,
            "pane_id": None,
            "provider_session_id": None,
        }
        save_execution(profile, record)
        claimed = False
        task_metadata = execution_task_metadata(
            metadata,
            profile,
            execution_id=execution_id,
            route=route,
            session=name,
            agent_name=agent_name,
            kind=kind,
            binding_state="pending",
            branch=branch,
            worktree_path=worktree_path,
        )
        try:
            task_metadata = patch_execution_metadata(
                name,
                profile,
                task_id,
                execution_id,
                task_metadata,
                task_identity,
                claim=True,
            )
            claimed = True
            record["phase"] = "claimed"
            save_execution(profile, record)

            workspace_id, pane_id = create_execution_worktree(
                name,
                profile,
                repo,
                base_commit,
                branch,
                worktree_path,
                f"{task_id} {role}",
            )
            record.update({"phase": "workspace_created", "workspace_id": workspace_id, "pane_id": pane_id})
            save_execution(profile, record)

            started = run(
                worker_agent_argv(name, profile, agent_name, pane_id, route, role, report_path),
                env=profile_env(name, profile),
                check=False,
                capture=True,
                timeout=140,
            )
            agent = get_agent_info(name, agent_name, strict=True)
            if agent is None:
                if started.returncode != 0:
                    detail = (started.stderr or started.stdout or "").strip()
                    raise CommandError(f"Herdr could not start {agent_name}: {detail}")
                raise CommandError(f"Herdr started worker but did not register {agent_name}")
            record["provider_session_id"] = provider_session_id(agent)
            record["phase"] = "awaiting_ready" if started.returncode != 0 else "agent_started"
            if started.returncode != 0:
                record["start_error"] = (started.stderr or started.stdout or "").strip()
            save_execution(profile, record)

            task_metadata = execution_task_metadata(
                task_metadata,
                profile,
                execution_id=execution_id,
                route=route,
                session=name,
                agent_name=agent_name,
                kind=kind,
                binding_state="live",
                branch=branch,
                worktree_path=worktree_path,
                workspace_id=workspace_id,
                pane_id=pane_id,
                provider_session_id=record["provider_session_id"],
            )
            task_metadata = patch_execution_metadata(
                name,
                profile,
                task_id,
                execution_id,
                task_metadata,
                task_identity,
            )
            if record["phase"] == "awaiting_ready":
                path = save_execution(profile, record)
                journal(
                    relay_root(profile),
                    {
                        "at": utcnow(),
                        "action": "execution-awaiting-ready",
                        "task_id": task_id,
                        "execution_id": execution_id,
                        "agent": agent_name,
                        "agent_status": find_agent_status(agent),
                    },
                )
            else:
                path = prompt_worker_agent(name, profile, bead, task_metadata, record, agent)
                agent = get_agent_info(name, agent_name, strict=True) or agent
                journal(relay_root(profile), {"at": utcnow(), "action": "execution-dispatched", "task_id": task_id, "execution_id": execution_id, "agent": agent_name})
        except (CommandError, OSError, KeyError, ValueError) as exc:
            failed_phase = str(record.get("phase"))
            agent_started = failed_phase in {"agent_started", "awaiting_ready", "prompting", "prompted"}
            record["phase"] = "attention_required"
            record["failed_phase"] = failed_phase
            record["error"] = str(exc)
            save_execution(profile, record)
            if claimed:
                failed_metadata = execution_task_metadata(
                    task_metadata,
                    profile,
                    execution_id=execution_id,
                    route=route,
                    session=name,
                    agent_name=agent_name,
                    kind=kind,
                    binding_state="live" if agent_started else "lost",
                    branch=branch,
                    worktree_path=worktree_path,
                    workspace_id=record.get("workspace_id"),
                    pane_id=record.get("pane_id"),
                    provider_session_id=record.get("provider_session_id"),
                )
                try:
                    patch_execution_metadata(
                        name,
                        profile,
                        task_id,
                        execution_id,
                        failed_metadata,
                        task_identity,
                        status="blocked",
                    )
                except CommandError as update_exc:
                    record["bead_update_error"] = str(update_exc)
                    save_execution(profile, record)
            raise CommandError(f"execution dispatch failed after {failed_phase}: {exc}") from exc
        result = {
            "ok": True,
            "task_id": task_id,
            "execution_id": execution_id,
            "phase": record["phase"],
            "agent_name": agent_name,
            "workspace_id": record["workspace_id"],
            "pane_id": record["pane_id"],
            "worktree_path": str(worktree_path),
            "branch": branch,
            "record_path": str(path),
            "agent_status": find_agent_status(agent),
            "requires_ready_reconcile": record["phase"] == "awaiting_ready",
        }
        if args.json:
            print(json.dumps(result, ensure_ascii=False))
        else:
            if record["phase"] == "awaiting_ready":
                print(f"worker {agent_name} is awaiting readiness/trust review in {record['workspace_id']} ({execution_id})")
            else:
                print(f"dispatched {task_id} as {agent_name} in {record['workspace_id']} ({execution_id})")


def execution_inspection(name: str, profile: dict[str, Any], task_id: str) -> dict[str, Any]:
    bead = load_bead(name, profile, task_id)
    record = load_execution(profile, task_id)
    metadata = bead_metadata(bead)
    agent = None
    if record and record.get("agent_name"):
        agent = get_agent_info(name, str(record["agent_name"]), strict=True)
    return {
        "task_id": task_id,
        "bead": bead,
        "task_metadata": metadata,
        "execution": record,
        "agent": agent,
        "agent_status": find_agent_status(agent) if agent else None,
        "events": execution_events(profile, task_id),
        "deliveries": execution_deliveries(profile, task_id),
    }


def execution_inspect(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    result = execution_inspection(name, profile, args.task_id)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    execution = result.get("execution") or {}
    print(f"task:       {args.task_id} / {result['bead'].get('status')}")
    print(f"execution:  {execution.get('execution_id', '-')} / {execution.get('phase', 'not-dispatched')}")
    print(f"agent:      {execution.get('agent_name', '-')} / {result.get('agent_status') or 'not-running'}")
    print(f"events:     {len(result['events'])}")
    print(f"deliveries: {len(result['deliveries'])}")


def reconcile_execution(name: str, profile: dict[str, Any], task_id: str) -> dict[str, Any]:
    with execution_lock(profile, task_id):
        record = load_execution(profile, task_id)
        if record is None:
            raise CommandError(f"execution record not found for {task_id}")
        bead = load_bead(name, profile, task_id)
        metadata = bead_metadata(bead)
        validate_task_metadata(metadata, name, task_id)
        expected_execution_id = str(record.get("execution_id") or "")
        raw_identity = record.get("task_identity")
        if isinstance(raw_identity, dict):
            expected_identity = raw_identity
        else:
            expected_identity = task_execution_identity(metadata)
            record["task_identity"] = expected_identity
            save_execution(profile, record)
        herdr = metadata.get("herdr") if isinstance(metadata.get("herdr"), dict) else {}
        actions: list[str] = []
        anomalies: list[str] = []
        binding = herdr.get("binding_state")
        observed_execution_id = metadata.get("execution_id")
        message = None
        if not expected_execution_id or observed_execution_id not in (None, "", expected_execution_id):
            message = (
                f"execution ownership conflict: expected {expected_execution_id or 'missing'}, "
                f"observed {observed_execution_id}"
            )
        else:
            try:
                validate_execution_identity(metadata, expected_identity, task_id)
            except CommandError as exc:
                message = str(exc)
        if message is not None:
            record["phase"] = "attention_required"
            record["error"] = message
            save_execution(profile, record)
            events = execution_events(profile, task_id)
            terminal_events = [row for row in events if row["event"].get("type") in TERMINAL_TYPES]
            deliveries = execution_deliveries(profile, task_id)
            return {
                "task_id": task_id,
                "execution_id": record.get("execution_id"),
                "phase": record.get("phase"),
                "binding_state": binding,
                "agent_status": None,
                "actions": actions,
                "anomalies": [message],
                "terminal_events": len(terminal_events),
                "bound_terminal_events": 0,
                "deliveries": len(deliveries),
            }
        if observed_execution_id in (None, ""):
            metadata = patch_execution_metadata(
                name,
                profile,
                task_id,
                expected_execution_id,
                {"execution_id": expected_execution_id},
                expected_identity,
            )
            actions.append("execution-id-restored")
            herdr = metadata.get("herdr") if isinstance(metadata.get("herdr"), dict) else {}
            binding = herdr.get("binding_state")
        agent_name = str(record.get("agent_name") or herdr.get("agent_name") or "")
        agent = get_agent_info(name, agent_name, strict=True) if agent_name else None
        status = find_agent_status(agent) if agent else None
        if agent is not None and binding in {"pending", "lost"}:
            herdr["binding_state"] = "live"
            herdr["workspace_id"] = record.get("workspace_id") or herdr.get("workspace_id")
            herdr["pane_id"] = record.get("pane_id") or herdr.get("pane_id")
            herdr["provider_session_id"] = provider_session_id(agent) or record.get("provider_session_id")
            metadata["herdr"] = herdr
            metadata = patch_execution_metadata(
                name, profile, task_id, expected_execution_id, metadata, expected_identity
            )
            herdr = metadata["herdr"]
            if record.get("phase") != "awaiting_ready":
                record["phase"] = "prompted" if record.get("prompted_at") else "agent_started"
            record.pop("error", None)
            actions.append("binding-restored-live")
            binding = "live"
        elif agent is None and binding in {"pending", "live"}:
            herdr["binding_state"] = "lost"
            metadata["herdr"] = herdr
            status_update = None if bead.get("status") == "closed" else "blocked"
            metadata = patch_execution_metadata(
                name,
                profile,
                task_id,
                expected_execution_id,
                metadata,
                expected_identity,
                status=status_update,
            )
            herdr = metadata["herdr"]
            record["phase"] = "attention_required"
            record["error"] = "bound Herdr agent is not live"
            actions.append("binding-marked-lost")
            anomalies.append("active Bead has no live Herdr agent")
            binding = "lost"
        elif agent is None and binding == "lost":
            anomalies.append("execution remains recoverable but has no live Herdr agent")

        if record.get("phase") == "awaiting_ready":
            if agent is None:
                anomalies.append("worker awaiting readiness is no longer live")
            elif status in {"idle", "done"}:
                herdr["binding_state"] = "live"
                herdr["workspace_id"] = record.get("workspace_id") or herdr.get("workspace_id")
                herdr["pane_id"] = record.get("pane_id") or herdr.get("pane_id")
                herdr["provider_session_id"] = provider_session_id(agent) or record.get("provider_session_id")
                metadata["herdr"] = herdr
                metadata = patch_execution_metadata(
                    name,
                    profile,
                    task_id,
                    expected_execution_id,
                    metadata,
                    expected_identity,
                    status="in_progress" if bead.get("status") != "in_progress" else None,
                )
                herdr = metadata["herdr"]
                record["phase"] = "agent_started"
                record.pop("start_error", None)
                save_execution(profile, record)
                try:
                    prompt_worker_agent(name, profile, bead, metadata, record, agent)
                except (CommandError, OSError) as exc:
                    record["phase"] = "attention_required"
                    record["failed_phase"] = "prompting"
                    record["error"] = str(exc)
                    save_execution(profile, record)
                    metadata = patch_execution_metadata(
                        name,
                        profile,
                        task_id,
                        expected_execution_id,
                        metadata,
                        expected_identity,
                        status="blocked",
                    )
                    herdr = metadata["herdr"]
                    actions.append("awaiting-ready-prompt-failed")
                    anomalies.append("worker became ready but the redacted task prompt failed")
                else:
                    actions.append("awaiting-ready-prompted")
                    binding = "live"
                    agent = get_agent_info(name, agent_name, strict=True)
                    status = find_agent_status(agent) if agent else None
            else:
                anomalies.append(f"worker is awaiting readiness (agent status={status or 'unknown'})")

        events = execution_events(profile, task_id)
        terminal_events = [row for row in events if row["event"].get("type") in TERMINAL_TYPES]
        bound_terminal_events = [row for row in terminal_events if event_matches_execution(row["event"], record)]
        acknowledged_bound = [row for row in bound_terminal_events if row["state"] == "acknowledged"]
        valid_acknowledged_terminal = None
        evidence_anomalies: list[str] = []
        for row in acknowledged_bound:
            row_anomalies = completion_evidence_anomalies(row["event"], record)
            if not row_anomalies and valid_acknowledged_terminal is None:
                valid_acknowledged_terminal = row
            evidence_anomalies.extend(row_anomalies)
        if terminal_events and not bound_terminal_events:
            anomalies.append("terminal Relay events exist for the task but none match this execution binding")
        anomalies.extend(evidence_anomalies)
        deliveries = execution_deliveries(profile, task_id)
        reporting = metadata.get("reporting") if isinstance(metadata.get("reporting"), dict) else {}
        policy = reporting.get("policy", "on_terminal")
        terminal_type = (
            valid_acknowledged_terminal["event"].get("type")
            if valid_acknowledged_terminal is not None
            else None
        )
        delivery_required = policy not in {"silent", "parent_only"} and not (
            policy == "on_failure" and terminal_type != "failed"
        )
        terminal_event_id = (
            valid_acknowledged_terminal["event"].get("event_id")
            if valid_acknowledged_terminal is not None
            else None
        )
        source_deliveries = [
            row
            for row in deliveries
            if row["delivery"].get("source_event_id") == terminal_event_id
        ]
        matching_deliveries = [
            row
            for row in source_deliveries
            if row["state"] == "delivered"
            and row["delivery"].get("kind") == "task_terminal"
            and row["delivery"].get("policy") == policy
            and row["delivery"].get("renderer") == reporting.get("renderer", "orchestrator")
            and row["delivery"].get("destination") == reporting.get("destination")
        ]
        delivery_delivered = len(source_deliveries) == 1 and len(matching_deliveries) == 1
        if (
            bead.get("status") == "closed"
            and valid_acknowledged_terminal is not None
            and (not delivery_required or delivery_delivered)
            and binding != "settled"
        ):
            herdr["binding_state"] = "settled"
            metadata["herdr"] = herdr
            metadata = patch_execution_metadata(
                name, profile, task_id, expected_execution_id, metadata, expected_identity
            )
            herdr = metadata["herdr"]
            record["phase"] = "settled"
            record["settled_at"] = utcnow()
            actions.append("binding-settled")
            binding = "settled"
        elif status in {"idle", "done"} and not bound_terminal_events and bead.get("status") != "closed":
            anomalies.append("Herdr agent is settled but no terminal Relay event matches this execution binding")
        if bead.get("status") == "closed" and valid_acknowledged_terminal is None:
            anomalies.append("closed Bead has no valid acknowledged terminal Relay event for this execution")

        if bead.get("status") == "closed" and delivery_required:
            if not source_deliveries:
                anomalies.append("closed root Bead has no Delivery for its terminal event")
            elif len(source_deliveries) > 1:
                anomalies.append("closed root Bead has multiple Delivery records for its terminal event")
            elif not matching_deliveries:
                anomalies.append("closed root Bead has no contract-matching delivered Delivery for its terminal event")
        save_execution(profile, record)
        return {
            "task_id": task_id,
            "execution_id": record.get("execution_id"),
            "phase": record.get("phase"),
            "binding_state": binding,
            "agent_status": status,
            "actions": actions,
            "anomalies": anomalies,
            "terminal_events": len(terminal_events),
            "bound_terminal_events": len(bound_terminal_events),
            "deliveries": len(deliveries),
        }


def execution_reconcile(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    execution_root(profile).mkdir(parents=True, exist_ok=True)
    relay_recover(name, profile, quiet=True)
    task_ids = [args.task_id] if args.task_id else [str(record["task_id"]) for record in iter_executions(profile)]
    results = [reconcile_execution(name, profile, task_id) for task_id in task_ids]
    if args.json:
        print(json.dumps(results[0] if args.task_id and results else results, ensure_ascii=False, indent=2))
        return
    if not results:
        print("no execution records")
    for result in results:
        print(
            f"{result['task_id']}: {result['phase']} / {result['binding_state']} / "
            f"actions={len(result['actions'])} anomalies={len(result['anomalies'])}"
        )

def start_orchestrator(name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    agent_name = profile["orchestrator"]["agent_name"]
    beads_dir = profile_paths(profile)["beads_dir"]
    initial = (
        f"Initialize as the Hanchou L0 Orchestrator for profile `{name}`. "
        "Read AGENTS.md, roles/orchestrator/ROLE.md, docs/SESSION_HANDOFF.md, docs/RELAY.md, and docs/REPORTING.md. "
        f"The authoritative Beads store is `BEADS_DIR={beads_dir}`. Use that absolute path for every `bd` command "
        "if BEADS_DIR is not already inherited; never fall back to a project-local Beads store. "
        f"Run `hanchou status {name}` and inspect only the control-plane state. "
        "If the Codex workspace sandbox denies that bounded command, retry the exact "
        "command through normal approval/escalation without using a bypass. "
        "Do not research or modify project repositories in this session. Reply with readiness and any blocking setup issue."
    )

    def initialize(record: dict[str, Any]) -> None:
        identity = str(record.get("terminal_id") or record.get("pane_id") or "unknown")
        marker = profile_paths(profile)["control_dir"] / ".hanchou-orchestrator-init.json"
        if marker.exists():
            try:
                if json.loads(marker.read_text()).get("identity") == identity:
                    print(f"orchestrator already exists: {agent_name}")
                    return
            except (OSError, json.JSONDecodeError):
                pass
        status_value = record.get("agent_status")
        if status_value not in {"idle", "done"}:
            print(f"orchestrator `{agent_name}` exists with status {status_value}; initialization remains pending")
            return
        prompt_argv = herdr_argv(name, "agent", "prompt", agent_name, initial)
        display_argv = ["<redacted-prompt>" if value == initial else value for value in prompt_argv]
        run(
            prompt_argv,
            capture=True,
            display_argv=display_argv,
            redact_output=True,
        )
        atomic_write(marker, json.dumps({"identity": identity, "initialized_at": utcnow()}) + "\n")
        print(f"initialized orchestrator `{agent_name}`")

    existing = get_agent_info(name, agent_name)
    if existing:
        initialize(existing)
        return
    created = run(
        herdr_argv(
            name,
            "workspace",
            "create",
            "--cwd",
            str(ROOT),
            "--label",
            profile["orchestrator"]["workspace_label"],
            "--no-focus",
        ),
        capture=True,
    )
    data = parse_json_output(created)
    try:
        pane_id = data["result"]["root_pane"]["pane_id"]
    except Exception as exc:
        raise CommandError(f"cannot read root pane ID from Herdr response: {data}") from exc
    kind = profile["orchestrator"].get("kind", "codex")
    argv = herdr_argv(
        name, "agent", "start", agent_name, "--kind", kind, "--pane", pane_id,
        "--timeout", "120000",
    )
    model = profile["orchestrator"].get("model")
    if model:
        if kind == "claude":
            argv += ["--", "--model", model]
        else:
            argv += ["--", "-m", model]
    if kind == "codex":
        if "--" not in argv:
            argv.append("--")
        paths = profile_paths(profile)
        session_dir = Path.home() / ".config" / "herdr" / "sessions" / name
        unix_socket_rule = f"network.unix_sockets={{{json.dumps(str(session_dir))}=\"allow\"}}"
        argv += [
            "--approve-for-me",
            "--add-dir", str(paths["root"]),
            "--add-dir", str(session_dir),
            "--add-dir", str(Path.home() / ".config" / "herdr" / "plugins" / "config"),
            "-c", "network.enabled=true",
            "-c", unix_socket_rule,
        ]
    started = run(argv, check=False, capture=True)
    if started.returncode != 0:
        if get_agent_status(name, agent_name) == "blocked":
            print(f"orchestrator `{agent_name}` is awaiting first-run trust/hook review; attach with `herdr --session {name} agent attach {agent_name}`")
            return
        detail = (started.stderr or started.stdout or "").strip()
        raise CommandError(f"cannot start orchestrator: {detail}")
    record = get_agent_info(name, agent_name)
    if record is None:
        raise CommandError(f"orchestrator started but Herdr did not register `{agent_name}`")
    initialize(record)
    print(f"started {kind} orchestrator `{agent_name}` in pane {pane_id}")


def open_target(name: str, profile: dict[str, Any], target: str) -> None:
    if target == "tasks":
        url = f"http://{profile['ui']['beads_ui_host']}:{profile['ui']['beads_ui_port']}"
        print(url)
        webbrowser.open(url)
    elif target == "herdr":
        os.execvp(command_path("herdr"), herdr_argv(name)[0:])
    elif target == "orchestrator":
        os.execvp(command_path("herdr"), herdr_argv(name, "agent", "attach", profile["orchestrator"]["agent_name"]))
    elif target == "automations":
        run(herdr_argv(name, "plugin", "pane", "open", "--plugin", "dnzzl.automations", "--entrypoint", "board", "--placement", "overlay"))
    else:
        raise CommandError(f"unknown open target: {target}")


def status(name: str, profile: dict[str, Any], as_json: bool) -> None:
    paths = profile_paths(profile)
    agent = profile["orchestrator"]["agent_name"]
    result = {
        "profile": name,
        "config_root": str(CONFIG_ROOT),
        "herdr_session": profile["herdr"]["session"],
        "orchestrator": {"name": agent, "kind": profile["orchestrator"].get("kind", "codex"), "model": profile["orchestrator"].get("model"), "status": get_agent_status(name, agent, strict=True)},
        "beads_dir": str(paths["beads_dir"]),
        "relay_dir": str(paths["relay_dir"]),
        "pending_inbox": len(list(iter_events(paths["relay_dir"], "pending"))) if paths["relay_dir"].exists() else 0,
        "pending_deliveries": len(list(iter_deliveries(paths["relay_dir"], "pending"))) if paths["relay_dir"].exists() else 0,
        "task_ui": f"http://{profile['ui']['beads_ui_host']}:{profile['ui']['beads_ui_port']}",
        "usage_snapshot": str(usage_snapshot_path(profile)),
        "commands": {
            "herdr": f"herdr --session {name}",
            "orchestrator": f"herdr --session {name} agent attach {agent}",
            "tasks": f"hanchou open tasks {name}",
            "automations": f"hanchou open automations {name}",
        },
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"profile:       {name}")
        print(f"config root:   {CONFIG_ROOT}")
        print(f"orchestrator:  {result['orchestrator']['kind']} / {result['orchestrator']['model'] or 'provider-default'} / {agent} / {result['orchestrator']['status'] or 'not-running'}")
        print(f"Herdr:        herdr --session {name}")
        print(f"Task UI:      {result['task_ui']}")
        print(f"Beads:        {paths['beads_dir']}")
        print(f"Relay:        {paths['relay_dir']}")
        print(f"Inbox pending: {result['pending_inbox']}")
        print(f"Delivery pending: {result['pending_deliveries']}")
        print(f"Usage:        {result['usage_snapshot']}")


def doctor(name: str, profile: dict[str, Any]) -> int:
    env = profile_env(name, profile)
    failures = 0

    def check_command(label: str, binary: str, args: list[str]) -> subprocess.CompletedProcess[str] | None:
        nonlocal failures
        try:
            path = command_path(binary)
            proc = run([path, *args], env=env, cwd=ROOT, check=False, capture=True, timeout=15)
        except CommandError as exc:
            print(f"FAIL {label}: {exc}")
            failures += 1
            return None
        ok = proc.returncode == 0
        print(f"{'ok  ' if ok else 'FAIL'} {label}")
        failures += 0 if ok else 1
        return proc if ok else None

    check_command("mise", "mise", ["--version"])
    herdr_proc = check_command("Herdr", "herdr", ["--version"])
    node_proc = check_command("Node.js", "node", ["--version"])
    check_command("Beads / bd", "bd", ["version"])
    check_command("Codex", "codex", ["--version"])
    check_command("Claude Code", "claude", ["--version"])
    check_command("beads-ui", "bdui", ["--help"])

    required_tools = mise_tools()
    if herdr_proc is not None:
        actual = (herdr_proc.stdout or herdr_proc.stderr).strip().split()[-1]
        expected = required_tools.get("herdr")
        ok = actual == expected
        print(f"{'ok  ' if ok else 'FAIL'} Herdr version: expected {expected}, got {actual}")
        failures += 0 if ok else 1
    if node_proc is not None:
        actual = (node_proc.stdout or node_proc.stderr).strip().lstrip("v")
        expected = required_tools.get("node", "")
        ok = actual == expected or actual.startswith(expected + ".")
        print(f"{'ok  ' if ok else 'FAIL'} Node.js version: expected {expected}, got {actual}")
        failures += 0 if ok else 1

    try:
        proc = run(herdr_argv(name, "status"), env=env, cwd=ROOT, check=False, capture=True, timeout=15)
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        ok = proc.returncode == 0 and "status: running" in output and f"version: {required_tools.get('herdr')}" in output
        print(f"{'ok  ' if ok else 'FAIL'} Herdr server/session")
        failures += 0 if ok else 1
    except CommandError as exc:
        print(f"FAIL Herdr server/session: {exc}")
        failures += 1

    try:
        proc = run([command_path("bd"), "ready", "--json"], env=env, cwd=profile_paths(profile)["control_dir"], check=False, capture=True, timeout=15)
        ok = proc.returncode == 0
        print(f"{'ok  ' if ok else 'FAIL'} Beads ready access")
        failures += 0 if ok else 1
    except CommandError as exc:
        print(f"FAIL Beads ready access: {exc}")
        failures += 1

    task_ui_url = f"http://{profile['ui']['beads_ui_host']}:{profile['ui']['beads_ui_port']}/"
    try:
        with urllib.request.urlopen(task_ui_url, timeout=5) as response:
            ok = 200 <= response.status < 400
    except (OSError, ValueError):
        ok = False
    print(f"{'ok  ' if ok else 'FAIL'} beads-ui endpoint: {task_ui_url}")
    failures += 0 if ok else 1

    try:
        proc = run([command_path("herdr"), "integration", "status"], env=env, cwd=ROOT, check=False, capture=True, timeout=15)
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        for provider, label in (("codex", "Herdr Codex integration"), ("claude", "Herdr Claude integration")):
            line = next((item for item in output.splitlines() if item.startswith(provider + ":")), "")
            ok = proc.returncode == 0 and bool(line) and "not installed" not in line
            print(f"{'ok  ' if ok else 'FAIL'} {label}")
            failures += 0 if ok else 1
    except CommandError as exc:
        print(f"FAIL Herdr integrations: {exc}")
        failures += 2

    try:
        proc = run([command_path("herdr"), "plugin", "list", "--json"], env=env, cwd=ROOT, check=False, capture=True, timeout=15)
        plugin_id = profile["scheduler"]["plugin_id"]
        ok = proc.returncode == 0 and plugin_id in (proc.stdout or "")
        print(f"{'ok  ' if ok else 'FAIL'} herdr-automations")
        failures += 0 if ok else 1
    except CommandError as exc:
        print(f"FAIL herdr-automations: {exc}")
        failures += 1

    try:
        cli_version = tomllib.loads((ROOT / "config" / "versions.toml").read_text())["components"]["skills_cli"]["version"]
        entries: list[dict[str, Any]] = []
        for scope_args in ([], ["--global"]):
            proc = run(
                [command_path("npx"), "-y", f"skills@{cli_version}", "list", *scope_args, "--json"],
                env=env,
                cwd=ROOT,
                check=False,
                capture=True,
                timeout=30,
            )
            if proc.returncode == 0:
                value = json.loads(proc.stdout or "[]")
                if isinstance(value, list):
                    entries.extend(item for item in value if isinstance(item, dict))
        expected_skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
        installed_for_providers = {
            item.get("name")
            for item in entries
            if any(agent in {"Codex", "Claude Code"} for agent in item.get("agents", []))
        }
        missing = sorted(expected_skills - installed_for_providers)
        ok = not missing
        suffix = "" if ok else f": missing {', '.join(missing)}"
        print(f"{'ok  ' if ok else 'FAIL'} Hanchou Skills{suffix}")
        failures += 0 if ok else 1
    except (CommandError, json.JSONDecodeError) as exc:
        print(f"FAIL Hanchou Skills: {exc}")
        failures += 1
    try:
        render_agents(check=True)
        print("ok   generated agent definitions")
    except CommandError as exc:
        print(f"FAIL generated agent definitions: {exc}")
        failures += 1
    paths = profile_paths(profile)
    for label, path in (("state root", paths["root"]), ("relay", paths["relay_dir"]), ("Beads", paths["beads_dir"])):
        ok = path.exists()
        print(f"{'ok  ' if ok else 'FAIL'} {label}: {path}")
        failures += 0 if ok else 1
    return failures


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hanchou", description="Herdr-first Hanchou control utility")
    parser.add_argument("--config-root", help="configuration root; defaults to HANCHOU_CONFIG_ROOT or ./config")
    parser.add_argument("--profile", choices=sorted(VALID_PROFILES), help="profile; defaults to HANCHOU_PROFILE or work")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("plan")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))

    p = sub.add_parser("bootstrap")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))

    p = sub.add_parser("apply")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))
    p.add_argument("--yes", action="store_true")
    p.add_argument("--install-upstream", action="store_true")

    p = sub.add_parser("status")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))
    p.add_argument("--json", action="store_true")

    p = sub.add_parser("doctor")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))

    p = sub.add_parser("start-orchestrator")
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))

    p = sub.add_parser("open")
    p.add_argument("target", choices=["tasks", "herdr", "orchestrator", "automations"])
    p.add_argument("profile_name", nargs="?", choices=sorted(VALID_PROFILES))

    p = sub.add_parser("render-agents")
    p.add_argument("--check", action="store_true")

    sub.add_parser("handoff")

    usage = sub.add_parser("usage")
    usage_sub = usage.add_subparsers(dest="usage_command", required=True)

    p = usage_sub.add_parser("set")
    p.add_argument("provider", choices=["codex", "claude"])
    p.add_argument("--weekly-remaining", type=float, required=True)
    p.add_argument("--session-remaining", type=float)
    p.add_argument("--reset-at")
    p.add_argument("--source", choices=["manual", "probe", "unknown"], default="manual")
    p.add_argument("--json", action="store_true")

    p = usage_sub.add_parser("show")
    p.add_argument("--json", action="store_true")

    p = usage_sub.add_parser("recommend", help="compatibility alias for route resolve")
    p.add_argument("--role", required=True, choices=["orchestrator", "mission-lead", "researcher", "implementer", "writer", "editor", "reviewer"])
    p.add_argument("--task-kind", default="general")
    p.add_argument("--japanese", action="store_true")
    p.add_argument("--json", action="store_true")

    route = sub.add_parser("route")
    route_sub = route.add_subparsers(dest="route_command", required=True)
    p = route_sub.add_parser("resolve")
    p.add_argument("--role", required=True, choices=["orchestrator", "mission-lead", "researcher", "implementer", "writer", "editor", "reviewer"])
    p.add_argument("--task-kind", default="general")
    p.add_argument("--japanese", action="store_true")
    p.add_argument("--json", action="store_true")

    execution = sub.add_parser("execution")
    execution_sub = execution.add_subparsers(dest="execution_command", required=True)

    p = execution_sub.add_parser("dispatch")
    p.add_argument("task_id")
    p.add_argument("--json", action="store_true")

    p = execution_sub.add_parser("inspect")
    p.add_argument("task_id")
    p.add_argument("--json", action="store_true")

    p = execution_sub.add_parser("reconcile")
    p.add_argument("task_id", nargs="?")
    p.add_argument("--json", action="store_true")

    relay = sub.add_parser("relay")
    relay_sub = relay.add_subparsers(dest="relay_command", required=True)

    p = relay_sub.add_parser("emit")
    p.add_argument("--type", required=True)
    p.add_argument("--task")
    p.add_argument("--execution")
    p.add_argument("--from-agent", required=True)
    p.add_argument("--from-role", required=True)
    p.add_argument("--to-agent", required=True)
    p.add_argument("--to-role", required=True)
    p.add_argument("--delegation-depth", type=int, default=1)
    p.add_argument("--summary", required=True)
    p.add_argument("--detail-ref")
    p.add_argument("--artifact", action="append")
    p.add_argument("--verification", action="append")
    p.add_argument("--origin", help="JSON origin descriptor for local or future Chat delivery")
    p.add_argument("--event-id")
    p.add_argument("--no-nudge", action="store_true")
    p.add_argument("--json", action="store_true")

    relay_sub.add_parser("recover")
    relay_sub.add_parser("dispatch")
    relay_sub.add_parser("daemon")

    inbox = sub.add_parser("inbox")
    inbox_sub = inbox.add_subparsers(dest="inbox_command", required=True)

    p = inbox_sub.add_parser("list")
    p.add_argument("--state", choices=["pending", "processing", "acknowledged", "dead-letter"])
    p.add_argument("--to")
    p.add_argument("--json", action="store_true")

    p = inbox_sub.add_parser("claim")
    p.add_argument("--to")
    p.add_argument("--limit", type=int)
    p.add_argument("--json", action="store_true")

    p = inbox_sub.add_parser("show")
    p.add_argument("event_id")

    p = inbox_sub.add_parser("ack")
    p.add_argument("event_id")
    p.add_argument("--by")
    p.add_argument("--note")
    p.add_argument("--json", action="store_true")

    p = inbox_sub.add_parser("retry")
    p.add_argument("event_id")

    p = inbox_sub.add_parser("dead-letter")
    p.add_argument("event_id")
    p.add_argument("--reason", required=True)

    delivery = sub.add_parser("delivery")
    delivery_sub = delivery.add_subparsers(dest="delivery_command", required=True)

    p = delivery_sub.add_parser("create")
    p.add_argument("--kind", required=True, choices=sorted(DELIVERY_KINDS))
    p.add_argument("--task")
    p.add_argument("--source-event")
    p.add_argument("--policy", required=True, choices=sorted(REPORTING_POLICIES))
    p.add_argument("--renderer", required=True, choices=sorted(DELIVERY_RENDERERS))
    p.add_argument("--destination", required=True, help="JSON destination descriptor")
    p.add_argument("--summary", required=True)
    p.add_argument("--body-ref")
    p.add_argument("--dedupe-key")
    p.add_argument("--coalesce-key")
    p.add_argument("--not-before")
    p.add_argument("--delivery-id")
    p.add_argument("--json", action="store_true")

    p = delivery_sub.add_parser("list")
    p.add_argument("--state", choices=["pending", "rendered", "delivered", "failed"])
    p.add_argument("--task")
    p.add_argument("--json", action="store_true")

    p = delivery_sub.add_parser("show")
    p.add_argument("delivery_id")

    p = delivery_sub.add_parser("mark-rendered")
    p.add_argument("delivery_id")
    p.add_argument("--by", required=True)
    p.add_argument("--message")
    p.add_argument("--message-file")

    p = delivery_sub.add_parser("mark-delivered")
    p.add_argument("delivery_id")
    p.add_argument("--adapter", required=True)
    p.add_argument("--external-id")
    p.add_argument("--note")

    p = delivery_sub.add_parser("fail")
    p.add_argument("delivery_id")
    p.add_argument("--reason", required=True)

    p = delivery_sub.add_parser("retry")
    p.add_argument("delivery_id")
    return parser


def selected_profile_arg(args: argparse.Namespace) -> str | None:
    return getattr(args, "profile_name", None) or args.profile


def main() -> None:
    global CONFIG_ROOT
    parser = build_parser()
    args = parser.parse_args()
    config_root_value = args.config_root or os.environ.get("HANCHOU_CONFIG_ROOT")
    CONFIG_ROOT = expand(config_root_value) if config_root_value else DEFAULT_CONFIG_ROOT
    try:
        if args.command == "render-agents":
            render_agents(args.check)
            return
        if args.command == "handoff":
            print((ROOT / "docs" / "SESSION_HANDOFF.md").read_text())
            return
        name, profile = load_profile(selected_profile_arg(args))
        os.environ.update({k: v for k, v in profile_env(name, profile).items() if k.startswith("HANCHOU_") or k in {"BEADS_DIR", "BD_AGENT_PROFILE"}})
        if args.command == "plan":
            print_plan(name, profile)
        elif args.command == "bootstrap":
            bootstrap_profile(name, profile)
        elif args.command == "apply":
            apply_profile(name, profile, args.yes, args.install_upstream)
        elif args.command == "status":
            status(name, profile, args.json)
        elif args.command == "doctor":
            raise SystemExit(doctor(name, profile))
        elif args.command == "start-orchestrator":
            start_orchestrator(name, profile)
        elif args.command == "open":
            open_target(name, profile, args.target)
        elif args.command == "usage":
            if args.usage_command == "set": usage_set(args, name, profile)
            elif args.usage_command == "show": usage_show(args, name, profile)
            elif args.usage_command == "recommend": usage_recommend(args, name, profile)
        elif args.command == "route":
            if args.route_command == "resolve": usage_recommend(args, name, profile)
        elif args.command == "execution":
            if args.execution_command == "dispatch": execution_dispatch(args, name, profile)
            elif args.execution_command == "inspect": execution_inspect(args, name, profile)
            elif args.execution_command == "reconcile": execution_reconcile(args, name, profile)
        elif args.command == "relay":
            cmd = args.relay_command
            if cmd == "emit": relay_emit(args, name, profile)
            elif cmd == "recover": relay_recover(name, profile)
            elif cmd == "dispatch": relay_dispatch(
                name, profile, quiet=bool(os.environ.get("HERDR_PLUGIN_CONTEXT_JSON") or os.environ.get("HERDR_PLUGIN_EVENT_JSON"))
            )
            elif cmd == "daemon": relay_daemon(name, profile)
        elif args.command == "inbox":
            cmd = args.inbox_command
            if cmd == "list": inbox_list(args, name, profile)
            elif cmd == "claim": inbox_claim(args, name, profile)
            elif cmd == "show": inbox_show(args, name, profile)
            elif cmd == "ack": inbox_ack(args, name, profile)
            elif cmd == "retry": inbox_retry(args, name, profile)
            elif cmd == "dead-letter": inbox_dead_letter(args, name, profile)
        elif args.command == "delivery":
            cmd = args.delivery_command
            if cmd == "create": delivery_create(args, name, profile)
            elif cmd == "list": delivery_list(args, name, profile)
            elif cmd == "show": delivery_show(args, name, profile)
            elif cmd == "mark-rendered": delivery_rendered(args, name, profile)
            elif cmd == "mark-delivered": delivery_delivered(args, name, profile)
            elif cmd == "fail": delivery_fail(args, name, profile)
            elif cmd == "retry": delivery_retry(args, name, profile)
    except CommandError as exc:
        print(f"hanchou: {exc}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
