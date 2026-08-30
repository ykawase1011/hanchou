#!/usr/bin/env bash
set -euo pipefail

TOOL_NAME="$(basename "$0")"
if [[ "$TOOL_NAME" == "mise" || "$TOOL_NAME" == "bd" || "$TOOL_NAME" == "herdr" ]]; then
    "$FAKE_PYTHON" - "$TOOL_NAME" "$@" <<'PY'
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

tool = sys.argv[1]
args = sys.argv[2:]

if tool == "mise":
    if len(args) >= 2 and args[0] == "-C":
        args = args[2:]
    if args and args[0] == "which":
        resolved = shutil.which(args[1])
        if not resolved:
            raise SystemExit(1)
        print(resolved)
        raise SystemExit(0)
    if args and args[0] == "exec":
        args = args[1:]
        if args and args[0] == "--":
            args = args[1:]
        if args and args[0] == "python3":
            args[0] = os.environ["FAKE_PYTHON"]
        os.execvpe(args[0], args, os.environ)
    raise SystemExit("unsupported fake mise invocation")

if tool == "bd":
    state_path = Path(os.environ["FAKE_BD_STATE"])
    state = json.loads(state_path.read_text())
    actor = None
    if len(args) >= 2 and args[0] == "--actor":
        actor, args = args[1], args[2:]
    command, task_id = args[0], args[1]
    bead = state["beads"].get(task_id)
    if bead is None:
        print(json.dumps({"error": "not_found"}), file=sys.stderr)
        raise SystemExit(1)
    if command == "show":
        print(json.dumps([bead]))
        raise SystemExit(0)
    if command != "update":
        raise SystemExit("unsupported fake bd invocation")
    if "--claim" in args:
        bead["status"] = "in_progress"
        bead["assignee"] = actor
    if "--status" in args:
        bead["status"] = args[args.index("--status") + 1]
    if "--metadata" in args:
        metadata_patch = json.loads(args[args.index("--metadata") + 1])
        bead["metadata"].update(metadata_patch)
        state.setdefault("metadata_updates", []).append({
            "task_id": task_id,
            "metadata": metadata_patch,
        })
    state_path.write_text(json.dumps(state))
    print(json.dumps([bead]))
    raise SystemExit(0)

if tool == "herdr":
    state_path = Path(os.environ["FAKE_HERDR_STATE"])
    state = json.loads(state_path.read_text())
    if len(args) >= 2 and args[0] == "--session":
        args = args[2:]
    if args[:2] == ["worktree", "create"]:
        def option(name):
            return args[args.index(name) + 1]
        repo, base, branch, target = option("--cwd"), option("--base"), option("--branch"), option("--path")
        proc = subprocess.run(["git", "-C", repo, "worktree", "add", "-q", "-b", branch, target, base], text=True, capture_output=True)
        if proc.returncode:
            print(proc.stderr, file=sys.stderr)
            raise SystemExit(proc.returncode)
        state.setdefault("worktrees", []).append(args)
        state["counter"] += 1
        workspace = f"w{state['counter']}"
        pane = f"{workspace}:p1"
        state["last_workspace"] = {"workspace_id": workspace, "pane_id": pane}
        state_path.write_text(json.dumps(state))
        print(json.dumps({"result": {"workspace": {"workspace_id": workspace}, "root_pane": {"pane_id": pane}}}))
        raise SystemExit(0)
    if args[:2] == ["agent", "start"]:
        if os.environ.get("FAKE_HERDR_FAIL_START") == "1":
            print(json.dumps({"error": {"code": "agent_start_failed"}}), file=sys.stderr)
            raise SystemExit(1)
        name = args[2]
        pane = args[args.index("--pane") + 1]
        workspace = pane.split(":", 1)[0]
        state.setdefault("starts", []).append(args)
        state["agents"][name] = {
            "name": name,
            "agent_status": "idle",
            "workspace_id": workspace,
            "pane_id": pane,
            "state_change_seq": 1,
            "agent_session": {"source": "fake", "agent": "codex", "kind": "id", "value": f"session-{name}"},
        }
        state_path.write_text(json.dumps(state))
        if os.environ.get("FAKE_HERDR_BLOCK_START") == "1":
            state["agents"][name]["agent_status"] = "blocked"
            state_path.write_text(json.dumps(state))
            print(json.dumps({"error": {"code": "agent_not_ready"}}), file=sys.stderr)
            raise SystemExit(1)
        print(json.dumps({"result": {"agent": state["agents"][name]}}))
        raise SystemExit(0)
    if args[:2] == ["agent", "get"]:
        name = args[2]
        agent = state["agents"].get(name)
        if agent is None:
            print(json.dumps({"error": {"code": "agent_not_found"}}), file=sys.stderr)
            raise SystemExit(1)
        print(json.dumps({"result": {"agent": agent}}))
        raise SystemExit(0)
    if args[:2] == ["agent", "prompt"]:
        name, prompt = args[2], args[3]
        if name not in state["agents"]:
            print(json.dumps({"error": {"code": "agent_not_found"}}), file=sys.stderr)
            raise SystemExit(1)
        if os.environ.get("FAKE_HERDR_FAIL_PROMPT") == "1":
            print(f"prompt rejected: {prompt}", file=sys.stderr)
            raise SystemExit(1)
        state["prompts"].append({"agent": name, "prompt": prompt, "args": args[4:]})
        state["agents"][name]["agent_status"] = "working"
        state["agents"][name]["state_change_seq"] += 1
        state_path.write_text(json.dumps(state))
        print(json.dumps({"result": {"accepted": True}}))
        raise SystemExit(0)
    raise SystemExit(f"unsupported fake herdr invocation: {args}")

