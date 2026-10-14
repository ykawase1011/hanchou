---
name: hanchou-orchestrator
description: >-
  Activate only when the user explicitly invokes hanchou-orchestrator, asks to
  start or use Hanchou, asks to manage work as Hanchou/班長, a dedicated Hanchou
  workspace instruction explicitly selects this skill, or this same session is
  already activated as Hanchou. Do not activate for ordinary Orca use, generic
  coding, a request that merely asks for another agent, or a request only to
  record, inspect, implement, publish, or update Hanchou improvements through
  an optional helper skill.
---

# Hanchou Orchestrator

Hanchou is an optional policy layer running inside an Orca coordinator session.
It is not a runtime or control plane.

## Activation gate

Proceed only when one of the description's explicit activation conditions is
true. At first activation, state the Hanchou kind and scope if supplied, then
keep that activation for this session. Never infer activation from installation
alone. Prefer a named user invocation (`$hanchou-orchestrator` in Codex or
`/hanchou-orchestrator` in Claude Code) in onboarding and reusable prompts;
natural-language activation remains supported.

Read [role.md](references/role.md), [routing.md](references/routing.md),
[task-design.md](references/task-design.md), and
[reporting.md](references/reporting.md). Read
[project-policy.md](references/project-policy.md) for the target project's
optional responsibility policy. Read the other references when their
topic applies.

## Mandatory startup

Before any Orca mutation:

1. Resolve the actual Orca executable once using the official `orca-cli`
   discovery rule: `ORCA_CLI_COMMAND`, then dev `orca-dev`, Linux
   `orca-ide`, otherwise `orca`. Reuse exactly that executable.
2. Run `ORCA skills get orca-cli`.
3. Run `ORCA skills get orchestration --full`.
4. Read both complete outputs. Treat them as authoritative over this skill,
   cached docs, memory, and the Orca source tree.
5. Run the live guide's status check. Confirm a running Orca runtime and a
   public Orchestration contract capability (currently
   `orchestration.contract.v1`) or a successor positive availability signal
   defined by the installed guide/runtime.
6. Use the live guide's read-only current-Run inspection to verify the
   Orchestration surface and inspect this pane's binding. If the installed
   runtime explicitly reports the feature disabled or unavailable, stop and
   follow its exact Settings/update guidance. Do not require an Experimental
   toggle when the installed Orca UI no longer exposes one.
   If no Run is bound at initial activation, create one for this Hanchou
   instance. Bind an existing Run only when the user explicitly names it.
   On restoration of this same conversation, inspect its original binding and
   ownership before acting; never infer a replacement Run or takeover from a
   shared project. Replacement of an unrestorable conversation is outside the
   continuation design.

After identifying the target project and before task actions, select and read
its optional responsibility policy under [project-policy.md](references/project-policy.md).
Repeat source selection for each new separately assigned task, including tasks
in the same project; keep an active task's snapshot fixed absent an explicit
authorized scope change. For a scheduled occurrence, use only the registered
prompt's pinned policy source or its recorded no-policy decision; do not perform
this interactive default lookup. An absent interactive default file does not
block ordinary requested work.

Resolve any explicit or inherited placement preference under
[placement.md](references/placement.md) before new coordinator or worker
launches. Keep the current conversation and bound Run in place; the preference
governs future entrypoints, not an implicit migration.

`ORCA` above is a documentation placeholder. Substitute the resolved
executable; do not invoke the word `ORCA` literally or create a wrapper.

If the executable, an official skill, the runtime, or the public Orchestration
contract is unavailable, fail closed. Report the exact failure and the recovery
action returned by the installed runtime. For an older build that explicitly
reports a disabled Experimental setting, ask the user to enable it manually;
never toggle a setting on the user's behalf. For a current build with a
dedicated Orchestration settings page and no enable/disable control, do not send
the user looking for a nonexistent Experimental toggle. Do not switch
executables, inspect private databases, copy a guide from source, use a
non-Orca agent tool, or implement a fallback.

## Session invariant

Use the same bound Run for the lifetime of this Hanchou conversation. All its
user requests become Tasks inside that Run; they do not each create a Run.
At most one active coordinator owns a Run. A project may have multiple Hanchou
conversations and Runs, usually with one familiar entrypoint. Never persist Run,
Task, Dispatch, or terminal identifiers in tracked repository files or shared
config. The explicitly opted-in private status snapshot may retain minimal
non-displayed identity tuples solely for reconstructible presentation comparison;
it never establishes ownership or a second authority store.

For supervised work, follow the live `orchestration` guide and prefer its
`worker-start` path. For a user-requested full ownership transfer, use the
live `orca-cli` full-handoff path and stop monitoring. Do not mix the two.

Load [cross-project.md](references/cross-project.md) for multi-repository work,
[review.md](references/review.md) when independent acceptance is warranted, and
[automations.md](references/automations.md) for scheduled work.

Use these topic gates; do not load every reference for every request:

| When | Policy reference |
| --- | --- |
| Intake, changed authorization, or a delivery decision | [request-scope.md](references/request-scope.md) |
| Starting, reusing, or recovering a worker; IPC trouble | [worker-evidence.md](references/worker-evidence.md) |
| Dispatching worker instructions, steering, or consuming Inbox mail | [inbox.md](references/inbox.md) |
| Accepting results or removing task resources | [cleanup.md](references/cleanup.md) |
| Investigating, repairing, or reviewing a data migration | [migration-acceptance.md](references/migration-acceptance.md) |
| Browser/API QA or transient browser tool errors | [browser-qa.md](references/browser-qa.md) |
| Requested notification aggregation design | [notifications.md](references/notifications.md) |
| Explicit local status-view request or opted-in meaningful update | [status-view.md](references/status-view.md) |
| Requested continuation after a turn ends | [continuation.md](references/continuation.md) |

## Improvement notes

When an activated Hanchou session observes a reusable Hanchou improvement, record
it at a natural checkpoint without interrupting the user's task. Before reading
or writing the memo, follow [improvement-notes.md](references/improvement-notes.md)
for location checks, minimal input, stable item IDs, and concurrent edits.
Recording is local only; it never authorizes GitHub publication. On an explicit
request to publish notes, use the optional `hanchou-publish-issues` skill if
available; otherwise explain how to install it without publishing automatically.

## Optional official capabilities

Load optional Orca skills only when the task needs them, using the same resolved
executable and its live `skills get` output:

- `computer-use` only for actual Orca UI or external desktop-app interaction;
  keep Orca-managed state operations on `orca-cli` or `orchestration`;
- `orca-per-workspace-env` for VM, cloud sandbox, disposable environment, or
  `orca.yaml` environment recipes;
- `orca-linear` for Linear work; do not choose the legacy `linear-tickets` name
  for new workflows;
- `orca-emulator` or `orca-emulator-android` for matching device workflows.

If a required official optional skill is unavailable, report its official
installation action and fail closed. Do not copy, emulate, or replace it with a
Hanchou-owned runtime or adapter.
