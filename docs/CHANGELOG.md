# Changelog

## Unreleased

- rewrote the Core CLI, execution bridge, Relay/Delivery mechanics, validators,
  and generators in TypeScript;
- made Node.js 22 the only Hanchou implementation runtime and removed Python;
- added strict TypeScript typechecking while retaining zero runtime npm
  dependencies.
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