raise SystemExit(f"unknown fake tool: {tool}")
PY
    exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REAL_MISE="$(command -v mise)"
FAKE_PYTHON="$($REAL_MISE -C "$ROOT" which python3)"
export FAKE_PYTHON
export FAKE_BD_STATE="$TMP/bd.json"
export FAKE_HERDR_STATE="$TMP/herdr.json"
export FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN" "$TMP/home" "$TMP/repo"

git -C "$TMP/repo" init -q -b main
git -C "$TMP/repo" config user.name "Hanchou Test"
git -C "$TMP/repo" config user.email "hanchou-test@example.invalid"
printf '# isolated execution fixture\n' > "$TMP/repo/README.md"
git -C "$TMP/repo" add README.md
git -C "$TMP/repo" commit -qm "Initial fixture"

"$FAKE_PYTHON" - "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$TMP/repo" <<'PY'
import json, sys
bd_path, herdr_path, repo = sys.argv[1:]

def task(task_id, title, role="implementer", description="Create one bounded fixture artifact."):
    return {
        "id": task_id,
        "title": title,
        "description": description,
        "acceptance_criteria": "The worker receives the task and reports a commit through Relay.",
        "status": "open",
        "metadata": {
            "schema": "hanchou.task.v1",
            "profile": "work",
            "project": "execution-fixture",
            "repo_path": repo,
            "execution_mode": "leaf",
            "execution_id": None,
            "owner_role": "orchestrator",
            "owner_agent": "orchestrator",
            "role": role,
            "herdr": None,
            "automation": None,
            "routing": None,
            "reporting": {
                "policy": "on_terminal",
                "renderer": "orchestrator",
                "destination": {"type": "local_session", "agent": "orchestrator"},
                "coalesce": "root_task",
                "digest_key": None,
                "origin": {"type": "local_session", "agent": "orchestrator"},
            },
        },
}

tasks = {
    "hch-ok": task("hch-ok", "Successful Codex dispatch"),
    "hch-delivery-bad": task("hch-delivery-bad", "Invalid and duplicate Delivery evidence"),
    "hch-evidence": task("hch-evidence", "Invalid completion evidence"),
    "hch-claude": task("hch-claude", "Successful Claude fallback dispatch"),
    "hch-reviewer": task("hch-reviewer", "Claude reviewer dispatch", role="reviewer"),
    "hch-researcher": task("hch-researcher", "Claude researcher dispatch", role="researcher"),
    "hch-conflict": task("hch-conflict", "Reconcile ownership conflict"),
    "hch-trust": task("hch-trust", "Codex first-run trust recovery"),
    "hch-trust-fail": task(
        "hch-trust-fail",
        "Ready reconcile prompt failure",
        description="Never expose SENTINEL-HANCHOU-READY-SECRET-8b319e.",
    ),
    "hch-fail": task("hch-fail", "Safe failed dispatch"),
    "hch-secret": task(
        "hch-secret",
        "Prompt failure redaction",
        description="Never expose SENTINEL-HANCHOU-PROMPT-SECRET-4c221d.",
    ),
}
blocked = task("hch-blocked", "Dependency-blocked dispatch")
blocked["dependencies"] = [{
    "id": "hch-prereq",
    "title": "Open prerequisite",
    "status": "open",
    "dependency_type": "blocks",
}]
tasks["hch-blocked"] = blocked
foreign = task("hch-foreign", "Foreign execution ownership")
foreign["metadata"]["execution_id"] = "exe_foreign"
tasks["hch-foreign"] = foreign
json.dump({"beads": tasks, "metadata_updates": []}, open(bd_path, "w"))
json.dump({"counter": 0, "agents": {}, "prompts": [], "starts": [], "worktrees": []}, open(herdr_path, "w"))
PY

cp "$ROOT/tests/test-execution.sh" "$FAKE_BIN/fake-tool"
chmod +x "$FAKE_BIN/fake-tool"
ln -s fake-tool "$FAKE_BIN/mise"
ln -s fake-tool "$FAKE_BIN/bd"
ln -s fake-tool "$FAKE_BIN/herdr"

