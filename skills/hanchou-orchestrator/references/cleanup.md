# Completion and resource cleanup

Before acceptance, reconcile the latest request and critical guidance with the
actual artifact/diff and verification evidence. Preserve or integrate needed
committed, uncommitted, and untracked results, then verify their destination
against the source before deleting any sole copy. A worker's settlement does
not itself prove user acceptance or successful integration.

After accepted settlement, follow the live lifecycle guide: reuse a proven
worker for an immediate next Task, retain only on explicit user request, or
release through `worker-release`. Avoid accumulating idle retained workers.
Follow an uncertain release receipt exactly; never substitute raw terminal close.

Cleanup has separate scopes. Check each that the task actually created:

- **Worker:** verify the release/reuse receipt and resulting ownership. Count
  current live terminals/sessions through official inventory, not historical
  Dispatch rows. On reuse, reconcile the old attempt, new owner, and actual
  terminal inventory before saying the old resources are gone.
- **Setup and workspace:** worker release does not promise their deletion.
  Inspect Setup and configured tabs; reclaim only task-owned, finished/unused
  terminals whose exit is confirmed and whose removal is authorized. Before
  official workspace removal, verify the exact target, deletion authority,
  preserved results, and absence of other owners. Keep a workspace containing
  sole unintegrated work, and report the reason and next owner.
- **Services:** identify compose services, proxies, and background processes the
  task launched from startup receipts and current process/service observations.
  Stop only proven task-owned services no longer needed using their supported
  control surface. Do not broadly kill a port owner, delete shared services, or
  remove persistent volumes. An occupied port alone does not prove ownership.

Inspect real command exit codes and each stage's result, including pipeline or
wrapper failures. A wrapper's successful exit does not prove that its child
started; a port collision cannot be reported as successful validation. Verify
the task-owned service stopped and its specific endpoint/port was released where
applicable. Workspace removal is not evidence that detached services exited.

Report cleanup as completed, intentionally retained (reason/owner), or unknown
per relevant scope. Missing ownership evidence or deletion authority preserves
the resource; ask only for the missing decision. Use public Orca operations for
Orca resources and the live recovery guide for lifecycle actions, without adding
a Hanchou collector or treating absence as exit.
