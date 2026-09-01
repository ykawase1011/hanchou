# Session handoff — Hanchou Core implementation

## Goal

Finish release validation, migrate the target Mac, and live-test the Core only.
Do not select or build Slack/Discord yet.

## Read in order

1. `HANCHOU_SPEC.md`
2. `docs/DECISIONS.md`
3. `docs/PLANNING.md`
4. `docs/CORE_E2E_TEST_PLAN.md`
5. `docs/RELAY.md`
6. `docs/REPORTING.md`
7. `docs/EXECUTION_BRIDGE.md`
8. `docs/CLI_AND_SKILL_BOUNDARY.md`

## Fixed architecture

```text
Herdr runtime
mise-managed Herdr 0.8.2 / Node.js 22
Beads Task source
beads-ui standard GUI
Hanchou loopback read-only status Dashboard
herdr-beads optional Herdr board
herdr-automations Cron source
Codex Sol L0
Relay Inbox + Delivery
profile-local regular launcher
managed Core + Public Skills exact commit pair
exact profile-root Orchestrator cwd
```

## Critical behavior

- L0 replies immediately and never waits for long worker execution.
- Worker completion starts a later turn in the same logical Orchestrator session.
- Beads is updated before Inbox ack.
- Root Task reporting policy decides whether a Delivery is required.
- Daily digest is bounded control-plane work.
- L2 defaults to Terra/Sonnet; Japanese draft/final review stays Codex.
- Use upstream CLIs directly for single-system operations; use `hanchou` only for
  Hanchou-owned or cross-system mechanics.
- One Orchestrator exists per profile, with the exact profile root as cwd and
  explicit direct read/write scope to the whole profile tree.
- Managed Core and Public Skills are sibling clean detached checkouts, updated
  and rolled back only as one reviewed exact commit pair.

## v2.4.0 implementation status

The v2.4.0 CLI implements `init`, `update`, `rollback`, paired Core/Public
Skills metadata, the profile-local launcher, and profile-root Orchestrator
lifecycle. Automated fixture coverage is in `tests/test-instance.sh` and the
updated launch lifecycle tests.

1. Bare `hanchou init <profile>` downloads/validates candidates and prints an
   exact token plan using the same seed Core executable path, without a deployed
   instance/shelf/registry mutation.
   Prepare itself is ordinary-human-TTY-only because validation runs candidate
   mise/npm/make code.
   Ordinary-TTY `init <profile> --plan <token> --yes` creates this topology and
   registers its fixed shelf through bounded onboarding:

   ```text
   ~/HanchouWorkspace/<profile>/
   ├── bin/hanchou
   ├── hanchou/
   ├── hanchou-skills/
   └── repositories/
   ```

   The launcher must be a regular file fixed to root/profile. Core and Skills
   must be clean detached exact commits from the fixed official HTTPS remotes
   `https://github.com/ykawase1011/hanchou.git` and
   `https://github.com/ykawase1011/hanchou-skills.git`, both
   `refs/heads/main`. Refuse conflicts, symlinks, dirty/mismatched checkout
   state, candidate/registry/target drift, and partial setup fail without
   deleting user content. Valid re-init is idempotent and not an update;
   `onboard` remains separately callable for the same fixed authority.
2. Pair metadata and the instance lock record independent exact current and
   previous commits. Candidate Core is validated against sibling candidate
   Skills; one-side activation/rollback is not exposed.
3. Local update/rollback prepare is also ordinary-human-TTY-only. Exact-token
   apply journals activation, preserves reviewed commits across upstream
   movement, and runs bootstrap/doctor. Failure attempts automatic restoration;
   incomplete recovery stays journaled and blocks automatic rollback/lifecycle
   commands until a human consistently repairs both checkouts and metadata.
   Apply does not deliberately close the L0 workspace, though bootstrap may
   reload changed services; explicitly restart L0 to load changed instructions.
   No automatic latest daemon or dirty implicit reset is installed.
4. New Orchestrator creation, binding, adoption, stop containment, token
   identity, and diagnostics use exact profile-root cwd and the current pair.
   Legacy Core roots are migration-only containment inputs.
