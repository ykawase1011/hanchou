# Configuration matrix

| Setting | Owner | Tracked? | Notes |
|---|---|---:|---|
| Role definitions | hanchou | yes | provider-neutral source |
| Public Skills | hanchou-skills | yes | canonical Skill repo |
| Herdr common template | hanchou | yes | backup + atomic replace |
| work/personal profile templates | hanchou / kingdom | yes | no secrets |
| project authorization | `~/.config/hanchou/<profile>/projects.local.toml` | no | human-owned、deny-by-default、Core example is never authority |
| private Skill sources | machine-local | no | reviewed private refs |
| credentials/tokens | Keychain/secret manager/env | no | never in kingdom |
| Beads DB | profile state dir | no | durable runtime state |
| Relay Inbox/Delivery | profile state dir | no | durable runtime state |
| Automation YAML/history | Herdr plugin dirs | no | scheduler source/runtime |
| provider usage snapshot | profile state dir | no | manual initially |
| Slack/Discord destination aliases | future hanchou-chat local config | no | not selected yet |

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