export HOME="$TMP/home"
export PATH="$FAKE_BIN:$PATH"

if $ROOT/bin/hanchou --profile work execution dispatch hch-blocked --json >"$TMP/blocked.out" 2>"$TMP/blocked.err"; then
    echo "expected dependency-blocked dispatch rejection" >&2
    exit 1
fi
grep -q 'has active blockers: hch-prereq' "$TMP/blocked.err"
$ROOT/bin/hanchou --profile work execution inspect hch-blocked --json > "$TMP/inspect-blocked.json"
"$FAKE_PYTHON" - "$TMP/inspect-blocked.json" <<'PY'
import json, sys
inspect = json.load(open(sys.argv[1]))
assert inspect["bead"]["status"] == "open"
assert inspect["execution"] is None
PY

if $ROOT/bin/hanchou --profile work execution dispatch hch-foreign --json >"$TMP/foreign.out" 2>"$TMP/foreign.err"; then
    echo "expected foreign execution ownership rejection" >&2
    exit 1
fi
grep -q 'already owned by execution exe_foreign' "$TMP/foreign.err"
$ROOT/bin/hanchou --profile work execution inspect hch-foreign --json > "$TMP/inspect-foreign.json"
"$FAKE_PYTHON" - "$TMP/inspect-foreign.json" "$FAKE_HERDR_STATE" <<'PY'
import json, sys
inspect = json.load(open(sys.argv[1]))
herdr = json.load(open(sys.argv[2]))
assert inspect["bead"]["status"] == "open"
assert inspect["task_metadata"]["execution_id"] == "exe_foreign"
assert inspect["execution"] is None
assert herdr["counter"] == 0 and not herdr["worktrees"] and not herdr["starts"]
PY

SUCCESS="$($ROOT/bin/hanchou --profile work execution dispatch hch-ok --json)"
printf '%s' "$SUCCESS" | "$FAKE_PYTHON" -c 'import json,sys; row=json.load(sys.stdin); assert row["phase"] == "prompted" and row["agent_name"].startswith("hch_")'

$ROOT/bin/hanchou --profile work execution inspect hch-ok --json > "$TMP/inspect-ok.json"
"$FAKE_PYTHON" - "$TMP/inspect-ok.json" "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$TMP/repo" "$TMP/home" <<'PY'
import json, subprocess, sys
from pathlib import Path
inspect = json.load(open(sys.argv[1]))
bd_state = json.load(open(sys.argv[2]))
beads = bd_state["beads"]
herdr = json.load(open(sys.argv[3]))
repo = sys.argv[4]
raw_test_home = Path(sys.argv[5])
test_home = raw_test_home.resolve()
assert inspect["execution"]["phase"] == "prompted"
base_commit = subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip()
assert inspect["execution"]["base_commit"] == base_commit
worktree = herdr["worktrees"][0]
assert worktree[worktree.index("--base") + 1] == base_commit
assert inspect["task_metadata"]["herdr"]["binding_state"] == "live"
assert inspect["task_metadata"]["herdr"]["worktree_path"]
assert inspect["task_metadata"]["herdr"]["branch"].startswith("hanchou/")
assert inspect["task_metadata"]["routing"]["provider"] == "codex"
assert inspect["task_metadata"]["routing"]["model"] == "gpt-5.6-terra"
assert inspect["agent_status"] == "working"
assert beads["hch-ok"]["status"] == "in_progress"
updates = [row["metadata"] for row in bd_state["metadata_updates"] if row["task_id"] == "hch-ok"]
assert len(updates) == 2
assert all(set(row) <= {"execution_id", "routing", "herdr", "reporting"} for row in updates)
assert all("schema" not in row and "project" not in row and "owner_agent" not in row for row in updates)
prompt = herdr["prompts"][0]["prompt"]
assert "Task ID: hch-ok" in prompt
assert "hanchou-worker" in prompt and "hanchou-relay" in prompt
assert "Canonical role contract:" in prompt and "# Implementer" in prompt
assert "--type completed" in prompt and "--to-agent orchestrator" in prompt
assert "--execution " + inspect["execution"]["execution_id"] in prompt
prompt_args = herdr["prompts"][0]["args"]
assert "--wait" in prompt_args and "working" in prompt_args and "blocked" in prompt_args
start = herdr["starts"][0]
assert start[start.index("--kind") + 1] == "codex"
assert "--sandbox" in start and "workspace-write" in start
assert "--approve-for-me" in start and "network.enabled=true" in start
add_dirs = [start[index + 1] for index, value in enumerate(start) if value == "--add-dir"]
assert set(add_dirs) == {
    str(Path(inspect["execution"]["report_path"]).parent),
    str((test_home / ".local/share/hanchou/work/relay").resolve()),
    str(raw_test_home / ".config/herdr/sessions/work"),
}
assert len(add_dirs) == 3
PY

