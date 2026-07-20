# Fix-or-rebut-with-escalation policy for Kilo Code comments

Kilo Code, like any automated reviewer, can flag false positives (e.g. a parameterized query mislabeled as SQL injection). We decided the subagent judges each comment rather than complying unconditionally: if the concern is valid it changes code, if not it replies with a rebuttal — and if a thread survives past the Rebuttal Round limit, or the Review Loop exceeds its token/time Budget (measured via `pr-metrics`), the subagent escalates to the human instead of resolving the thread itself.

We considered always-fix (treat every comment as valid, never argue back). We rejected it because it gives Kilo Code unilateral veto power over the codebase even when it's objectively wrong, which isn't how a human contributor would behave with an overzealous reviewer. We also considered fix-or-rebut without any escalation valve, and rejected that because an autonomous subagent that can talk itself out of a real bug, with nobody checking, is a worse failure mode than occasionally bothering a human.

## Consequences

The subagent needs a config-driven Reviewer login, Rebuttal Round limit, and Budget ceilings (see Review-Loop Config in CONTEXT.md) — this policy has no fixed thresholds baked in, so a repo with no tuned config falls back to defaults that haven't been validated against real Kilo Code behavior yet.
