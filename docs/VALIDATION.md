# Validation status

## Passed

- 24 TOML files parsed;
- all JSON schemas/contracts and plist templates parsed;
- TypeScript sources passed strict typechecking and Node.js 22 execution;
- compatibility shell launchers and E2E harnesses passed syntax checks;
- 12 Public Skills validated, including `hanchou-cli`;
- canonical Role → Codex/Claude definitions were current;
- Writer/Editor remained Codex-only;
- `hanchou route resolve` matched the compatibility routing alias;
- Relay Inbox lifecycle passed `emit → claim → ack`;
- Relay rejected path traversal, symlink/malformed records, unclaimed or
  wrong-actor acknowledgement, forged/unmanaged sender identity, unmanaged
  claim, expired leases, and duplicate concurrent claim; terminal replay
  repaired interrupted receipt/journal writes without duplicating journal
  entries, recovered staged acknowledgement and dead-letter state moves without
  allowing claim/retry/ack to roll them back, accepted stable legacy journal
  rows, and rejected mismatched receipts plus mismatched/duplicate journal
  evidence; versioned Inbox retry and lease-recovery replay covered every
  source/move crash shape without double-incrementing counts or journals, and
  non-finite lease deadlines were recovered instead of becoming stuck;
- Codex project rules resolved project `list/show/resolve/doctor` and Inbox
  `list/show/claim/ack` to `allow`, Inbox `retry/dead-letter` to `prompt`, and
  unknown or trust-mutating project commands to no match;
- project authorization tests passed exact-repository and trusted-root resolve,
  fixed effective-user registry lookup despite a spoofed process `HOME`,
  profile/project mismatch rejection, path-prefix and symlink escape rejection,
  external Git-common-directory and dirty-repository rejection, registry file
  and parent/project/root permissions, broad HOME authorization rejection,
  ID/root-overlap validation, disabled configured fsmonitor execution, external
  local/included/worktree Git-filter rejection before status, sanitized
  production Node/Bash preload options, effective-user HOME/XDG/mise root
  normalization, managed-runtime custom-config rejection, and safe
  missing-registry deny-all behavior;
- Delivery lifecycle passed `create → rendered → delivered`, including
  traversal/symlink rejection and duplicate concurrent-create exclusion;
  queue reconciliation preserved staged render/failure evidence, prevented a
  failed record from being rendered or delivered, repaired current and legacy
  retry crash shapes without duplicate states/journal rows, and rejected retry
  on a never-failed pending record;
- execution fake E2E passed dependency, ownership, and unauthorized-project
  rejection without a WAL/Bead/branch/Herdr side effect, base-pinned dispatch,
  first-run readiness recovery, authorization-revocation rejection before the
  first prompt, role-scoped Codex/Claude startup,
  prompt redaction, execution-bound Relay evidence, Delivery, settlement, and
  agent-start failure → blocked/lost → non-destructive reconcile; its strict
  Herdr 0.8.2 surface verifies workspace/tab-level environment injection and
  rejects unsupported Agent/worktree options; managed Codex network overrides
  passed a live sandbox-proxy smoke test, overrode inherited unsafe local/socket
  settings, denied external domains, local TCP and a sibling Unix socket, and
  allowed only the selected Herdr Unix socket;
- `hanchou-kingdom` passed secret-free repository checks;
- old `hanchou-mailbox` files and command names were absent;
- `make manifest` regenerates each release manifest from the Git index only;
- `make check` verifies both the exact tracked-file set and every recorded
  SHA-256 checksum.

On a target macOS host, 2026-08-30:

- `mise install` resolved Herdr 0.8.2 and the TypeScript runtime, Node.js 22;
- `hanchou bootstrap work` installed the Codex/Claude integrations, Hanchou
  Skills, `herdr-automations`, and `beads-ui`, and initialized embedded Beads;
- `hanchou doctor work` passed every required tool, integration, plugin,
  service, endpoint, Skill, and state-directory check;
- launchd supervision started the Herdr server and Automations daemon, while
  the beads-ui HTTP endpoint responded on its configured loopback port;
- a Codex L0 Orchestrator started in Herdr, loaded its Role and Skills, retried
  a sandbox-denied status command through normal approval, and reported ready;
- repeated setup preserved source files and backed up managed user
  configuration before replacement.

## Not yet proven

- a fresh live L0 task-status query after the managed Codex environment fix. A
  follow-up probe in the earlier L0 exposed that Codex's persistent app-server
  had lost `HERDR_ENV`; deterministic L0/worker argv tests now verify explicit
  per-run Herdr workspace/tab/pane, Agent, Beads, and Relay context, but the
  existing Agent must be restarted before the live recheck;
- live Claude agent startup and task completion (the Claude integration itself
  is installed and passes doctor);
- live Beads↔Herdr execution, Relay wake, and later-turn Delivery loop;
- completion wake while the user is editing the L0 pane;
- provider session restoration after crash/reboot;
- typed Hanchou schedule wrapper and `existing-orchestrator` extension;
- Automation daemon crash supervision;
- Slack/Discord transport and external Delivery receipts;
- multi-writer Beads server mode.

## Commands

```bash
cd hanchou && make check
cd ../hanchou-skills && make check
cd ../hanchou-kingdom && make check

# After staging an intentional tracked-file addition or removal:
make manifest
```
