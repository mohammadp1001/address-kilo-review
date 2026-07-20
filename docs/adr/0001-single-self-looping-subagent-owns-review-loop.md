# Single self-looping subagent owns the Review Loop

The main agent needs something to wait out Kilo Code's review rounds and react to comments across however many rounds it takes, without the main agent babysitting that state itself. We decided the main agent spawns exactly one subagent per PR, which re-enters itself after each `ScheduleWakeup` (via the `/loop` mechanism) and holds all Review Round history — comments already triaged, per-thread Rebuttal Round counts, Budget spend — in its own context, reporting back to the main agent only once, at the end.

We considered having the main agent re-spawn a fresh subagent for each new round instead, with the main agent tracking round history and feeding it into each new subagent's prompt. We rejected this because it forces state (which threads are resolved, how many rebuttals each has had) to be reconstructed or persisted externally every round, rather than living naturally in one subagent's memory.

## Consequences

If the subagent process is lost (crash, session end) mid-loop, its round history is lost with it — a resumed Review Loop starts by re-deriving state from GitHub (thread resolution status) rather than from memory of prior rounds.
