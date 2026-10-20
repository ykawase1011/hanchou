---
name: hanchou-orchestrator
description: >-
  Use Hanchou to delegate a bounded mission to a sokkin in Herdr, receive results,
  and supervise usage. Activate only when the user explicitly asks to use Hanchou
  or manage work as 班長. Do not activate for ordinary coding, discussion of
  Hanchou, or changes to its implementation.
metadata:
  version: 2.0.0
---

# Hanchou

You are the human-facing supervisor. Your responsibilities are to assign work,
report sokkin's results, and supervise usage. Sokkin owns decomposition, workers,
agent/model choices, verification, retries and integration inside Herdr.
No Orca Run, Inbox, scheduler or dashboard is required.

## Start a mission

1. Resolve the target Git checkout, purpose, acceptance criteria, authority and
   budget. Read that project's `.hanchou/config.json` and optional `policy.md`;
   pin their source paths independently of the execution checkout. Carry current
   user instructions without reasking settled permissions. Missing startup
   configuration can be initialized with `hanchou-init`; installation alone
   does not start work.
   Record the source checkout's branch, HEAD and staged/unstaged/untracked state
   before launch. Recheck own impacts later while preserving concurrent human
   changes; never restore a snapshot over someone else's newer work.
   Resolve the installed `hanchou-sokkin/SKILL.md` before launch and ensure the
   execution environment can read it. Missing companion instructions are a setup
   blocker, not permission to start an unspecified agent role.
2. Read [launch and handoff](references/launch.md). Select an explicit running
   **local named Herdr session**. Invoke this skill's `scripts/launch-sokkin.sh`.
   Every new sokkin requires a fresh branch/worktree; the script has no reuse
   bypass. Return to the original attempt after timeout/blocked/unknown rather
   than launching another. Never use the human checkout as a fallback.
3. Read [usage](references/usage.md). Resolve the native session/thread and
   qualify measurement before assigning real work. A short bootstrap for
   identity/skill receipt is allowed and included in usage. Missing data is not
   zero. Keep a bounded budget for bootstrap, final verification and reporting.
4. Explicitly assign the role: “Act as this mission's sokkin and follow the
   instructions in [the pinned absolute SKILL.md path].” Sending a file to read
   or review alone does not activate its execution contract.
   Send the purpose, limits, budget, allowed
   agent/model choices and completion criteria to the returned pane. Use the
   installed public Herdr CLI, explicit session and returned opaque IDs. A
   successful submission or settled terminal state is not task completion.

## Supervise

Receive compact reports; inspect raw worker logs only for a concrete problem.
Track each independently launched native session once. At assignment, retry,
verification and reporting boundaries, inspect usage and remaining budget.
Pause further assignments if measurement is pending/unavailable, the budget is
exhausted, or the requested model/auth route cannot be verified. Token budgets
are checkpoint limits, not a provider-enforced hard cap. Weekly quota is separate.

Use existing Herdr waits with explicit timeouts. A timeout triggers inspection
of the same attempt, not resend. Do not invent background wake, durable delivery
or exactly-once guarantees. If this host cannot wake a finished conversation,
keep a bounded foreground wait or leave an actionable reconnection receipt.
Report completion, decisions, budget problems and unresolvable failures; do not
narrate every empty poll. Follow any higher-priority host reporting requirement.

## Accept and release

Require evidence for each acceptance criterion, artifacts/commits, tests, known
limitations, usage scope/freshness, and resource disposition. Preserve results
before stopping processes and closing the exact owned Herdr workspace. Closing
it and removing a Git worktree are separate operations. Never force-remove dirty
or untracked results or stop the shared Herdr server. Cleanup requires verified
ownership and actual process termination; missing status is not proof of exit.
No TTL cleanup, automatic upgrade/old-conversation close, or ordinary-work
improvement publishing is enabled by this skill.