AWAITING="$(FAKE_HERDR_BLOCK_START=1 $ROOT/bin/hanchou --profile work execution dispatch hch-trust --json)"
AWAITING_AGENT="$(printf '%s' "$AWAITING" | "$FAKE_PYTHON" -c 'import json,sys; row=json.load(sys.stdin); assert row["phase"] == "awaiting_ready" and row["agent_status"] == "blocked" and row["requires_ready_reconcile"] is True; print(row["agent_name"])')"
"$FAKE_PYTHON" - "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$AWAITING_AGENT" <<'PY'
import json, sys
bd_path, herdr_path, agent_name = sys.argv[1:]
bd_state = json.load(open(bd_path))
bead = bd_state["beads"]["hch-trust"]
assert bead["status"] == "in_progress"
assert bead["metadata"]["herdr"]["binding_state"] == "live"
bead["status"] = "blocked"
open(bd_path, "w").write(json.dumps(bd_state))
state = json.load(open(herdr_path))
assert not any("Task ID: hch-trust" in entry["prompt"] for entry in state["prompts"])
agent = state["agents"][agent_name]
assert agent["agent_status"] == "blocked"
agent["agent_status"] = "idle"
agent["state_change_seq"] += 1
open(herdr_path, "w").write(json.dumps(state))
PY
$ROOT/bin/hanchou --profile work execution reconcile hch-trust --json > "$TMP/reconcile-trust.json"
$ROOT/bin/hanchou --profile work execution reconcile hch-trust --json > "$TMP/reconcile-trust-again.json"
"$FAKE_PYTHON" - "$TMP/reconcile-trust.json" "$TMP/reconcile-trust-again.json" "$FAKE_HERDR_STATE" "$FAKE_BD_STATE" <<'PY'
import json, sys
first = json.load(open(sys.argv[1]))
second = json.load(open(sys.argv[2]))
state = json.load(open(sys.argv[3]))
bead = json.load(open(sys.argv[4]))["beads"]["hch-trust"]
assert first["phase"] == "prompted"
assert "awaiting-ready-prompted" in first["actions"]
assert second["phase"] == "prompted"
assert bead["status"] == "in_progress"
trust_prompts = [entry for entry in state["prompts"] if "Task ID: hch-trust" in entry["prompt"]]
assert len(trust_prompts) == 1
assert "Codex first-run trust recovery" in trust_prompts[0]["prompt"]
assert "--wait" in trust_prompts[0]["args"] and "working" in trust_prompts[0]["args"]
PY

$ROOT/bin/hanchou --profile work execution inspect hch-trust --json > "$TMP/inspect-trust.json"
"$FAKE_PYTHON" - "$TMP/inspect-trust.json" <<'PY'
import json, sys
execution = json.load(open(sys.argv[1]))["execution"]
assert execution["phase"] == "prompted"
assert execution["prompted_at"]
PY

AWAITING_FAIL="$(FAKE_HERDR_BLOCK_START=1 $ROOT/bin/hanchou --profile work execution dispatch hch-trust-fail --json)"
AWAITING_FAIL_AGENT="$(printf '%s' "$AWAITING_FAIL" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["agent_name"])')"
"$FAKE_PYTHON" - "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$AWAITING_FAIL_AGENT" <<'PY'
import json, sys
bd_path, herdr_path, agent_name = sys.argv[1:]
bd_state = json.load(open(bd_path))
bd_state["beads"]["hch-trust-fail"]["status"] = "blocked"
open(bd_path, "w").write(json.dumps(bd_state))
herdr = json.load(open(herdr_path))
herdr["agents"][agent_name]["agent_status"] = "idle"
herdr["agents"][agent_name]["state_change_seq"] += 1
open(herdr_path, "w").write(json.dumps(herdr))
PY
FAKE_HERDR_FAIL_PROMPT=1 $ROOT/bin/hanchou --profile work execution reconcile hch-trust-fail --json > "$TMP/reconcile-trust-fail.json"
"$FAKE_PYTHON" - "$TMP/reconcile-trust-fail.json" "$FAKE_BD_STATE" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
bead = json.load(open(sys.argv[2]))["beads"]["hch-trust-fail"]
assert row["phase"] == "attention_required"
assert "awaiting-ready-prompt-failed" in row["actions"]
assert any("redacted task prompt failed" in item for item in row["anomalies"])
assert bead["status"] == "blocked"
assert "SENTINEL-HANCHOU-READY-SECRET-8b319e" not in json.dumps(row)
PY
$ROOT/bin/hanchou --profile work execution inspect hch-trust-fail --json > "$TMP/inspect-trust-fail.json"
"$FAKE_PYTHON" - "$TMP/inspect-trust-fail.json" <<'PY'
import json, sys
execution = json.load(open(sys.argv[1]))["execution"]
assert execution["phase"] == "attention_required"
assert execution["failed_phase"] == "prompting"
assert "<redacted-prompt>" in execution["error"]
assert "<command output redacted>" in execution["error"]
assert "SENTINEL-HANCHOU-READY-SECRET-8b319e" not in json.dumps(execution)
PY

