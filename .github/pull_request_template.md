## Issues

Merge-blocking: a real `Fixes #N`, `Closes #N`, or `Refs owner/repo#N`. Template placeholders such as `#<n>` fail the gate.

- Fixes #<n> | Closes #<n> | Refs owner/repo#<n>:
- Living development Issue opened before this PR. Sibling PRs use `Refs appkits-ai/core#N`. Do not span BlockReq.

## Outcome

- File operations still go through `@appkits-ai/sdk/client`.
- `CORE_REF` / SDK bumps wait until `appkits-ai/core` is merged and the SHA is pinnable.

## Verification

Merge-blocking.

- Head SHA:
- Commands and results:

## Final state

- State: DONE | BLOCKED | STOPPED_OUT_OF_SCOPE | STOPPED_BUDGET | STOPPED_DUPLICATE_PATH | NEEDS_REVIEW
