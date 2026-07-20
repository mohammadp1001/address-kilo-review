# address-kilo-review

A Claude Code subagent that closes the loop on an AI code review: once a
PR is pushed, it triages every comment left by an automated reviewer (e.g.
Kilo Code) as a fix or a rebuttal, waits out however many review rounds it
takes, and escalates to a human instead of arguing forever or silently
overriding a real bug.

The entry point is the `review-loop-owner` subagent, defined in
[`agents/review-loop-owner.md`](./agents/review-loop-owner.md) - spawn it
directly to run the loop. It's written specifically against Kilo Code's
observed behavior (its exact `[bot]`-suffix login quirk, its
summary-comment wording), so its known traps should be re-verified before
pointing this at a different reviewer bot.

[`skills/address-kilo-review/`](./skills/address-kilo-review/) is *not*
the entry point - it's reference tooling (`review-loop.mjs`,
`guard-hook.mjs`) the agent uses. `review-loop.mjs` itself is
reviewer-agnostic (the login is a config value); only the agent file is
Kilo-Code-specific.

## Dependencies

- `gh` CLI, authenticated, on `PATH`.
- The [`issue-metrics`](https://github.com/mohammadp1001/pr-metrics)
  skill - **only** needed if you set `tokenBudget` or `timeBudgetHours` in
  config (see below).

## Install

Symlink both the skill directory and the agent definition into Claude
Code's global folders so they're available in any repo:

```
ln -s /path/to/address-kilo-review/skills/address-kilo-review ~/.claude/skills/address-kilo-review
ln -s /path/to/address-kilo-review/agents/review-loop-owner.md ~/.claude/agents/review-loop-owner.md
```

## Spawn the subagent

From (or pointed at) the repo whose PR you want reviewed, spawn
`review-loop-owner` directly with, in its spawn prompt:

- the repo's local working directory
- the PR number
- the PR's branch
- one or two sentences on what the PR actually changes

Run it right after pushing a PR for review, or later to resume watching a
PR whose review is already in progress. It loops on its own and reports
back once, when the PR goes Green or an Escalation fires.

It needs `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `ScheduleWakeup`,
`Monitor`, and `PushNotification` as tools - without `PushNotification` it
can still escalate via a PR comment, but not push-notify.

## Safety hook (recommended)

`guard-hook.mjs` is a `PreToolUse` hook that blocks `review-loop-owner`
from force-pushing, hard-resetting, or merging/closing the PR it's
reviewing. It checks `agent_type` in the hook payload and only acts on
`review-loop-owner`, so it's safe to install once, globally.

Add to `~/.claude/settings.json` (merge into an existing
`hooks.PreToolUse` array if you have one - don't replace it):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"<path-to-installed-skill>/guard-hook.mjs\"" }
        ]
      }
    ]
  }
}
```

## Configure (per repo)

First run creates `<repo-root>/.claude/review-loop.config.json` with
defaults if missing:

```json
{
  "reviewerLogin": "kilo-code-bot",
  "rebuttalRoundLimit": 3,
  "tokenBudget": null,
  "timeBudgetHours": null
}
```

Check `reviewerLogin` against a real PR before trusting the default:

```
node skills/address-kilo-review/review-loop.mjs threads <pr-number>
```

Leave `tokenBudget` / `timeBudgetHours` as `null` until you've observed a
few real runs' cost via:

```
node ~/.claude/skills/issue-metrics/issue-metrics.mjs [pr-number] --dry-run
```

## CLI

`review-loop.mjs` also works standalone:

```
node skills/address-kilo-review/review-loop.mjs status [pr-number]
node skills/address-kilo-review/review-loop.mjs threads [pr-number]
node skills/address-kilo-review/review-loop.mjs reply <comment-id> --body "text" [--pr <n>]
node skills/address-kilo-review/review-loop.mjs resolve <thread-id>
```
