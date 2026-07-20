#!/usr/bin/env node
// Talks to GitHub on behalf of the Review Loop (see CONTEXT.md): lists
// unresolved review threads opened by a configured Reviewer, replies to and
// resolves a thread, and reports whether a PR is Green (every Reviewer
// thread resolved). Zero npm dependencies - only needs node, git, and gh on
// PATH. Works from inside any git repo with a GitHub remote.
//
// Usage:
//   node review-loop.mjs threads [pr-number]
//   node review-loop.mjs resolve <thread-id> --reply "text" [--no-reply]
//   node review-loop.mjs status [pr-number]
//
// Config: <repo-root>/.claude/review-loop.config.json. Created with sane
// defaults on first run if missing - see README.md for the schema.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = {
  // NOTE: this must match the `author.login` GraphQL returns on a review
  // thread's comments, NOT the REST `pulls/.../reviews` endpoint's
  // `user.login` - GitHub's GraphQL API drops the "[bot]" suffix that REST
  // includes for bot accounts (observed: REST "kilo-code-bot[bot]" vs
  // GraphQL "kilo-code-bot" for the same account). Verify with
  // `threads` on a real PR, not by cross-checking against REST.
  reviewerLogin: "kilo-code-bot",
  rebuttalRoundLimit: 3,
  tokenBudget: null,
  timeBudgetHours: null,
};

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function ghJson(args) {
  return JSON.parse(sh("gh", args));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function repoRoot() {
  try {
    const raw = sh("git", ["rev-parse", "--show-toplevel"]);
    return process.platform === "win32" ? raw.replace(/\//g, "\\") : raw;
  } catch {
    fail("Not inside a git repository (git rev-parse --show-toplevel failed).");
  }
}

function loadConfig() {
  const configPath = path.join(repoRoot(), ".claude", "review-loop.config.json");
  if (!existsSync(configPath)) {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    console.warn(
      `No config found - wrote defaults to ${configPath}. Review \`reviewerLogin\` ` +
        `especially: it must match the exact GitHub login the reviewer bot posts under.`
    );
    return { ...DEFAULT_CONFIG, path: configPath };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    fail(`Could not parse ${configPath} as JSON.\n${e.message}`);
  }
  return { ...DEFAULT_CONFIG, ...parsed, path: configPath };
}

function nameWithOwner() {
  try {
    return ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
  } catch (e) {
    fail(
      `Could not resolve the GitHub repo (is 'gh' installed, authenticated, and does this ` +
        `repo have a GitHub remote?)\n${e.message}`
    );
  }
}

function resolvePr(prArg) {
  const ghRepoArgs = ["--repo", nameWithOwner()];
  try {
    return prArg
      ? ghJson(["pr", "view", prArg, ...ghRepoArgs, "--json", "number"])
      : ghJson(["pr", "view", ...ghRepoArgs, "--json", "number"]);
  } catch (e) {
    fail(
      prArg
        ? `Could not find PR #${prArg}.\n${e.message}`
        : `No PR found for the current branch. Pass a PR number explicitly.\n${e.message}`
    );
  }
}

// --- GraphQL: fetch review threads with resolution status + comments ---

const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 50) {
            nodes { id databaseId author { login } body createdAt }
          }
        }
      }
    }
  }
}`;

function fetchThreads(owner, name, number) {
  const threads = [];
  let after = null;
  for (;;) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${THREADS_QUERY}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${name}`,
      "-F",
      `number=${number}`,
    ];
    if (after) args.push("-F", `after=${after}`);
    const data = ghJson(args);
    const conn = data.repository.pullRequest.reviewThreads;
    threads.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return threads;
}

// A thread counts as "opened by the Reviewer" if the Reviewer authored its
// first comment. rebuttalCount approximates Rebuttal Rounds: every reply in
// the thread from someone other than the Reviewer (i.e. the subagent's own
// replies), since these threads have no other participants by convention.
function annotateThreads(threads, reviewerLogin) {
  return threads
    .map((t) => {
      const comments = t.comments.nodes;
      const openedByReviewer = comments[0]?.author?.login === reviewerLogin;
      const rebuttalCount = comments.filter((c) => c.author?.login !== reviewerLogin).length;
      return {
        threadId: t.id,
        isResolved: t.isResolved,
        openedByReviewer,
        rebuttalCount,
        firstCommentId: comments[0]?.databaseId ?? null,
        comments: comments.map((c) => ({
          author: c.author?.login ?? null,
          body: c.body,
          createdAt: c.createdAt,
        })),
      };
    })
    .filter((t) => t.openedByReviewer);
}

// --- commands ---

function cmdThreads(prArg) {
  const config = loadConfig();
  const [owner, name] = nameWithOwner().split("/");
  const pr = resolvePr(prArg);
  const threads = annotateThreads(fetchThreads(owner, name, pr.number), config.reviewerLogin);
  console.log(JSON.stringify({ pr: pr.number, reviewerLogin: config.reviewerLogin, threads }, null, 2));
}

function cmdStatus(prArg) {
  const config = loadConfig();
  const [owner, name] = nameWithOwner().split("/");
  const pr = resolvePr(prArg);
  const threads = annotateThreads(fetchThreads(owner, name, pr.number), config.reviewerLogin);
  const unresolved = threads.filter((t) => !t.isResolved);
  console.log(
    JSON.stringify(
      {
        pr: pr.number,
        reviewerLogin: config.reviewerLogin,
        green: unresolved.length === 0,
        unresolvedCount: unresolved.length,
        totalReviewerThreads: threads.length,
      },
      null,
      2
    )
  );
}

const RESOLVE_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

// Resolving is a separate, later step from replying: run `reply` first (if
// this is a rebuttal or a fix has been pushed), then `resolve` once the
// reply is posted. Keeping them separate means a fix that needs no reply
// text can resolve directly.
function cmdResolve(threadId) {
  if (!threadId) fail("Usage: node review-loop.mjs resolve <thread-id>");
  const result = ghJson(["api", "graphql", "-f", `query=${RESOLVE_MUTATION}`, "-F", `threadId=${threadId}`]);
  console.log(JSON.stringify(result.resolveReviewThread.thread, null, 2));
}

function cmdReply(commentId, body, prArg) {
  if (!commentId || !body) fail("Usage: node review-loop.mjs reply <comment-id> --body \"text\" [pr-number]");
  const [owner, name] = nameWithOwner().split("/");
  const pr = resolvePr(prArg);
  const result = ghJson([
    "api",
    `repos/${owner}/${name}/pulls/${pr.number}/comments`,
    "-f",
    `body=${body}`,
    "-F",
    `in_reply_to=${commentId}`,
  ]);
  console.log(JSON.stringify({ id: result.id, url: result.html_url }, null, 2));
}

// --- entry point ---

const [, , command, ...rest] = process.argv;
const flagValue = (flag) => {
  const i = rest.indexOf(flag);
  return i === -1 ? null : rest[i + 1];
};

switch (command) {
  case "threads":
    cmdThreads(rest.find((a) => !a.startsWith("--")));
    break;
  case "status":
    cmdStatus(rest.find((a) => !a.startsWith("--")));
    break;
  case "resolve":
    cmdResolve(rest[0]);
    break;
  case "reply":
    cmdReply(rest[0], flagValue("--body"), flagValue("--pr"));
    break;
  default:
    fail(
      "Usage:\n" +
        "  node review-loop.mjs threads [pr-number]\n" +
        "  node review-loop.mjs reply <comment-id> --body \"text\" [--pr <n>]\n" +
        "  node review-loop.mjs resolve <thread-id>\n" +
        "  node review-loop.mjs status [pr-number]"
    );
}