$ROOT/bin/hanchou --profile work execution dispatch hch-conflict --json > "$TMP/dispatch-conflict.json"
"$FAKE_PYTHON" - "$FAKE_BD_STATE" <<'PY'
import json, sys
path = sys.argv[1]
state = json.load(open(path))
state["beads"]["hch-conflict"]["metadata"]["owner_agent"] = "other-orchestrator"
state["beads"]["hch-conflict"]["metadata"]["automation"] = {"external": "preserve"}
state["updates_before_conflict_reconcile"] = len(state["metadata_updates"])
open(path, "w").write(json.dumps(state))
PY
$ROOT/bin/hanchou --profile work execution reconcile hch-conflict --json > "$TMP/reconcile-conflict.json"
"$FAKE_PYTHON" - "$TMP/reconcile-conflict.json" "$FAKE_BD_STATE" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
state = json.load(open(sys.argv[2]))
bead = state["beads"]["hch-conflict"]
assert row["phase"] == "attention_required"
assert not row["actions"]
assert any("execution identity changed in: owner_agent" in item for item in row["anomalies"])
assert bead["metadata"]["owner_agent"] == "other-orchestrator"
assert bead["metadata"]["automation"] == {"external": "preserve"}
assert len(state["metadata_updates"]) == state["updates_before_conflict_reconcile"]
PY

SUCCESS_EXECUTION_ID="$(printf '%s' "$SUCCESS" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["execution_id"])')"
SUCCESS_AGENT="$(printf '%s' "$SUCCESS" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["agent_name"])')"
SUCCESS_WORKTREE="$(printf '%s' "$SUCCESS" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["worktree_path"])')"
SUCCESS_REPORT="$("$FAKE_PYTHON" - "$TMP/inspect-ok.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["execution"]["report_path"])
PY
)"
printf 'execution-bound artifact\n' > "$SUCCESS_WORKTREE/result.txt"
git -C "$SUCCESS_WORKTREE" add result.txt
git -C "$SUCCESS_WORKTREE" commit -qm "Add execution-bound artifact"
SUCCESS_COMMIT="$(git -C "$SUCCESS_WORKTREE" rev-parse HEAD)"
mkdir -p "$(dirname "$SUCCESS_REPORT")"
printf '# Execution report\n\nVerification passed.\n' > "$SUCCESS_REPORT"

UNRELATED_EVENT="$($ROOT/bin/hanchou --profile work relay emit \
    --type completed --task hch-ok \
    --execution exe_unrelated \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary unrelated --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
UNRELATED_EVENT_ID="$(printf '%s' "$UNRELATED_EVENT" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"
$ROOT/bin/hanchou --profile work inbox claim --to orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work inbox ack "$UNRELATED_EVENT_ID" --by orchestrator --json >/dev/null
WRONG_ROUTE_EVENT="$($ROOT/bin/hanchou --profile work relay emit \
    --type completed --task hch-ok \
    --execution "$SUCCESS_EXECUTION_ID" \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent other-orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary wrong-route --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
WRONG_ROUTE_EVENT_ID="$(printf '%s' "$WRONG_ROUTE_EVENT" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"
$ROOT/bin/hanchou --profile work inbox claim --to other-orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work inbox ack "$WRONG_ROUTE_EVENT_ID" --by other-orchestrator --json >/dev/null
STALE_DELIVERY="$($ROOT/bin/hanchou --profile work delivery create \
    --kind task_terminal --task hch-ok --source-event "$UNRELATED_EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary stale --json)"
STALE_DELIVERY_ID="$(printf '%s' "$STALE_DELIVERY" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["delivery_id"])')"
$ROOT/bin/hanchou --profile work delivery mark-delivered "$STALE_DELIVERY_ID" --adapter local-session >/dev/null
bd --actor orchestrator update hch-ok --status closed --json >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-ok --json > "$TMP/reconcile-unrelated.json"
"$FAKE_PYTHON" - "$TMP/reconcile-unrelated.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert not row["actions"]
assert row["terminal_events"] == 2 and row["bound_terminal_events"] == 0
assert any("none match this execution binding" in item for item in row["anomalies"])
assert any("no valid acknowledged terminal" in item for item in row["anomalies"])
PY

EVENT="$($ROOT/bin/hanchou --profile work relay emit \
    --type completed --task hch-ok \
    --execution "$SUCCESS_EXECUTION_ID" \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary complete --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
