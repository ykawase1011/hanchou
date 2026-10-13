# Hanchou repository instructions

Read `AGENTS.md`. Hanchou v3 distributes provider-neutral Orca skills that work from
both Claude and Codex sessions.

For supervised Hanchou development here, use the dedicated worker workspace
preference in `AGENTS.md` for implementation, investigation, independent review,
retries, and added workers unless the user explicitly overrides it. Carry the
resolved preference into each Task spec and verify the launch receipt's actual
workspace differs from the coordinator checkout while remaining in the same Run.
