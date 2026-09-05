# Acceptance matrix

Checked through 2026-09-03 against the migration request. `PASS` means current
evidence proves the stated scope. `PENDING` is not treated as success.

## Requirements 1–19 implementation audit

| Request section | Status | Authoritative repository evidence |
| --- | --- | --- |
| 1. Product definition | PASS | `README.md`, `HANCHOU_SPEC.md`, and `docs/ARCHITECTURE.md` define one optional policy skill and assign all runtime/state mechanics to Orca |
| 2. Multiplicity | PASS | architecture and `docs/MULTIPLE_HANCHOU.md` require one Run per pane, N Hanchou sessions per runtime, and no fixed work/personal mapping |
| 3. Three Hanchou kinds | PASS | README and `docs/USAGE.md` use only Project, Cross-project, and Temporary Hanchou as modes of one skill |
| 4. Non-invasive install | PASS for tested installer scope | standard local installer isolation, unchanged pre-existing hashes, sibling invisibility, and non-activation were tested; no custom installer/service exists |
| 5. Official skill reuse | PASS for implementation; runtime boundaries below | `SKILL.md` mandates live `orca-cli` and full `orchestration` guides and routes conditional UI/environment/Linear/emulator work to official optional skills without copied catalogs |
| 6. Session and Run contract | PASS for implementation; runtime cases below | startup gate, current binding, create-if-absent, explicit bind/recovery-only takeover, and same-Run invariant are in `SKILL.md` |
| 7. Coordinator policy | PASS | `references/role.md` separates direct answer, supervised work, full handoff, and one blocking question |
| 8. Task/worker/review | PASS | minimal DAG, `worker-start`, provider-neutral routing, optional mission lead, independent review, retain, and desktop worker release are encoded and exercised |
| 9. Completion loop | PASS via required fallback | installed releases did not provide native idle wake; official bounded `check --wait` delivered all required event types without a daemon or polling loop |
| 10. Cross-Hanchou boundary | PASS | no cross-Run protocol, lock service, or registry; repository conflict inspection is policy-only |
| 11. Cross-project mode | PASS for available environments | dedicated example and three-repository routing passed; connected Linux placement passed; authenticated remote completion is conditional and the current profile has no connected server |
| 12. Automations | PASS | Orca owns all schedule state; simple create/history/edit/remove passed, and an installed-skill Temporary Hanchou manual run completed its Run/Task/Dispatch/worker/Delivery lifecycle |
| 13. Legacy skill consolidation | PASS | exactly one core `SKILL.md`; retained policy is split across the seven requested references |
| 14. Repository reorganization | PASS | `hanchou` is the sole distribution; `hanchou-skills` and `hanchou-kingdom` are four-file deprecated pointers; all versions are 3.0.0 |
| 15. Legacy responsibility removal | PASS | final tree has no production CLI/runtime/code/config/schema/service/manifest paths; repository tests reject their return |
| 16. v2 migration guide | PASS | `docs/MIGRATION_V2_TO_V3.md` covers export, exact service discovery/stop, non-deletion, Orca preparation, install, both workspace modes, and immutable v2 tags |
| 17. README examples | PASS | ordinary, Project, Cross-project, Temporary, and multiple-Hanchou flows are documented |
| 18. Orca sources | PASS for recorded evidence | installed/package live guides, official releases, checksums, release commit, issue, and compatibility result are recorded in `docs/ORCA_COMPATIBILITY.md` and `docs/VALIDATION.md` |
| 19. Migration procedure | PASS | repository investigation, replacement, deletion, documentation, versions, tests, obsolete scan, and final report are represented by the current diff and validation evidence |

Section 20 is expanded below because its environment-dependent cases determine
whether the release is fully runtime-qualified.

## 20.1 Install isolation

| Criterion | Status | Evidence |
| --- | --- | --- |
| Project-local installation | PASS | standard `skills` installed the local source into temporary and current workspaces |
| Orca application/userData unchanged by install | PASS | no Orca paths existed or were created by the installer test |
| Existing project/session/default agent/Automations unchanged | PASS for install scope | only standard skill placement/lock paths were added; pre-existing file hashes and empty Automation inventory stayed unchanged |
| Uninstalled sibling project cannot see Hanchou | PASS for filesystem scope | skill exists only below the installation target |
| Ordinary non-activated session unchanged | PASS for Codex/Claude behavior | both providers answered ordinary and generic-agent requests without Hanchou startup |

## 20.2 Activation

