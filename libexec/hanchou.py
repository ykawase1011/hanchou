#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
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
from pathlib import Path
from typing import Any, Iterable

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
) -> subprocess.CompletedProcess[str]:
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
        raise CommandError(f"command timed out after {timeout}s: {' '.join(argv)}") from exc
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise CommandError(f"command failed ({proc.returncode}): {' '.join(argv)}\n{detail}")
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


def usage_recommend(args: argparse.Namespace, name: str, profile: dict[str, Any]) -> None:
    policy = load_routing_policy(profile)
    routes = policy.get("routes", {})
    if args.role not in routes:
        raise CommandError(f"unknown routing role: {args.role}")
    route = routes[args.role]
    snapshot = load_usage_snapshot(profile)
    states = {provider: usage_provider_state(snapshot, provider, policy) for provider in ("codex", "claude")}
    primary_provider = route["primary_provider"]
    primary_model = route["primary_model"]
    fallback_provider = route.get("fallback_provider")
    fallback_model = route.get("fallback_model")
    forced = bool(route.get("force_provider")) or args.japanese or args.task_kind in {"writing", "japanese", "business-writing", "final-prose-review"}
    chosen_provider, chosen_model = primary_provider, primary_model
    reason = "default route"
    if forced:
        chosen_provider = "codex"
        if args.task_kind == "high-stakes-writing" or args.role == "orchestrator":
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
        "role": args.role,
        "task_kind": args.task_kind,
        "provider": chosen_provider,
        "model": chosen_model,
        "reason": reason,
        "max_concurrency": concurrency,
        "usage": states,
        "snapshot_path": str(usage_snapshot_path(profile)),
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"{args.role}: {chosen_provider} / {chosen_model}")
        print(f"reason: {reason}")
        print(f"recommended max concurrency: {concurrency}")


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


def get_agent_info(profile_name: str, agent: str) -> dict[str, Any] | None:
    try:
        proc = run(herdr_argv(profile_name, "agent", "get", agent), capture=True)
        value = parse_json_output(proc)
        record = value.get("result", {}).get("agent") if isinstance(value, dict) else None
        return record if isinstance(record, dict) else None
    except (CommandError, FileNotFoundError):
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

def start_orchestrator(name: str, profile: dict[str, Any]) -> None:
    ensure_state(name, profile)
    agent_name = profile["orchestrator"]["agent_name"]
    initial = (
        f"Initialize as the Hanchou L0 Orchestrator for profile `{name}`. "
        "Read AGENTS.md, roles/orchestrator/ROLE.md, docs/SESSION_HANDOFF.md, docs/RELAY.md, and docs/REPORTING.md. "
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
        run(herdr_argv(name, "agent", "prompt", agent_name, initial), capture=True)
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

    relay = sub.add_parser("relay")
    relay_sub = relay.add_subparsers(dest="relay_command", required=True)

    p = relay_sub.add_parser("emit")
    p.add_argument("--type", required=True)
    p.add_argument("--task")
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
