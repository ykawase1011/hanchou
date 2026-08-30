# Task model

## Source of truth

Beads is the only Task source of truth. Initial mode is embedded Dolt with one
autonomous writer: the Orchestrator. Human edits through beads-ui are allowed.
Workers and Mission Leads report through Relay rather than directly mutating the
global graph.

## Command surface

Use `bd` directly for the Task graph. Hanchou does not add generic Task CRUD.
The `hanchou execution` surface begins only where one operation must
coordinate a WAL-backed Bead claim and Herdr binding and later reconcile it.

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

1. Resolve human-owned project authority and copy its exact project ID and
   canonical repository into the child Bead.
2. Create the Bead before visible Agent spawn.
3. Revalidate authority before dispatch WAL, claim, Git, or Herdr effects.
4. Bind Herdr IDs after successful spawn.
5. Worker emits Relay event and artifact.
6. Owner verifies acceptance criteria.
7. Update/close Bead.
8. If reporting policy requires output, create/publish Delivery.
9. Acknowledge the Inbox event.

A root user Task with `on_terminal` is not operationally finished until its
terminal outcome has been delivered or explicitly waived.
