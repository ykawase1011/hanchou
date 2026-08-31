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
- human onboarding tests passed plan-only behavior, ordinary-terminal/TTY
  enforcement, Herdr/Managed-Agent rejection, fixed-path mode 0700 creation,
  mode 0600 registry append with backup/comment preservation, descendant Git
  resolve, idempotence, project/workspace-root ID collision rejection without
  partial mutation, and writable-parent rejection before mutation;
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
- the read-only Dashboard passed literal-loopback bind enforcement, Host-header
  validation, GET-only routing, security headers/CSP, no CORS or remote assets,
  DOM text-only rendering of hostile values, bounded 5-second refresh,
  degraded-snapshot isolation, and idempotent shutdown of a hanging request;
  production snapshots run in one deduplicated subprocess with a four-second
  deadline, one-MiB output limit, process-group termination, redacted failure
  details, and a health endpoint that remains responsive while a probe hangs;
- launch fake E2E passed strict Herdr 0.8.2 server-status JSON plus a non-Ping
  read-only control-plane probe, rejected the real shutdown shape where Ping
  succeeds but `agent list` returns `server_unavailable`, preserved transient
  Agent lookup errors without creating a replacement workspace, serialized
  concurrent Orchestrator starts, atomically bound and reused the exact
  workspace/pane after failed, blocked, `/exit`-equivalent, and unnamed-Agent
  recovery, kept one live named Agent among five same-label workspaces, failed
  closed on legacy duplicates and binding identity/cwd drift, and never called
  `workspace close`; `open orchestrator` focused the Agent or recorded
  workspace and opened the multi-client full Herdr TUI without direct attach;
  the separate human-confirmed `stop-orchestrator --all` path was plan-only,
  emitted a 64-character lowercase-hex snapshot token and its exact
  `--all --plan <64hex-token> --yes` apply command, rejected non-interactive/managed
  callers, bound profile digest/resolved state paths and Agent/process identity,
  displayed process IDs/names, pane-reported cwd, and every foreground process
  cwd, preflighted all same-label
  targets, rejected an additional process observed on the legacy shell's TTY or
  descendant tree without claiming this scan enumerates every Darwin
  same-session process, reported `observed_additional=n/a` for Agent-occupied
  targets where no OS shell scan ran, documented the final-revalidate-to-close
  TOCTOU in Herdr 0.8.2 and the complete PTY/process-session termination approval;
  kept default and `--include-unmanaged` tokens non-interchangeable, failed
  closed by default on busy/current-cwd/background/scan-unavailable/stale-authority
  legacy panes, and exposed only explicitly included unbound/no-Agent-record
  targets as `UNMANAGED-ACTIVE` with foreground process, foreground/base cwd,
  observed count, sorted reason, whole-session, scan-limit, and TOCTOU warnings;
  the include mode preserved label/Core-base-cwd/one-tab-one-pane/no-worktree/
  ID/binding/real-Agent containment, rejected Agent-list/direct-lookup
  disagreement, bound activity overrides, and malformed Herdr process-info
  result/PID/PGID/TTY/process records even when OS scan override was selected,
  checked every foreground process cwd for current-cwd mismatch, invalidated on
  activity drift, retained its flag in partial retry guidance, and closed
  unmanaged targets before the bound Agent target;
  closed four legacy spaces before the bound Agent space, preserved an unrelated
  workspace, retained binding/marker on partial failure, distinguished
  closed/remaining/uncertain outcomes, replanned before retry, rejected moved
  terminals and cwd drift, and recreated exactly one Orchestrator on the next
  start;
  the suite also passed all three service readiness gates, browser opt-out, no
  healthy Herdr/LaunchAgent restart, and optional Herdrm
  missing/mismatched/matched socket behavior and ownership warning;
- Herdrm compatibility tests rejected missing, regular-file, and different live
  sockets, created a compatibility symlink only for an absent default path and
  a live same-user named socket, never replaced an existing path, and accepted
  only two paths resolving to the same live Unix socket;
- LaunchAgent rendering produced pinned Herdr, beads-ui, and Dashboard plists,
  embedded the exact validated mise Herdr/Node paths even when Herdr was absent
  from `PATH`, left a second unchanged render current without backups, reloaded
  every plist before the first service load, loaded UI services before Herdr,
  recovered interrupted multi-service reloads from durable pending markers,
  rejected a concurrent profile installer and recovered a dead owner's lock,
  waited for both old Herdr endpoints under one deadline, continued with a
  warning when the client pathname persisted for pinned Herdr to classify,
  retried transient bootstrap and kickstart races, explicitly kickstarted newly
  registered and unchanged dormant jobs, reloaded only the service whose
  fingerprint changed, preserved healthy processes by omitting `kickstart -k`,
  recovered a registration-disappearance race, retained the durable marker
  across a persistent kickstart failure, recovered an unchanged beads-ui daemon
  idempotently, and validated all Dashboard placeholders;
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

- live installation and endpoint health of the new Dashboard LaunchAgent plus
  one `hanchou launch work` run on the target Mac after this change;
- Herdrm monitor/attach against a socket-compatible Hanchou session (Herdrm is
  optional and the standard named-session layout is intentionally rejected);
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
