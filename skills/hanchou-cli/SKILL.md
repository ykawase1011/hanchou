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
| Human-confirmed Orchestrator shutdown | `hanchou stop-orchestrator` |
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
start-orchestrator / stop-orchestrator / dashboard serve / dashboard snapshot / open
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

On macOS, LaunchAgent registration is not proof that a service process started.
Bootstrap explicitly performs a bounded, non-destructive `kickstart -p` for
each managed service after registration and on an unchanged reapply. It never
uses `-k`, so a healthy running process is not restarted. If registration
disappears immediately before kickstart, recover that service registration once
and resume the same bounded start request.

Treat Herdr as ready only when Hanchou's pinned-version Ping and read-only
control-plane probe both succeed. Herdr 0.8.2 continues answering Ping while it
is shutting down. Never interpret a transient `server_unavailable` or shutdown
response as an absent Agent, and do not create a replacement workspace in that
state. Wait for bootstrap/reload to settle and retry the bounded Hanchou command.

Orchestrator startup is serialized per profile. Hanchou records the exact
workspace/tab/pane/terminal binding before Agent startup and reuses it after a
blocked start, failure, or `/exit`. Never delete Orchestrator workspaces from
`launch` or `start-orchestrator`. If unbound legacy `00-orchestrator` spaces are
reported, fail closed unless a live named Agent exactly matches the configured
kind, label, single-pane/no-worktree shape, Core cwd, and all opaque IDs. Only
that exact migration may be bound and kept. Open the full Herdr TUI, preserve
the live named `orchestrator`, and let the human close only verified empty rows
with `Ctrl+B` then `Shift+D`.

When the human explicitly wants every dedicated Orchestrator workspace
terminated, use `hanchou stop-orchestrator <profile> --all` only to print the
read-only plan. Review every `CLOSE` row and use only the exact apply command
printed by that plan:

```text
hanchou stop-orchestrator <profile> --all --plan <64hex-token> --yes
```

Do not construct, omit, or reuse the token. It is a 64-character lowercase-hex
hash bound to the reviewed profile/session, profile TOML digest, every resolved
profile state path, Core and config roots, lifecycle state, binding, and
workspace/pane/Agent/process identities. It is not a secret or authentication
credential. If the target snapshot changes, run the read-only plan again and
review its new exact command. After any partial close, inspect the reported
`closed`, `remaining`, and `uncertain` sets without assuming an uncertain
outcome succeeded, fix the condition, and replan. The old token is invalid for
the current set.

Only the human operator may apply the command, from an ordinary interactive
terminal outside Herdr. Managed Agents must never apply it. TTY/Agent checks,
the snapshot token, and command policy are defense-in-depth against mistakes
and routine automation, not a complete same-user security boundary. The
command preflights the complete configured-label set, requires the Core cwd,
one tab, one pane, no worktree, consistent configured-Agent identity for an
occupied target, and an available foreground shell in the Core cwd for an
unowned legacy target. For that legacy shell, the OS process table scan must
observe no additional process sharing its TTY or descending from the shell.
Treat `observed_additional=0` only as zero detected by this best-effort union,
not proof that all other processes are absent. An Agent-occupied target is not
subject to the OS shell scan and reports `observed_additional=n/a`. On Darwin,
the scan cannot fully enumerate processes in the same OS process session
outside those two relations. Review `PID:name`, `observed_additional`, and
foreground cwd on every `CLOSE` row.

Herdr 0.8.2 has no workspace close conditional on the identity/revision just
revalidated, so a process can change in the final revalidate-to-close TOCTOU
window. Apply is the human operator's approval to terminate every process in
the target workspace PTY/OS process session, including a process not displayed
by the plan. If that cannot be approved, do not apply; use the full Herdr TUI
to inspect and manually close individual workspaces. The command closes legacy
spaces before the bound space and preserves the Herdr server/session, Beads,
Relay, Dashboard, repositories, and worktrees. Lifecycle state is cleared only
after every target is verified absent.

`hanchou open orchestrator` focuses the Agent or its recorded single-pane
workspace and opens the ordinary full Herdr client; it must not use exclusive
`agent attach`. Full Herdr clients can coexist. A direct CLI attach (`agent
attach` or `terminal attach`) and a Herdrm attach to the same pane share one
writable owner, so detach the earlier direct
view with `Ctrl+B` then `q`. `Another client took this pane over` means direct
ownership moved; it does not prove that the Agent stopped.

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
