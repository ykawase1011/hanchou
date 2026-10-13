# Initialize a project responsibility policy

`hanchou-init` is an optional, instruction-only setup helper. Invoke it for a
specific project when you want Hanchou's standing responsibilities written down.
Installing it starts no Hanchou session, Run, worker, or Automation. A project
without a policy remains usable for ordinary explicit requests.

1. Identify the exact target project root and ask `hanchou-init` to discuss
   responsibilities and permission conditions. The default source is
   `.hanchou/policy.md` at that root; you may explicitly choose another source.
2. Review the proposed responsibilities, project root, and selected policy path.
   For material missing permissions, the helper offers localized **Allow**,
   **Ask each time**, or **Do not do** choices, plus freeform conditions. Already
   specified permissions are reused. Irrelevant or deferred actions, including
   publication/deployment, may stay unspecified; a real task that needs one
   asks then. Unspecified does not mean allowed or prohibited.
3. Approve or correct the concrete proposal only if approval is still needed.
   A fully specified, authorized request proceeds directly, and answers that
   settle the material gaps do not trigger another confirmation. Displayed,
   recommended, or preselected choices and silence do not grant consent. The
   helper writes only the approved static policy
   and the target repository's local Git `info/exclude` entry when needed. It
   does not edit shared `.gitignore`, `AGENTS.md`, `CLAUDE.md`, global settings,
   or Automations, and it does not activate Hanchou.

The helper resolves the selected destination, including symlinks at the default
path, before writing. It reports an external or shared destination for a
specific decision instead of silently overwriting it.

Codex example: `$hanchou-init を使って、このprojectのHanchou責任方針を初期化してください。`
For Claude Code, use `/hanchou-init`. Starting Project Hanchou remains a
separate explicit `$hanchou-orchestrator` or `/hanchou-orchestrator` request.

## Language and permission questions

Questions, proposals, permission choices, and the final report use your explicit
response-language preference first, then your current conversation language,
then the project's documentation language if the conversation gives no clear
signal. English tool output, quoted text, and skill instructions do not select
English on your behalf. An unclear language signal uses a reversible display
default you can correct; it does not require a separate approval step.

The policy document has its own language choice. An existing policy keeps its
language and custom sections unless you request a change, even when you ask for
responses in another language. A new policy follows your explicit document
language, otherwise the project documentation language when clear, then the
response language. Responses in Japanese do not implicitly translate an
existing English policy.

For example, after you authorize edits and tests but leave relevant PR and merge
permissions open in a Japanese conversation, a proposal can say:

> 担当範囲はこのプロジェクトの不具合修正とテストです。対象は `/work/project`、
> 保存先は `/work/project/.hanchou/policy.md` です。編集とテストは許可済みです。
> PR 作成とマージの権限をそれぞれ選んでください：許可／毎回確認／行わない。
> 「PR は許可、マージはテスト成功後に毎回確認」のように条件も自由に書けます。
> 今回使わない公開・デプロイは未指定のままにします。担当範囲や保存先も修正できます。

This example is a proposal, not consent. An unanswered PR or merge choice stays
unsettled; an answer about PRs alone does not authorize merging. The helper keeps
dependent changes pending and continues already authorized independent work.

## Policy source and later use

The default policy is local and commonly ignored. Git's `info/exclude` path
must be discovered with `git rev-parse --git-path info/exclude`, since linked
worktrees can store it outside the visible checkout's `.git` entry. An ignored
file does not appear in a fresh worktree, clone, or remote host. Select an
explicit stable source or place a reviewed copy where that session can read it;
do not expect Hanchou to discover a sibling worktree's copy. If a selected
policy source goes missing, Hanchou stops the affected work and reports it.

Cron setup may pin this policy as a **separate** source in the registered
Automation prompt. Each occurrence reads that pinned source once and applies
its current restrictions within the approved job scope. Initializing a policy
later does not retrofit existing Automations; explicitly update each schedule
that should adopt it. A policy file edit cannot expand an existing Task or job.
