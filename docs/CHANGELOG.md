# Changelog

## Unreleased

- rewrote the Core CLI, execution bridge, Relay/Delivery mechanics, validators,
  and generators in TypeScript;
- made Node.js 22 the only Hanchou implementation runtime and removed Python;
- added strict TypeScript typechecking while retaining zero runtime npm
  dependencies.

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
