# Core E2E test plan

## A. Intake and immediate acknowledgement

1. Send a task to L0.
2. Verify a root Bead is created.
3. Verify L0 replies with Task ID before worker completion.
4. Verify L0 becomes idle and accepts another request.

## B. Visible worker

1. Dispatch a Leaf.
2. Verify Herdr worktree/workspace/Agent binding metadata.
3. Verify correct Role and Terra/Sonnet route.
4. Verify worker cannot mutate global Task/Schedule state by policy.

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