EVENT_ID="$(printf '%s' "$EVENT" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"
$ROOT/bin/hanchou --profile work execution reconcile hch-ok --json > "$TMP/reconcile-unacknowledged.json"
"$FAKE_PYTHON" - "$TMP/reconcile-unacknowledged.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert row["bound_terminal_events"] == 1
assert any("no valid acknowledged terminal" in item for item in row["anomalies"])
PY
$ROOT/bin/hanchou --profile work inbox claim --to orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work inbox ack "$EVENT_ID" --by orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-ok --json > "$TMP/reconcile-before-delivery.json"
"$FAKE_PYTHON" - "$TMP/reconcile-before-delivery.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert not row["actions"]
assert any("no Delivery for its terminal event" in item for item in row["anomalies"])
PY
DELIVERY="$($ROOT/bin/hanchou --profile work delivery create \
    --kind task_terminal --task hch-ok --source-event "$EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary complete --json)"
DELIVERY_ID="$(printf '%s' "$DELIVERY" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["delivery_id"])')"
$ROOT/bin/hanchou --profile work delivery mark-delivered "$DELIVERY_ID" --adapter local-session >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-ok --json > "$TMP/reconcile-ok.json"
"$FAKE_PYTHON" - "$TMP/reconcile-ok.json" "$FAKE_BD_STATE" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
bead = json.load(open(sys.argv[2]))["beads"]["hch-ok"]
assert row["phase"] == "settled" and row["binding_state"] == "settled"
assert row["actions"] == ["binding-settled"]
assert not row["anomalies"]
assert row["terminal_events"] == 3 and row["bound_terminal_events"] == 1
assert bead["status"] == "closed"
assert bead["metadata"]["herdr"]["binding_state"] == "settled"
PY

DELIVERY_BAD="$($ROOT/bin/hanchou --profile work execution dispatch hch-delivery-bad --json)"
DELIVERY_BAD_EXECUTION_ID="$(printf '%s' "$DELIVERY_BAD" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["execution_id"])')"
DELIVERY_BAD_AGENT="$(printf '%s' "$DELIVERY_BAD" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["agent_name"])')"
DELIVERY_BAD_WORKTREE="$(printf '%s' "$DELIVERY_BAD" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["worktree_path"])')"
$ROOT/bin/hanchou --profile work execution inspect hch-delivery-bad --json > "$TMP/inspect-delivery-bad.json"
DELIVERY_BAD_REPORT="$("$FAKE_PYTHON" - "$TMP/inspect-delivery-bad.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["execution"]["report_path"])
PY
)"
printf 'delivery contract artifact\n' > "$DELIVERY_BAD_WORKTREE/result.txt"
git -C "$DELIVERY_BAD_WORKTREE" add result.txt
git -C "$DELIVERY_BAD_WORKTREE" commit -qm "Add Delivery contract artifact"
DELIVERY_BAD_COMMIT="$(git -C "$DELIVERY_BAD_WORKTREE" rev-parse HEAD)"
mkdir -p "$(dirname "$DELIVERY_BAD_REPORT")"
printf '# Delivery contract report\n' > "$DELIVERY_BAD_REPORT"
DELIVERY_BAD_EVENT="$($ROOT/bin/hanchou --profile work relay emit \
    --type completed --task hch-delivery-bad \
    --execution "$DELIVERY_BAD_EXECUTION_ID" \
    --from-agent "$DELIVERY_BAD_AGENT" --from-role implementer \
    --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
    --summary complete --detail-ref "$DELIVERY_BAD_REPORT" \
    --artifact "commit:$DELIVERY_BAD_COMMIT" --verification tests-pass --no-nudge --json)"
DELIVERY_BAD_EVENT_ID="$(printf '%s' "$DELIVERY_BAD_EVENT" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"
$ROOT/bin/hanchou --profile work inbox claim --to orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work inbox ack "$DELIVERY_BAD_EVENT_ID" --by orchestrator --json >/dev/null
bd --actor orchestrator update hch-delivery-bad --status closed --json >/dev/null
BAD_CONTRACT_DELIVERY="$($ROOT/bin/hanchou --profile work delivery create \
    --kind manual --task hch-delivery-bad --source-event "$DELIVERY_BAD_EVENT_ID" \
    --policy on_terminal --renderer editor \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary wrong-contract --json)"
BAD_CONTRACT_DELIVERY_ID="$(printf '%s' "$BAD_CONTRACT_DELIVERY" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["delivery_id"])')"
$ROOT/bin/hanchou --profile work delivery mark-delivered "$BAD_CONTRACT_DELIVERY_ID" --adapter local-session >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-delivery-bad --json > "$TMP/reconcile-delivery-contract.json"
"$FAKE_PYTHON" - "$TMP/reconcile-delivery-contract.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert any("no contract-matching delivered Delivery" in item for item in row["anomalies"])
PY
GOOD_DUPLICATE_DELIVERY="$($ROOT/bin/hanchou --profile work delivery create \
    --kind task_terminal --task hch-delivery-bad --source-event "$DELIVERY_BAD_EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary duplicate --json)"
