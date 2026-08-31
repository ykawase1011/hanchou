# Core E2E test plan

## 0. Onboarding and startup

1. From an ordinary terminal, verify `hanchou onboard work` is plan-only.
2. Apply `hanchou onboard work --yes`; verify the fixed workspace/registry
   modes and an idempotent second run.
3. Run `hanchou plan work`, `hanchou bootstrap work`, and `hanchou doctor work`.
4. Run `hanchou launch work`; verify the Dashboard opens and the Orchestrator
   exists in the named Herdr session.
5. Run a second launch and one overlapping start; verify the same recorded
   Orchestrator workspace/pane is reused and no duplicate is created. If legacy
   duplicate labels exist, verify launch fails closed or keeps the one live
   named Agent without closing any workspace automatically.
6. Review `hanchou stop-orchestrator work --all`; verify it closes nothing.
   Verify the plan prints one 64-character lowercase-hex token and the exact
   `--all --plan <token> --yes` command. Verify each row exposes process
   `PID:name`, additional count, and foreground cwd, and that the token binds the
   profile digest/resolved state paths plus target identities. Verify apply
   rejects a missing, malformed, wrong, or stale token, non-interactive input,
   and a managed-Agent caller before closing anything. Reject an unowned legacy
   shell with a non-Core foreground cwd or an additional process observed on the
   same TTY or as a shell descendant. Treat `observed_additional=0` only as the
   result of that best-effort scan, not proof that all same-session processes
   are absent; verify Agent-occupied rows use `observed_additional=n/a` because
   their OS shell is not scanned.
   Apply the exact printed command and verify only fully validated dedicated
   Orchestrator workspaces close, the bound one closes last, unrelated/worktree
   spaces remain, and lifecycle files survive any partial failure. After
   target-state drift or a partial close, verify the error distinguishes
   `closed`, `remaining`, and unverifiable `uncertain` outcomes, the old token
   fails, and a read-only replan provides the new token. Apply it, then start
   exactly one clean Orchestrator. Record the Herdr 0.8.2 limitation that final
   revalidation and workspace close are not one conditional operation, and
   verify the human-facing plan describes apply as approval to terminate the
   complete target PTY/process session.
7. Verify the Dashboard shows Herdr/Beads/Relay/workspace summary, changes no
   durable state, and refuses non-loopback or state-changing HTTP access.
8. Ask L0 for active/blocked Beads Tasks and live Herdr execution Agents; verify
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