| Criterion | Status | Evidence |
| --- | --- | --- |
| Explicit Codex activation | PASS through fail-closed boundary | natural-language Hanchou request selected the locally installed skill and reported the missing executable |
| Explicit Claude activation | PASS through fail-closed boundary | natural-language Hanchou request selected the locally installed skill and reported the missing executable; the documented installer now explicitly creates both Universal and Claude Code placements |
| Generic request does not activate | PASS in Codex and Claude CLI | both answered an ordinary request without reading the skill or starting Orca checks |
| Disabled/unavailable Orchestration yields non-destructive guidance | PASS for compatibility branch; not applicable to installed v1.4.195 toggle UI | installed status publishes `orchestration.contract.v1`; official Computer Use captured its dedicated Orchestration page with skill coverage and worker depth but no enable/disable toggle. A deterministic forward test returned `orchestration_feature_disabled` from the read-only binding probe; Hanchou gave the supplied manual Settings guidance, made no mutation, and never called Run creation |

## 20.3 Official skill reuse

| Criterion | Status | Evidence |
| --- | --- | --- |
| Load version-matched `orca-cli` guide | PASS in Codex and Claude activation sessions | both providers used `ORCA_CLI_COMMAND` and retrieved the packaged v1.4.195 guide |
| Load full version-matched orchestration guide | PASS in Codex and Claude activation sessions | both providers retrieved `orchestration --full` before status |
| No copied Orca command catalog | PASS | repository scan and one thin core skill |
| No fallback to retired Hanchou skills | PASS | retired skill directories and production CLI removed |

## 20.4 Multiple Hanchou

Two same-project coordinator terminals created distinct Runs
`run_ca9ddf40d502` and `run_a3116f917aa5` in one Orca runtime. After restart,
two new terminals rebound those Runs through public `run-use`; consumer
generation advanced independently. Each Run then received one uniquely marked
Task and one uniquely marked status message. Per-Run `task-list` and Delivery
checks returned only their own marker, and both Deliveries were acknowledged
independently. Distinct panes/Runs, Task and Inbox isolation, same-project
concurrency, and absence of a global one-project/one-Run mapping are `PASS`.

## 20.5 Project Hanchou

Task creation, `worker-start`, worker question, coordinator reply,
`worker_done`, automatic Task/Dispatch completion, a dependent independent
review Task, and `worker-retain` are `PASS` in live Orca. The primary and review
workers both reported `succeeded` and made no file changes. An initial headless
`worker-release` captured its archive and stopped the terminal but returned
`release_unknown: tab_not_found`. The same lifecycle was then repeated in a
desktop v1.4.188 renderer: Dispatch `ctx_c6144b5ab379` completed successfully,
`worker-release` returned `state: released`, closed the exact agent terminal,
captured its archive, and recorded no release error. Section 20.5 is `PASS`.

## 20.6 Cross-project Hanchou

Dedicated workspace examples and owner-Run policy are `PASS`. One Run dispatched
successful workers across `hanchou`, `hanchou-skills`, and `hanchou-kingdom`,
including a fully version-matched v1.4.188 CLI/runtime worker: `PASS` for local
multi-repository routing. An official v1.4.188 Linux arm64 AppImage runtime was
then paired as `hanchou-docker-remote`: remote status became ready, `/workspace`
was registered, and `worker-start --on hanchou-docker-remote` created its
terminal on that host. This is `PASS` through connected-server placement. The
disposable container intentionally had no provider CLI or credentials, so the
remote worker stopped at `agent_prompt_stalled`. The criterion is conditional
on a connected server; the installed profile currently has none, so
authenticated remote completion is not claimed or treated as an unconditional
release blocker.

## 20.7 Completion loop

No Hanchou daemon, watcher, or polling loop is present: `PASS`. Native
`check --wait` delivered `worker_done`, and question/reply delivery completed a
blocked worker. A separate tracked bare-shell Dispatch emitted an `escalation`;
the owning Run received it as a one-message Delivery and acknowledged it:
`PASS` for all three required Inbox event types and bounded wait. Native
desktop-pane wake was then tested as the preferred path. The original v1.4.188
pass used two idle Codex
coordinators, including one launched directly by Orca; neither received an
injected pointer for status or tracked escalation within bounded observation.
A later user-installed v1.4.195 desktop repeated the test with Accessibility
and screenshot permissions both `granted`. Run `run_e36d686e6f8c`, Task
`task_1bc65dddc553`, and Dispatch `ctx_f552888c2bbf` completed successfully,
but the idle coordinator received no native turn for more than 35 seconds.
Non-consuming `check --peek` showed unread `worker_done` message
`msg_0f885ff19791`; one bounded `check --wait` returned Delivery
`delivery_797a3ac43961`, after which `worker-release` closed the exact worker
terminal and the Delivery was acknowledged. This proves Inbox persistence and
the documented fallback on the installed release, but not native wake.

