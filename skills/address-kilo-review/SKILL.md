---
name: address-kilo-review
description: Own a PR through Kilo Code's review until it's Green - triage each comment as a fix or a rebuttal, wait out review rounds, and escalate to a human instead of arguing forever or unilaterally overriding a real bug. Use right after pushing a PR for review, or to resume watching a PR whose review is still in progress.
---

Runs the Review Loop described in `CONTEXT.md` and `docs/adr/0001-*.md` /
`docs/adr/0002-*.md`: a single subagent that owns one PR from "pushed for
review" to Green (every Reviewer-opened thread resolved), or to Escalation
if a thread won't settle or the loop's budget runs out.

**This skill spawns a subagent that loops itself.** Don't try to run the
loop steps below in the invoking (main) agent's own context - spawn a
subagent (`Agent` tool, fresh `general-purpose` type, not a fork - it needs
to survive independently of the main conversation) with this skill's
instructions as its prompt, then return control to the user. The subagent
reports back exactly once, at the end.

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
  `pr-metrics` - don't invent numbers.

## The loop

One Review Round per iteration:

1. **Check status.**
   `node skills/address-kilo-review/review-loop.mjs status [pr-number]`
   If `green: true`, stop - report success to whoever spawned this subagent
   and end. Don't loop further.

2. **List threads.**
   `node skills/address-kilo-review/review-loop.mjs threads [pr-number]`
   Each entry has `isResolved`, `rebuttalCount`, `firstCommentId`, and the
   full comment history. Skip anything already `isResolved: true`.

3. **Check the budget** (skip this step entirely if both `tokenBudget` and
   `timeBudgetHours` are `null` in config - that's the "unset" default and
   means no budget is enforced). Requires the `issue-metrics` skill from
   https://github.com/mohammadp1001/pr-metrics to be installed
   (`~/.claude/skills/issue-metrics/`) - if it isn't, say so and skip this
   check rather than failing the whole loop over it. Run:

   ```
   node ~/.claude/skills/issue-metrics/issue-metrics.mjs [pr-number] --dry-run
   ```

   and compare its JSON output's `tokens.total` against `tokenBudget`, and
   `durationHours` against `timeBudgetHours` (only compare the ones that
   are non-`null`). If either configured budget is exceeded -> go to
   **Escalate** instead of triaging.

4. **Fix-or-Rebut Triage each unresolved thread:**
   - If `rebuttalCount >= rebuttalRoundLimit` for this thread -> **Escalate**
     for this thread specifically (don't resolve it, don't reply again -
     leave it for the human).
   - Otherwise, read the thread's comments and the code they reference.
     Judge validity:
     - **Valid concern** -> make the code change, commit, push. Reply via
       `node review-loop.mjs reply <firstCommentId> --body "..." [--pr <n>]`
       explaining what changed. Then
       `node review-loop.mjs resolve <threadId>`.
     - **Invalid concern** (false positive, already handled elsewhere, out
       of scope) -> reply via `review-loop.mjs reply` explaining *why*,
       citing specifics (line numbers, existing tests, prior commits) - a
       bare "this is fine" is not a rebuttal. Then `resolve <threadId>`.

5. **Wait for the next round.** If any threads were fixed or rebutted this
   round, Kilo Code will likely re-review. Use `ScheduleWakeup` (not a
   sleep loop) with a delay matched to how fast Kilo Code has actually been
   responding on this PR so far (a few minutes if unobserved) and pass this
   same skill/prompt back so the loop re-enters at step 1.

## Escalate

Stop resolving threads unilaterally. Post a PR comment (`gh pr comment`)
naming the specific thread(s) or budget that triggered escalation and why,
then use `PushNotification` to alert the human directly. End the subagent
here - do not continue looping past an escalation. Report the same
information back to whoever spawned this subagent.

## Notes

- Never resolve a thread you haven't actually replied to (fix or rebuttal)
  - resolving without a paper trail defeats the point of Fix-or-Rebut
    Triage (see CONTEXT.md's "Flagged ambiguities").
- `rebuttalCount` from `review-loop.mjs threads` is a count of non-Reviewer
  replies already in the thread - it assumes no human has also posted in
  that thread. If a human *has* replied in a thread, treat that thread as
  already escalated (a human is already involved) rather than continuing
  to triage it automatically.
