# Roadmap

## M0 — Final design and static scaffold

- Herdr + Beads + Relay architecture;
- Codex L0 and Role definitions;
- reporting/digest contract;
- public Skills and secret-free Kingdom;
- static validation;
- thin CLI boundary and shared `hanchou-cli` Skill.

## M1 — Local Core visibility

- Herdr session and Orchestrator visible;
- beads-ui and optional herdr-beads visible;
- pinned Automations board visible;
- manual Task/worker smoke test.

## M2 — Durable execution bridge

- implemented `hanchou execution` Bead dispatch, inspect and reconciliation;
- write-ahead execution record, worktree and Agent binding;
- completion artifact contract;
- live restart/orphan E2E and cancellation remain.

## M3 — Later-turn completion reporting

- Relay event-driven wake;
- root terminal reporting;
- Decision/failure notification;
- Delivery lifecycle and receipts.

## M4 — Cron and digest

- typed schedule CRUD;
- same-Orchestrator schedule wake;
- daily/weekly digest;
- on_change/on_failure policies;
- miss/failure health reporting.

## M5 — Operational hardening

- crash, sleep, duplicate, blocked, lost-agent E2E;
- backup/rollback/reprovision;
- work/personal and optional remote deployment.

## M6 — hanchou-chat

- write ADR and select transport;
- Slack/Discord allowlisted ingress;
- channel/thread Delivery adapter;
- no Task/Cron/session ownership in Chat layer.
