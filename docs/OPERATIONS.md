# Operations

## Apply model

`hanchou apply` is idempotent where practical. It renders agent definitions,
backs up and replaces Herdr config atomically, installs Public Skills, creates
profile state, and optionally installs pinned upstream components and
LaunchAgents. Existing Automation YAML is preserved.

```bash
hanchou onboard work
hanchou onboard work --yes
hanchou plan work
hanchou bootstrap work
hanchou apply work --yes
hanchou apply work --yes --install-upstream
hanchou launch work
```

Herdr and Node.js are resolved from the repository's `mise.toml`; Homebrew is
not the standard Herdr installation path. `bootstrap` runs `mise install` before
the full apply. Existing managed files are backed up before replacement, and
the plan names each affected user-level location.

Managed Herdr panes use a non-login Bash shell with the bootstrap PATH. This
keeps agent startup deterministic and prevents unrelated interactive login
hooks (such as credential prompts) from blocking lifecycle detection.

The first `start-orchestrator` may pause for Codex project and hook review.
Open the focused full Herdr view, review the exact sources, and trust only the
intended Hanchou/Herdr integration. Hanchou never bypasses Codex approvals or sandboxing.
That first project/hook decision is intentionally not auto-approved.

New project dispatch is separately deny-by-default. A human either reviews and
edits `~/.config/hanchou/<profile>/projects.local.toml` for exact entries, or
uses the fixed-path, interactive `hanchou onboard <profile> [--yes]` flow for
the dedicated Agent-safe repository shelf. Managed Agents only use
`hanchou project list/show/resolve/doctor`; `onboard --yes` rejects a
Herdr-managed environment, an Agent identity, and non-interactive input. Do not
authorize `$HOME` or a mixed directory containing secrets. See
`PROJECT_WORKSPACES.md`.
The production `bin/hanchou` wrapper starts Bash with `-p` (startup hardening;
it grants no OS privilege) so caller-provided `BASH_ENV`/inherited functions
cannot replace its sanitization.
It removes Node preload options, normalizes HOME/XDG/mise roots to the effective
OS user, and resolves the pinned runtime only below that user's standard mise
install root after owner/mode checks. Registry authority independently opens
the effective-user file without following a final symlink and parses/hashes one
file snapshot. Managed Agent start/execution also rejects a custom
`--config-root` or `HANCHOU_CONFIG_ROOT`; planning and test-only rendering may
still use an alternate configuration root. Project inspection also
sanitizes Git environment overrides and disables optional locks/fsmonitor/hooks.
Configured clean/smudge/process filters are readiness blockers because Git may
execute them during status checks; configured hooks and fsmonitor are reported
for human review without executing them during readiness checks.

An Agent that was already running before an `apply` does not gain new launch
arguments. Open it with `hanchou open orchestrator <profile>`, enter `/exit`,
detach the Herdr view with `Ctrl+B` then `q`, and rerun
`hanchou start-orchestrator <profile>`. Hanchou reuses its recorded pane; the
fresh Agent receives the managed environment and reloads the project-local
command policy.

Routine control commands use the checked-in project policy at
`.codex/rules/hanchou.rules`. It automatically allows the read-only
`hanchou project list/show/resolve/doctor` commands and only the canonical
`hanchou inbox list/show/claim/ack` forms in this trusted checkout. Arbitrary
project trust mutation commands do not exist, and the human-only
`onboard --yes` command is not allowed by this Agent policy. Inbox `retry` and
`dead-letter` still prompt because they alter delivery semantics, and unknown
future commands receive no blanket permission. Never add a user-global
`prefix_rule(pattern=["hanchou", "inbox"], decision="allow")`: it also allows
destructive and future subcommands in unrelated Codex projects. Back up and
remove such a remembered rule from `~/.codex/rules/default.rules`, then restart
the L0 Agent so Codex reloads the narrower project policy.

Hanchou injects `HANCHOU_AGENT_ID` into the root shell when it creates each
orchestrator or worker workspace, and the managed Agent in that pane inherits
it. For workers, Hanchou retains Herdr's dedicated worktree creation and opens
an identity-bearing tab inside that worktree workspace; Herdr 0.8.2 supports
`--env` on tab creation, not on worktree or Agent creation. Hanchou also passes
the selected profile, Agent identity,
Herdr workspace/tab/pane/socket, Beads, and Relay paths to each managed Codex
run through per-run `shell_environment_policy.set` overrides. This preserves
Herdr context when a persistent Codex app-server executes shell tools. Do not
set `HERDR_ENV=1` globally in `~/.codex/config.toml` or launchd: a normal non-Herdr Codex session
must not impersonate a managed pane. If context is nevertheless absent, L0 may
answer from Beads but must label live Herdr state unavailable and request a
Hanchou-managed restart.

The Codex L0 receives writable access only to the selected Hanchou profile state,
its Herdr session socket directory, and Herdr plugin configuration in addition
to the Core checkout. Managed Codex runs enable the command-network proxy,
replace inherited domain rules with an empty default-deny policy, and allow only
the selected Herdr Unix socket for local control-plane IPC. Broad local binding,
arbitrary Unix sockets, non-loopback proxy listeners, upstream proxy chaining,
and SOCKS are disabled. Sandbox denials are routed through Codex automatic
approval review; the dangerous approval/sandbox bypass flag is never used.

