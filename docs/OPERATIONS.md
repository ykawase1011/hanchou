# Operations

## Profile-local instance lifecycle

This is the v2.4.0 instance operations contract. Old Core-cwd deployments need
the explicit pre-cutover cleanup in `SESSION_HANDOFF.md` before first launch
from the new profile root.

An ordinary human terminal prepares and then applies one instance with a trusted
bootstrap Core:

```bash
git clone --branch main --single-branch \
  https://github.com/ykawase1011/hanchou.git \
  "$HOME/HanchouBootstrap/hanchou"
cd "$HOME/HanchouBootstrap/hanchou"
mise install
mise exec -- npm ci
make check

./bin/hanchou init work
# review the output, then copy its exact token-bearing command
$HOME/HanchouBootstrap/hanchou/bin/hanchou init work --plan <64hex-token> --yes
cd ~/HanchouWorkspace/work
```

Bare `init <profile>` downloads and validates the exact candidate pair and
prints the apply command without creating a deployed instance, launcher,
managed checkout, shelf, or registry entry. `<64hex-token>` above is notation;
use the exact command printed by the plan. Prepare runs candidate
mise/npm/make code, so prepare and apply both require an ordinary human TTY
outside a managed Agent. The printed apply command repeats the exact seed Core
executable that performed prepare; do not substitute a PATH-resolved global
command. Apply additionally requires the exact token and creates these
principal paths:

```text
~/HanchouWorkspace/<profile>/
├── bin/hanchou          non-symlink regular launcher fixed to root/profile
├── hanchou/             managed clean detached Core checkout
├── hanchou-skills/      managed clean detached Public Skills checkout
└── repositories/        empty/retained target-repository shelf
```

It also materializes root-level `AGENTS.md`/`CLAUDE.md`, provider control files,
and trusted non-symlink instance state under `.hanchou/`. The mode-0600
`.hanchou/instance.json` records fixed sources plus exact current/previous pairs;
after deployment, `.hanchou/candidates/` holds reviewed update/rollback pairs;
the initial prepare cache remains outside the not-yet-created instance root.
`transaction.json` exists only while activation/recovery is incomplete.
Root-level instructions point into the managed Core so an L0 started at
profile-root cwd reads the intended Role and operations contract.

It obtains both repositories from fixed official public HTTPS sources, never
from caller-provided URLs or refs:

```text
https://github.com/ykawase1011/hanchou.git         refs/heads/main
https://github.com/ykawase1011/hanchou-skills.git  refs/heads/main
```

Core and Skills have independent exact commits but form one deployed pair.
Candidate validation runs candidate Core against sibling candidate Skills and
requires the Skills VERSION expected by Core, byte-identical shared
`hanchou-cli` content, and every configured public Skill.
Neither checkout is placed under `repositories/`, registered as a target
project, or used for ordinary work. Init apply reuses the fixed-path onboarding
operation, so it creates/registers `repositories/` for immediate worker
dispatch within the same reviewed action. `onboard` remains separately callable
for that same fixed authority. Before first deployment, the profile root must
be absent or contain only a retained `repositories/` shelf and an optional
empty `.hanchou/`; any other root entry or a non-empty uninitialized control
directory is an unknown occupant and is refused. `init` also refuses symlinks,
dirty/mismatched managed checkouts, and ownership/mode violations; it never
discards local content. Candidate, registry, or target-path drift after plan
invalidates apply. Repeating it for an already valid instance verifies the
instance and does not update it.

Managed-checkout validation also rejects unapproved repository-local Git
configuration, executable hooks, replace/alternate-style object indirection,
and hidden/nonstandard index flags. The lifecycle never relies on ambient Git
configuration to interpret the reviewed commit.

Validation runs with a fresh temporary HOME/XDG tree, common GitHub-token and
HTTP-proxy variables removed, ambient Git configuration disabled, and
`npm ci --ignore-scripts`. Candidate `make check` still executes upstream code
with the operator's OS authority and no sandbox. These controls reduce ambient
credential/config exposure; they do not make an untrusted upstream safe.

The local launcher is the canonical command entrypoint. It fixes the profile and
instance root; conflicting caller environment or a contradictory profile
argument is rejected. A user-global command/link is shared installation state
and may be owned by the last successful bootstrap, so do not rely on it to
select among profile instances.

### Pair update

Never run `git pull`, switch branches, or edit either managed checkout. From the
profile root, request an update plan:

```bash
./bin/hanchou update
```

Prepare can run the candidate pair's mise/npm/make validation, so it is accepted
only in an ordinary interactive human terminal outside a managed Agent. It is
not an Agent-safe read-only inspection command even though deployment stays
unchanged.

