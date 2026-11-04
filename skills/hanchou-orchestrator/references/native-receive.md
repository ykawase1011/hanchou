# Qualified Claude native receive

Use only when explicitly selected and **both endpoints are independent local
Claude Code root CLI sessions**. The qualified baseline is Claude Code 2.1.317,
Herdr 0.9.5, existing subscription authentication, manual permission mode and
allowed inbound peer delivery. This is a capability, not the provider-neutral
default. A Codex native ID or Orca session ID is not a Claude peer address.

## Readiness and identity

Use the unchanged official Herdr Claude SessionStart integration already selected
by the user. The launcher never installs hooks, trusts folders/hooks, changes
inbound controls or edits global settings. If an explicit temporary settings file
is authorized, `--claude-settings /absolute/file.json` passes it to this process
only; preserve inherited plugins/MCP/tools. Trust/personal-action gates remain.
A hook's exit 0 does not prove it reported anything: require the Herdr readback.

The invoking Claude parent uses official ListAgents/tool discovery once to verify
its current name/ref, SendMessage and notify_when_idle support. Verify both root
sessions' effective permission class/inbound controls using available native
settings/UI evidence. Hold/refuse or “shown only to your user” is not model wake.
Do not infer effective settings from a default or change files under a running
session expecting live reload. Native evidence unavailable means unqualified.

Preserve a bounded public readiness receipt, then provide this one-launch JSON
via `--claude-peer /absolute/parent.json`:

```json
{
  "version": 1,
  "host": "local",
  "provider": "claude",
  "cliVersion": "2.1.317",
  "root": true,
  "nativeId": "11111111-1111-1111-1111-111111111111",
  "name": "the-parent-name",
  "peer": "the-parent-name [abcdef]",
  "herdr": {"session": "the-parent-server", "paneId": "w1:p1"},
  "cwd": "/verified/parent",
  "process": {"pid": 12345, "birth": "actual ps lstart value"},
  "sendMessage": true,
  "notifyWhenIdle": true,
  "inbound": "accept",
  "observedAt": "2026-11-04T12:00:00Z",
  "evidenceRef": "/durable/public-readiness-receipt.txt"
}
```

These are observed facts, never placeholders or fabricated capabilities. The
parent must have explicit `--session-id`, `--name` and `--permission-mode manual`
process bindings. Evidence must be at most five minutes old when launching.
The shell checks the qualified caller and actual-pane CLI versions, and parent
Herdr native/cwd and process PID/birth/arguments before
creation and after startup, and hashes the supplied public evidence. The peer
capability/inbound assertions remain caller observations: the shell cannot invoke
model-only ListAgents or prove effective settings from a file's mere existence.
The record is local evidence, not authentication against hostile local writers.

The child gets a fresh UUID/name and manual mode. The launcher checks its exact
process arguments and unchanged official SessionStart `source: herdr:claude`,
native ID and cwd before any conversation ACK. The result's
`identityReadiness.status: ready` is this startup binding. `receive.status:
peer_binding_required` deliberately requires a fresh official ListAgents listing
to map the unique child name to its current `[ref]`, plus native/effective model,
effort and inbound-setting evidence, before assignment. Requested values are not
observed model facts. Do not invent an LLM ACK to generate usage data.

If prerequisites fail, preserve the attempt and report the boundary. Do not
silently install integrations, choose a different parent, downgrade permissions
or turn a failed owned launch into RUNNING. Other combinations can explicitly use
the existing Herdr launch/read/wait path; they do not inherit model-free wake.

## One request, receipt, notification, independent acceptance

Include the launch `requestId` with mission/attempt/native/process binding and
both current peer refs in one assignment. Before sending, save the current peer
mapping alongside the launch receipt. Use official SendMessage with the exact
child address and `notify_when_idle: true`. Read its actual receipt and preserve
its message ID. A submitted asynchronous tool command must be awaited to receipt;
“no polling” applies to checking whether the child is done, not that command.
End the parent turn after the receipt; do not poll ListAgents or send progress
questions. The native notice can start the next parent turn without periodic
parent-model checking. Sending and handling a notice still uses model turns.

An inbox receipt is not proof of consumption or task completion. A pure idle
subscription may immediately report an **old** result. A held/refused delivery,
expired subscription, exit-before-idle or interrupted turn requires inspection of
the same attempt; none is success. Do not resend on an uncertain receipt. A
restart may keep the same native UUID but changes PID/birth and peer ref: reject
that old binding, retain evidence, and decide a separate fresh attempt.

At receipt of a notice, match request/mission/attempt, native ID, current process
incarnation and exact peer mapping to the saved assignment. Read the referenced
result/verification and perform independent acceptance. A notification never
performs finish or accept itself. For an owned instance the bound report carries:

```json
{"receive":{"parentPeer":"parent [abcdef]","childPeer":"sokkin-attempt [123abc]",
 "nativeId":"the-child-native-id","process":{"the":"exact sokkin.process object from launch"}}}
```

This is an illustration of the additional fields, not a valid report by itself.
Copy `process` from the preserved full launch receipt; compact output omits arguments.
Use the full [result contract](lifecycle.md#completion-and-acceptance). If acceptance
records a notice, `notification` has `kind: idle`, `requestId`, `nativeId`, exact
`process`, `parentPeer`, `childPeer` and the saved send `receiptId`. Hold/refuse/
exit/old bindings are rejected. Accepted instances cannot be accepted twice.
Provider duplicate suppression is not a general exactly-once guarantee.

Questions can use SendMessage to the actual `from` address. A reply conveying a
choice or existing delegation does **not** answer native permission UI. The
direct parent verifies the exact pending tool/request ID, native/process/pane,
operation and authority, then uses supported public controls once. Preserve the
receipt and read back resumption. Personal-action gates still go to the human;
no blanket future approvals or permission laundering through a peer.

## Scope and costs

Offline schema/process tests cannot prove native wake. The bounded native probe
qualified local 2.1.317 roots, including old idle, hold/refuse, exit and one scoped
Write approval. It did not qualify arbitrary hosts, all restart/reconnect cases,
TTL expiry or automatic native-approval forwarding. External debug measures only
attributable native requests; no participant is asked to self-account. Include
preparation, full context, failures and acceptance when comparing equivalent tasks.
Fewer responses alone do not establish a 1.2–1.3x efficiency ratio.
