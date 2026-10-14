# Scheduled work with hanchou-cron

`hanchou-cron` is an optional instruction-only helper for an explicit request to
create, inspect, change, pause, or remove an Orca Automation. It works from an
ordinary Codex or Claude Code session without activating a Hanchou Run during
configuration. Orca owns the schedule, timezone, enabled state, run history,
delivery, and session lifecycle; the helper uses the installed Orca CLI's live
guide. A requested manual trial may start the selected Hanchou job.

Installing the helper or asking only to "add cron" does not select work or
authorize a definition, disabled Automation, trial, or enabled schedule. For
`cronを追加して` or `このPJをいい感じに定期実行して`, first ask the user which
concrete job they want and whether it may only inspect and report, edit and
open a PR, or perform explicitly granted merge or publish actions. A project
definition or document can suggest a job, but does not select it even when it
is the only candidate. An install-only or "later" request leaves the job
unconfigured; onboarding can be offered without blocking installation.

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
An approved concrete request for a new recurring job authorizes its necessary
static definition; it does not need a second file-specific approval. A vague
or install-only request does not authorize a definition. Start from the shipped
[job template](../skills/hanchou-cron/assets/job-template.md) and fill in the
project-specific content; this repository does not maintain a second copy of
that template.

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

At configuration, select any project responsibility policy explicitly named by
the user or applicable project instructions. Otherwise check only the exact
target project's root `.hanchou/policy.md`. An absent optional default leaves
the job on its approved snapshot; a missing selected source is an error. When
present, pin its host, project, stable source workspace/checkout and relative
path separately in the Automation prompt. Each occurrence reads that policy
once along with the job definition and applies the intersection of current
policy conditions and the approved registered job scope. Policy tightening
applies on the next occurrence; broadening alone adds no permission. A missing
or unreadable configured policy stops that occurrence. Initializing a policy
later does not retrofit an existing Automation; request an explicit configuration
update to adopt it.

## Configure and verify

When creating a persistent periodic-work worktree, use `hanchou-cron` by default,
or `hanchou-cron-<job-name>` when jobs need isolation. Explicit user names win;
never double a `hanchou-` prefix. This names a worktree, separately from the
Automation's `[hanchou] <business name>` display convention. It does not require
a new worktree, rename/move existing ones, or change an Automation. Before reuse,
verify exact identity, project, host, required parent lineage, purpose, and owner.
A default-name collision can use a meaningful suffix or another verified target;
resolve an explicit-name conflict with the user and reconcile unknown creation
results before retrying. A fixed name or workspace does not ensure safe concurrent
edits or overlapping launches; retain the ownership checks below.