5. L0 has explicit whole-tree access; worker dispatch outside the fixed grant is
   deny-by-default. Same-user global integrations remain shared and may be
   last-bootstrap-owned, so the operator serializes cross-profile
   update/bootstrap and follows it with doctor. The instance lock is not a
   global coordinator.

Remaining operational work is the target-Mac cutover and live E2E below. Run
the full `make check` release gate before distributing the versioned artifacts.

## Current target-Mac handoff

Existing pre-2.4.0 installations use an external Core checkout as Orchestrator
cwd. Prefer stopping the old L0 with the old checkout and old command semantics
before creating/cutting over to the new profile-root instance.

From the old trusted checkout, first review the old stop plan and use only its
exact apply command if every listed workspace may be terminated. If automatic
containment refuses, inspect and close only human-verified old rows in the full
Herdr TUI. Preserve unrelated workspaces, repositories, state, and worktrees.
After all old L0s for the profile are confirmed absent, run the implemented
bare `init work`, review/apply its exact token command, bootstrap/doctor the
local instance, then start exactly one new L0
whose cwd is `~/HanchouWorkspace/work`.

If pre-init cleanup is not possible, init metadata records its exact bootstrap
Core checkout as a migration-only approved root. The new local launcher may
adopt or stop an old workspace only when it uses that exact recorded root and
passes all other containment checks; it never force-closes an arbitrary old
cwd. Creating the new profile-root workspace clears the legacy allowance.

Do not run manual `git pull` in either new managed checkout. After cutover,
updates and recovery use only the new local pair-aware `update`/`rollback`
plan/apply.

### Legacy pre-cutover cleanup details

The commands below describe the pre-2.4.0, old-Core-cwd stop flow.
They are intentionally run from the old checkout before `init`; they are not the
new profile-root lifecycle contract. After cutover, a stop plan invoked through
the profile-local launcher preserves that launcher's absolute path in its exact
apply/retry command; this pre-init seed flow may use the bare fallback shown
below.

If the human confirms that every same-label Orchestrator workspace may be
terminated, use `hanchou stop-orchestrator work --all` to review the exact IDs,
then copy the exact `--all --plan <64hex-token> --yes` command printed by that
plan into the ordinary interactive terminal. The token is bound to the reviewed
target snapshot. Any relevant state change, including a partial close, requires
a fresh plan and token; never retry the old token. The command validates every
target before the first close and revalidates each target, but Herdr 0.8.2 has
no conditional close, so a short revalidate-to-close TOCTOU window remains.
On Darwin, the legacy check's same-TTY/shell-descendant scan does not enumerate
every same-session process. Apply is human approval to terminate the target
PTY/process session; use manual TUI cleanup if that cannot be approved. Start
one clean L0 with `hanchou start-orchestrator work` afterward. TTY/Agent checks
and the token are defense-in-depth, not a complete same-user security boundary.

If the default plan refuses only an unbound, no-Agent-record legacy pane's
activity and the human explicitly approves terminating its whole pane OS
session, replan with
`hanchou stop-orchestrator work --all --include-unmanaged`. Review every
`UNMANAGED-ACTIVE` row and copy only its
exact flag-preserving token command. The option does not relax label, approved
base/current/process cwd, one-tab/one-pane, no-worktree, ID/binding,
real-Agent containment, or
Herdr `pane process-info` schema validation. Review pane-reported `cwd` and all
`process_cwds` evidence; any cwd that does not exactly equal the profile root or
an explicitly recorded legacy root is a hard refusal. Its
`process_scan_unavailable` reason refers only to the later OS scan.
After drift or partial failure, replan with `--include-unmanaged`; never retry a
default-mode token or drop the flag. Otherwise use manual TUI cleanup.

The Core goal remains open until that live Agent answers the initial status
query using both Beads and Herdr and explicitly reports zero for empty active,
blocked, and delegated-task results.

## Do not change without explicit decision

- no second Task/Cron/runtime;
- no permanent three-layer workflow;
- no direct L2→L0 in mission mode;
- no secrets in hanchou-kingdom;
- no Chat library selection before Core E2E.
