# Architecture

## Component ownership

| Component | Owns | Does not own |
|---|---|---|
| Herdr | PTY、Workspace、Worktree、Agent lifecycle、API | Task semantics、Cron、user report |
| Beads | Task graph、Decision、dependency、ready、closure | live process、Chat |
| herdr-automations | cron entry、run history、fresh Agent execution | Task graph、same-session completion report |
| Hanchou Relay | Inbox event、wake、Delivery lifecycle、receipt | PTY、Task DB、Chat SDK |
| Hanchou | Role、routing、bridge、configuration、operations | replacement runtime/DB/scheduler |
| hanchou-chat | future Slack/Discord ingress/egress | Task、Cron、Orchestrator ownership |

## Profile instance topology

The decided v1 topology is one self-identifying instance per profile:

```text
~/HanchouWorkspace/<profile>/        Orchestrator cwd / explicit L0 scope
├── bin/hanchou                      regular-file local launcher
├── hanchou/                         managed clean detached Core
├── hanchou-skills/                  managed clean detached Public Skills
└── repositories/                    canonical target-repository shelf
```

The launcher fixes the instance root and profile. Core and Skills are fetched
only from the fixed official public HTTPS repositories at `refs/heads/main`,
then pinned to independent exact commits. The two commits are the unit of
candidate validation, activation, current/previous recording, health checking,
and rollback. Candidate Core is always validated against sibling candidate
Skills, including the declared Skills version, shared `hanchou-cli` content,
and configured public-Skill presence. Neither managed repository is a target
under `repositories/`.
Keeping them as siblings prevents the standard recursive repository-shelf grant
from authorizing installed supply-chain code as an ordinary worker target. It
does not hide them from L0, whose whole profile-root access is explicit.

Bare `init <profile>` prepares/validates candidates without a deployed instance;
its human-reviewed exact-token apply creates the topology and registers the
fixed repository shelf through the bounded onboarding operation. `onboard`
remains separately callable. An uninitialized root may contain only a retained
repository shelf and an optional empty control directory; unknown root/control
entries are never overwritten. `update` and `rollback` use the same exact-token
plan/apply model. Update may fetch candidate Git objects
without changing the deployment; each public-main candidate must fast-forward
its installed commit, and an unchanged pair needs no apply. Apply activates the
reviewed pair, performs bootstrap and doctor, and records the previous pair.
Rollback restores that pair and repeats bootstrap/doctor. Post-activation
failure attempts automatic recovery to the original pair; an incomplete
recovery remains journaled and blocks automatic lifecycle commands, including
rollback. Recovery then requires a
human to inspect and consistently repair both checkouts and metadata; deleting
the journal is not itself a repair. Prepare for all three operations can run
candidate validation code and is restricted to an ordinary human TTY outside
managed Agents. Apply does not deliberately close the L0 workspace, but
bootstrap may reload changed managed services. An explicit L0 restart is still
needed to load changed instructions.
There is no background updater. This topology and lifecycle are implemented in
v2.4.0.

Candidate validation uses a fresh temporary HOME, removes common GitHub-token
and HTTP-proxy variables, ignores ambient Git configuration, and disables npm
install scripts. Candidate `make check` still executes upstream code without an
OS sandbox, so this reduces ambient exposure but is not hostile-code isolation.

The profile root is intentionally the L0 cwd, so L0 can directly read/write
managed Core, Public Skills, and target repositories. Delegation is enforced by
Role policy, not by filesystem isolation. The project registry controls worker
dispatch and does not remove L0's direct whole-tree access. A profile root is an
operational scope, not an OS security boundary against the same user.

Profile roots and profile state are separate, but provider integration files,
global Agent definitions, plugin/tool links, and similar same-user resources may
be shared and last-bootstrap-owned. Different deployed pairs can therefore
drift across profiles. The lifecycle lock is instance-scoped, not a global
cross-profile coordinator. Operators must serialize cross-profile
update/bootstrap and follow it with per-profile doctor. Separate OS users or
VMs are required for hard independence.

## Runtime topology

```text
Herdr session: work/personal
├─ 00-orchestrator
│  └─ Codex Sol `orchestrator`
├─ project source workspaces
│  └─ Herdr-managed worktree workers
├─ optional Mission Lead workspaces
├─ herdr-beads board
└─ herdr-automations board
```

## Turn lifecycle

```text
Human request
→ L0 immediate answer or Bead/delegation acknowledgement
→ L0 turn ends
→ Worker emits Relay event
→ Dispatcher waits for safe L0 state
→ same Orchestrator session receives a new internal turn
→ Beads verification + Delivery
→ user-facing response
```

A long-running L0 wait loop is prohibited.

## Restart model

- Herdr restores session shape and supported provider sessions.
- Hanchou records one exact Orchestrator workspace/tab/pane/terminal binding per
  profile before Agent startup and serializes create/reuse against that record.
- A missing Agent name never authorizes a second Orchestrator workspace when a
  recorded or legacy candidate remains; ambiguous legacy state fails closed.
- The normal approved workspace root is the exact profile root. During
  pre-2.4 cutover only, init may record its exact seed Core root as an additional
  migration root; creating a new profile-root workspace clears that allowance.
- Destructive reset is a separate, human-confirmed, plan-first command. The
  read-only plan emits an exact apply command with a 64-character lowercase-hex
  token bound to the reviewed target snapshot. A state change or partial close
  requires a new plan/token. Apply closes only the fully validated dedicated
  Orchestrator workspace set, preserves all other control-plane/project state,
  and clears the binding only after every selected workspace is confirmed
  absent. Legacy-shell process screening is a best-effort union of same-TTY and
  shell-descendant records; on Darwin it cannot enumerate every process in the
  same OS process session. Herdr 0.8.2 has no conditional workspace close, so
  final revalidation narrows but cannot eliminate the revalidate-to-close
  TOCTOU window. Apply is the human's approval to terminate the complete target
  PTY/process session; otherwise the full Herdr TUI is the fallback. TTY,
  managed-Agent, token, and command-policy checks are
  defense-in-depth rather than a complete same-user security boundary.
- Beads restores Task truth.
- Relay recovers expired Inbox leases and pending Deliveries.
- Plugin startup runs one idempotent Relay dispatch.
- If the provider context cannot resume, the replacement L0 reconstructs from
  Beads, Relay, Automation history, and artifacts.
