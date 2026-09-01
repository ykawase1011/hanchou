# Core E2E test plan

## 0. Instance, onboarding, update, and startup

Automated fixture coverage for this v2.4.0 contract lives in
`tests/test-instance.sh`; this section also defines target-Mac live acceptance.

1. From an ordinary terminal with isolated operator home and local public Git
   fixtures, invoke the trusted seed Core executable's exact path for
   `hanchou init work`. Verify it downloads and validates the
   exact candidate Core/Skills pair and prints a 64-character token plus exact
   apply command using that same seed executable path, while leaving no
   deployed instance, launcher, managed checkout, shelf, or registry mutation.
   Because validation executes candidate mise/npm/make code, reject
   Agent/non-TTY prepare as well as apply. Reject missing, malformed, wrong, or
   stale tokens, candidate or registry drift, and a target path that appears
   after plan. Apply the exact printed command and verify this topology:

   ```text
   ~/HanchouWorkspace/work/
   ├── bin/hanchou
   ├── hanchou/
   ├── hanchou-skills/
   └── repositories/
   ```

   Verify init apply reused bounded onboarding so the shelf is already
   registered for worker dispatch. Verify the launcher is an executable regular
   file rather than a symlink and fixes `work` plus the exact instance root
   despite conflicting caller environment. Verify Core and Skills are clean
   detached checkouts at their independent exact commits, outside
   `repositories/`, and that candidate Core
   was validated against sibling candidate Skills, including expected Skills
   VERSION, byte-identical shared `hanchou-cli`, and configured public-Skill
   presence. Verify validation uses a fresh temporary HOME/XDG tree, strips
   common GitHub-token and HTTP-proxy variables, ignores ambient Git config,
   disables npm install scripts, and is still honestly described as unsandboxed
   candidate `make check` execution. Production CLI wiring must accept only the
   two official HTTPS remotes and `refs/heads/main`; a direct
   dependency seam may substitute local Git fixtures only in tests.
2. Verify init is idempotent for an already valid instance, retains existing
   repository shelf contents, and does not silently update either commit.
   Verify an uninitialized root accepts only a retained `repositories/` shelf
   and optional empty `.hanchou/`; reject every other unknown root entry and a
   non-empty uninitialized control directory. Verify conflicting paths,
   symlinks, owner/mode violations, dirty managed checkouts, remote/ref mismatch,
   unapproved local Git config/hooks, replace/alternate object indirection,
   hidden index flags, and partial candidate validation fail without discarding
   user content or leaving a successful half-instance.
3. Verify `./bin/hanchou project list --json` shows the init-created fixed shelf.
   Verify separately callable `./bin/hanchou onboard` is plan-only and
   `./bin/hanchou onboard --yes` revalidates/reapplies the same authority
   idempotently without duplicate registry entries.
4. Run local `plan`, `bootstrap`, and `doctor`. Verify diagnostics identify the
   active profile-local root and exact managed pair and do not claim same-user
   integrations are profile-isolated. Run `launch`; verify the Dashboard opens
   and exactly one Orchestrator exists with cwd equal to the exact profile root.
5. Update tests:
   - plan fetches both fixed `main` tips and prevalidates the exact candidate
     pair, but does not change current checkout commits or deployment metadata;
   - prepare is rejected for Agent/non-TTY callers because it executes candidate
     validation code;
   - the token binds root/profile, fixed remotes/ref, current pair, candidate
     pair and candidate versions, and project registry digest;
   - malformed, exchanged, stale, Agent/non-TTY, dirty, mismatched, or drifted
     apply attempts change nothing;
   - if upstream moves after plan, apply activates the reviewed pair rather than
     re-resolving latest;
   - successful apply leaves both checkouts clean/detached, records the previous
     pair, runs bootstrap and doctor, and records success only after pair health
     succeeds;
   - candidate validation failure and switch interruption never report half-pair
     success; bootstrap/doctor failure automatically attempts restoration and
     revalidation of the original pair, while failed recovery leaves a durable
     transaction that blocks automatic rollback and other lifecycle commands
     until human-inspected consistent checkout/metadata repair; deleting the
     journal alone must not be documented as repair;
   - equal current/candidate is a no-op that does not corrupt previous history.
6. Rollback tests: prepare is human-TTY-only, and plan/apply restores the exact
   previous Core/Skills pair, records the displaced current pair as the new
   previous pair, and reruns bootstrap/doctor. Verify no previous pair, dirty
   state, stale token, and half-switch failures are safe;
   one-side and arbitrary-commit rollback do not exist. Verify no background
   updater or implicit latest activation is installed. Verify apply never calls
   stop-orchestrator, bootstrap may still reload changed services, and output
   requires an explicit L0 restart for changed instructions.
7. Create two profile instances at different pairs. Run update/bootstrap
   serially because the CLI does not provide hard cross-profile isolation.
   Verify each doctor exposes the active local pair and any observable shared
   integration drift, and that documentation recommends a separate OS user/VM
   rather than claiming hard independence.
8. Run a second launch and one overlapping start; verify the same recorded
   Orchestrator workspace/pane is reused and no duplicate is created. If legacy
   duplicate labels exist, verify launch fails closed or keeps the one live
   named Agent without closing any workspace automatically.
