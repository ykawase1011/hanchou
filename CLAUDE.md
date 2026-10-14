# Hanchou repository instructions

Read `AGENTS.md`. Hanchou v3 distributes provider-neutral Orca skills that work from
both Claude and Codex sessions.

Use `AGENTS.md`'s human-main/Hanchou-child preference for future interactive and
cron coordinators as well as supervised workers, reviews, and retries, unless
explicitly overridden. Verify intended parent, host, and project against the
selector, receipt, and actual workspace lineage. Preserve the current
conversation/Run and pinned sources; only supervised workers belong to their
coordinator's existing Run. The preference grants no cron activation authority.