A final installed-skill repetition used an Orca-created worktree and a real
Temporary Hanchou coordinator on v1.4.195. Run `run_8cb0c22a6743`, Task
`task_efb1bf4df819`, and Dispatch `ctx_86b19029c6a8` completed successfully.
The coordinator ended its turn immediately after `worker-start` and performed
no check/wait/peek/poll. More than 90 seconds after worker completion its output
cursor was still unchanged. External `check --peek` then found unread
`worker_done` message `msg_1dbbc74f7b86` with `delivered_at: null`. The bounded
fallback returned Delivery `delivery_a102b19bc2fe`; exact worker release and
acknowledgement succeeded. Native wake is therefore unavailable on the tested
installed release, including with the candidate Hanchou distribution skill
installed in the workspace. This is the exact case for which acceptance
criterion 20.7 requires the official bounded-wait fallback. Upstream Orca issue
[#12953](https://github.com/stablyai/orca/issues/12953) remains open and states
that lifecycle mail reaches a lightweight-Run coordinator through
`check --wait`; Hanchou uses that supported path and adds no fallback process.
Section 20.7 is `PASS` via its required unavailable-native fallback.

## 20.8 Restart

Public-guide-only recovery policy is `PASS`; private database access is absent.
After a full runtime/daemon stop and restart, public v1.4.188 commands recovered
all prior Runs and three completed Tasks: state preservation is `PASS`. After a
second restart, two new terminals rebound the two unavailable coordinators'
ordinary Runs with public `run-use`; each Run's consumer generation advanced
from 1 to 2 and subsequent Task/Delivery operations succeeded. Section 20.8 is
`PASS`. No private database or takeover-only path was needed.

## 20.9 Automations

No Hanchou schedule state exists and installation creates none: `PASS`.
A disabled Orca Automation with an existing-workspace target was created and
run once; history reported `trigger: manual`, `status: completed`, and no error:
`PASS` for manual execution. It was then edited while disabled and removed;
the final list was empty: `PASS` for edit/removal. The run used an ordinary
read-only Codex prompt and did not activate Hanchou, proving the simple
Automation path. The simple path is `PASS`. A second disabled Automation
targeted a workspace with the standard local Hanchou installation and
explicitly activated a Temporary Hanchou. Its manual trigger launched Codex,
created Run `run_39c3962e5e5e`, Task `task_fb0b5ee6ce68`, and Dispatch
`ctx_97d1a21880af`, received marker `HANCHOU_AUTOMATION_20260903` by bounded
Delivery, released the exact worker, acknowledged the Delivery, and reported no
file changes. The Automation history reported `trigger: manual`,
`status: completed`, and no error. Its history status became completed when the
agent session was dispatched, before the terminal workflow settled, so the
Run/Task/Dispatch and final terminal evidence were also checked. The Automation
and its run history were removed afterward; the final list was empty. The
Hanchou-enabled manual path is `PASS`; a wall-clock scheduled firing is not
required. The original test profile was archived as a whole and is not active.

## 20.10 Legacy removal

| Criterion | Status | Evidence |
| --- | --- | --- |
| No Herdr/Beads/Relay/Delivery runtime dependency | PASS | production code, schemas, bridges, dependencies, and dedicated skills removed |
| No Hanchou runtime/DB/scheduler/dashboard | PASS | final repository tree and validation script |
| Current architecture has no legacy canonical path | PASS | README/spec/architecture replaced; old source remains only in Git history and migration text |
| Operates without legacy processes | PASS | live Run/Task/worker/review/Automation flows invoked only Orca and provider CLIs; no Hanchou legacy runtime was started |

## Runtime limitations

The baseline v1.4.195 packaged headless runtime reproduced official issue #16761
with `AppEnvironment not initialized`; the issue's fix commit is not an
ancestor of the release commit. The known-good official v1.4.188 arm64 package
was therefore used for the original bounded E2E. A later normal installation
provided a ready v1.4.195 desktop runtime and repeated the live-guide,
Run/Task/Dispatch, Inbox, bounded-wait, and clean-release path successfully.
Orca v1.4.196 is now the latest release and includes startup/app-environment
fixes; the installed desktop remains v1.4.195.

Native desktop idle wake is unavailable in the tested release and tracked by
upstream Orca issue #12953; bounded `check --wait` satisfies the request's
explicit fallback criterion. The Hanchou-enabled Automation manual run passes.
The host's selected `/Applications/Xcode.app` developer path is
broken, but installed Command Line Tools work when explicitly selected through
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`; that bounded process
environment allowed Orca worktree/terminal E2E without changing system
settings. The installed profile has no saved remote environment.