9. Review `stop-orchestrator --all`; verify it closes nothing.
   Verify the plan prints one 64-character lowercase-hex token and the exact
   `--all --plan <64hex-token> --yes` command. When invoked through the
   profile-local launcher, verify that exact command preserves its absolute
   launcher path; seed/development invocation may use the documented bare
   fallback. Verify each row exposes process
   `PID:name`, pane-reported `cwd`, every foreground process
   `process_cwds=PID:name@cwd`, and `observed_additional`, and that the token
   binds the profile digest/resolved state paths, approved workspace-root list,
   and target identities. Verify apply rejects a missing, malformed, wrong, or
   stale token, non-interactive input, and a managed-Agent caller before closing
   anything. Reject an unowned legacy
   shell whose cwd does not exactly equal an approved root or an additional
   process observed on the same TTY or as a shell descendant. Treat
   `observed_additional=0` only as the result of that best-effort scan, not proof
   that all same-session processes
   are absent; verify Agent-occupied rows use `observed_additional=n/a` because
   their OS shell is not scanned.
   Verify each default refusal for a busy foreground, observed background
   process, unavailable OS scan, or stale pane authority suggests only the
   read-only `--all --include-unmanaged` plan. Verify that
   explicit mode labels only unbound/no-Agent-record overrides
   `UNMANAGED-ACTIVE`, prints process, foreground/base cwd, observed count and
   sorted reasons, warns about whole-session termination, and emits an exact
   flag-preserving apply command. Default/include tokens must differ and fail
   when exchanged; activity drift must invalidate the include token before the
   first close. A pane or foreground-process cwd that does not exactly equal one
   approved root must remain a hard refusal in include mode. The flag must not
   override a bound pane, foreign/multiple Agent,
   Agent-list/direct-lookup disagreement, approved-root-external cwd, multi-pane
   shape, worktree, moved binding, opaque-ID inconsistency, or malformed Herdr
   `pane process-info` result type, foreground PID/PGID/TTY, or process records.
   Verify `process_scan_unavailable` applies only to the later OS process-table
   scan and does not bypass that Herdr response validation.
   Verify only the exact profile root and explicitly metadata-recorded pre-2.4
   bootstrap Core root are approved during migration; after a new profile-root
   workspace is created, the legacy allowance is cleared.
   Apply the exact printed command and verify only fully validated dedicated
   Orchestrator workspaces close, the bound one closes last, unrelated/worktree
   spaces remain, and lifecycle files survive any partial failure. After
   target-state drift or a partial close, verify the error distinguishes
   `closed`, `remaining`, and unverifiable `uncertain` outcomes, the old token
   fails, and a read-only replan provides the new token. Apply it, then start
   exactly one clean Orchestrator. Record the Herdr 0.8.2 limitation that final
   revalidation and workspace close are not one conditional operation, and
   verify the human-facing plan describes apply as approval to terminate the
   complete target PTY/process session. In a mixed include-mode set, verify
   unmanaged targets close first and the bound target closes last; partial
   retry guidance must retain `--include-unmanaged` and require a new token.
10. Verify the Dashboard shows Herdr/Beads/Relay/workspace summary, changes no
   durable state, and refuses non-loopback or state-changing HTTP access.
11. Ask L0 for active/blocked Beads Tasks and live Herdr execution Agents; verify
   it checks both sources and explicitly reports zero when empty.

## A. Intake and immediate acknowledgement

1. Send a task to L0.
2. Verify a root Bead is created.
3. Verify L0 replies with Task ID before worker completion.
4. Verify L0 becomes idle and accepts another request.

## B. Visible worker

1. Resolve the target through the human-owned project registry.
2. Verify an unregistered/mismatched repo fails before WAL, Bead claim, Git, or
   Herdr effects.
3. Dispatch an authorized Leaf.
4. Verify Herdr worktree/workspace/Agent binding metadata.
5. Verify correct Role and Terra/Sonnet route.
6. Verify worker cannot mutate global Task/Schedule state by policy.

## C. Later-turn completion

1. Worker writes artifact and emits completed Relay event.
2. Verify event is durable before nudge.
3. Verify L0 is not held in a wait loop.
4. Verify idle/done transition causes a new L0 turn.
5. Verify acceptance criteria, Bead close, Delivery, Inbox ack.
6. Verify user sees one root completion report.

## D. Failure and Decision

- failed event produces `on_terminal` report;
- needs_decision bypasses coalescing and appears immediately;
- child event goes to Mission Lead, not L0;
- raw transcript is not propagated.

## E. Crash/restart

- kill worker after Bead claim;
- kill L0 after Inbox claim;
- restart Herdr with pending Inbox;
- expire lease and recover;
- complete Bead with pending Delivery;
- ensure no silent loss or duplicate user report.

## F. Schedule and digest

- new-agent schedule produces artifact/event;
- sleep catch-up within window;
- repeated run dedupe;
- on_failure suppresses success;
- on_change suppresses unchanged result;
- daily digest reports every run and includes control-plane sections;
- existing-orchestrator wake uses same logical L0.

## G. Usage routing

- Codex pressure shifts flexible code work to Sonnet;
- Claude pressure shifts flexible research to Terra;
- Writer/Editor remain Codex;
- stale snapshot preserves default route.
