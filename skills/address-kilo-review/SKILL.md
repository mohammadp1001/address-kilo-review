---
name: address-kilo-review
description: Reference for the review-loop-owner subagent's tooling (review-loop.mjs, guard-hook.mjs) and per-repo config (.claude/review-loop.config.json) - reviewer login, rebuttal round limit, token/time budgets. Load this when you need the config schema, dependency list, or CLI usage for the Kilo Code review loop; to actually run the loop, spawn the review-loop-owner agent instead.
---

Reference documentation and tooling for the Review Loop described in
`CONTEXT.md` and `docs/adr/0001-*.md` / `docs/adr/0002-*.md`: getting a PR
from "pushed for review" to Green (every Reviewer-opened thread resolved),
or to Escalation if a thread won't settle or the loop's budget runs out.

**This skill does not spawn anything.** The entry point is the
`review-loop-owner` subagent (`agents/review-loop-owner.md`) - spawn it
directly. That agent is the one place with the actual step-by-step loop,
the known GitHub API traps, and the escalation rules; it loads this skill
(or just reads `review-loop.mjs`/this file directly) when it needs the
config schema or dependency details below. Don't re-add loop steps here -
update `review-loop-owner.md` instead.

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
