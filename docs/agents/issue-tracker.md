# Issue tracker: local issues.json

Issues live in `issues.json` at the repo root. It is gitignored: local to this machine, not versioned. Edit it with a short `node -e` script (read, modify, `JSON.stringify(j, null, 2)`, write), never by hand-splicing text.

## Schema

```json
{
  "source": "PRD.md",
  "generated": "YYYY-MM-DD",
  "status_values": ["blocked", "ready-for-agent", "in_progress", "done"],
  "issues": [
    {
      "id": "AG-15",
      "title": "...",
      "status": "ready-for-agent",
      "labels": ["ready-for-agent"],
      "blocked_by": ["AG-12"],
      "user_stories": [3, 7],
      "body": "markdown",
      "comments": [{ "date": "YYYY-MM-DD", "body": "..." }]
    }
  ]
}
```

- `id`: `AG-NN`, next free number (zero-padded). Review tickets use `AG-R<n>`.
- `status`: one of `status_values`. Open = anything but `done`.
- `labels`: triage labels (see `triage-labels.md`) plus repo labels `review` and `needs-environment`.
- `blocked_by`: ids of blocking issues; an issue is unblocked when every one is `done`.
- `user_stories`: story numbers from `PRD.md`, when relevant.
- `body`: markdown with `## What to build` and `## Acceptance criteria` (checkbox list).
- `comments`: optional, appended in order.

## Operations

- **Create**: append an issue with the next id, `status: "ready-for-agent"` (or `"blocked"` if `blocked_by` has open issues).
- **Read**: find by `id`; show body, labels, status, blockers and comments.
- **List**: filter `issues` by `status` and/or `labels`.
- **Comment**: push to `comments`.
- **Apply / remove labels**: edit `labels`.
- **Close**: set `status: "done"` and add a closing comment.

## When a skill says "publish to the issue tracker"

Append a new issue to `issues.json`.

## When a skill says "fetch the relevant ticket"

Read the issue with that `id` from `issues.json`.

## Wayfinding operations

Used by `/wayfinder`.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog in `body`.
- **Child ticket**: an issue with `"parent": "<map id>"`, labelled `wayfinder:<research|prototype|grilling|task>`.
- **Blocking**: `blocked_by`.
- **Frontier query**: open children of the map with no open blocker and `status` not `in_progress`; lowest id wins.
- **Claim**: set `status: "in_progress"`, the session's first write.
- **Resolve**: comment with the answer, set `status: "done"`, then append a pointer (gist + id) to the map's Decisions-so-far.
