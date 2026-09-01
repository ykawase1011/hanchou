# Implementation plan

## Objective

Deliver the simplest reliable Core before Chat integration:

```text
Human → Codex L0 → Beads → Herdr worker → Relay → later L0 turn → Delivery
```

## Phase 0: repository cleanup

- add canonical `mise.toml` pins for Herdr and Node.js;
- adopt Relay/Inbox/Delivery terminology everywhere;
- make `hanchou-skills` canonical;
- keep `hanchou-kingdom` secret-free;
- validate generated Agent definitions and schemas;
- install `hanchou-cli` Skill and freeze command-ownership rules.

**Exit:** no stale Mailbox command/schema names; all repositories pass static
validation.

## Phase 1: local bootstrap

- implement bare `hanchou init <profile>` as candidate download/validation with
  no deployment, plus ordinary-TTY exact-token apply for the root/profile-fixed
  local launcher, sibling managed Core/Public Skills clean detached checkouts,
  and repository shelf under `~/HanchouWorkspace/<profile>`;
- fetch only the fixed official public HTTPS repositories at
  `refs/heads/main`, validate candidate Core against sibling candidate Skills,
  and record independent exact commits as one deployed pair;
- implement exact-token pair `update` and `rollback`, previous-pair recovery,
  bootstrap/doctor, explicit post-switch L0 instruction reload, and no
  automatic latest updater; restrict prepare as well as apply to an ordinary
  human TTY because candidate validation executes candidate code;
- move new Orchestrator workspace cwd/containment from Core to exact profile
  root and E2E-test legacy cutover;
- install pinned Herdr and Node.js with `mise`;
- use Homebrew only for prerequisites such as mise, git, gh and Beads;
- bootstrap provider integrations, Skills, beads-ui and herdr-automations;
- keep herdr-beads optional and do not require a standalone Dolt server;
- have init apply create/register the fixed Agent-safe repository shelf through
  the bounded onboarding operation; retain separately callable plan-first
  `onboard` for that same authority;
- apply work profile;
- launch Herdr, Task UI, and the read-only Hanchou status Dashboard;
- start Codex Orchestrator through the single `hanchou launch` entrypoint;
- verify Claude/Codex Herdr integrations and Skills.

The instance bullets are implemented in v2.4.0. Same-user global integrations
are not profile-isolated; serialize
cross-profile update/bootstrap and doctor every affected profile.

**Exit:** all Core surfaces are visible locally.

## Phase 2: Beads↔Herdr bridge

- implemented `hanchou execution dispatch/inspect/reconcile` commands;
- atomic Bead claim, write-ahead record and Herdr binding;
- role/model/usage resolution;
- worktree creation and Agent prompt contract;
- fake success/failure/reconcile coverage;
- live E2E, cancellation and orphan rediscovery remain.

**Exit:** one Bead reliably maps to one visible execution.

## Phase 3: Relay completion loop

- Worker emits terminal event;
- Dispatcher waits for idle/done L0;
- L0 claims, verifies, updates Beads;
- L0 replies in a later turn;
- Inbox lease/ack/retry/dead-letter passes crash tests.

**Exit:** no accepted root Task can complete silently under `on_terminal`.

## Phase 4: Delivery/reporting

- reporting metadata and policy evaluation;
- Delivery state/receipt commands;
- coalescing and dedupe;
- decisions/critical alerts immediate;
- daily digest and monitor `on_change` examples.

**Exit:** Task completion and user notification are independently observable.

## Phase 5: Scheduler integration

Do not wrap ordinary `herdr-automations` operations unnecessarily. The typed
Hanchou schedule surface exists only for Hanchou reporting metadata, Task binding,
and `existing-orchestrator` wake.


- typed schedule CRUD;
- `existing-orchestrator` target;
- occurrence idempotency;
- Automation run↔Bead↔Relay binding;
- daemon health and missed-run alerting.

**Exit:** scheduled work and daily digest survive sleep/restart without duplicate
reports.

## Phase 6: work/personal deployment

- kingdom wrappers, local overrides, backup/restore;
- separate profile state and credentials;
- Lima/remote node procedure if required;
- security and company-policy review.

## Phase 7: hanchou-chat ADR and implementation

Only after Core E2E:

- compare direct Slack/Discord implementation, Herdr-native bridges, and transport
  relays;
- implement allowlisted ingress and Delivery adapter;
- preserve one Orchestrator session and origin-aware reply routing.

## Non-goals before Core exit

- a custom writable Task/Agent GUI (a loopback read-only status Dashboard is in scope);
- custom PTY/runtime;
- second Task or Cron store;
- automatic provider usage scraping by browser;
- recursive agent trees beyond L2;
- Slack/Discord library selection.
