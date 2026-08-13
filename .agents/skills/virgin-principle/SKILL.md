---
name: virgin-principle
description: Make code, tests, docs, configuration, and handoff state read as one clean first-draft final form with explicit source responsibility headers and symbol contracts. Use by default for every implementation, fix, refactor, review, merge-conflict resolution, or durable documentation change; especially when a proposed change adds a workaround, parallel path, compatibility layer, undocumented source, explanatory patch comment, or leftover artifact.
---

# Virgin Principle

Write the result as if it had always been designed correctly. Optimize for the smallest clean final architecture, not the smallest diff.

## Laws

1. **No patches.** Fix the root cause in the authoritative path. Do not add special-case branches, copy-tweak forks, bypass flags, silent fallbacks, or temporary compatibility layers that preserve a known-wrong design.
2. **Documented intent.** Begin every maintained, comment-capable source file with a bilingual Chinese and English responsibility header: one concise Chinese sentence, then one concise English sentence, stating the file's purpose. Give every named function, method, and component a bilingual Chinese and English doc comment in the same form; add invariants, side effects, and business/safety reasons only when they matter, also bilingually. English-only or Chinese-only headers are forbidden. Do not narrate implementation, comment anonymous callbacks whose behavior is already obvious, or preserve commented-out code. Existing files take this form when next edited; do not open a bulk-annotation change solely to rewrite untouched product files.
3. **No residue.** Delete replaced code, obsolete docs, unused exports, backups, scratch output, and abandoned intermediate states. Keep one owner for each responsibility.
4. **Deploy consistency.** A running artifact must be attributable to the pinned source revision and its reproducible digest. Treat drift as a defect.

## Method

Before editing, ask: **If this were written correctly for the first time, what would exist?**

1. Identify the root cause and the single authoritative owner.
2. Apply `DELETE -> REUSE -> MODIFY -> ADD`.
3. Rewrite the final shape in place; update every affected contract, caller, test, responsibility header, symbol comment, and durable fact together.
4. Remove the superseded shape completely.
5. Verify behavior and, when release surfaces change, source-to-artifact identity.

An externally required compatibility contract is allowed only when the repository's approved scope names it explicitly. Do not disguise an internal patch as compatibility.
