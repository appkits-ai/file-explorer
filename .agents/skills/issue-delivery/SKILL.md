---
name: issue-delivery
description: Deliver work as GitHub Issues inside one composed workspace. Use after the workspace preamble is loaded; members come from that preamble and `.agents/workspace.json`.
---

# Issue delivery

GitHub Issues are the only durable task tracker inside the current composed workspace. Do not create SpecKit packages, `.agent/goal.md` locks, or root TODO ledgers.

## Members

Read the workspace preamble in `AGENTS.md` and `.agents/workspace.json`. Those files name the members, default bases, and host path. Do not load another workspace's rules or open an Issue that spans two workspaces.

## Linking

- Dominant PR in the owning member: `Fixes #N` or `Closes #N` when the Issue lives in that same repository.
- Sibling PRs in other members of the same workspace: `Related: owner/repo#N`.
- Cross-repository `Fixes` cannot close another repository's Issue; do not pretend it can.

At most one open PR per member for that Issue.

## Freshness gate

Before durable edits, run `bash scripts/agent-issue-gate.sh` when the script exists, or do the same checks by hand:

1. Fetch each member's `origin/<base>`.
2. Do not start a new Issue on another unmerged branch.
3. An unmerged PR may only receive CI fixes or review replies; do not expand its scope.
4. After the Issue's PRs are open, stop and wait for review or merge.

Worktrees are optional. When used, create them with native `git worktree` under `.worktrees/<task>` from the member's current `origin/<base>`.

## Stop states

Every run ends with exactly one of `DONE`, `BLOCKED`, `STOPPED_OUT_OF_SCOPE`, `STOPPED_BUDGET`, `STOPPED_DUPLICATE_PATH`, or `NEEDS_REVIEW`.
