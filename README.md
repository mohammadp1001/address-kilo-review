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
