---
name: issue-delivery
description: Deliver work as GitHub Issues inside one composed workspace. Use after the workspace preamble is loaded; members come from that preamble and `.agents/workspace.json`.
---

# Issue delivery

GitHub Issues are the only durable task tracker inside the current composed workspace. Do not create SpecKit packages, `.agent/goal.md` locks, or goal-loop queues. A product or factory roadmap `TODO.md` is not the delivery lock.

## Members

Read the workspace preamble in `AGENTS.md` and `.agents/workspace.json`. Those files name the members and default bases. `host_path` is an example layout, not a Cursor environment requirement. Do not load another workspace's rules or open an Issue that spans two workspaces.

## Linking

- Open the living Issue in the owning member before the first PR. A pull request is not a substitute.
- Dominant PR in the owning member: `Fixes #N` or `Closes #N` when the Issue lives in that same repository.
- Sibling PRs in other members of the same workspace: `Refs owner/repo#N`.
- Cross-repository `Fixes` cannot close another repository's Issue; do not pretend it can.

At most one open pull request per member repository. If one exists, inspect it: merge if complete, close if already done, stale, or superseded, rebase if behind; then open the new PR. Do not stop the new workstream solely because another PR is open.

## Freshness gate

Before durable edits, run `bash scripts/agent-issue-gate.sh` when the script exists, or do the same checks by hand:

1. Fetch each member's `origin/<base>`.
2. Process existing open PRs in this repository before opening another.
3. Do not start a duplicate Issue for the same stream.
4. After **this** workstream's PR is open, stop expanding it. That PR may only receive CI fixes or review replies.

Worktrees are optional. When used, create them with native `git worktree` under `.worktrees/<task>` from the member's current `origin/<base>`.

## Stop states

Every run ends with exactly one of `DONE`, `BLOCKED`, `STOPPED_OUT_OF_SCOPE`, `STOPPED_BUDGET`, `STOPPED_DUPLICATE_PATH`, or `NEEDS_REVIEW`.
