# Configuration matrix

| Setting | Owner | Tracked? | Notes |
|---|---|---:|---|
| profile root | `~/HanchouWorkspace/<profile>` | no | exact Orchestrator cwd and explicit whole-tree L0 scope |
| local launcher | `<profile-root>/bin/hanchou` | no | regular file; fixes root/profile; canonical instance selector |
| managed Core | `<profile-root>/hanchou` | no | clean detached exact commit; fixed official HTTPS `refs/heads/main` |
| managed Public Skills | `<profile-root>/hanchou-skills` | no | clean detached exact commit; sibling of Core, never under repository shelf |
| deployed/previous pair | `<profile-root>/.hanchou/instance.json` | no | mode 0600 non-symlink state; independent Core/Skills commits activated as one pair |
| prepared candidates | initial `~/.cache/hanchou/instance-plans/<profile>`, then `<profile-root>/.hanchou/candidates` | no | private cache bound to exact plan token; validation uses a temporary HOME but still executes unsandboxed candidate code |
| recovery journal | `<profile-root>/.hanchou/transaction.json` | no | incomplete recovery blocks automatic lifecycle commands until human-inspected checkout/metadata repair |
| instance instructions | `<profile-root>/AGENTS.md`, `CLAUDE.md`, provider control files | no | generated from deployed Core so profile-root cwd resolves the intended Role/policy |
| Role definitions | hanchou | yes | provider-neutral source |
| Public Skills | hanchou-skills | yes | canonical Skill repo |
| Herdr common template | hanchou | yes | backup + atomic replace |
| work/personal profile templates | hanchou / kingdom | yes | no secrets |
| project authorization | `~/.config/hanchou/<profile>/projects.local.toml` | no | human-owned、deny-by-default、Core example is never authority |
| dedicated repository shelf | `~/HanchouWorkspace/<profile>/repositories` | no | init exact-token apply creates/registers it through bounded onboarding; Agent-safe Git repos only |
| Dashboard host/port | hanchou profile | yes | literal loopback、read-only、work 3747 / personal 3847 |
| private Skill sources | machine-local | no | reviewed private refs |
| credentials/tokens | Keychain/secret manager/env | no | never in kingdom |
| Beads DB | profile state dir | no | durable runtime state |
| Relay Inbox/Delivery | profile state dir | no | durable runtime state |
| Automation YAML/history | Herdr plugin dirs | no | scheduler source/runtime |
| provider usage snapshot | profile state dir | no | manual initially |
| Slack/Discord destination aliases | future hanchou-chat local config | no | not selected yet |
| provider integrations / global Agent definitions / plugin-tool links | same-user global state | no | not profile-isolated; may be last-successful-bootstrap-owned; serialize and doctor |

The fixed managed sources are:

```text
Core    https://github.com/ykawase1011/hanchou.git         refs/heads/main
Skills  https://github.com/ykawase1011/hanchou-skills.git  refs/heads/main
```

Candidate Core is validated with sibling candidate Skills. Update and rollback
operate on the exact commit pair, run bootstrap/doctor after activation, and do
not install an automatic latest daemon. This contract is implemented in v2.4.0.

## Profile state

```text
~/.local/share/hanchou/<profile>/
├─ control/.beads
├─ worktrees/
├─ reports/
├─ relay/
│  ├─ inbox/
│  ├─ deliveries/
│  └─ receipts/
├─ usage.json
└─ logs/
```
