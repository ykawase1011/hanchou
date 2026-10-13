# Synthetic private input; NEVER upload this fixture

## HN-001: Preserve notes until remote verification
Status: recorded
Observed: Project Silver Orchard at Customer Example Lantern lost a note after
a write through https://relay.private.invalid/customer-47 returned a timeout.
Desired: Keep the note until its remote content is verified.
Evidence: /Users/example-private/Clients/SilverOrchard/trace.log contains
Authorization: Bearer DUMMY_SECRET_DO_NOT_PUBLISH_47 and cookie DUMMY_COOKIE_47.
Private reference: https://github.com/example-private/internal-repo/issues/47
Runtime identifier: task_DUMMY_PRIVATE_47
Unknowns: Whether the write reached the server.

## HN-002: Details cannot safely be generalized
Status: recorded
Observed: A confidential, uniquely identifying customer launch sequence.
Desired: Publish the exact sequence, names, dates, and internal endpoints.
Unknowns: No non-identifying reproduction is available.