## Startup

On macOS, GUI-domain LaunchAgents start Herdr, beads-ui, and the loopback-only
read-only Hanchou Dashboard. Reapplying an unchanged plist leaves the running
service in place; a changed managed plist is backed up, replaced, and reloaded.
All plist files are installed before any service is touched. Dashboard and
beads-ui are loaded before a disruptive Herdr reload. A durable pending marker
is created before each changed destination and removed only after that service
loads, so an interrupted apply resumes the missing reload on its next run. A
profile-scoped hard-link lock rejects concurrent installers and recovers a lock
owned by a dead process. A Herdr reload gives the API and client socket paths one
shared deadline of up to ten seconds; if either pathname remains, Hanchou warns
and delegates the final live/stale check to pinned Herdr. Transient `launchctl
bootstrap` and `kickstart -p` failures are retried for up to fifteen seconds.
Registration alone is not treated as process startup, and a pending marker is
cleared only after the explicit kickstart succeeds. The kickstart does not use
`-k`, so it starts a dormant job without restarting a healthy Herdr or Dashboard.
If registration disappears immediately before kickstart, Hanchou re-registers
that service once and resumes the bounded start request.
Because beads-ui intentionally daemonizes, the same operation also reactivates
its short-lived launcher. Each profile uses a separate beads-ui runtime/PID
directory.
Herdr plugin startup launches herdr-automations and runs one Relay
recovery/dispatch pass. If scheduler crash supervision proves insufficient,
promote its daemon to a separate LaunchAgent rather than running two schedulers.

After bootstrap, the normal entrypoint is:

```bash
hanchou launch work
```

It verifies that the three LaunchAgent-owned services are ready, starts or
initializes the Orchestrator, and opens the Dashboard. It does not reinstall
missing services; run `hanchou bootstrap work` when readiness fails.
Herdr readiness requires both the pinned-version Ping and a successful
read-only `agent list`; Ping alone remains available during Herdr 0.8.2 shutdown
and is not sufficient. `start-orchestrator`, `open herdr`, `open orchestrator`,
and `doctor` use the same strong check, and transient control-plane failures are
never interpreted as an absent Orchestrator.

## UI

```text
                 work                       personal
Dashboard        http://127.0.0.1:3747      http://127.0.0.1:3847
beads-ui          http://127.0.0.1:3737      http://127.0.0.1:3837
```

```bash
hanchou open dashboard work
hanchou open tasks work
hanchou open herdr work
hanchou open orchestrator work
```

`open orchestrator` first focuses the recorded Agent or single-pane workspace
and then opens the ordinary full Herdr client. It does not use the exclusive
direct-attach API.
Hanchou serializes Orchestrator lifecycle operations per profile and stores the
exact workspace/tab/pane/terminal binding under the profile control directory.
Retries reuse that binding; they do not create a replacement workspace or
silently close the old one.

If Hanchou reports unbound legacy `00-orchestrator` workspaces, open the full
Herdr TUI and preserve the row containing the live Agent named `orchestrator`.
Hanchou may automatically bind that live named Agent only when its configured
kind, label, single-pane shape, no-worktree state, Core cwd, and all opaque IDs
match exactly; it still does not create or close a workspace in that migration.
For each other row that you have verified is an empty shell, press `Ctrl+B`,
then `Shift+D`, and confirm close. If none contains a live Agent, close every
stale labeled row before rerunning `hanchou start-orchestrator work`. Closing a
Herdr workspace removes its PTY runtime; it does not delete a Git checkout.

Herdrm is optional and is not a Core readiness condition. Herdrm 0.5.x uses the
default local socket while Hanchou uses named sessions. `hanchou open herdrm`
therefore opens the app only when both paths resolve to the same socket. On an
explicit Herdrm open, Hanchou may create a symlink only when the default path is
absent and the named path is a live same-user socket; it never overwrites an
existing default session or starts a second server. Even when compatible, use
it only for monitoring or attaching to Hanchou-created Agents. A direct
`agent attach` or `terminal attach` has one writable owner. Do not attach Herdrm
and another direct client to the same pane at once; detach the earlier direct
view with `Ctrl+B` then `q`. The message `Another client took this pane over`
means ownership moved to the later direct client; it does not mean the Agent
stopped. The full client opened by `hanchou open orchestrator` is the preferred
multi-client-safe view.

## Health checks

`hanchou doctor` should verify:

- mise and the pinned Herdr/Node.js versions;
- project registry structure/ownership/mode (an absent registry is safe
  deny-all; use `hanchou project doctor` for repository readiness);
- Beads, Codex and Claude Code binaries;
- Herdr Codex/Claude integrations, herdr-automations and beads-ui;
- Hanchou Skills freshness;
- Herdr server/session, Orchestrator, and duplicate/binding workspace topology;
- Beads doctor/ready access;
- Relay directories, expired leases, pending Deliveries;
- Automation config, daemon, misses, repeated failures;
- beads-ui endpoint;
- Hanchou Dashboard endpoint;
- optional Herdrm presence/compatibility without making absence a failure;
- generated agent and Skill freshness;
- the project-local Codex control policy and absence of a broad user-level
  Inbox allow rule.

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
