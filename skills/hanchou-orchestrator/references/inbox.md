# Inbox processing and steering

Use the live messaging and worker contracts with the injected identity. A send
receipt proves durable **enqueue**, a consuming check proves **delivery**, an
explicit recipient response can prove **read/understood**, and a successful ack
proves **batch acknowledgment**. None alone proves **application** of guidance;
check the recipient's stated changed plan and the resulting work/evidence.

For workers as well as coordinators, at each natural checkpoint and immediately
before completion:

1. Read every message in the entire returned Delivery. If tool output is clipped,
   obtain the complete batch through the official inspection/replay surface; do
   not act on a preview as if it were all mail.
2. Process instructions and questions in order, letting later corrections
   supersede earlier ones. Apply relevant changes at a safe operation boundary;
   report an unresolved conflict instead of silently ignoring it. Coordinators
   validate completion against the active Dispatch and decide each settled
   worker's next owner/cleanup under the live guide before acknowledging.
3. Acknowledge the processed Delivery using the live `check --ack` contract and
   the same caller identity. Check its receipt, then process the next returned
   Delivery. Repeat until no pending batch remains at that checkpoint.

A single pre-completion check is insufficient when it replays an unacknowledged
old batch. `--peek`, filters, and truncated output are not substitutes for draining
the inbox. Do not acknowledge unseen/unprocessed rows. An empty inbox is a
point-in-time observation, not proof that a concurrently enqueued instruction
was received; reconcile any known pending critical guidance before acceptance.

For cancellation, safety-critical corrections, or scope changes that invalidate
ongoing work, request an explicit receipt response naming the instruction and
how/when it was applied. Track that obligation in the existing conversation/Task
context. Do not accept success while critical guidance is unreceived or unapplied;
use the official follow-up/review path if completion raced with steering.

Use only attention/wake/nudge or safe-boundary steering supported by the installed
contract for that session type. A successful send and best-effort nudge are not
an interruption guarantee. Do not guess terminal input/control for structured
sessions. If read/ack telemetry or safe interruption is unavailable, say that
Orca capability is unsupported/unverified, seek explicit worker confirmation at
the next checkpoint, and leave acceptance pending. Do not build a delivery layer.
