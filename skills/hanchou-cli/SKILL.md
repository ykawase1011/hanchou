---
name: hanchou-cli
description: Choose the correct Hanchou, Beads, Herdr, or herdr-automations command surface; use the thin Hanchou CLI only for Hanchou-owned state and cross-system operations.
---

# Hanchou command routing

The Hanchou CLI is a deterministic control utility, not a facade over every
upstream tool. Before running a command, identify the source of truth.

| Operation | Canonical command surface |
|---|---|
| Task, Epic, Decision, dependency, ready queue | `bd` |
| Agent, pane, workspace, worktree, liveness | `herdr` |
| Ordinary `new-agent` recurring job and history | `herdr-automations` |
| Profile setup, health, UI opening | `hanchou` |
| Usage snapshot and provider routing | `hanchou usage` / `hanchou route` |
| Relay Inbox, retry, acknowledgement | `hanchou relay` / `hanchou inbox` |
| User-facing report lifecycle | `hanchou delivery` |
| Beads↔Herdr atomic dispatch/reconcile | planned `hanchou execution` |
| Existing-Orchestrator schedule and reporting contract | planned `hanchou schedule` |

Do not invent a Hanchou wrapper when one upstream system already owns the
operation. Use `--json` whenever a supported command is consumed by an agent or
script, and parse returned IDs instead of deriving them from names or UI order.

## Codex sandbox boundary

Local Herdr socket access can be denied by the Codex workspace sandbox with
`Operation not permitted`. For a bounded Hanchou/Herdr control-plane command,
retry the exact command through normal Codex approval/escalation when this
happens. Do not add dangerous approval or sandbox-bypass flags, broaden the
command, or broaden its target.

## Implemented Hanchou surfaces

```text
plan / apply / status / doctor / start-orchestrator / open
render-agents / handoff
usage set / usage show
route resolve
relay emit / relay recover / relay dispatch
inbox list / claim / show / ack / retry / dead-letter
delivery create / list / show / mark-rendered / mark-delivered / fail / retry
```

## Planned surfaces

`hanchou execution` and the typed `hanchou schedule` wrapper are design
contracts until implemented. Check `hanchou --help` before use. Until then:

- operate the Beads graph with `bd`;
- operate Herdr sessions with `herdr`;
- operate standard scheduled fresh-agent jobs with `herdr-automations`;
- do not emulate an `existing-orchestrator` schedule with ad-hoc terminal input.

## Why the CLI exists

Skills express policy but cannot guarantee atomic writes, schema validation,
deduplication, leases, retry state, exit codes, or cross-provider behavior. The
CLI owns those mechanical guarantees so Claude Code, Codex, humans, plugins and
scripts share one tested contract.
