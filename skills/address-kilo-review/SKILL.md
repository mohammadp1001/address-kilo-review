---
name: address-kilo-review
description: Own a PR through Kilo Code's review until it's Green - triage each comment as a fix or a rebuttal, wait out review rounds, and escalate to a human instead of arguing forever or unilaterally overriding a real bug. Use right after pushing a PR for review, or to resume watching a PR whose review is still in progress.
---

Runs the Review Loop described in `CONTEXT.md` and `docs/adr/0001-*.md` /
`docs/adr/0002-*.md`: a single subagent that owns one PR from "pushed for
review" to Green (every Reviewer-opened thread resolved), or to Escalation
if a thread won't settle or the loop's budget runs out.

**The loop logic itself lives in `agents/review-loop-owner.md`, not here.**
That file is the subagent definition - it's the one place with the actual
step-by-step loop, the known GitHub API traps, and the escalation rules.
Keeping it in one file (instead of also duplicating it in this SKILL.md)
is deliberate: a past version of this SKILL.md drifted out of sync with
what real usage taught the agent file, including missing a real bug in
`review-loop.mjs` itself. Don't re-add loop steps here - update
`review-loop-owner.md` instead.

## What to do

1. Ensure `review-loop.mjs` (this directory) is reachable from the target
   repo, and confirm `gh` is authenticated there.
2. Spawn the `review-loop-owner` subagent (`Agent` tool, fresh, not a
   fork - it must survive independently of this conversation) with its
   spawn prompt containing everything `review-loop-owner.md` says it needs:
   the repo's local working directory, the PR number, the PR's branch, and
   a one-to-two sentence summary of what the PR changes.
3. Return control to whoever invoked this skill immediately - don't wait
   inline. The subagent reports back exactly once, when the PR is Green or
   Escalated.

## Dependencies

- `gh` CLI, authenticated, on `PATH`.
- The `issue-metrics` skill (https://github.com/mohammadp1001/pr-metrics) -
  **only** if `tokenBudget` or `timeBudgetHours` is set in config. With both
  left `null` (the default), this skill has no dependency on it.

## Config

Read `<repo-root>/.claude/review-loop.config.json`. `review-loop.mjs`
creates it with defaults on first run if missing:

```json
{
  "reviewerLogin": "kilo-code-bot",
  "rebuttalRoundLimit": 3,
  "tokenBudget": null,
  "timeBudgetHours": null
}
```

- `reviewerLogin` - exact GitHub login Kilo Code posts under, as it appears
  in `review-loop.mjs threads`' output (GraphQL `author.login`) - not the
  REST `pulls/.../reviews` endpoint's `user.login`. GitHub's GraphQL API
  drops the `[bot]` suffix REST includes for bot accounts (observed: REST
  `kilo-code-bot[bot]` vs GraphQL `kilo-code-bot` for the same account), so
  cross-checking against REST gives you the wrong string. Run `threads`
  once on a real PR and read the login back from there before trusting the
  default.
- `rebuttalRoundLimit` - max times a single thread can be rebutted before
  Escalation (see ADR-0002).
- `tokenBudget` / `timeBudgetHours` - `null` means unset (no budget
  enforced). Leave unset until you've observed a few real runs' costs via
  `issue-metrics` - don't invent numbers.
