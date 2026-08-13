#!/usr/bin/env bash
# 组合工作区 Issue 交付的新鲜度门：列出并处理已有 open PR 后再开新 PR。
# Freshness gate for composed-workspace Issue delivery: process existing open PRs before opening another.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${root}/.agents/workspace.json" ]]; then
  workspace_file="${root}/.agents/workspace.json"
elif [[ -f "${script_dir}/../.agents/workspace.json" ]]; then
  workspace_file="$(cd "${script_dir}/.." && pwd)/.agents/workspace.json"
else
  echo "agent-issue-gate: missing .agents/workspace.json (repo root or script parent)" >&2
  exit 1
fi

python3 - "${root}" "${workspace_file}" <<'PY'
import json
import subprocess
import sys

root, workspace_file = sys.argv[1], sys.argv[2]
workspace = json.loads(open(workspace_file, encoding="utf-8").read())
members = workspace.get("members") or []
if not members:
    raise SystemExit("agent-issue-gate: workspace members list is empty")

origin = subprocess.check_output(["git", "-C", root, "remote", "get-url", "origin"], text=True).strip()
current_repo = origin.rstrip("/").removesuffix(".git").split("github.com/")[-1]
current_repo = current_repo.split(":")[-1]
member = next((item for item in members if item.get("repo") == current_repo), None)
if member is None:
    raise SystemExit(f"agent-issue-gate: {current_repo} is not a member of {workspace.get('workspace_id')}")

base = member["base"]
subprocess.check_call(["git", "-C", root, "fetch", "origin", base])
behind = subprocess.check_output(
    ["git", "-C", root, "rev-list", "--count", f"HEAD..origin/{base}"],
    text=True,
).strip()
print(f"agent-issue-gate: workspace={workspace.get('workspace_id')} repo={current_repo} base={base} behind_origin_base={behind}")
if int(behind) > 0:
    print(f"agent-issue-gate: warning: HEAD is {behind} commit(s) behind origin/{base}; rebase or merge before expanding scope", file=sys.stderr)

current_branch = subprocess.check_output(
    ["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"],
    text=True,
).strip()

gh = subprocess.run(
    ["gh", "pr", "list", "--repo", current_repo, "--state", "open", "--json", "number,title,headRefName,isDraft,url"],
    capture_output=True,
    text=True,
)
if gh.returncode != 0:
    print("agent-issue-gate: GitHub PR listing unavailable; fetched base only. Inspect open PRs before expanding scope.", file=sys.stderr)
    print(gh.stderr.strip() or gh.stdout.strip(), file=sys.stderr)
    sys.exit(0)

prs = json.loads(gh.stdout or "[]")
print(f"agent-issue-gate: open_prs={len(prs)} current_branch={current_branch}")
for pr in prs:
    print(f"  #{pr.get('number')} {pr.get('headRefName')} draft={pr.get('isDraft')} {pr.get('url')}")

if not prs:
    sys.exit(0)

heads = [pr.get("headRefName") for pr in prs]
if len(prs) == 1 and current_branch in heads:
    print(f"agent-issue-gate: continuing open PR #{prs[0].get('number')} on {current_branch}")
    sys.exit(0)

print(
    "agent-issue-gate: process existing open PRs before opening another: "
    "merge if complete, close if already done/stale/superseded, rebase if behind. "
    "Do not stop the new workstream solely because another PR is open.",
    file=sys.stderr,
)
sys.exit(1)
PY