The plan fetches both fixed `refs/heads/main` tips, requires each to be a
fast-forward from its installed commit, and prevalidates the exact candidate
pair without changing the running checkout or current pair. A fetch may add Git
objects. The output identifies the current and candidate commits, candidate
versions, fixed source ref, and validation result, then prints an exact apply
command:

```text
./bin/hanchou update --plan <64hex-token> --yes
```

This is normalized documentation notation. The actual plan prints the absolute
profile-local launcher path; copy that complete command without editing it.

If both public-main tips already equal the current pair, update reports that the
instance is current and prints no token or apply command.

The token binds the profile/root, current and candidate Core/Skills commits,
candidate versions, fixed remotes/refs, and machine-local project registry
digest. The prepared checkouts are revalidated before switching. Apply never
resolves “latest” again: if upstream `main` moves after planning, the reviewed
exact pair remains the only candidate. Drift or a dirty/mismatched checkout
invalidates the token and changes nothing.

Under an instance-scoped lock, apply records the current pair as previous,
activates both detached checkouts with a recovery journal, runs `bootstrap`, and
requires `doctor`. It never records a half-switched pair or failed health check
as successful. On post-switch failure, Hanchou automatically attempts to restore
the original pair and reruns bootstrap/doctor. If that recovery also fails, it
retains a `rollback-failed` transaction for human inspection and refuses another
normal switch. That journal is not input to automatic `rollback`: local
lifecycle commands intentionally fail closed until a human has inspected and
consistently repaired both managed checkouts and instance metadata. Do not
delete `transaction.json` merely to retry; preserve it as recovery evidence and
follow a reviewed maintainer repair procedure.

Update/rollback does not call `stop-orchestrator` or deliberately close the L0
workspace. Its required bootstrap may nevertheless reload changed Herdr,
Dashboard, or other managed services, so the running session is not guaranteed
unaffected. After a successful pair switch, open the Orchestrator, enter
`/exit`, detach with `Ctrl+B` then `q`, and run
`./bin/hanchou start-orchestrator` so the recorded pane reloads changed Role or
instruction files.

### Pair rollback

Rollback is also review/apply and always targets the recorded previous pair:

```bash
./bin/hanchou rollback
./bin/hanchou rollback --plan <64hex-token> --yes
```

Rollback prepare has the same ordinary-human-TTY requirement because it runs
candidate validation code. Apply additionally requires its exact reviewed token.

The plan identifies current/previous Core and Skills commits plus the rollback
target versions. Apply restores the exact pair and runs `bootstrap` plus
`doctor`. There is no one-repository rollback, arbitrary commit selector,
implicit reset of dirty content, or background “latest” updater. A successful
rollback records the displaced current pair as the new previous pair, so
reversing the rollback still requires another reviewed plan/apply.

Exact commit pinning provides reproducible plan/apply behavior but is not a
release signature and does not defend against compromise of an official
upstream. Hanchou deliberately has no automatic updater daemon or poller.

Multiple profile roots isolate managed checkouts and profile state, but not all
same-user integrations. Provider integrations, global Agent definitions,
plugin/tool links, and similar user-level files may be replaced by the last
successful bootstrap. The instance lifecycle lock does not coordinate another
profile. The operator must serialize update/bootstrap operations across
profiles, then run `doctor` for each affected profile. Use another OS user or VM
for hard independence; a profile root is not an OS security boundary.

## Apply model

`hanchou apply` is idempotent where practical. It renders agent definitions,
backs up and replaces Herdr config atomically, installs Public Skills, creates
profile state, and optionally installs pinned upstream components and
LaunchAgents. Existing Automation YAML is preserved.

```bash
./bin/hanchou onboard
./bin/hanchou onboard --yes
./bin/hanchou plan
./bin/hanchou bootstrap
./bin/hanchou apply --yes
./bin/hanchou apply --yes --install-upstream
./bin/hanchou launch
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

New worker dispatch is deny-by-default outside a human-reviewed grant. Init
apply creates and registers its fixed repository shelf by invoking the same
bounded onboarding operation. A human may also separately review and edit
`~/.config/hanchou/<profile>/projects.local.toml` for exact entries, or use the
fixed-path, interactive `hanchou onboard <profile> [--yes]` flow for
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
arguments. From the profile root, open it with `./bin/hanchou open orchestrator`, enter `/exit`,
detach the Herdr view with `Ctrl+B` then `q`, and rerun
`./bin/hanchou start-orchestrator`. Hanchou reuses its recorded pane; the
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

The Codex L0 starts with the exact profile root as its cwd and receives direct
read/write scope to that entire tree, including managed Core, managed Public
Skills, and canonical target repositories. This whole-tree scope is explicit
operator authorization. Delegation is a Role policy; it is not a filesystem
barrier against direct L0 access. L0 also receives its selected profile state,
Herdr session socket directory, and required Herdr plugin configuration.
Managed Codex runs enable the command-network proxy,
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
cd ~/HanchouWorkspace/work
./bin/hanchou launch
```

