# Operations

## Apply model

`hanchou apply` is idempotent where practical. It renders agent definitions,
backs up and replaces Herdr config atomically, installs Public Skills, creates
profile state, and optionally installs pinned upstream components and
LaunchAgents. Existing Automation YAML is preserved.

```bash
hanchou plan work
hanchou bootstrap work
hanchou apply work --yes
hanchou apply work --yes --install-upstream
```

Herdr and Node.js are resolved from the repository's `mise.toml`; Homebrew is
not the standard Herdr installation path. `bootstrap` runs `mise install` before
the full apply. Existing managed files are backed up before replacement, and
the plan names each affected user-level location.

Managed Herdr panes use a non-login Bash shell with the bootstrap PATH. This
keeps agent startup deterministic and prevents unrelated interactive login
hooks (such as credential prompts) from blocking lifecycle detection.

The first `start-orchestrator` may pause for Codex project and hook review.
Attach to the named Agent, review the exact sources, and trust only the intended
Hanchou/Herdr integration. Hanchou never bypasses Codex approvals or sandboxing.
The Codex L0 receives writable access only to the selected Hanchou profile state,
its Herdr session socket directory, and Herdr plugin configuration in addition
to the Core checkout. Its Codex network sandbox allowlists only that selected
Herdr Unix-socket directory for local control-plane IPC. No external domain is
allowlisted for L0. Sandbox denials are routed through Codex automatic approval
review; the dangerous approval/sandbox bypass flag is never used.

## Startup

On macOS, a GUI-domain LaunchAgent starts only Herdr and beads-ui. Herdr plugin
startup launches herdr-automations and runs one Relay recovery/dispatch pass.
If scheduler crash supervision proves insufficient, promote its daemon to a
separate LaunchAgent rather than running two schedulers.

## UI

```text
work      http://127.0.0.1:3737
personal  http://127.0.0.1:3837
```

```bash
herdr --session work
herdr --session personal
```

## Health checks

`hanchou doctor` should verify:

- mise and the pinned Herdr/Node.js versions;
- Beads, Codex and Claude Code binaries;
- Herdr Codex/Claude integrations, herdr-automations and beads-ui;
- Hanchou Skills freshness;
- Herdr server/session and Orchestrator;
- Beads doctor/ready access;
- Relay directories, expired leases, pending Deliveries;
- Automation config, daemon, misses, repeated failures;
- beads-ui endpoint;
- generated agent and Skill freshness.

## Backup and recovery

Back up profile state, Automation config/history, and machine-local config.
Credentials remain in their approved secret store. Recovery order:

1. start Herdr;
2. restore/verify Beads;
3. run Relay recover/dispatch;
4. reconcile Beads↔Herdr bindings;
5. inspect pending Deliveries;
6. start/attach Orchestrator;
7. resume Automations.
