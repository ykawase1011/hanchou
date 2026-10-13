# Maintenance skills acceptance evidence

This covers issues [#1](https://github.com/ykawase1011/hanchou/issues/1) and
[#2](https://github.com/ykawase1011/hanchou/issues/2), the update helper, and the
new global installation default. The older migration reports remain historical.

For issue #26, `make check` and the verbose maintenance suite passed 23 Python
tests plus the shell checks. Real disposable Git/filesystem probes cover the
new `.hanchou/hanchou_update.md` candidate, absent parents, explicit alternative,
tracked paths, negated ignores, exact auxiliary-path ignores, external parent
and file symlinks (including dangling links), exclusive locks, and legacy-only
or both-source files with preserved receipts/drafts/locks. A known legacy receipt
without its memo also remains detectable. Separate-process comparison rejects
an empty or byte-identical new memo when the receipt belongs to the legacy
source. These are storage/comparison primitives and default-document agreement,
not execution of the instruction-only skills by a model or live publication.
The initial absent-directory probe was corrected to use the trailing slash
needed for a directory-only lock ignore rule before creation.

For issue #16, the distribution at that point had four instruction-only skills,
including optional `hanchou-kaizen`. `make check` then ran 14 Python tests and
the shell checks; `make check-installer` passed in a disposable container with
all four skills and a core-only subset that stayed core-only after targeted
reinstall. Skill-creator validation passed for the changed/new skill entrypoints
in a temporary PyYAML environment. These checks establish packaging and
installer isolation, not automatic intent selection by a model. The 13-test and
three-skill results below are historical evidence from the earlier change.

Executed on 2026-10-13: `make check` passed all 13 Python tests and both shell
checks; `make check-installer` passed against `skills` 1.7.2 and Node 22.23.3;
skill-creator's `quick_validate.py` passed for all three skills using a temporary
Python environment with PyYAML. `git diff --check` passed. The initial installer
probe exposed agent-detection dependence in list output; the final fixture
includes empty Codex/Claude configuration directories, with no credentials.

## Evidence and limitations

The earlier `make check` validated the then-current three-skill distribution, absence of production
code/runtime paths, relative reference links, and current install selections.
Python repository tests use actual disposable Git repositories for unignored,
ignored, tracked, negated-ignore and existing-memo cases, and actual exclusive
lock-directory creation for the second-writer case. They do not mutate project
or global Git configuration.

Publication fixtures contain only synthetic private canaries and a generalized
public draft. Automated tests check that those canaries are absent from that
known draft and exercise a test-only outcome oracle for timeout, pending writes,
read-back failure, existing duplicates, cleanup retries, partial coverage and
concurrent edits. A separate-process reload test verifies the private source-
fingerprint comparison primitive for unchanged, edited and missing-evidence
cases; it is not a complete publisher restart. This is fixture/oracle validation, **not** execution of the
skill by a model and **not** proof of semantic confidentiality or live GitHub
idempotency. No new GitHub issue/comment is created by these tests.

`make check-installer` is an opt-in network test using the official `skills`
1.7.2 package in a disposable Node 22 Docker container with a read-only source
mount and no host credentials or home mount. It installed all three then-shipped skills and
an unrelated fixture in global and project scopes, verifies Codex/Claude
placements and listing, then changes the fixture source and reinstalls only the
global update helper. It checks byte-for-byte that other global skills, local
skills, sibling scope and project instructions remain unchanged. This proves
installer placement and targeted reinstall isolation with a local source, not
an update from a live GitHub ref or the updater's decisions about custom edits.

The official contract was inspected through `skills --version`/`--help` and
[installer documentation](https://github.com/vercel-labs/skills), with
[CLI documentation](https://skills.sh/docs/cli) as a second official entrypoint.
`skills` 1.7.2 accepts named updates but may rediscover provider targets; the
helper therefore prefers explicit targeted `add` and preserves existing layout.
Each shipped skill frontmatter must also pass skill-creator's `quick_validate.py`.
That validator checks packaging, not model behavior.

## Acceptance mapping

| Requirement | Instruction/evidence |
| --- | --- |
| #1 destination, trigger, input and update rules | Core skill routes at a task checkpoint to `references/improvement-notes.md`; user path takes precedence over default candidate |
| #26 default and legacy preservation | New `.hanchou/hanchou_update.md` candidate; limited non-following legacy detection; explicit source scope and source-bound receipts; disposable path probes above |
| #1 ignored/unignored/tracked/existing memo | Real Git tests plus path/symlink and private non-Git policy; shared ignores are not changed automatically |
| #1 duplicate/concurrent preservation | Stable IDs, merge same concern, shared editing guard, reread/context checks, defer uncooperative editors |
| #1 secrets and runtime IDs | Minimize/generalize before persistence; excludes raw artifacts and runtime identifiers even in ignored files |
| #1 publisher handoff | Recorded versus published-verified states and per-part cleanup contract |
| #2 explicit publish, routing, duplicates | Helper trigger; live README/owner/archive/deprecation checks; inspect open/closed issue bodies and comments |
| #2 exact payload confidentiality | Synthetic canaries + expected public draft; semantic review includes queries, attachments, metadata and combinations; unsafe items remain local |
| #2 verified success before deletion | Issue and exact comment read-back; canonical repo/URL/content/coverage check |
| #2 timeout and local cleanup retry | Pre-write receipt/token and safe draft; reconcile before repost, unknown outcome stays unresolved |
| #2 partial success and concurrent memo edits | Per-part outcome oracle; only unchanged covered source is removed, append retained, in-place change deferred |
| #2 retained reason and generalized sample | `docs/IMPROVEMENTS.md` and final reporting contract |
| Update helper | Official installer, provenance/baseline checks, preserve subset/scope/targets/ref/method, backups, read-back and unrelated-content verification |
| Global default with optional local | README, onboarding, installation and migration guide; real container placement test |
| No runtime/control plane/manual copy | Instruction-only skills; repository structure guard |

## Independent synthetic execution

A separate Orca worker exercised the draft recorder/publisher instructions with
actual temporary Git files and a file-backed fake GitHub sink. Its saved artifacts
showed generalized recording with zero external calls; rejection of tracked,
negated-ignore, symlink and occupied-lock paths; one create after a timeout and
recovery through a second API page; preservation of a concurrent append and an
edited selected item; and reuse after an injected cleanup write failure. The
run made three fake create calls for three fake issues and zero live remote
writes. It inspected exact simulated outgoing requests for synthetic canaries
and identifying context. This was explicit agent execution with temporary
helpers, not automatic skill discovery or a shipped publisher implementation.

The evaluator identified that a durable original-source fingerprint was not
explicitly required. The final contract now requires private per-part comparison
evidence before the remote write and defers cleanup if that evidence is missing
or source text changed after restart. A separate-process repository test checks
that primitive. The evaluator reloaded receipts within its own process; it did
not test a restarted model, live GitHub, comment/attachment operations, wrong-
owner/archived routing, or stress-test noncooperating concurrent writers. Its
execution predates the fingerprint clarification; final independent review must
assess the resulting diff.

## Independent forward-test cases

Use temporary private fixtures and a mocked GitHub transport; prohibit live
publication, real credentials, and writes outside that fixture. The independent
reviewer should read the skill and raw inputs without this expected-outcome
column. Record actual actions/artifacts separately from these acceptance rules.

| Setup | Required outcome |
| --- | --- |
| `.hanchou` exists but is not ignored; tracked memo also matches ignore | Do not persist there; use only authorized safe local storage or defer without changing shared files |
| Legacy-only, both memos, or empty new memo plus known old receipt | Retain old items/artifacts; explicitly select source for publication; no automatic migration, duplicate backlog or false completion |
| External parent/file symlink at memo or auxiliary path | Stop before following it; unresolved discovery is not an empty legacy source |
| Existing note and duplicate observation; another writer holds lock | Preserve original, defer mutation until safely serialized |
| Synthetic secrets plus project identifiers and identifying combinations | No private values in external queries/payloads; publish only generalized material |
| Unsafe item with no meaningful generalized reproduction | Keep local and explain missing non-sensitive clarification |
| Deprecated candidate, archived candidate, ambiguous current owner | Verify appropriate active successor or ask; no blind posting |
| Similar open or closed issue covers all/part | Verify/reuse or add only missing safe evidence; no duplicate create |
| Timeout after server accepted create/comment | Keep source until read-back; recover matching token; no second write |
| Timeout with no search results or incomplete pagination | Remain unknown, do not infer failure or retry |
| Successful remote write, failed receipt or source cleanup | Recover from pre-write token/draft; reuse URL; selective cleanup |
| One safe part succeeds; unsafe or failed part remains | Report partial and retain all unresolved parts |
| Append elsewhere during network operation | Preserve append while deleting only unchanged verified source |
| Edit same item during network operation or noncooperating editor | Keep changed source and defer cleanup |
| Local + global installs, custom local edits, unrelated skills | Preserve scope and modifications; update only provably unmodified authorized targets |
| Unknown baseline, source symlink, pinned ref, unsupported installer | No destructive overwrite, no broad update fallback |

The independent synthetic execution above is separate from repository checks.
Live GitHub publication, automatic discovery and full process/model restart
behavior remain unqualified; do not infer them from fixture or static results.
