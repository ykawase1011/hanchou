# Task model

## Source of truth

Beads is the only Task source of truth. Initial mode is embedded Dolt with one
autonomous writer: the Orchestrator. Human edits through beads-ui are allowed.
Workers and Mission Leads report through Relay rather than directly mutating the
global graph.

## Command surface

Use `bd` directly for the Task graph. Hanchou does not add generic Task CRUD.
The planned `hanchou execution` surface begins only where one operation must
atomically bind a Bead to a Herdr execution and later reconcile it.

## Mapping

- Epic: large user request or mission.
- Task: one delegated unit.
- Decision: human choice required to unblock work.
- `blocks`: execution dependency.
- parent-child: hierarchy only.
- `discovered-from`: newly found work.

## Metadata

`hanchou.task.v1` stores:

- profile/project/repository;
- execution mode and owner;
- Herdr session/agent/workspace/pane binding;
- routing provider/model/reason/usage snapshot;
- Automation link;
- reporting policy、renderer、destination、coalescing、origin.

## Lifecycle

```text
open → in_progress → blocked / closed
```

Hanchou adds operational checks:

1. Create the Bead before visible Agent spawn.
2. Bind Herdr IDs after successful spawn.
3. Worker emits Relay event and artifact.
4. Owner verifies acceptance criteria.
5. Update/close Bead.
6. If reporting policy requires output, create/publish Delivery.
7. Acknowledge the Inbox event.

A root user Task with `on_terminal` is not operationally finished until its
terminal outcome has been delivered or explicitly waived.
