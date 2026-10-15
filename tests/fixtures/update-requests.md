# Update request forward-test inputs

These are independent synthetic conversations for an instruction-level evaluation,
not live update requests or executable fixtures. Use the repository's update
skill to choose actions and a user-facing outcome for each case. The observations
below are stipulated inputs; do not install, launch, close, or call external APIs.
This file supplies no expected answers. Review the evaluator's decisions separately.

Unless a case says otherwise, installed provenance and complete content comparison
are verified, there are no local edits or active workers, all requests/mail are
settled, pinned sources are accessible, and no launch has been attempted. The
public CLI supports visible independent PTY creation/read-back and exact PTY
closure. The user accepts a normal terminal successor. Successful simulated
adoption includes the successor's own complete comparison and handoff response;
successful simulated closure includes exact endpoint confirmation.

## A: Ordinary update with a placement instruction

User: `hanchou updateして`

Project instructions: keep main for human work; future implementation and
workers belong in explicit child worktrees. Preserve the current conversation
and its bound Run; do not silently move, clone, or rebind them. Future independent
coordinators start normally in a child rather than as workers in the old Run.
The selected skill content changed. The old endpoint is a PTY with no bound Run.

## B: Short declaration, content current

User: `$hanchou-update !`

All selected installed content is current. This conversation is not stale.
The old endpoint is a PTY. There is no Run.

## C: Required adoption and retained old conversation

User: `/hanchou-update ! 旧会話は閉じない`

Selected files changed. The old endpoint is a PTY.

## D: One contradictory request

User: `$hanchou-update ! files-only`

There is no later correction. Selected files changed.

## E: Standing declaration, explicit check-only

User-authored policy: require verified fresh-tab adoption for explicit Hanchou
updates, even if files are current.

User: `Hanchouの更新があるか確認だけして`

Selected files changed.

## F: Feature work containing invocation examples

User: `「$hanchou-update !」で切り替え必須にできるよう設計・実装して。`

No update or session replacement is otherwise requested.

## G: Required structured successor

User: `Hanchouを更新して、新しいstructured chatへの切り替え必須。`

The public CLI has no discovered independent structured create/read contract.
PTY creation is supported. Selected files changed and have been installed/verified.

## H: Supported successor, unsupported old closure

User: `$hanchou-update ! 通常のCodex端末への切り替えでよい`

The old endpoint is a verified structured chat. No public operation for its
exact close has been discovered. The independent PTY successor path is supported.
Selected files changed and have been installed/verified.

## I: Same request after an uncertain launch

Earlier in this same update request, the create call timed out after receiving
a request identifier; its completion is unknown. The original receipt is available.

User follow-up: `同じ更新を続けて。$hanchou-update !`

No positive evidence of a rejected create exists.

## J: New work before closure

User: `$hanchou-update !`

File content and visible successor adoption have been verified. Immediately
before close, a new user request arrives that the old owner has not processed.

## K: Helper changes during an installation-only request

Original user request: `Hanchouを更新して。今回はファイルだけ。`

Installed files now contain instructions documenting `$hanchou-update !`.
The user has supplied no new instruction.

## L: Same Run must survive across owners

User: `$hanchou-update ! 同じRunを新しい会話に引き継ぐことも必須`

The old Run is settled. No public fenced current-Run transfer contract is
available; ordinary run-use binding exists.

## M: Background receipt only

User: `$hanchou-update !`

Create returned a background handle and input acceptance. The successor has
not replied, and visible-tab placement has not been verified.

## N: New conversation sees shadowing content

User: `$hanchou-update !`

The successor is visible and ready but its own comparison finds a project-local
skill that differs from the global verified update. It has not accepted adoption.

## O: Explicit prohibition applying to updates

User-authored standing policy: never open another agent tab, including during
updates, unless I explicitly revoke this prohibition.

User: `$hanchou-update !`

No explicit revocation or other clarification is supplied.

## P: Automated check with a dormant declaration

User-authored policy: require fresh-tab adoption for explicit Hanchou updates.
This is an activated Hanchou checkpoint with no separate update authority.
The update-check result says new content is available.

## Q: Ordinary punctuation

User: `Hanchouを更新して！`

Selected files are current, this conversation is not stale, and no other
reload/adoption declaration is present.

## R: Known local edits

User: `$hanchou-update !`

The installation inventory finds a modified reference file with no supplied
decision about retaining/merging it. There is a new upstream version.
