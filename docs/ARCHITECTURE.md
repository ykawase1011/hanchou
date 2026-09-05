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

## Multiplicity and ownership

Orca is normally one runtime per OS user/userData profile. Hanchou has no fixed
count or fixed work/personal mapping. A separate pane may start a separate
Hanchou, including multiple Hanchou sessions in one project.

Each coordinator pane binds one current Run. Each Run has one active coordinator
owner, and every Task has one owner Run. Multiple Runs may target the same
repository, so the coordinator checks active worktree/agent state before
dispatch. Hanchou adds no shared registry or lock server.

## Dependencies

Core official skills are `orca-cli` and `orchestration`. Optional official
skills are loaded only when needed:

- `computer-use`: Orca UI or another desktop application;
- `orca-per-workspace-env`: VM/cloud/disposable workspace recipes;
- `orca-linear`: Linear work; the compatibility alias is not used in new design;
- `orca-emulator` and `orca-emulator-android`: device workflows.

No official skill is vendored, copied, forked, or reimplemented.

## Event and recovery model

The normal flow is Task creation, supervised worker start, end the coordinator
turn, native Orca delivery to the idle coordinator, then a new turn that handles
question/review/completion. Synchronous work uses a bounded official wait only.

After restart, use public Run/Task/message inspection and the live guide's
recovery contract. Explicit takeover is allowed only when replacing an
unavailable coordinator. Private SQLite/RPC access is prohibited.
