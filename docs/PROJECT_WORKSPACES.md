# Project workspaces and authorization

## Three separate layers

Hanchou uses one Core checkout and one persistent Orchestrator per profile. It
is not installed inside every target repository.

```text
stable Hanchou Core checkout
human repository shelf
  └─ clean canonical Git repositories
~/.local/share/hanchou/<profile>/
  ├─ control/.beads
  ├─ worktrees/<task-id>/<execution-id>/
  ├─ reports/
  └─ relay/
```

The repository shelf is a human-approved authorization boundary, not a directory
that Hanchou scans for work. Hanchou does not infer a target from the caller's
current directory. L0 resolves one absolute Git top-level for each Leaf Task.
Dispatch then creates the task worktree automatically.

## Recommended filesystem layout

For a dedicated same-user workspace:

```text
~/HanchouWorkspace/
├─ work/
│  └─ repositories/
└─ personal/
   └─ repositories/
```

Keep secrets, credentials, downloads, imports, and mixed local data outside an
authorized repository root. If an existing repository shelf contains even one
private or sensitive repository, do not authorize the shelf; use exact entries
or create a new Agent-safe shelf.

## Human-owned authorization

New dispatch is deny-by-default. Authority comes only from this fixed
effective-OS-user path, not from `HOME`, `HANCHOU_CONFIG_ROOT`, a Bead, or the
public example:

```text
~/.config/hanchou/<profile>/projects.local.toml
```

Managed Agents may use only:

```bash
hanchou project list --json
hanchou project show <id> --json
hanchou project resolve --path /absolute/git/root --json
hanchou project doctor
```

There is intentionally no Agent-callable arbitrary add/remove/trust command.
For the fixed dedicated shelf only, a human may run `hanchou onboard` from an
ordinary interactive terminal. Without `--yes` it is plan-only. Applying is
rejected when `HERDR_ENV=1`, `HANCHOU_AGENT_ID` is present, or stdin is not a
TTY. It accepts no arbitrary path and creates only
`~/HanchouWorkspace/<profile>/repositories` with the corresponding fixed
workspace-root ID. This makes first setup reproducible without letting a
Managed Agent broaden authority through the normal command surface.

The registry must be owned by the effective OS user, must be a regular
non-symlink file, and must not be group/world writable. Its parent Hanchou
config directories have the same non-symlink/non-writable requirement. This is
not a kernel-level boundary against a hostile process running as the same OS
user. A directory dedicated to Hanchou improves organization, but only a
separate OS user, restrictive ownership/ACL, or Kingdom/VM provides a strong
secret boundary.

For the recommended first-time setup, review the plan and then apply it from a
normal terminal:

```bash
hanchou onboard work
hanchou onboard work --yes
hanchou project list --json
```

This creates a `descendant-git-repositories` entry. If recursive authorization
is too broad, do not run `onboard --yes`. Instead, create the parent directory
and edit one exact entry at a time:

```bash
mkdir -p ~/HanchouWorkspace/work/repositories
mkdir -p ~/.config/hanchou/work
chmod go-w ~/.config ~/.config/hanchou ~/.config/hanchou/work
touch ~/.config/hanchou/work/projects.local.toml
chmod 600 ~/.config/hanchou/work/projects.local.toml
${EDITOR:-nano} ~/.config/hanchou/work/projects.local.toml
```

An exact entry means an Agent cannot authorize another repository through
Hanchou's normal command surface. A workspace-root entry deliberately delegates
more freedom: an Agent still cannot edit the registry through Hanchou, but any
Git repository it creates or discovers strictly inside that already-approved
root is authorized. Choose one exact entry per repository when that is too
broad.

### Exact repository authorization (default)

```toml
schema_version = 1
default_policy = "deny"

[[projects]]
id = "example-app"
path = "~/HanchouWorkspace/work/repositories/example-app"
allowed_profiles = ["work"]
```

The Bead `project`, canonical `repo_path`, and active profile must all match.

### Dedicated workspace-root authorization (opt-in)

Use this only when every descendant repository is safe for Agent work:

```toml
schema_version = 1
default_policy = "deny"

[[workspace_roots]]
id = "work-repositories"
path = "~/HanchouWorkspace/work/repositories"
allowed_profiles = ["work"]
trust = "descendant-git-repositories"
```

This is one recursive human grant. It authorizes every Git top-level strictly
below the root at resolve time, including repositories created or cloned there
in the future. `project resolve` returns a deterministic identity such as
`root:work-repositories/example-app`; L0 must copy that exact value into the
child Bead.

Hanchou rejects filesystem root, the operator HOME, ancestors of HOME,
overlapping roots, path components that resolve through symlinks, relative or
environment-expanded paths, project/root directories not owned by the effective
OS user or writable by group/other, and repositories whose Git common directory
is outside the authorized repository. Registry bytes are opened without
following the final symlink and one snapshot is used for both parsing and its
audit digest.

## Daily flow

```bash
git -C /absolute/repository switch main
git -C /absolute/repository pull --ff-only
git -C /absolute/repository status --short

hanchou project resolve --path /absolute/repository
hanchou launch work
hanchou open orchestrator work
```

The Hanchou checkout and target repository need not be the current directory;
the absolute target path is the contract. After `open`, paste the request into
the Orchestrator pane. Tell L0 the target path, task, acceptance criteria, and
verification command. L0 resolves authorization, creates root/Leaf Beads, and
dispatches the Leaf. Each successful Leaf dispatch receives a unique branch,
worktree, Herdr workspace, Agent, report, and execution record.

For example:

```text
対象repo: /absolute/path/example-app
依頼: READMEのQuick startを実際のCLIに合わせて更新してください。
完了条件: 記載した手順が実環境で再現できること。
検証: make check
まず project resolve で登録を確認し、Leaf Taskへ委譲してください。
commitまでは行い、merge/push/PR作成はしないでください。
```

`project doctor` reports a missing registry as a safe deny-all state. The final
readiness check for a target is therefore `project resolve`; it must print
`dispatch ready: yes` before delegation.

## What is automatic

| Event | Hanchou behavior |
|---|---|
| L0 answers directly | No worktree is created |
| L0 dispatches a Leaf | Creates a unique branch, worktree, Herdr workspace, Agent, report, and execution record |
| Implementer succeeds | Commits the bounded result on the task branch and emits completion evidence |
| Task completes | Does not automatically merge, push, open a PR, or delete the worktree |

Use `hanchou execution inspect <bead-id> --json` to find the task branch and
worktree. Review its log/diff from the canonical repository, then let a human
perform the merge or explicitly authorize a separate integration step.

## Isolation boundary

Git worktrees isolate checkout files, index, HEAD, and the task branch. They
still share Git objects, refs, configuration, and hooks with the source
repository. Hanchou does not automatically merge, push, create a PR, or remove
completed worktrees.

`project resolve/doctor` disable Git optional locks, configured fsmonitor, and
hooks during their readiness checks. Configured clean/smudge/process filters
block readiness before `git status`, because status itself can execute a filter.
Configured fsmonitor, custom hook paths, and executable hooks are reported as
warnings for human review without being executed by the readiness check. A
later worktree checkout may legitimately use trusted repository integrations,
so a workspace-root grant must cover those Git settings as well as repository
files.

This registry is a dispatch boundary, not confidential-read or hostile-code
isolation. Same-user Agents ultimately share the host user's authority. Use a
separate OS user or Kingdom/VM for a hard secret boundary, and consider a full
per-task clone rather than a worktree when shared Git metadata is unacceptable.
