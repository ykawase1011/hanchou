---
name: hanchou-init
description: >-
  Initialize or update a project's Hanchou responsibilities and sokkin startup
  configuration when explicitly requested. Does not launch agents or scheduling.
metadata:
  version: 2.0.0
---

# Initialize Hanchou

Select the exact Git project root. Resolve existing `.hanchou` paths/symlinks
before writing; preserve existing policy text and custom settings. A selected
external/shared destination must not be overwritten as if it were local.

Record settled authority, completion checks and reporting preferences in
`.hanchou/policy.md`, using [the policy template](assets/policy-template.md)
only for relevant sections. Use the user's language and preserve an existing
policy's language unless a translation was requested. Ask only for material
missing choices; settled instructions need no second confirmation.

Write `.hanchou/config.json` with `version: 2` and `sokkin.agent` (`codex` or
`claude`) plus optional `sokkin.model` (null means the CLI's configured default).
Select the agent with the user; never infer consent to API billing from a model
choice. Claude is subscription-only. Configuration is JSON data, not shell code.
Budget and allowed model choices may be recorded in `policy.md` or the mission.
Optional `sokkin.effort` is `low`, `medium`, `high` or null; null/omission uses the
CLI default. Pin a supported low effort for routine work rather than inheriting
a costly default without checking. Verify the actual model/effort after startup.

Example:

```json
{"version":2,"sokkin":{"agent":"codex","model":null}}
```

Keep local configuration ignored by default through the repository's actual
`git rev-parse --git-path info/exclude`; preserve an explicit versioned/shared
choice and already tracked files. Do not change shared `.gitignore` or global
settings merely to initialize a project. Never store credentials in `.hanchou`.

Report source paths, chosen agent/model and delegated authority. Readiness also
requires Git, Bash, jq, Herdr and official agent CLI/auth plus qualified usage
measurement. Initialization does not create a worktree, start an agent, install
Herdr, activate a schedule or delete old `.hanchou` artifacts.
