# Scheduled work with hanchou-cron

`hanchou-cron` is an optional instruction-only helper for an explicit request to
create, inspect, change, pause, or remove an Orca Automation. It works from an
ordinary Codex or Claude Code session without activating a Hanchou Run during
configuration. Orca owns the schedule, timezone, enabled state, run history,
delivery, and session lifecycle; the helper uses the installed Orca CLI's live
guide. A requested manual trial may start the selected Hanchou job.

## Choose the purpose and job

| Purpose | Target and completion |
| --- | --- |
| Continue an unfinished request | Target its **original conversation and Run**. Stop unnecessary checks when that request completes or the user stops them. This requires a qualified public wake contract; the existing Automation session-reuse option does not establish it. If unavailable, report this mode as unsupported and do not substitute a fresh session. |
| Independent recurring job | Run the selected job as its own Temporary Hanchou. Each run can finish while the Automation remains scheduled until explicitly paused or removed. Do not take over an unrelated Run in the same project. |

A project may define several jobs. Use one static Markdown file per job at the
standard candidate `.hanchou/cron/<job>.md`, or an explicitly selected path that
fits the project's conventions. A definition names the job, purpose, mode,
project scope, concrete checks or work, per-run completion, reporting conditions,
and relevant operating documents. It may suggest a frequency, but Orca's stored
Automation is authoritative. Keep credentials, mutable Run/Task/Dispatch/terminal
IDs, and execution history out of the file. Project `AGENTS.md` may point to the
definitions, but must not cause ordinary conversations to schedule or start
Hanchou automatically.
If original-conversation continuation becomes publicly supported, its original
request and Run policy can define that check without a new project job file.
Start from the shipped [job template](../skills/hanchou-cron/assets/job-template.md)
and fill in the project-specific content; this repository does not maintain a
second copy of that template.

At setup, identify the exact project, host, Orca workspace or repository source,
and selected relative definition path. The Automation prompt must carry that
identity. At each run, read that file from the selected source and use the
content read at the start of that run. An ignored local definition exists only
in the workspace that holds it; another worktree of the same repository does not
inherit it. Pin and verify that workspace as the definition source. The
Automation may execute in another workspace or a fresh worktree if it can read
the pinned source on the selected host. If it cannot, choose a source accessible
to the run before registration. Never resolve an identically named file
from whichever worktree happens to be active. Missing, unreadable, or ambiguous
definitions are configuration errors to report, not permission to use another
project's file or a generic job.

## Configure and verify

Before saving, agree on the purpose, job, target, frequency, timezone, allowed
actions, reporting conditions, and stop condition. Inspect Orca's existing
Automations and the selected target so a retry or uncertain result does not
create a duplicate. Create a new schedule disabled, read it back, run a manual
trial, inspect history and the actual result, then enable it when requested.
An ordinary request to register a scheduled job includes a bounded trial
within the approved scope and enablement after a verified result. A request for
a draft or disabled schedule ends before activation. If a representative trial
is unavailable or its ownership or result remains uncertain, leave it disabled
and explain the limit; testing does not grant extra authority for job effects.
Changes, pause, and removal use Orca's public Automation operations and
read-back. Distinguish the check frequency from notifications: report changes,
user decisions, failures, and completion according to the agreed conditions.

Changing a definition can change the next run's work **within** the previously
authorized scope. It does not change Orca's schedule or expand permission to
merge, publish, or take other gated actions. Frequency changes and wider
authority require an explicit configuration decision. If multiple schedules or
settings could match, stop and identify the exact Automation before editing or
sending a result. Preserve user decision gates even when the Automation runs
unattended. Public list, history, and Run inspection do not provide an atomic
overlap lock or a documented general mapping from an Automation occurrence to
its Hanchou Run. If receipts cannot establish ownership, stop and report the
uncertainty before creating work. Do not claim a race-free duplicate guarantee.

Codex request example:

```text
$hanchou-cron を使って、このprojectの `.hanchou/cron/morning-review.md` にある
独立した定期業務を毎朝9時に設定してください。対象workspace、timezone、許可範囲、
報告条件を確認し、disabledで登録して手動試行の結果を見せてください。
```