GOOD_DUPLICATE_DELIVERY_ID="$(printf '%s' "$GOOD_DUPLICATE_DELIVERY" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["delivery_id"])')"
$ROOT/bin/hanchou --profile work delivery mark-delivered "$GOOD_DUPLICATE_DELIVERY_ID" --adapter local-session >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-delivery-bad --json > "$TMP/reconcile-delivery-duplicate.json"
"$FAKE_PYTHON" - "$TMP/reconcile-delivery-duplicate.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert any("multiple Delivery records" in item for item in row["anomalies"])
PY

EVIDENCE="$($ROOT/bin/hanchou --profile work execution dispatch hch-evidence --json)"
EVIDENCE_EXECUTION_ID="$(printf '%s' "$EVIDENCE" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["execution_id"])')"
EVIDENCE_AGENT="$(printf '%s' "$EVIDENCE" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["agent_name"])')"
EVIDENCE_WORKTREE="$(printf '%s' "$EVIDENCE" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["worktree_path"])')"
printf 'unreported artifact\n' > "$EVIDENCE_WORKTREE/result.txt"
git -C "$EVIDENCE_WORKTREE" add result.txt
git -C "$EVIDENCE_WORKTREE" commit -qm "Add unreported artifact"
EVIDENCE_STALE_COMMIT="$(git -C "$EVIDENCE_WORKTREE" rev-parse HEAD^)"
INVALID_EVENT="$($ROOT/bin/hanchou --profile work relay emit \
    --type completed --task hch-evidence \
    --execution "$EVIDENCE_EXECUTION_ID" \
    --from-agent "$EVIDENCE_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary invalid-evidence \
    --detail-ref "$TMP/wrong-report.md" --artifact "commit:$EVIDENCE_STALE_COMMIT" \
    --no-nudge --json)"
INVALID_EVENT_ID="$(printf '%s' "$INVALID_EVENT" | "$FAKE_PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"
$ROOT/bin/hanchou --profile work inbox claim --to orchestrator --json >/dev/null
$ROOT/bin/hanchou --profile work inbox ack "$INVALID_EVENT_ID" --by orchestrator --json >/dev/null
bd --actor orchestrator update hch-evidence --status closed --json >/dev/null
$ROOT/bin/hanchou --profile work execution reconcile hch-evidence --json > "$TMP/reconcile-evidence.json"
"$FAKE_PYTHON" - "$TMP/reconcile-evidence.json" <<'PY'
import json, sys
row = json.load(open(sys.argv[1]))
assert row["phase"] == "prompted" and row["binding_state"] == "live"
assert not row["actions"]
assert row["terminal_events"] == 1 and row["bound_terminal_events"] == 1
joined = "\n".join(row["anomalies"])
assert "detail_ref does not match" in joined
assert "execution report does not exist" in joined
assert "no valid verification evidence" in joined
assert "commit artifact does not match worktree HEAD" in joined
assert "no valid acknowledged terminal" in joined
PY

$ROOT/bin/hanchou --profile work usage set codex --weekly-remaining 5 --source manual --json >/dev/null
$ROOT/bin/hanchou --profile work usage set claude --weekly-remaining 90 --source manual --json >/dev/null
$ROOT/bin/hanchou --profile work execution dispatch hch-claude --json > "$TMP/dispatch-claude.json"
$ROOT/bin/hanchou --profile work execution inspect hch-claude --json > "$TMP/inspect-claude.json"
"$FAKE_PYTHON" - "$TMP/inspect-claude.json" "$FAKE_HERDR_STATE" <<'PY'
import json, sys
from pathlib import Path
inspect = json.load(open(sys.argv[1]))
herdr = json.load(open(sys.argv[2]))
assert inspect["task_metadata"]["routing"]["provider"] == "claude"
assert inspect["task_metadata"]["routing"]["model"] == "sonnet"
start = next(row for row in herdr["starts"] if row[row.index("--kind") + 1] == "claude")
assert start[start.index("--kind") + 1] == "claude"
assert start[start.index("--permission-mode") + 1] == "auto"
assert start[start.index("--tools") + 1] == "Read,Edit,Write,Grep,Glob,Bash,Skill"
add_dirs = [start[index + 1] for index, value in enumerate(start) if value == "--add-dir"]
assert set(add_dirs) == {
    str(Path(inspect["execution"]["report_path"]).parent),
    str((Path.home() / ".local/share/hanchou/work/relay").resolve()),
}
assert len(add_dirs) == 2
PY

