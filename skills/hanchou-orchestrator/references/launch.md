# Launch and handoff

Use the one-shot Bash 3.2+ launcher with Git, jq, Herdr and the official selected
agent CLI. Herdr 0.9.5 is the tested public contract. No usage tool is required
for ordinary operation. The launcher neither installs tools/hooks nor sends a
mission. Reuse installed-version help and supplied readiness; inspect source only
for a concrete implementation problem, not routine preparation.

By default launch a dedicated local named server; `--session NAME` explicitly
uses an existing shared server without ownership/auto-stop authority. Keep the
returned host/session/pane IDs. Fixed policy/config sources remain the selected
project, independent of execution cwd. The launcher copies no ignored settings.
Check actual shell/process resolution; wrappers can change arguments or billing.
Do not rewrite global shell, plugins, MCP or notification settings speculatively.

## Configuration and call

```json
{"version":2,"sokkin":{"agent":"codex","model":"gpt-6-astra","effort":"medium"}}
```

Only `agent`, `model`, `effort` are supported inside `sokkin`. Agent is codex or
claude; model null/omitted uses the official CLI default. Effort is low, medium,
high or null. Root optionally accepts languages. Preserve existing choices.
Keep action authority, finite concurrency/retries and explicit stop limits in
policy/mission; do not add ordinary usage budgets or accounting configuration.

### Communication languages

Optionally add `"languages":{"human":"ja","agents":"en"}` to the version 2
root. Only `human` and `agents` are accepted in this object. A tag must be an
ASCII string of at most 63 characters: 2–8 letters followed by zero or more
hyphen-separated groups of 1–8 letters/digits, with no whitespace (for example
`ja`, `en`, `pt-BR`, `zh-Hant`). This is a language-tag-shaped subset, not a
registry lookup or a guarantee of model fluency. Underscores, empty strings,
free-form instructions and other types are rejected before creating resources.
Tags are preserved as supplied; matching their meaning is case-insensitive.

Omitted/null `languages`, `{}`, and omitted/null fields impose no preference
for that audience: retain current conversation/mission/project behavior. Do not
copy the other field as a fallback. Explicit user/mission language instructions
override config defaults without changing the pinned file.

`human` covers the supervisor's acknowledgement, progress, approval/escalation
explanations and final summaries. `agents` covers supervisor→sokkin and
sokkin↔workers, including returned questions/reports and new worker assignments.
The supervisor conveys internal meaning in `human`, retaining commands, paths,
IDs, numbers and quoted diagnostics exactly where necessary. Native CLI UI,
JSON keys, protocol markers, source syntax and artifacts' requested/project
language are unaffected. No permission or approval rule changes.

The receipt preserves the effective fields and omissions. Pass them once with the
mission and propagate explicit overrides to new workers; init/update never rewrites
a live fixed configuration. Protocol markers are not translated.

Invoke the resolved installed script with quoted `--project PATH --mission SLUG`.
`--config` pins an explicit file; `--agent`, `--model`, `--effort` override this
launch only. `--base` resolves once to a commit (default selected checkout HEAD).
`--worktree-root` must be absolute and outside all existing checkouts. `HERDR_BIN`
selects an executable, not shell code. See `--help` for the small option surface.

