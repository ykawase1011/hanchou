# Architecture

## Product boundary

```text
Orca runtime
├─ ordinary Orca sessions × N
├─ Project Hanchou panes × N
├─ Cross-project Hanchou panes × N
└─ Temporary Hanchou panes × N

one Hanchou pane
└─ one Codex or Claude coordinator session
   ├─ hanchou-orchestrator policy
   └─ one bound Orca Orchestration Run
      ├─ Tasks / DAG / gates
      ├─ Dispatches / workers
      └─ Run Inbox / Delivery
```

Orca owns runtime mechanics and state. Hanchou owns only judgment policy:
decomposition, routing, review, reporting, and when to ask the user.

The distribution contains one orchestrator and five optional instruction-only
helpers: `hanchou-kaizen`, `hanchou-publish-issues`, `hanchou-update`, and
`hanchou-cron`, and `hanchou-init`. Configuration-only helper calls do not create a
Run or activate the orchestrator. Private ignored improvement notes and compact
publication receipts are user documents, not a Hanchou database or control plane.
Scoped updates delegate installation to the official skill installer. New
installations default to global Codex/Claude Code coverage; local installs remain
available and updates preserve their scope.
`hanchou-cron` uses the installed Orca Automation contract for scheduling and
keeps project job definitions as static documents. It adds no scheduler or
shared registry. A requested manual trial can start the selected job.
The optional project responsibility source is a static local document, usually
`.hanchou/policy.md` at the exact target root. The coordinator reads it at
intake and snapshots effective limits into Task briefs. An Automation may pin
it separately from its job definition, reading both once per occurrence;
neither document creates work or broadens the registered job scope by itself.

## Optional read-only presentation

The [explicit B decision](https://github.com/ykawase1011/hanchou/issues/37#issuecomment-6162521218)
permits an opt-in self-contained local HTML/CSS/JS status snapshot,
using the orchestrator asset and [status-view reference](../skills/hanchou-orchestrator/references/status-view.md).
This is the sole static-presentation exception to the production-code/dashboard
prohibition, not a runtime, authoritative DB/cache, exporter service or control UI.
Orca and GitHub remain authoritative; the embedded snapshot is disposable and must
contain no unique original instruction or accepted result. One verified writer
owns a checked private destination; input revisions and existing bytes are checked
before atomic replacement. Other Runs remain separately owned. Natural meaningful
checkpoints may refresh an opted-in view; no scheduler, no-op rewrites or post-turn
update guarantee is added. Cron stops remain effective.

## Multiplicity and ownership

Orca is normally one runtime per OS user/userData profile. Hanchou has no fixed
count or fixed work/personal mapping. A separate pane may start a separate
Hanchou, including multiple Hanchou sessions in one project.

Each coordinator pane binds one current Run. Each Run has one active coordinator
owner, and every Task has one owner Run. Multiple Runs may target the same
repository, so the coordinator checks active worktree/agent state before
dispatch. Usually a project uses one familiar Hanchou entrypoint; a separate
purpose, authority, or completion condition may justify another. All requests
in one Hanchou conversation remain in its Run. Hanchou adds no shared registry
or lock server.

## Dependencies

Core official skills are `orca-cli` and `orchestration`. Optional official
skills are loaded only when needed:

- `computer-use`: Orca UI or another desktop application;
- `orca-per-workspace-env`: VM/cloud/disposable workspace recipes;
- `orca-linear`: Linear work; the compatibility alias is not used in new design;
- `orca-emulator` and `orca-emulator-android`: device workflows.

No official skill is vendored, copied, forked, or reimplemented.

## Event and recovery model

The normal supervised flow is Task creation, worker start, then complete Inbox
processing through the installed guide's loop. Native idle delivery is usable
only when advertised or qualified for that release. Otherwise continue official
bounded waits while expected Dispatches remain; a timeout is a checkpoint.
Hanchou provides no background watcher or guarantee of work after a turn ends.

At a qualified restoration of the original interactive conversation after
restart, inspect its original Run, owned Tasks, workers, CI waits, and authority
before continuing. Missing status is not proof that work stopped. Do not take
another Run's work because it shares a project. The original conversation's
periodic wake remains unqualified; Automation session reuse does not satisfy
it. Replacement or takeover when that conversation is unrestorable is outside
this continuation design. Private SQLite/RPC access is prohibited.
