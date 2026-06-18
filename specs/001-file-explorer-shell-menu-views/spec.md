# Spec 001: File Explorer Shell Menu And Views

Status: in-progress
Last reviewed: 2026-06-18

The File Explorer marketplace plugin must behave like a host-integrated desktop
file manager while keeping system-owned UI in the parent shell.

## Goals

- List the active directory directly so `/home/agent/.config` and its plugin
  folders are visible.
- Use the APPKits SDK context menu protocol instead of iframe-local menu UI.
- Make Refresh and Delete toolbar buttons execute real SDK operations and
  update state.
- Add file icons, image thumbnails, tooltips, and Details/List, Icon Grid, and
  Gallery views.

## Non-Goals

- No Core built-in File Explorer migration.
- No new persistent view-mode storage contract.
- No private filesystem protocol outside `@appkits-ai/sdk/client`.

## Acceptance Criteria

- Tests cover direct current-directory listing, `.config` navigation, toolbar
  actions, context-menu request/selection, icons/thumbnails, and view switching.
- Build and typecheck pass for the independent plugin repository.
