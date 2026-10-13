# Preserve improvement notes until remote content is verified

Observed: A remote write returned a timeout and its result was unknown.
Desired: Retain the local note until the destination and content can be read back.
Reproduction: Use a synthetic request whose response is disconnected after send.
Acceptance: Reconcile a prior attempt before retrying, then remove only verified,
unchanged source portions while preserving pending and newly appended material.
Unknowns: A timeout alone does not establish whether the server accepted the write.