Carry an explicit human-main/Hanchou-child preference into the scheduled
coordinator, not only its workers. Compare intended parent, host, project, and
target with the supported selector, then verify the receipt and actual child
lineage. Where Automation cannot express a parent, a supported alternative is
an explicitly created and verified persistent child selected as the exact
existing workspace. Each independent occurrence still starts a fresh session
and owns its own Run. Retain that child with reason, owner, and next review;
temporary-worker cleanup does not remove it or the separately pinned sources.
Unspecified placement retains Orca defaults; explicit scoped overrides remain
distinct. See [setup placement checks](../skills/hanchou-cron/references/setup.md#placement-and-target-consistency).

Read back all public target representations after configuration. If workspace
identity, execution context, host/project, or prompt disagree, or the target
cannot be verified, do not infer precedence from an edit success: leave disabled
and report the discrepancy and recovery evidence needed before a trial or
enablement. Do not create a replacement Automation, erase history, or edit
private state to evade the discrepancy. Placement isolation does not prevent
authentication waits, bootstrap failure, or new-tab accumulation; startup
prompts are too late to enforce prelaunch suppression. Honor a request to keep
cron stopped, including no manual trial. Configuration consistency, actual
placement, and launch-failure recovery require separate evidence.

After the user chooses the work, present the exact purpose, job, display name and target,
frequency and timezone, allowed actions, excluded or gated actions, reporting
conditions, and stop condition. Obtain a go-ahead unless the user's request
already explicitly approves that scope. Silence does not approve defaults.

For a new Automation, propose `[hanchou] <business name>` if the user has not
specified a name; for example, `朝のレビュー` becomes `[hanchou] 朝のレビュー`.
Keep an explicit user name exactly as given, and do not add a second `[hanchou]`
when the selected business name already has it. The display name is never
identity or ownership evidence. Existing Automations are not migrated by this
default: rename only explicitly requested targets, including an explicit set
for bulk renaming. Read the exact Automation before an authorized rename and
read back the same ID afterward to verify its name and preserve frequency,
timezone, session mode, prompt/permission scope, target, provider, enabled state,
and all other settings unless separately authorized. Report mismatches or
unavailable verification instead of assuming success or silently repairing
unrelated settings. See the [setup rules](../skills/hanchou-cron/references/setup.md#automation-display-name).

Inspect Orca's existing Automations and the selected target so a retry or
uncertain result does not create a duplicate. Create a new schedule disabled,
read it back, run a bounded manual check, inspect history and the actual result,
then enable it within the approved decision.
An approved concrete request to register a scheduled job includes a bounded
trial within the approved timing and effect scope and enablement after verified
limited checks. A scheduled merge or deployment approval does not authorize
doing it immediately for setup. Honor a separate explicit approval for an
immediate consequential trial. Otherwise use non-effectful checks and state
exactly which effects were untested. If no useful check can be verified, leave
disabled and ask how to proceed. The user may explicitly authorize enabling
after verified limited checks while those effects remain untested. A request
for a draft or disabled schedule ends before activation. If the check's
ownership or result remains uncertain, leave it disabled and explain the
limit; testing does not grant extra authority for job effects.
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
| Default display name | A new approved job is called `朝のレビュー`; the user supplies no Automation name. | Propose `[hanchou] 朝のレビュー`; the naming default grants no registration authority by itself. |
| Explicit display name | The user specifies `朝チェック` or `[hanchou] 朝チェック` as the Automation name. | Preserve that exact name, with no forced prefix or duplicate prefix. |
| Existing prefix | No explicit Automation name is supplied, and the selected business name is `[hanchou] 朝のレビュー`. | Propose `[hanchou] 朝のレビュー` once, not `[hanchou] [hanchou] 朝のレビュー`. |
| Scoped rename | Several Automations exist, including same-named jobs; the user selects one exact Automation to rename. | Rename only that target after reading its current settings. A list request, shared project, or prefix does not authorize renaming others; bulk rename needs an explicitly selected set. Names never prove identity or ownership. |
| Rename read-back | An authorized rename returns success; the same ID is read back. | Verify the saved name and compare frequency, timezone, session mode, prompt/permission scope, target, provider, enabled state, and all other settings with the pre-change values and authorized changes. If any unrelated value differs or read-back is unavailable, report it as unverified instead of claiming success or silently repairing it. |
| Vague cron request | The user asks to add cron or make the project run periodically, and one or more job definitions exist. | Ask which concrete work to schedule and its allowed actions. Do not author a definition or register a disabled Automation while waiting; no reply leaves it unconfigured. |
| New concrete job | The user specifies a new daily CI report, then provides its missing time, timezone, and destination. | Author its necessary static definition without a separate file-specific approval, then register only within the approved schedule and action scope. |
| Timed release | The user authorizes a release merge/deploy at its scheduled time, with no immediate-effect trial approval. | Do not merge or deploy during setup. Verify non-effectful checks and report untested effects; if safe verification is unavailable, leave disabled and ask a real decision. Enable after limited checks only within explicit user authorization. |
| Configured project policy | An Automation pins a separate project policy source; the policy tightens between occurrences. | The next occurrence reads that exact source once, applies the tighter condition within the registered job scope, and stops if the source is missing. Broader policy text alone grants nothing new. |
| Late initialization | An existing Automation was registered without a policy source, then the project initializes one. | Keep the registered snapshot behavior until the user explicitly updates that Automation to adopt the policy. |
| Two projects, multiple jobs | Projects A and B each have distinct jobs; A has `morning-review` and `weekly-triage`. | The selected project, source workspace, and job path stay attached to each schedule and run. Choosing A's `weekly-triage` cannot load A's other job or B's same-named file. |
| Separate worktrees | A definition is ignored locally in worktree A and absent from execution worktree B. | An Automation targeting B reads A's file when A is the explicitly pinned, accessible source. If A is missing or unreadable, it reports a configuration error without using a same-named file in B or copying the definition. |
| Definition edited | A job document adds new work, asks for publishing authority, and suggests a new frequency. | The next run reads its current business instructions only within the original authority. Orca's schedule remains unchanged, and publishing remains gated until explicitly approved and configured. |
| Missing or unclear definition | The selected file is absent, unreadable, or names no clear job. | Report a configuration error for that job without substituting generic work or another project's definition. |
| Ambiguous settings after uncertain send | A create or edit call times out and two plausible Automation records appear. | Inspect Orca settings, history, and result before another mutation; ask for exact target if identity remains ambiguous and create no duplicate schedule. |
| Unqualified ownership or overlap | A run receipt cannot be tied to a specific Hanchou Run, or another occurrence may be starting concurrently. | Stop and report uncertain ownership before creating work. Public inspection can reduce duplicate risk but cannot guarantee atomic exclusion. |
| Unsupported continuation wake | The installed public contract can run a fresh Automation session but cannot wake the original interactive conversation and Run. | State that continuation mode is unsupported; do not claim `--reuse-session` proves it or start a fresh replacement Run. Independent-job support is assessed separately. |
| Job completion | An independent daily job finishes its current run; a continuation check finds its original request complete. | The independent schedule remains active until paused or removed. Stop unnecessary continuation checks after verified completion or user stop. |
| Duplicate-looking history | One enabled Automation, a disabled different job with the same display name, several past occurrences, and historical Hanchou Runs appear in the UI. | Inspect exact target/job/mode/schedule and IDs, including disabled entries. Do not count history as registrations or infer workers from names; preserve history and other jobs. Multiple plausible exact matches require ownership clarification before mutation. |
| Temporary trial disposition | An approved continuing schedule has a separate disabled trial Automation plus trial workspace/worker receipts. Repeat with a failed trial and with history-deletion authority absent. | Account for the trial ID even when disabled or failed. Preserve evidence and remove only the authorized temporary Automation/history; otherwise retain disabled with reason/owner/next action. Resolve trial resources separately under cleanup policy, preserve the pinned source, and verify the continuing schedule's intended enabled state. |
| Silent occurrence | A history row is completed but output is empty and there is no evidence of the job's checks; a second variant has positive check evidence and an explicit no-op result. | Report the first result unverified without duplicate work; accept the second bounded no-op. Silence or terminal idle cannot prove idle ownership or successful checks. |

## Prior cron candidate validation (2026-10-13)

The record below predates the six-skill project-policy integration. It does not
claim to validate the new initialization or project-policy behavior.

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