Codex retains `--no-daemon`. An explicitly authorized `--skip-update-check` only
adds a process-local Codex flag. No queue fallback/shared daemon is created.
The [separate Codex design](https://github.com/ykawase1011/hanchou/blob/3e0ecf79bceef6e57436cef5440bd328e765c81e/docs/CODEX_NATIVE_RECEIVE_DESIGN.md) records
why the owned app-server experiment cannot silently replace this mode.
Claude requires first-party subscription auth in caller and actual pane; no
API/extra-usage fallback or credential export. Auth alone does not prove every
account-wide extra-usage setting. Report unresolved billing evidence.

### Qualified startup

`--qualify-startup` supports Codex 0.162.1/0.163.0 with a finite timeout. It sends
one fixed tool-free identity bootstrap because this supported TUI path materializes
native identity/context in its first turn. This is no longer a token-measurement
ACK: there is no ccusage dependency, counter gate or budget bookkeeping. Fresh
cwd/start time/marker, unique nonforked native ID, model/effort, exact response and
process PID/birth/arguments remain checked. Bootstrap submission is once without
Herdr's activity-gated `--wait`; the script checks completion within its deadline.
No mission/retry/continuing observation is added.

Use `identityReadiness.status: ready`, not legacy `usageReadiness`, for the stated
identity boundary. `usageReadiness.status: not_required` is a compatibility field;
old receipts keep their original optional usage fields. New observations never
rewrite or certify those old counters. Missing/inconsistent native identity still
fails closed. Unsupported provider/version must use its separately verified
public identity route; a failed qualification cannot be bypassed by manual ACK.

Claude's explicitly selected [native receive](native-receive.md) uses official
SessionStart identity without an LLM ACK. `--claude-peer PATH` supplies the current
local Claude parent evidence. For any Claude launch, optional `--claude-settings
PATH` is an explicitly authorized process-local settings file, never silently
installed/trusted; it can select manual permissions on the ordinary Herdr path.
Read back actual native settings. This option does not claim that a Codex/Orca
parent supports Claude peer tools or native wake.

### Explicit manual approvals

Codex 0.163.0 accepts `--manual-approvals --qualify-startup`, selecting
workspace-write/on-request/user and checking those exact native values. No global
settings change. Missing/mismatched evidence refuses qualification; do not use a
manual mode to evade a provider denial. Claude peer startup selects manual mode
and reports the exact-process evidence boundary; effective native gates still
need corroboration before assignment.

### Native automatic approval review

Explicit automatic review is separate from model/effort. Use only a qualified
public provider mode and inspect its actual denial/input behavior. It does not
create a Hanchou parent approval channel. Keep exact-request delegated authority,
human-only gates and denial handling; never use bypass/blanket approval or weaker
sandboxing. Missing reviewer usage is an external-debug limitation, not authority
to relax review or a gate on otherwise qualified work.

## Receipt and partial failure

Capture exit status and complete stdout/stderr. Version 2 receipts retain
config, source snapshot, worktree, Herdr, sokkin, lifecycle and resources. New
`identityReadiness`, `requestId` and `receive` fields separate identity/delivery
from optional legacy `usageReadiness`. Process details corroborate native identity;
a PID alone never substitutes for it. Requested model/effort is not observed data.

Owned launch preserves full receipt and Git blob hash in the instance directory.
`--compact-receipt` keeps decision fields and the full evidence reference; shared
and early-failure output stays full. Missing/colliding/symlink evidence fails
closed and retains resources. STARTING/UNKNOWN has no promotion path. Inspect
the same attempt and preserve unique work; do not relaunch blindly or claim a
later ACK recovered the lifecycle. A separate retry needs a justified decision.

A successful ordinary owned launch with pending optional native metadata instead
uses [one-shot bind](lifecycle.md#bind-delayed-native-identity) against its captured
original process and fresh public identity, before real assignment. Keep the
original receipt; do not infer identity from the result or hand-edit the record.

After identity/settings and viewer checks, send one bound mission with the fixed
companion/policy references, criteria, authority, languages, resource limits and
durable result destination. Receipt waiting and child-completion observation are
separate. The native route supplies result/exit notices; all manual-approval paths
still require the parent's bounded public waits/readback because pending approval
wake is unqualified. Establish that capability before assignment. Idle or a
timeout is never success or permission to resend.
Finalization follows [lifecycle](lifecycle.md), without usage gates.

## Human-visible Herdr

Every new sokkin launch includes a visible Herdr tab before real assignment,
unless the user or pinned policy explicitly selects headless operation. The
supervisor opens it through the host's existing terminal UI; the one-shot
launcher remains independent of that UI. In Orca, use the available Orca terminal
skill/tool to create a tab in the supervisor's current workspace without moving
or replacing the conversation. Other hosts may use their existing terminal tabs
or windows. No Orca installation is required on those hosts.

Create and verify tabs/workspaces in the background. Preserve the user's current
focus, including the existing conversation; only an explicit request to switch
the displayed location authorizes activation. In Orca, do not use `--focus`,
`--activate`, `terminal switch`, or the revealing `--run-hooks` for creation or
verification. Use public read/list/visual-layout observations without selecting
the tab. Other hosts follow the same rule using their supported public controls.
If non-activating creation or display verification is unavailable, report that
limitation and connection details; do not bring a window forward or switch back
to the conversation on the user's behalf. The headless exception below still
requires explicit authority.

In Orca, give the viewer an explicit tab title `Herdr | <short mission name>`
using the user's language, for example `Herdr | Issue整理`. Add a short attempt
suffix only when needed to distinguish tabs for the same mission. Use the
installed Orca terminal contract to set the title at creation and, once the
handle is known, explicitly rename that tab with `terminal rename --terminal
HANDLE --title TITLE`. Apply this to a reused viewer shell or a reconnected tab
as well. Do not rely on the Herdr/agent's dynamic terminal title or rename its
workspace, branch, session or agent to change the Orca tab label.

Verify the matching tab ID's title in `terminal list --include-visual-layouts`
(or a non-activating observation of the tab label); the terminal/pane title can
still show Herdr's dynamic
title and is not the custom tab label. Preserve a title explicitly chosen by the
user. If naming cannot be verified, report that limitation alongside the verified
viewer connection; do not open a duplicate tab or restart the agent just to rename
it. Keep the label stable across status changes rather than adding a title-update
poller. Other hosts use their supported naming controls when available.

A successful read from a terminal does not by itself prove that the host has
adopted it as a visible tab. In Orca, reconcile an `orphaned` result with the
matching public visual layout before assignment. Keep the same sokkin and inspect
the existing viewer; an uncertain result is not permission to create duplicates.
If the first viewer is confirmed unadopted, a replacement in the verified
supervisor workspace may attach to that same Herdr session. Record both handles
for disposition and verify the replacement before assigning work. A different
dynamic pane title alone does not show that the custom tab label was overwritten;
read that tab ID's label before renaming or claiming a title-update race.

Use the resolved Herdr executable and the returned `herdr.session` on the
receipt's host. Herdr 0.9.5 provides `session attach NAME`; confirm the installed
contract when missing from readiness. This command takes the name positionally,
without the global `--session` used by ordinary agent/pane operations.
Do not use an unnamed/default session or
create another server, workspace or agent to obtain a display. For a shared
session, use supported controls that preserve the user's focus to select the
returned workspace and verify
its identity; attachment to the right server alone is insufficient.

Verify tab creation and actual Herdr workspace display, including any startup
overlay, before reporting success. Record the tab handle, tab ID, chosen title and session/workspace
alongside the existing launch receipt, not in a new registry. On timeout, inspect
existing tabs before retrying. Reuse the verified tab for follow-ups to the same
live sokkin; if closed, reconnect to that session. New attempts must display their
own target without repurposing another attempt's tab. Do not install optional
integrations or change global terminal/provider settings merely to view it.

If the host cannot display a viewer, report the exact limitation and reconnect
details. Retain the launched attempt and hold real assignment unless headless
operation is already authorized. Viewer failure is not evidence of agent failure
and never justifies relaunching sokkin. A later viewer disconnect does not stop
the running mission. Leave the tab available after completion; report that the
agent exited when applicable. Normal owned-server lifecycle cleanup still applies.
The native TUI accepts input: viewing intent is not technical read-only access.
A browser viewer is an alternative only when already configured and verified;
do not install a web plugin or expose a new listener as part of this step.
