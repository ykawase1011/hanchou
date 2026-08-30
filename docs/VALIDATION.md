# Validation status

## Passed

- 24 TOML files parsed;
- all JSON schemas/contracts and plist templates parsed;
- Python sources compiled and shell scripts passed syntax checks;
- 12 Public Skills validated, including `hanchou-cli`;
- canonical Role → Codex/Claude definitions were current;
- Writer/Editor remained Codex-only;
- `hanchou route resolve` matched the compatibility routing alias;
- Relay Inbox lifecycle passed `emit → claim → ack`;
- Delivery lifecycle passed `create → rendered → delivered`;
- execution fake E2E passed dependency and ownership rejection, base-pinned
  dispatch, first-run readiness recovery, role-scoped Codex/Claude startup,
  prompt redaction, execution-bound Relay evidence, Delivery, settlement, and
  agent-start failure → blocked/lost → non-destructive reconcile;
- `hanchou-kingdom` passed secret-free repository checks;
- old `hanchou-mailbox` files and command names were absent;
- `make manifest` regenerates each release manifest from the Git index only;
- `make check` verifies both the exact tracked-file set and every recorded
  SHA-256 checksum.

On a target macOS host, 2026-08-30:

- `mise install` resolved Herdr 0.8.2, Node.js 22, and the pinned Python runtime;
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
