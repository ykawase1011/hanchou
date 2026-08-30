---
name: hanchou-usage-routing
description: Resolve a Hanchou role to Codex or Claude using role locks, content type, model tier and fresh weekly usage snapshots.
---

# Usage-aware routing

Use `hanchou route resolve --role <role> --task-kind <kind> --json`.

Rules:

1. Provider/content locks win.
2. Japanese prose, prose review and final output use Codex.
3. The third visible layer starts with Terra/Sonnet.
4. Fresh weekly usage may move flexible work toward the provider with more
   headroom.
5. Missing/stale usage never causes an invented switch.
