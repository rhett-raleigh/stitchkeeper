# Issue tracker: Linear

Issues and specs for this repo live in Linear, in the **Stitchkeeper** project
(`P-RD-17`) on the **raleigh-dev** team (key `RD`, so issues are `RD-<n>`).
https://linear.app/raleigh-dev/project/stitchkeeper-cf021aa3bc68

Use the Linear MCP tools (`mcp__claude_ai_Linear__*`) for all operations.

## Conventions

- **Create an issue**: `save_issue` with `team: "raleigh-dev"` and `project: "Stitchkeeper"`. Always set the project; the team holds issues for other repos too.
- **Read an issue**: `get_issue` with the `RD-<n>` identifier, then `list_comments` for the discussion.
- **List issues**: `list_issues` filtered by `project: "Stitchkeeper"`, plus `label` / `state` as needed.
- **Comment on an issue**: `save_comment`.
- **Apply / remove labels**: `save_issue` with the updated label set. Labels are team-scoped; check `list_issue_labels` with `team: "raleigh-dev"` before creating one, so existing labels get reused.
- **Close**: `save_issue` setting the state to Done (or Canceled for won't-do), with a closing comment.

## When a skill says "publish to the issue tracker"

Create a Linear issue in the Stitchkeeper project.

## When a skill says "fetch the relevant ticket"

`get_issue` for `RD-<n>`, plus `list_comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single parent issue with **child** issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map (`parentId`), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, it's assigned to the driving dev.
- **Blocking**: Linear's native "blocked by" relations on the child. A ticket is unblocked when every blocker is Done or Canceled.
- **Frontier query**: the map's open children, minus any that have an open blocker or an assignee. The first in map order wins.
- **Claim**: assign the ticket to `me`. This is the session's first write.
- **Resolve**: comment the answer, move the ticket to Done, then append a context pointer (gist + link) to the map's Decisions-so-far.