Claude Code uses the same request with `/hanchou-cron` in place of
`$hanchou-cron`. A continuation request must identify its original conversation
and Run; if the installed Orca contract cannot wake that exact target, report
that limit separately from independent-job support. See
[Automations](AUTOMATIONS.md) and the
[continuation design](../skills/hanchou-orchestrator/references/continuation.md).

## Acceptance scenarios

These are review cases for the instruction policy. They do not claim that a
model or live Automation has passed an end-to-end run.

| Case | Setup | Expected result |
| --- | --- | --- |
| Two projects, multiple jobs | Projects A and B each have distinct jobs; A has `morning-review` and `weekly-triage`. | The selected project, source workspace, and job path stay attached to each schedule and run. Choosing A's `weekly-triage` cannot load A's other job or B's same-named file. |
| Separate worktrees | A definition is ignored locally in worktree A and absent from execution worktree B. | An Automation targeting B reads A's file when A is the explicitly pinned, accessible source. If A is missing or unreadable, it reports a configuration error without using a same-named file in B or copying the definition. |
| Definition edited | A job document adds new work, asks for publishing authority, and suggests a new frequency. | The next run reads its current business instructions only within the original authority. Orca's schedule remains unchanged, and publishing remains gated until explicitly approved and configured. |
| Missing or unclear definition | The selected file is absent, unreadable, or names no clear job. | Report a configuration error for that job without substituting generic work or another project's definition. |
| Ambiguous settings after uncertain send | A create or edit call times out and two plausible Automation records appear. | Inspect Orca settings, history, and result before another mutation; ask for exact target if identity remains ambiguous and create no duplicate schedule. |
| Unqualified ownership or overlap | A run receipt cannot be tied to a specific Hanchou Run, or another occurrence may be starting concurrently. | Stop and report uncertain ownership before creating work. Public inspection can reduce duplicate risk but cannot guarantee atomic exclusion. |
| Unsupported continuation wake | The installed public contract can run a fresh Automation session but cannot wake the original interactive conversation and Run. | State that continuation mode is unsupported; do not claim `--reuse-session` proves it or start a fresh replacement Run. Independent-job support is assessed separately. |
| Job completion | An independent daily job finishes its current run; a continuation check finds its original request complete. | The independent schedule remains active until paused or removed. Stop unnecessary continuation checks after verified completion or user stop. |

## Validation record (2026-10-13)

| Check | Result | What it establishes |
| --- | --- | --- |
| `make check` | Passed: structure validation and 15 repository contract tests. | The five-skill distribution and repository policy checks pass. |
| `make check-installer` | Passed in a disposable Node 22 Docker container with `skills@1.7.2`. | Codex and Claude Code global and project installs include `hanchou-cron`; a targeted reinstall preserves other skills and a core-only sibling stays core-only. |
| `skill-creator/scripts/quick_validate.py skills/hanchou-cron` | Passed with PyYAML in a disposable `uv` environment. | Skill naming, frontmatter, and scaffold validation pass. |
| Independent forward review | Six synthetic scenarios assessed: selected project/job, edited definition, continuation, uncertain create, overlapping occurrence, and missing source. | Instruction policy was reviewed against the installed public Orca guides; these scenarios were not executed as live Automations. |
| Manual Orca smoke | One disabled Claude Automation created a fresh worktree for a manual run and completed. History output contained `HC_CRON_SMOKE_V1`, read from the pinned source workspace; that marker was absent from the saved prompt and execution worktree. The unrelated interactive Run remained untouched. | This verifies one manual independent-job path, not scheduled firing or general occurrence-to-Run correlation. |

While dispatched, the Automation history terminal PTY matched the PTY in public
terminal details; that terminal's handle matched the Hanchou Run's coordinator
handle, establishing exact linkage for this occurrence. Completed history
cleared the terminal fields, and the Hanchou Run has no direct Automation run
ID, so that linkage requires
the dispatched receipt. The disabled daily schedule was edited by one minute
and read back, then removed; the trial worktree and source fixture were also
removed. No recurring schedule remains; the lightweight Hanchou Run record does.

Two-project routing, both providers, original-conversation continuation,
overlap exclusion, and automatic scheduled execution have not been verified end
to end. Public inspection is not an atomic overlap lock.
