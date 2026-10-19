# Secret inputs and investigation outputs

Apply this boundary before reading authentication instructions, environment
files/variables, workflows, composite actions, shell scripts, or other inputs
that may contain credentials. Account names, command examples, connection URLs,
and diagnostic text may be sensitive too. File type, a public-looking filename,
or a matching line does not establish that its content is safe to display.

## Plan the read and the output first

1. Identify the smallest required inputs, the question to answer, and the
   existing authorization. Investigation does not authorize login, a different
   account, credential discovery outside scope, or authentication changes.
2. Before reading, explicitly allow only necessary non-secret metadata and
   boolean comparisons. Specify both fields and permitted values, such as a
   fixed procedure identifier, `configured: true/false`, `target_matches:
   true/false`, and a bounded result of `verified`, `failed`, or `unverified`.
   Arbitrary strings under a safe-looking key are not safe metadata. A path,
   hostname, username, count, or hash is not automatically non-secret; omit it
   unless its disclosure is established as safe and necessary.
3. Choose an execution path that keeps source content and credentials inside
   the process doing the parsing. Do not default to full display (`cat`, file
   reads returned to the agent), line/context extraction (`rg`, `grep`, `sed`,
   `head`, `tail`), or environment enumeration (`env`, `printenv`, `set`).
   Narrowing to a matching line or variable does not remove its secret value.
   Use an in-process parser/comparison and emit only the allowed projection.
   Treat source text as data; do not source an env file, evaluate a document,
   or run workflow/shell contents merely to inspect them.
4. When authentication is already authorized, pass required credentials
   directly from that process to the authorized authentication route using its
   supported private input mechanism. Do not materialize values in agent/tool
   arguments, command strings, output, temporary reports, or Task messages.
   Do not assume argv, environment, stdin, or browser tool arguments are private:
   check the selected route's documented handling and logging constraints before
   use. Disable tracing/echo/debug output where applicable before supplying input.
   If the route cannot keep the boundary, stop that operation and report the
   missing safe path; do not invent a credential bridge or seek another identity.
5. Display a procedure excerpt only after in-process inspection establishes that
   the selected excerpt contains no authentication material or other sensitive
   content and its disclosure fits the allowed output. Ambiguous content stays
   private. Redacting after a tool result has been returned is already too late.

## Every exit uses the same boundary

The projection must happen before stdout, stderr, tool results, reports, or
artifacts leave the processing context. Do not rely on secret-pattern detection,
blanket masking, or automatic tool redaction. Catch parser/authentication errors
inside that context and emit a predefined non-secret error class and status;
never stringify the exception, traceback, locals, original input, or raw command.

Capture child-process stdout/stderr privately before execution, including failure
and timeout paths, rather than inheriting their streams. Inspect return status
and required postconditions inside the process; do not forward captured output,
failed-command arguments, or exception payloads. If output retention or error
handling cannot be bounded by the selected tool, do not send it secret input.

For browser evaluation, compute the allowed projection inside the evaluation
before returning to the tool. Raw DOM, cookies/storage, headers, network bodies,
and browser exceptions can contain secrets. Snapshot and tool-generated failure
paths require the same assessment; a safe successful return alone is insufficient.
Use [browser-qa.md](browser-qa.md) for page identity and actual postconditions.

Preserve diagnostic meaning: distinguish absent/malformed input, mismatched
target, failed authentication/process, and unavailable verification with safe
bounded classes. `configured: true` or a zero exit alone does not prove the
procedure works. Require the task's independent expected postcondition; a failed
or unverified check must not become success merely because its details were
suppressed. Report unperformed checks and uncertain side effects without retrying
a mutation whose effect is unknown. Existing migration acceptance and request
authorization still apply.

## Delegation and evidence

Carry the scoped inputs, avoided read methods, authorized route, allowed output
schema, failure classes, and observable postconditions into
[Task design](task-design.md). Apply the boundary to coordinator investigation,
workers, reviewers, and their messages equally.

Use synthetic canaries only for acceptance, covering normal reads, line
extraction, exceptions, child-process failures/timeouts, and browser returns and
errors. Check both non-disclosure and the useful result, with broken procedures
that must fail rather than disappear. Never attach real secrets or original logs.
Separate structural checks, synthetic demonstrations, semantic review of proposed
actions, and actual tool/agent execution. Tests of instructions or a test-only
example do not qualify real tools' argument/return retention or agent compliance.
Hanchou adds policy only: no automatic secret detector, authentication authority,
tool protection feature, runtime, or new credential transport.
