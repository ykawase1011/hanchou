# Initialize a project responsibility policy

`hanchou-init` is an optional, instruction-only setup helper. Invoke it for a
specific project when you want Hanchou's standing responsibilities written down.
Installing it starts no Hanchou session, Run, worker, or Automation. A project
without a policy remains usable for ordinary explicit requests.

1. Identify the exact target project root and ask `hanchou-init` to discuss
   responsibilities and permission conditions. The default source is
   `.hanchou/policy.md` at that root; you may explicitly choose another source.
2. Review the concrete proposed policy. Set project responsibilities and, when
   useful, **permit** (`allow`), **ask** (`ask each time`), or **do not do** for edits, PRs, merges, and
   publication/deployment. Add project conditions and reporting requirements.
   An unset action asks for a decision only if a later task needs it.
3. Approve writing that static file. The helper writes only the approved policy
   and the target repository's local Git `info/exclude` entry when needed. It
   does not edit shared `.gitignore`, `AGENTS.md`, `CLAUDE.md`, global settings,
   or Automations, and it does not activate Hanchou.

The helper resolves the selected destination, including symlinks at the default
path, before writing. It reports an external or shared destination for a
specific decision instead of silently overwriting it.

Codex example: `$hanchou-init を使って、このprojectのHanchou責任方針を初期化してください。`
For Claude Code, use `/hanchou-init`. Starting Project Hanchou remains a
separate explicit `$hanchou-orchestrator` or `/hanchou-orchestrator` request.

The default policy is local and commonly ignored. Git's `info/exclude` path
must be discovered with `git rev-parse --git-path info/exclude`, since linked
worktrees can store it outside the visible checkout's `.git` entry. An ignored
file does not appear in a fresh worktree, clone, or remote host. Select an
explicit stable source or place a reviewed copy where that session can read it;
do not expect Hanchou to discover a sibling worktree's copy. If a selected
policy source goes missing, Hanchou stops the affected work and reports it.

Cron setup may pin this policy as a **separate** source in the registered
Automation prompt. Each occurrence reads that pinned source once and applies
its current restrictions within the approved job scope. Initializing a policy
later does not retrofit existing Automations; explicitly update each schedule
that should adopt it. A policy file edit cannot expand an existing Task or job.
