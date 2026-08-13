# AGENTS.md — AppKits File Explorer

This repository is the AppKits File Explorer plugin (`@appkits-ai/plugin-file-explorer`). Treat this file as the root harness for every agent session in this checkout and in repo-local worktrees.

## Workspace AppKits

This checkout is a member of **Workspace AppKits**. Host path: `/home/agent/workspace/appkits/<repo>`. Do not load BlockReq, w3kits, or other workspace rules. `project-harness-skill` is the shared contract factory, not a member.

| Member | Role | Default base |
| --- | --- | --- |
| `appkits-ai/core` | SDK, UI, shared eslint, desktop/host product contracts | `main` |
| `appkits-ai/file-explorer` | File manager plugin `@appkits-ai/plugin-file-explorer` | `main` |
| `appkits-ai/monaco-vscode-api` | Upstream monaco-vscode-api fork; AppKits plugin lives only under `appkits-editor/` as `@appkits-ai/vscode-editor` | `main` |

Route work to the owning member before loading that member's overlay. One GitHub Issue covers this workspace only. The dominant PR uses `Fixes #N` or `Closes #N`; sibling PRs in other members use `Related: owner/repo#N`. At most one open PR per member for that Issue. Typical order: SDK contract changes land in `appkits-ai/core` first; plugin members bump `CORE_REF` / SDK only after that core change is merged and the SHA is pinnable. Plugin-only UI may ship as a single-member PR.

### Freshness gate

Before durable edits, fetch each member's `origin/<base>` and inspect open PRs for this Issue. Do not start a new Issue on another unmerged branch. An unmerged PR may only receive CI fixes or review replies; do not expand its scope. After the Issue's PRs are open, stop and wait for review or merge. Run `bash scripts/agent-issue-gate.sh` when the script exists.

## This repository

Load `.agents/skills/issue-delivery/SKILL.md` for linking rules. Work from `/home/agent/workspace/appkits/file-explorer` on `main`, or from a repo-local `.worktrees/<task>` checkout created by `git worktree`.

- Check `git status --short` before editing. Preserve user changes and do not clean or remove dirty worktrees unless explicitly asked.
- Keep runtime state out of git. `.codegraph/`, `.agents/runtime/container-state/`, `.codex/container-state/`, `node_modules/`, `dist/`, and `.worktrees/` are local-only.
- Use CodeGraph for source navigation when available.
- Do not invent a private filesystem protocol. Listing, reading, writing, moving, deleting, and transfer operations go through `@appkits-ai/sdk/client`.
- Do not treat unpublished `appkits-ai/core` APIs as released. Bump `CORE_REF` in `scripts/install-appkits-sdk.mjs` only after the core change is merged and the SHA is pinnable.
- GitHub Issues are the only durable task tracker. Do not create SpecKit packages, `specs/` delivery trees, or a goal lock. Shell/menu/view acceptance lives in `tests/file-model.spec.ts` and `tests/mobile-menu.spec.ts`.

## Path presentation and authority

- Breadcrumb chrome presents the selected profile root as separate `home > agent` segments.
- `/home` is a virtual presentation parent only. Clicking it must normalize back to `/home/agent` before directory state or SDK calls change, and it must never expose sibling home directories.
- Launch params, path editing, listing, reading, writing, moving, deleting, and transfer operations remain rooted at canonical `/home/agent/**` paths.
- Canonical `/home/agent/**` input and supported `home/**` aliases remain accepted; parsing `home/agent/**` must not duplicate the `agent` segment.

## Code quality and reuse gates

- `npm run lint` is a zero-warning gate. Do not introduce warning backlog or relax `--max-warnings 0`.
- Do not add unscoped `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `any` as an escape hatch. If a suppression is unavoidable, scope it to the smallest line and explain the debt in the same change.
- Do not add unused files, exports, dependencies, scripts, manifest fields, or unreachable UI branches.
- Avoid copy/paste across file-model, menu, view-state, SDK install, and plugin runtime flows.

## Verification

Run the smallest relevant set, and run the full set before committing harness or shared behavior changes:

```bash
bash scripts/agent-issue-gate.sh
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

For docs-only harness edits, `git diff --check` is acceptable when no executable code changed.
