# Repository boundaries

## hanchou

Public Core repository.

- CLI and schemas;
- canonical Role definitions and generated provider definitions;
- Herdr plugin for Relay dispatch;
- Beads↔Herdr execution bridge contract;
- Task、Cron、Relay、Delivery、model routing documentation;
- static validation and Core E2E plan.

No credentials or private environment policy.

## hanchou-skills

Public shared Skills canonical repository.

- provider-neutral operational Skills;
- installed to Codex and Claude Code with `vercel-labs/skills`;
- versioned independently from Core;
- deployed at its own exact commit, but candidate validation, activation, and
  rollback pair it with the profile-local Core exact commit;
- no credentials or confidential policy.

The managed Core and Public Skills checkouts are siblings directly below the
profile root. Neither is placed under or authorized as a target in
`repositories/`.

Private company/personal overlays live in separate private repositories and are
referenced only from machine-local `skills.local.toml`.

## hanchou-kingdom

Secret-free deployment/configuration repository for both work and personal
profiles.

- profile templates;
- project/node examples without confidential coordinates;
- reproducible apply/doctor wrappers;
- launch, backup, recovery procedures.

It must not contain tokens, cookies, keys, `.env`, private repository URLs,
company-confidential names, Chat configuration, or private Skill contents.

## hanchou-chat

Future optional transport repository.

- Slack Socket Mode / Discord Gateway or selected relay library;
- allowlist/authentication;
- external origin and destination mapping;
- consumes rendered Delivery records and writes delivery receipts.

It does not own Task、Schedule、Agent、or Orchestrator state.
