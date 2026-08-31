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
| Human-owned workspace authorization | `hanchou onboard` |
| Profile setup, service launch, health, status UI | `hanchou` |
| Human-owned project authorization inspection | `hanchou project` |
| Usage snapshot and provider routing | `hanchou usage` / `hanchou route` |
| Relay Inbox, retry, acknowledgement | `hanchou relay` / `hanchou inbox` |
| User-facing report lifecycle | `hanchou delivery` |
| Beads↔Herdr WAL-backed dispatch/reconcile | `hanchou execution` |
| Existing-Orchestrator schedule and reporting contract | planned `hanchou schedule` |

Do not invent a Hanchou wrapper when one upstream system already owns the
operation. Use `--json` whenever a supported command is consumed by an agent or
script, and parse returned IDs instead of deriving them from names or UI order.

## Human-owned onboarding boundary

`hanchou onboard <profile>` is a read-only plan. Only a human in an interactive
terminal outside Herdr may run `hanchou onboard <profile> --yes`, because that
command creates the dedicated workspace and expands the machine-local project
authorization registry. Managed Agents must never run it, edit that registry,
or reproduce the authorization change with filesystem commands.

## Codex sandbox boundary

Local Herdr socket access can be denied by the Codex workspace sandbox with
`Operation not permitted`. For a bounded Hanchou/Herdr control-plane command,
retry the exact command through normal Codex approval/escalation when this
happens. Do not add dangerous approval or sandbox-bypass flags, broaden the
command, or broaden its target.

## Implemented Hanchou surfaces

```text
onboard / plan / bootstrap / apply / launch / status / doctor
start-orchestrator / dashboard serve / dashboard snapshot / open
render-agents / handoff
project list / project show / project resolve / project doctor
usage set / usage show
route resolve
relay emit / relay recover / relay dispatch
inbox list / claim / show / ack / retry / dead-letter
delivery create / list / show / mark-rendered / mark-delivered / fail / retry
execution dispatch / inspect / reconcile
```

## Service lifecycle

Run `hanchou bootstrap <profile>` after the first clone and again after updating
Hanchou when managed integrations or LaunchAgents may have changed. `launch`
does not install missing services; it verifies the existing Herdr, beads-ui, and
Dashboard services, initializes the Orchestrator, and opens the Dashboard.
Direct `start-orchestrator`, `open herdr`, and `open orchestrator` commands also
require an operational pinned Herdr session before they act.

Treat Herdr as ready only when Hanchou's pinned-version Ping and read-only
control-plane probe both succeed. Herdr 0.8.2 continues answering Ping while it
is shutting down. Never interpret a transient `server_unavailable` or shutdown
response as an absent Agent, and do not create a replacement workspace in that
state. Wait for bootstrap/reload to settle and retry the bounded Hanchou command.

`execution dispatch` accepts only a ready Leaf Bead with no existing execution
owner. It first revalidates the Bead's project identity and canonical repository
against the human-owned machine-local deny-by-default registry. Managed Agents
must never edit or broaden that registry. It then pins the validated repository
`HEAD`, claims the Bead, and merges only
the execution-owned metadata fields. If Codex first-run trust leaves the Agent
blocked, dispatch returns `awaiting_ready`; after the user accepts trust and the
Agent becomes idle/done, run `execution reconcile <id>` to deliver the prompt
once. Reconciliation settles only from valid acknowledged execution-bound
Relay evidence, never from terminal Agent state alone.

## Planned surfaces

`hanchou execution cancel` and the typed `hanchou schedule` wrapper remain
design contracts. Check `hanchou --help` before use. Until then:

- operate the Beads graph with `bd`;
- operate Herdr sessions with `herdr`;
- operate standard scheduled fresh-agent jobs with `herdr-automations`;
- do not emulate an `existing-orchestrator` schedule with ad-hoc terminal input.

## Why the CLI exists

Skills express policy but cannot guarantee atomic file operations,
command-level contract validation, deduplication, leases, retry state, exit
codes, or cross-provider behavior. The CLI owns those mechanical guarantees so
Claude Code, Codex, humans, plugins and scripts share one tested contract.
