#!/usr/bin/env node
// PreToolUse hook (Bash) guarding the review-loop-owner subagent against a
// small set of destructive/overreaching actions that a system prompt can
// only discourage, not prevent: force-pushing, hard-resetting, or
// merging/closing the very PR it's supposed to be getting reviewed - all of
// which should go through a human instead. Scoped to agent_type ===
// "review-loop-owner" only - never blocks anything for any other agent or
// session on this machine.
//
// Install as a PreToolUse hook (matcher: "Bash") in ~/.claude/settings.json.
// Reads the hook's JSON payload from stdin, writes an allow/deny decision
// to stdout. Zero npm dependencies.

import { readFileSync } from "node:fs";

const REASON =
  "review-loop-owner may never merge or close a PR, force-push, or hard-reset - " +
  "escalate to a human instead (see agents/review-loop-owner.md's Escalate section).";

const BLOCKED_PATTERNS = [
  /\bgit\s+push\b.*(--force\b|--force-with-lease\b|(?<![\w-])-f\b)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+pr\s+close\b/,
  /\bgh\s+api\s+graphql\b.*(mergePullRequest|closePullRequest)/,
];

function allow() {
  console.log(JSON.stringify({}));
  process.exit(0);
}

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // Malformed input isn't this hook's problem to fail loudly over - let the
  // tool call proceed rather than breaking every other agent's session.
  allow();
}

if (payload.agent_type !== "review-loop-owner" || payload.tool_name !== "Bash") {
  allow();
}

const command = payload.tool_input?.command ?? "";
if (BLOCKED_PATTERNS.some((re) => re.test(command))) {
  deny(REASON);
} else {
  allow();
}