It verifies that the three LaunchAgent-owned services are ready, starts or
initializes the Orchestrator, and opens the Dashboard. It does not reinstall
missing services; run `./bin/hanchou bootstrap` when readiness fails.
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
./bin/hanchou open dashboard
./bin/hanchou open tasks
./bin/hanchou open herdr
./bin/hanchou open orchestrator
```

`open orchestrator` first focuses the recorded Agent or single-pane workspace
and then opens the ordinary full Herdr client. It does not use the exclusive
direct-attach API.
Hanchou serializes Orchestrator lifecycle operations per profile and stores the
exact workspace/tab/pane/terminal binding under the profile control directory.
Retries reuse that binding; they do not create a replacement workspace or
silently close the old one.

To stop every dedicated Orchestrator workspace and rebuild one clean instance,
use the human-confirmed lifecycle flow:

```bash
# Read-only plan
./bin/hanchou stop-orchestrator --all
```

Review every `CLOSE` row, then copy the exact apply command printed at the end
of that plan into the same ordinary terminal. Its format is:

```text
<exact-profile-local-launcher> stop-orchestrator --all --plan <64hex-token> --yes
```

When invoked through the local launcher, the printed command begins with its
actual absolute path. Preserve that path. A seed/development invocation without
instance identity may fall back to bare `hanchou`; in either case copy the exact
printed command.

`<64hex-token>` is documentation notation, not a literal value. The CLI prints
the real 64-character lowercase-hex token. After a complete stop, recreate
exactly one Orchestrator and open its full Herdr view:

```bash
./bin/hanchou start-orchestrator
./bin/hanchou open orchestrator
```

The plan selects every workspace with the configured Orchestrator label, then
requires each target to resolve to an approved Hanchou workspace cwd, have
exactly one tab and one pane, have no worktree, and have internally consistent
opaque IDs. A
durably bound target must match the binding. A named Orchestrator outside the
candidate set, a moved bound terminal, or any unsafe same-label target causes
the initial preflight to fail without closing anything. An occupied target must
contain at most one matching configured Orchestrator Agent; an unowned legacy
pane must have only an available foreground shell whose cwd exactly equals an
approved root. Hanchou also
scans the OS process table and accepts that shell only when it observes no
additional same-TTY or shell-descendant process. Each `CLOSE` row displays
foreground process `PID:name` values, pane-reported `cwd`, all foreground
process `process_cwds=PID:name@cwd` evidence, and `observed_additional` for human
review. The field is the numeric count from that best-effort scan
for an unowned legacy target and is `n/a` for an Agent-occupied target whose OS
shell is not scanned. An `observed_additional=0` result is not proof that every
other process is absent. On Darwin, processes in the same OS process session but
outside the same-TTY/descendant union cannot be enumerated completely by this
check.

The normal approved root is the exact profile root. During pre-2.4 migration,
only a bootstrap Core root explicitly recorded by init is accepted as an
additional root. Arbitrary old paths are never inferred, and the allowance is
cleared after Hanchou creates a new profile-root workspace.

The default plan fails closed when an unbound, no-Agent-record legacy pane is
not proven idle. `--include-unmanaged` is a human-selected activity override
for exactly that case, not a general force option:

```bash
# Read-only activity-override plan
./bin/hanchou stop-orchestrator --all --include-unmanaged
```

It may override only these activity reasons on that unbound legacy pane:
`foreground_busy`, `background_processes_observed`, `process_scan_unavailable`, and
`stale_pane_authority`. It continues to require the exact configured label,
approved-root base/current/process cwd, one tab/one pane, no worktree, consistent opaque
IDs and binding state, no Agent-list/direct-lookup disagreement, and exact
identity for every real Agent record. A bound target, foreign/wrong-kind Agent,
moved binding, approved-root-external cwd, multi-pane target, or worktree remains a
hard refusal. Herdr `pane process-info` must be schema-valid, including its
result type, foreground PID/PGID/TTY, and process records.
`process_scan_unavailable` applies only to the later OS process-table scan;
malformed Herdr process information remains a hard refusal.

An overridden row is labeled `UNMANAGED-ACTIVE`. Review its foreground
`PID:name`, pane-reported `cwd`, all foreground process
`process_cwds=PID:name@cwd` evidence, `observed_additional`, `base_cwd`, and
sorted `reasons`. Every pane/foreground-process cwd must exactly equal one
approved root even in include mode.
`observed_additional=n/a` can mean the foreground was busy or the OS scan was
unavailable; it never means zero. The plan warns that `unmanaged` means no
authoritative Agent record, not idle or safe, and that apply terminates the
entire pane OS session including unobserved processes. If the operator cannot
approve that effect for every row, use the full Herdr TUI instead.

The plan token binds the reviewed profile/session, profile TOML digest, every
resolved profile state path, approved workspace-root list, Core and config
roots, lifecycle state, binding,
validated workspace/pane/Agent/process identities and the selected
`include_unmanaged` mode. If the target snapshot changes before apply, the
token mismatch closes nothing and requires a fresh plan/token. The include-mode
plan prints this exact form:

```text
<exact-profile-local-launcher> stop-orchestrator --all --include-unmanaged --plan <64hex-token> --yes
```

The apply must run in an ordinary interactive terminal controlled by the human;
it rejects Herdr-managed or Hanchou-identified Agents and non-interactive
callers. Default and include-mode tokens are not interchangeable. The token is
a snapshot hash, not a secret or an authentication credential. These checks
and the command policy are defense-in-depth against mistakes and routine
automation, not a complete security boundary against code running as the same
OS user.

Applying closes every validated target regardless of Agent status and
terminates every process in its PTY's OS process session. This includes a
process not displayed by the plan, so apply is the human operator's approval of
that complete termination effect. Herdr 0.8.2 has no workspace close conditional
on the identity/revision Hanchou just checked. Per-target final revalidation
narrows but cannot eliminate the revalidate-to-close TOCTOU window. If this
effect cannot be approved, do not apply; use the full Herdr TUI fallback below.
Apply does not stop the Herdr server/session or alter unrelated workspaces,
Beads, Relay, Dashboard, repositories, or worktrees. Workspace close is
sequential rather than transactionally atomic.
On a mid-run failure, the error reports `closed`, `remaining`, and any
`uncertain` workspace IDs. Never assume an uncertain close succeeded. Fix the
condition, run the read-only plan named by the error again, review the current
targets, and use its new exact token command. An unmanaged retry retains
`--include-unmanaged`; never drop the flag or reuse the old token after a
partial close. Unmanaged targets close first and the bound target closes last.
The durable binding and initialization marker are cleared only after every
target is verified absent. Planning an already stopped profile is a no-op and
needs no apply.

The full Herdr TUI remains the manual fallback when Hanchou cannot validate the
required candidate predicates or the operator cannot approve the complete
termination effect. Open it with `./bin/hanchou open herdr`. To preserve
a live Agent while removing duplicates, keep the row containing the live Agent
named `orchestrator`; for each other row that you have verified is an empty
shell, press `Ctrl+B`, then `Shift+D`, and confirm close. If the intent is a
complete reset and no row must be preserved, close every individually verified
stale labeled row before rerunning `./bin/hanchou start-orchestrator`. Manual
workspace close also removes its PTY runtime; it does not delete a Git checkout.

Herdrm is optional and is not a Core readiness condition. Herdrm 0.5.x uses the
default local socket while Hanchou uses named sessions. `./bin/hanchou open herdrm`
therefore opens the app only when both paths resolve to the same socket. On an
explicit Herdrm open, Hanchou may create a symlink only when the default path is
absent and the named path is a live same-user socket; it never overwrites an
existing default session or starts a second server. Even when compatible, use
it only for monitoring or attaching to Hanchou-created Agents. A direct
`agent attach` or `terminal attach` has one writable owner. Do not attach Herdrm
and another direct client to the same pane at once; detach the earlier direct
view with `Ctrl+B` then `q`. The message `Another client took this pane over`
means ownership moved to the later direct client; it does not mean the Agent
stopped. The full client opened by `./bin/hanchou open orchestrator` is the preferred
multi-client-safe view.

## Health checks

`./bin/hanchou doctor` should verify:

- mise and the pinned Herdr/Node.js versions;
- project registry structure/ownership/mode (an absent registry is safe
  deny-all; use `./bin/hanchou project doctor` for repository readiness);
- Beads, Codex and Claude Code binaries;
- Herdr Codex/Claude integrations, herdr-automations and beads-ui;
- Hanchou Skills freshness;
- local launcher identity and managed Core/Skills current-pair integrity;
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
