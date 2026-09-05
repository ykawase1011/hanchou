# Migrating from Hanchou v2 to v3

v3 is a breaking change. Hanchou changed from a separately deployed
orchestration runtime into one optional Orca Agent Skill. There is no v2
compatibility mode and no automatic Task import.

## 1. Preserve human-readable records

Before stopping v2, export any active Task/Decision data you still need. Use the
installed Beads CLI's help to select a supported JSON or text export, and save
the output outside directories you plan to retire. At minimum record open item
IDs, titles, descriptions, dependencies, decisions, repository/branch, owner,
and current result. Recreate only still-active work manually as Orca Tasks after
v3 activation.

Also copy any reports or source artifacts you intend to keep. Do not treat a
database file alone as a readable archive.

## 2. Stop legacy processes without deleting data

List user services first:

```bash
launchctl print gui/$(id -u) | grep -Ei 'hanchou|herdr|beads'
systemctl --user list-unit-files | grep -Ei 'hanchou|herdr|beads'
```

On the applicable platform, use the service manager's documented
disable/unload command for each exact legacy label you found. Also stop any
Hanchou daemon, old agent runtime, task UI, relay/wake process, dashboard/status
server, and scheduler process. Verify with the service manager and process list.
Do not copy example labels into a destructive command.

After resolving the exact unit or plist path, the platform flow is:

```bash
# macOS: replace the placeholder with the exact plist found above
launchctl bootout gui/$(id -u) /absolute/path/to/exact-legacy.plist

# Linux: replace the placeholder with the exact unit name found above
systemctl --user disable --now exact-legacy.service
systemctl --user daemon-reload
```

Remove the exact legacy plist/unit only after the stop is verified. Do not
uninstall a shared Herdr or Beads binary if another non-Hanchou workflow still
uses it; v3 requires only that no Hanchou path depends on or starts it.

## 3. Retire deployment state

Locate old profile roots, profile-local launchers, managed Core/Skills
checkouts, local registries, launch/service definitions, dashboard config, and
schedule config. Move them to a dated archive or leave them read-only until the
v3 transition is accepted.

v3 never deletes these automatically. Do not remove an old profile root until
human-readable exports and needed artifacts are verified. Old schedule entries
must not remain enabled if equivalent Orca Automations are created.

Once accepted, remove or archive the v2-only launcher, Core/Skills pair,
mutable project registry, Relay/Delivery queues, dashboard files, scheduler
state, and service definitions. Beads data should remain in the archive beside
its human-readable export; it is not imported automatically into Orca.

## 4. Prepare Orca

Update Orca, then install its official skills:

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent universal claude-code --global
```

Open Orca Settings → Orchestration and confirm the official skill coverage and
worker-depth policy. If an older Orca build explicitly reports a disabled
Experimental feature, enable it manually at the Settings location named by that
build. From an Orca terminal, confirm the official live guides and public
Orchestration contract are available before Hanchou work begins.

## 5. Install Hanchou locally

```bash
cd /path/to/project
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator --agent universal claude-code --local
```

Do not run an old `hanchou init`, bootstrap, updater, or rollback command.

## 6. Start a Project Hanchou

Open a new pane in the project and explicitly invoke the skill. For Codex:

```text
$hanchou-orchestrator を使って、Project Hanchouとして開始してください。
対象はこのprojectです。
```

For Claude Code:

```text
/hanchou-orchestrator Project Hanchouとして開始してください。対象はこのprojectです。
```

After activation, manually recreate only active exported items as minimal Orca
Tasks in this pane's bound Run.

## 7. Create a Cross-project workspace

Create a new dedicated Orca folder workspace, local-install the skill there,
and optionally copy the reviewed files from `examples/cross-project`. Its
local policy may name allowed repositories and preferences but must contain no
credentials or mutable Orca IDs.

## 8. Reinstalling v2

There is no in-place rollback engine. The pre-migration source points are:

- `hanchou`: `v2.4.0` at
  `6f5936a04b770dfdf196afa829c1c30102c2cbe8`;
- `hanchou-skills`: `v0.3.0` at
  `2c2dd6ca23d73d05c664183be590026b2a93822c`;
- `hanchou-kingdom`: `v2.3.1` at
  `e11a712d1c43c933b4d84b8fde4d9c94884e2fb9`.

The tags were created locally during migration and must be published with the
v3 release. If v2 must be recovered, check out these immutable tags separately
and follow their own documentation. Do not mix v2 services/state with an active
v3 session or use a moving branch name as a rollback target.
