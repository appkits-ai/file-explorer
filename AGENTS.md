# File Explorer Agent Harness

This repository is the APPKits File Explorer plugin. Treat this file as the root harness for every agent session in this checkout and in repo-local worktrees.

## Start Here

- Work from `/home/agent/workspace/appkits/file-explorer` on `main`, or from a repo-local `.worktrees/<task>` checkout created by `git worktree`.
- Check `git status --short` before editing. Preserve user changes and do not clean or remove dirty worktrees unless explicitly asked.
- Keep runtime state out of git. `.codegraph/`, `.codex/container-state/`, `node_modules/`, `dist/`, and `.worktrees/` are local-only.
- Use CodeGraph for source navigation when available. Run `codegraph status`, `codegraph node <symbol-or-file>`, `codegraph callers <symbol>`, and `codegraph impact <path>` before changing shared flows.

## Code Quality And Reuse Gates

- `npm run lint` is a zero-warning gate. Do not introduce warning backlog or relax `--max-warnings 0`.
- Do not add unscoped `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `any` as an escape hatch. If a suppression is unavoidable, scope it to the smallest line and explain the debt in the same change.
- Do not add unused files, exports, dependencies, scripts, manifest fields, or unreachable UI branches. Use ESLint, TypeScript, CodeGraph callers/impact, `rg`, and tests to prove reachability.
- Avoid copy/paste across file-model, menu, view-state, SDK install, and plugin runtime flows. Repeated blocks over roughly 40 lines should become shared helpers/services, or be documented as a temporary exception with a cleanup path.
- New source files should stay below these effective-line targets unless the task explicitly justifies a larger unit:
  - Route/page/shell: 300 lines.
  - UI component: 250 lines.
  - Hook/composable: 200 lines.
  - Service/API client/use case: 500 lines.
  - Domain/model/schema helper: 800 lines.
  - Test/spec file: 700 lines.
- Touched files over 800 effective lines are legacy-risk. Before changing one, inspect CodeGraph callers/impact, identify reusable helpers, and state whether the change extracts, narrows, or intentionally defers a split.
- Touched files over 2,000 effective lines are high-risk. Do not add unrelated behavior there without a split plan.

## Path Presentation And Authority

- Breadcrumb chrome presents the selected profile root as separate `home > agent` segments.
- `/home` is a virtual presentation parent only. Clicking it must normalize back to `/home/agent` before directory state or SDK calls change, and it must never expose sibling home directories.
- Launch params, path editing, listing, reading, writing, moving, deleting, and transfer operations remain rooted at canonical `/home/agent/**` paths.
- Canonical `/home/agent/**` input and supported `home/**` aliases remain accepted; parsing `home/agent/**` must not duplicate the `agent` segment.

## Verification

Run the smallest relevant set, and run the full set before committing harness or shared behavior changes:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

For docs-only harness edits, `git diff --check` plus a CodeGraph status check is acceptable when no executable code changed.
