# hanchou-chat boundary

Slack／Discord support is intentionally deferred until the local Core E2E works.
The library/implementation has not been selected.

## Required boundary

```text
Slack / Discord
→ allowlist/auth
→ durable human_request Relay event
→ logical Herdr Agent `orchestrator`
→ Delivery rendered by L0/Editor
→ adapter posts to destination
→ Delivery receipt with external message ID
```

The Chat adapter must not own Task、Cron、provider session、worker lifecycle、or
reporting policy. It may not target arbitrary panes; external input routes only
to the configured Orchestrator.

## Selection candidates for later ADR

- thin direct Slack Socket Mode + Discord Gateway implementation;
- extension of a Herdr-native bridge such as herdr-hail;
- existing relay used only as transport, without session ownership.

## Acceptance criteria

- work/personal secret injection remains outside `hanchou-kingdom`;
- restart-safe origin/destination mapping;
- idempotent send and retry;
- same Orchestrator conversation when session survives;
- no terminal scraping as the canonical final response;
- one channel may be canonical while others are read-only until shared session
  ownership is proven.
