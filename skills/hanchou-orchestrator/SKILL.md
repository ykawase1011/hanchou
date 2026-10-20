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
Clarify what must be achieved and its boundaries; leave the execution plan and
worker assignments to sokkin. Do not duplicate that planning to compensate for
a lighter model. Use the configured sokkin unless the mission explicitly selects
another model; a routine bounded task can use a lighter choice.

## Start a mission

1. Resolve the target, purpose, acceptance criteria, authority and budget.
   Read its `.hanchou/config.json` and optional `policy.md`; pin source paths
   independently of execution placement. Reuse instructions already in context,
   including this SKILL; do not reread them from disk. Carry current user
   instructions without reasking settled permissions. Do not run init/update
   again for an initialized project. Missing setup is a blocker or an explicitly
   authorized `hanchou-init` task, not a reason to expand launch preparation.
2. Read [usage](references/usage.md) for the active providers and bind the
   supervisor's own usage before further discovery. Batch independent necessary
   checks and return selected fields. Keep logs on disk; avoid full environment,
   transcript or CLI-guide dumps. Use specific subcommand help for unknown syntax.
   Reuse verified facts with their source, version, host/session and observation
   time; recheck mutable state and discrepancies, not the whole installation.
3. Read [launch and handoff](references/launch.md). Select an explicit running
   **local named Herdr session**. Invoke this skill's `scripts/launch-sokkin.sh`.
   Every new sokkin requires a fresh branch/worktree; the script has no reuse
   bypass. Return to the original attempt after timeout/blocked/unknown rather
   than launching another. Never use the human checkout as a fallback.
   Before launch, record the source branch/HEAD and staged/unstaged/untracked
   state, resolve the readable companion `hanchou-sokkin/SKILL.md`, and check
   remaining supervisor capacity for launch, bootstrap, acceptance and release.
   Missing companion instructions block launch. If capacity is insufficient,
   report before creating resources.
4. Explicitly assign the role: “Act as this mission's sokkin and follow the
   instructions in [the pinned absolute SKILL.md path].” First use one short,
   tool-free bootstrap with the supplied instructions, then bind its native ID
   and qualify usage before sending real work. Include bootstrap in the total;
   missing data is not zero. Send the purpose, limits, budget, allowed choices
   and completion criteria to the returned pane using public Herdr CLI.
   A successful submission or settled terminal state is not task completion.

## Supervise

Receive compact reports; inspect raw worker logs only for a concrete problem.
Track each independently launched native session once. Include preparation:
check supervisor usage after discovery, before launch and at assignment, retry,
verification and reporting boundaries. Combine checks with useful work instead
of spending separate LLM turns just polling counters.
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
and recheck own impacts on the source checkout without reverting concurrent edits
before stopping processes and closing the exact owned Herdr workspace. Closing
it and removing a Git worktree are separate operations. Never force-remove dirty
or untracked results or stop the shared Herdr server. Cleanup requires verified
ownership and actual process termination; missing status is not proof of exit.
No TTL cleanup, automatic upgrade/old-conversation close, or ordinary-work
improvement publishing is enabled by this skill.
