# address-kilo-review

A Claude Code subagent that closes the loop on an AI code review: once a
PR is pushed, it triages every comment left by an automated reviewer (e.g.
Kilo Code) as a fix or a rebuttal, waits out however many review rounds it
takes, and escalates to a human instead of arguing forever or silently
overriding a real bug.

See [`CONTEXT.md`](./CONTEXT.md) for the domain language (Review Loop,
Review Round, Green, Fix-or-Rebut Triage, Escalation, ...) and
[`docs/adr/`](./docs/adr/) for why the loop is shaped the way it is.

The actual entry point is the `review-loop-owner` subagent, defined in
[`agents/review-loop-owner.md`](./agents/review-loop-owner.md) - spawn it
directly to run the loop. It's written specifically against Kilo Code's
observed behavior (its exact `[bot]`-suffix login quirk, its
summary-comment wording), so its traps 2 and 3 should be re-verified before
pointing this at a different reviewer bot.

The [`skills/address-kilo-review/`](./skills/address-kilo-review/) skill
is *not* the entry point - it's reference documentation and tooling
(`review-loop.mjs`, `guard-hook.mjs`, the config schema) that the agent
reads or loads as needed. `review-loop.mjs` itself is reviewer-agnostic
(the login is a config value); only the agent file is Kilo-Code-specific.

## Dependencies

- `gh` CLI, authenticated, on `PATH`.
- The [`issue-metrics`](https://github.com/mohammadp1001/pr-metrics)
  skill - **only** needed if you set `tokenBudget` or `timeBudgetHours` in
  config (see below). With both left `null` (the default), this skill has
  no dependency on it.

## Usage

### Install

Symlink (or copy) both the skill directory and the agent definition into
Claude Code's global folders so they're available in any repo:

```
ln -s /path/to/address-kilo-review/skills/address-kilo-review ~/.claude/skills/address-kilo-review
ln -s /path/to/address-kilo-review/agents/review-loop-owner.md ~/.claude/agents/review-loop-owner.md
```

### Spawn the subagent

From (or pointed at) the repo whose PR you want reviewed, spawn
`review-loop-owner` directly with, in its spawn prompt:

- the repo's local working directory
- the PR number
- the PR's branch
- one or two sentences on what the PR actually changes (so it can judge
  Fix-or-Rebut triage without re-deriving the diff's intent from scratch)

Run it right after pushing a PR for review, or later to resume watching a
PR whose review is already in progress (e.g. after an interruption). It
loops on its own - spawning it returns control to you immediately, and it
reports back only once, when the PR goes Green or an Escalation fires.

It needs `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `ScheduleWakeup`,
`Monitor`, and `PushNotification` available as tools - without
`PushNotification` it can still escalate via a PR comment, but can't
deliver the push-notification half of Escalation.

### Safety hook (recommended)

`skills/address-kilo-review/guard-hook.mjs` is a `PreToolUse` hook that
blocks `review-loop-owner` specifically from force-pushing, hard-resetting,
or merging/closing the PR it's supposed to be getting reviewed - actions a
system prompt can only discourage, not actually prevent. It checks
`agent_type` in the hook payload and only acts on `review-loop-owner`, so
it's safe to install once, globally, without affecting any other agent or
session.

Install it in `~/.claude/settings.json` (not per-repo - it needs to be
present wherever the subagent runs, and self-scopes via `agent_type`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<path-to-installed-skill>/guard-hook.mjs\""
          }
        ]
      }
    ]
  }
}
```

Merge this into your existing `hooks.PreToolUse` array if you already have
one - don't replace it. Keep `guard-hook.mjs` in sync with
`~/.claude/skills/address-kilo-review/` if you installed the skill as a
hard copy rather than a symlink (see Install above).

### Configure it (per repo)

First run creates `<repo-root>/.claude/review-loop.config.json` with
defaults if it doesn't exist yet:

```json
{
  "reviewerLogin": "kilo-code-bot",
  "rebuttalRoundLimit": 3,
  "tokenBudget": null,
  "timeBudgetHours": null
}
```

Check `reviewerLogin` against a real review thread on your PR before
trusting the default - confirm the exact login with:

```
node skills/address-kilo-review/review-loop.mjs threads <pr-number>
```

Leave `tokenBudget` / `timeBudgetHours` as `null` until you've observed a
few real runs' cost. The budget check runs:

```
node ~/.claude/skills/issue-metrics/issue-metrics.mjs [pr-number] --dry-run
```

and compares its `tokens.total` / `durationHours` against your configured
ceilings - don't guess numbers up front, and don't set these at all until
`issue-metrics` is actually installed.

### Use the CLI directly

`review-loop.mjs` also works standalone, e.g. to check status without
spawning the full loop:

```
node skills/address-kilo-review/review-loop.mjs status [pr-number]
node skills/address-kilo-review/review-loop.mjs threads [pr-number]
node skills/address-kilo-review/review-loop.mjs reply <comment-id> --body "text" [--pr <n>]
node skills/address-kilo-review/review-loop.mjs resolve <thread-id>
```
