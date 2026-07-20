# address-kilo-review

A Claude Code skill that closes the loop on an AI code review: once a PR is
pushed, a subagent triages every comment left by an automated reviewer
(e.g. Kilo Code) as a fix or a rebuttal, waits out however many review
rounds it takes, and escalates to a human instead of arguing forever or
silently overriding a real bug.

See [`CONTEXT.md`](./CONTEXT.md) for the domain language (Review Loop,
Review Round, Green, Fix-or-Rebut Triage, Escalation, ...) and
[`docs/adr/`](./docs/adr/) for why the loop is shaped the way it is.

The skill itself lives in
[`skills/address-kilo-review/`](./skills/address-kilo-review/).

## Dependencies

- `gh` CLI, authenticated, on `PATH`.
- The [`issue-metrics`](https://github.com/mohammadp1001/pr-metrics)
  skill - **only** needed if you set `tokenBudget` or `timeBudgetHours` in
  config (see below). With both left `null` (the default), this skill has
  no dependency on it.

## Usage

### Install the skill

Symlink (or copy) the skill directory into Claude Code's skills folder so
it's available in any repo:

```
ln -s /path/to/address-kilo-review/skills/address-kilo-review ~/.claude/skills/address-kilo-review
```

### Invoke it

From inside the repo whose PR you want reviewed:

```
/address-kilo-review
```

- With no PR specified, it targets the PR for the current branch.
- Run it right after pushing a PR for review, or later to resume watching
  a PR whose review is already in progress (e.g. after an interruption).
- It spawns a subagent that loops on its own - the invocation returns
  control to you immediately, and the subagent reports back only once,
  when the PR goes Green or an Escalation fires.

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