$ROOT/bin/hanchou --profile work execution dispatch hch-reviewer --json >/dev/null
$ROOT/bin/hanchou --profile work execution dispatch hch-researcher --json >/dev/null
$ROOT/bin/hanchou --profile work execution inspect hch-reviewer --json > "$TMP/inspect-reviewer.json"
$ROOT/bin/hanchou --profile work execution inspect hch-researcher --json > "$TMP/inspect-researcher.json"
"$FAKE_PYTHON" - "$TMP/inspect-reviewer.json" "$TMP/inspect-researcher.json" "$FAKE_HERDR_STATE" <<'PY'
import json, sys
reviewer = json.load(open(sys.argv[1]))
researcher = json.load(open(sys.argv[2]))
herdr = json.load(open(sys.argv[3]))
for inspect, expected_tools in (
    (reviewer, "Read,Write,Grep,Glob,Bash,Skill"),
    (researcher, "Read,Write,Grep,Glob,Bash,WebSearch,WebFetch,Skill"),
):
    assert inspect["task_metadata"]["routing"]["provider"] == "claude"
    agent_name = inspect["execution"]["agent_name"]
    start = next(row for row in herdr["starts"] if row[2] == agent_name)
    assert start[start.index("--permission-mode") + 1] == "auto"
    assert start[start.index("--tools") + 1] == expected_tools
    prompt = next(row["prompt"] for row in herdr["prompts"] if row["agent"] == agent_name)
    assert "Do not modify the project worktree" in prompt
    assert "current worktree HEAD" in prompt and "do not create an empty commit" in prompt
PY

"$FAKE_PYTHON" - "$ROOT" "$TMP/home/.local/share/hanchou/work/reports/disabled/report.md" <<'PY'
import importlib.util, sys
from pathlib import Path
root, report = Path(sys.argv[1]), Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("hanchou_cli_for_test", root / "libexec/hanchou.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
_, profile = module.load_profile("work")
try:
    module.worker_agent_argv(
        "work",
        profile,
        "disabled_writer",
        "w99:p1",
        {"provider": "claude", "model": "sonnet"},
        "writer",
        report,
    )
except module.CommandError as exc:
    assert str(exc) == "Claude execution is disabled for role: writer"
else:
    raise AssertionError("expected writer Claude execution to be rejected")
PY

if FAKE_HERDR_FAIL_PROMPT=1 $ROOT/bin/hanchou --profile work execution dispatch hch-secret --json >"$TMP/secret.out" 2>"$TMP/secret.err"; then
    echo "expected failed worker prompt" >&2
    exit 1
fi
if grep -q 'SENTINEL-HANCHOU-PROMPT-SECRET-4c221d' "$TMP/secret.err"; then
    echo "worker prompt leaked through dispatch stderr" >&2
    exit 1
fi
grep -q '<redacted-prompt>' "$TMP/secret.err"
grep -q '<command output redacted>' "$TMP/secret.err"
$ROOT/bin/hanchou --profile work execution inspect hch-secret --json > "$TMP/inspect-secret.json"
"$FAKE_PYTHON" - "$TMP/inspect-secret.json" <<'PY'
import json, sys
inspect = json.load(open(sys.argv[1]))
execution = inspect["execution"]
assert execution["phase"] == "attention_required"
assert "SENTINEL-HANCHOU-PROMPT-SECRET-4c221d" not in json.dumps(execution)
assert "<redacted-prompt>" in execution["error"]
assert "<command output redacted>" in execution["error"]
PY

if FAKE_HERDR_FAIL_START=1 $ROOT/bin/hanchou --profile work execution dispatch hch-fail --json >"$TMP/fail.out" 2>"$TMP/fail.err"; then
    echo "expected failed agent start" >&2
    exit 1
fi
grep -q 'execution dispatch failed after workspace_created' "$TMP/fail.err"

$ROOT/bin/hanchou --profile work execution inspect hch-fail --json > "$TMP/inspect-fail.json"
$ROOT/bin/hanchou --profile work execution reconcile hch-fail --json > "$TMP/reconcile-fail.json"
"$FAKE_PYTHON" - "$TMP/inspect-fail.json" "$TMP/reconcile-fail.json" "$FAKE_BD_STATE" <<'PY'
import json, sys
inspect = json.load(open(sys.argv[1]))
reconciled = json.load(open(sys.argv[2]))
beads = json.load(open(sys.argv[3]))["beads"]
assert inspect["execution"]["phase"] == "attention_required"
assert inspect["task_metadata"]["herdr"]["binding_state"] == "lost"
assert beads["hch-fail"]["status"] == "blocked"
assert reconciled["binding_state"] == "lost"
assert reconciled["phase"] == "attention_required"
assert reconciled["anomalies"]
PY

echo "execution bridge fake E2E ok"
