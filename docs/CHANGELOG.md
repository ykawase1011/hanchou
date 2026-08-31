# Changelog

## Unreleased

- rewrote the Core CLI, execution bridge, Relay/Delivery mechanics, validators,
  and generators in TypeScript;
- made Node.js 22 the only Hanchou implementation runtime and removed Python;
- added strict TypeScript typechecking while retaining zero runtime npm
  dependencies.
- added a human-owned, machine-local, deny-by-default project registry with
  exact-repository and opt-in workspace-root authorization, read-only Agent
  inspection commands, canonical path checks, single-snapshot registry reads,
  sanitized Node/Git execution, and pre-dispatch/reconcile enforcement;
- preserved Herdr/Beads/Relay identity in managed Codex shell tools with
  per-run environment policy overrides, including explicit L0 and worker Agent
  identity;
- added least-privilege project-local Codex rules for routine Inbox handling;
- hardened Relay and Delivery identifiers, record loading, transition locking,
  lease ownership/expiry, retry cleanup, crash-repairable terminal receipts,
  versioned/legacy-compatible journal validation, durable and attempt-aware
  render/failure/retry recovery, exactly-once Inbox retry/lease-recovery counts,
  sender identity binding, and target-specific wake instructions;
- aligned managed Agent environment injection with Herdr 0.8.2's supported
  workspace/tab-create contracts and made the fake bridge reject unknown
  options;
- made managed Codex command networking fail closed through an explicit proxy,
  empty external-domain policy, and exact Herdr Unix-socket allowlist.
- made Orchestrator startup profile-serialized and crash-safe with a durable
  exact workspace/tab/pane/terminal binding, same-pane retry/restart, strict
  legacy migration checks, duplicate detection, and no automatic workspace
  deletion;
- added `stop-orchestrator` with a read-only, exact-target plan and a
  snapshot-bound 64-character lowercase-hex token required by the exact
  ordinary-terminal `--all --plan <64hex-token> --yes` apply; target-state drift and
  partial closure require a new plan/token, the plan exposes process identity
  and binds the profile digest/resolved state paths, and unowned legacy shells
  require zero additional processes observed by the best-effort same-TTY plus
  shell-descendant scan while Agent-occupied rows report that scan as `n/a`;
  documented that Darwin cannot fully enumerate the same
  OS process session and that Herdr 0.8.2 has a final-revalidate-to-close TOCTOU
  window; apply is human approval to terminate the complete workspace process
  session, surrounding Hanchou subsystems are preserved, and lifecycle state is
  cleared only after complete closure; the TTY/Agent/token checks are
  defense-in-depth, not a complete same-user security boundary;
- added the explicit `--include-unmanaged` plan mode for a human-approved
  cleanup of unbound, no-Agent-record legacy panes whose activity is not proven
  idle; the mode reports `UNMANAGED-ACTIVE` reasons and whole-session effects,
  remains constrained by label/Core-base-cwd/topology/worktree/ID/binding/Agent
  containment, rejects malformed Herdr `pane process-info` even when the later
  OS process-table scan is unavailable, reports every foreground process cwd,
  is bound into the exact plan token and retry command, and never becomes an
  automatic `launch`/`start-orchestrator` fallback;
- changed `open orchestrator` from single-owner direct attach to a focused full
  Herdr client, and documented Herdrm/direct-attach ownership and recovery.

## v2.3.1 final design

- renamed Mailbox subsystem to Hanchou Relay;
- separated internal Inbox from user-facing Delivery;
- added reporting policies and daily digest contract;
- defined later-turn completion response without holding L0 busy;
- added Codex-only Editor role;
- made hanchou-skills the canonical Public Skill repository;
- retained hanchou-kingdom as work/personal secret-free deployment config;
- deferred hanchou-chat selection until Core E2E;
- added Relay and Delivery CLI/schema/test scaffolds;
- defined the thin CLI boundary and added the shared `hanchou-cli` Skill;
- added canonical `hanchou route resolve` while retaining the old recommendation path as an alias.
