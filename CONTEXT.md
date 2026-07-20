# address-kilo-review

Automates closing out a PR after an AI reviewer (Kilo Code) leaves comments: a subagent triages each comment, fixes or rebuts it, and loops with Kilo Code until the PR is green or a budget/argument limit forces a human back in.

## Language

**Review Loop**:
The subagent-owned process that starts once the main agent's PR work is pushed, and ends when the PR is Green or an Escalation fires.
_Avoid_: "the automation," "the bot"

**Review Round**:
One pass of: Kilo Code posts comments -> subagent triages each -> subagent fixes or rebuts -> subagent waits for Kilo Code's next pass. Rebuttal Rounds are counted per-thread, not per-Review Round.
_Avoid_: "iteration," "cycle"

**Reviewer**:
The GitHub identity whose comments the Review Loop reacts to (e.g. Kilo Code). Configured per-repo by login, not hardcoded, since the account name isn't guaranteed stable across setups.
_Avoid_: "Kilo Code" as a hardcoded assumption in code — always resolve through config.

**Green**:
The stop condition for the Review Loop: every review thread opened by the Reviewer is resolved. Not the same as the Reviewer posting an explicit approval — thread resolution is the authoritative signal.
_Avoid_: "approved," "passing"

**Fix-or-Rebut Triage**:
For each unresolved comment, the subagent judges validity: if valid, it changes code and resolves the thread; if it judges the concern invalid, it replies with a rebuttal and resolves the thread without a code change.
_Avoid_: "addressing comments" (ambiguous about whether code changes are involved)

**Rebuttal Round**:
One rebuttal reply on a single thread. If the Reviewer re-flags the same thread after a Rebuttal Round, that's a second Rebuttal Round on that thread. Exceeding the configured limit on a thread triggers Escalation.

**Budget**:
The token-spend and wall-clock-time ceiling for a Review Loop, measured via the `pr-metrics` tool. Exceeding either triggers Escalation.

**Escalation**:
The Review Loop pausing and notifying the human (via push notification and a PR comment) instead of resolving a thread unilaterally. Triggered by exceeding the Rebuttal Round limit on any thread, or exceeding the token or time Budget.

**Review-Loop Config**:
Per-repo config file holding the Reviewer login, Rebuttal Round limit, and token/time Budget ceilings. Ships with sane defaults; repos tune it as they observe real Kilo Code behavior.

## Relationships

- A **Review Loop** is owned by exactly one self-looping subagent, spawned once by the main agent per PR
- A **Review Loop** consists of one or more **Review Rounds**, repeating until **Green** or an **Escalation**
- Each **Review Round** applies **Fix-or-Rebut Triage** to every comment from the **Reviewer**
- A thread accumulates **Rebuttal Rounds**; exceeding the limit in **Review-Loop Config** triggers **Escalation**
- A **Review Loop**'s **Budget** is checked against **Review-Loop Config**; exceeding it also triggers **Escalation**

## Example dialogue

> **Dev:** "So once Kilo Code approves the PR, the loop is done?"
> **Domain expert:** "No — Kilo Code doesn't need to post an approval for us to consider it **Green**. We only care that every thread it opened is resolved. Some setups never emit an explicit approval at all."
>
> **Dev:** "And if the subagent thinks a comment is a false positive, does it just close the thread?"
> **Domain expert:** "It replies first — that's a **Rebuttal Round** — and resolves the thread. But if Kilo Code reopens the same thread after that, we don't let the subagent argue forever. Past the round limit in **Review-Loop Config**, it's an **Escalation**, not another rebuttal."

## Flagged ambiguities

- "convince Kilo Code" (original phrasing) was ambiguous between "always make Kilo Code happy by changing code" and "sometimes argue back." Resolved as **Fix-or-Rebut Triage**: the subagent is allowed to judge and rebut, not just comply.
- "PR is green" could have meant an explicit Reviewer approval state. Resolved: it means thread resolution, not an approval event.
