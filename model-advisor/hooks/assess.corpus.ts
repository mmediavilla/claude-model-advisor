// Prompts as people send them, each labelled with the tier a person would give
// it. The regression test holds the advisor to these, so a change to SIGNALS
// that reads one of them differently fails until the label, the change or
// MISREADS is argued for.
//
// How a tier is labelled, by the setup it gets:
//   trivial  (Haiku · low)    nothing to read or reason about: chat, a git chore, a named command
//   light    (Sonnet · low)   one small local change, or a quick answer about the code
//   standard (Sonnet · medium) a bounded feature or an ordinary bug fix in one area
//   involved (Opus · high)    diagnosis, work across many files, a planned phase, a careful review
//   deep     (Fable · high)   hard-to-pin bugs, system design, high stakes, or asked for outright
//
// Labels are a person's judgement, written before the advisor read them.

import type { Tier } from '../types'

export type Case = { prompt: string; tier: Tier }
/** `struggled`: the turn after `after` ran long, kept failing, or died on an error. */
export type FollowOnCase = { after: string; prompt: string; tier: Tier; isFollowOn: boolean; struggled?: boolean }

export const CASES: readonly Case[] = [
  // trivial
  { prompt: 'thanks!', tier: 'trivial' },
  { prompt: 'ok', tier: 'trivial' },
  { prompt: 'hello', tier: 'trivial' },
  { prompt: 'cool', tier: 'trivial' },
  { prompt: 'perfect, thank you', tier: 'trivial' },
  { prompt: 'thanks so much!', tier: 'trivial' },
  { prompt: 'commit this and push', tier: 'trivial' },
  { prompt: 'git status', tier: 'trivial' },
  { prompt: 'push it', tier: 'trivial' },
  { prompt: 'open a PR', tier: 'trivial' },
  { prompt: 'pull latest', tier: 'trivial' },
  { prompt: 'merge the PR', tier: 'trivial' },
  { prompt: 'lgtm, merge it', tier: 'trivial' },
  { prompt: 'commit the changes with a good message', tier: 'trivial' },
  { prompt: 'stash my changes', tier: 'trivial' },
  { prompt: 'git log --oneline -5', tier: 'trivial' },
  { prompt: 'bump the version to 0.2.0 and commit', tier: 'trivial' },
  { prompt: 'create a branch called feature/advisor-calibration', tier: 'trivial' },

  // light
  { prompt: 'fix the typo in README.md', tier: 'light' },
  { prompt: 'what does useConversation do?', tier: 'light' },
  { prompt: 'run the tests', tier: 'light' },
  { prompt: 'rename getUser to fetchUser in UserService.php', tier: 'light' },
  { prompt: 'explain this function\n```ts\nexport const money = (d: number) => (d < 0.01 ? "<$0.01" : `$${d.toFixed(2)}`)\n```', tier: 'light' },
  { prompt: 'where is the retry logic defined?', tier: 'light' },
  { prompt: 'add a comment explaining the regex in assess.ts', tier: 'light' },
  { prompt: 'remove unused imports in the controllers', tier: 'light' },
  { prompt: "what's the difference between tier and setup here?", tier: 'light' },
  { prompt: 'summarize the changes in the last commit', tier: 'light' },
  { prompt: 'change the button color to blue', tier: 'light' },
  { prompt: 'update the copyright year in the footer', tier: 'light' },
  { prompt: 'translate this error message to Tagalog', tier: 'light' },
  { prompt: 'which file handles login?', tier: 'light' },
  { prompt: 'how do I run this locally?', tier: 'light' },
  { prompt: 'make the default mode auto instead of suggest', tier: 'light' },
  { prompt: 'sort the imports in register.tsx', tier: 'light' },
  { prompt: 'fix the lint warnings', tier: 'light' },
  { prompt: 'reformat this file with prettier', tier: 'light' },
  { prompt: 'is there a helper for formatting money?', tier: 'light' },
  { prompt: 'set the timeout to 30 seconds', tier: 'light' },
  { prompt: 'show me the last 5 commits', tier: 'light' },
  { prompt: 'add a .env.example with the keys we use', tier: 'light' },

  // standard
  { prompt: 'add a dark mode toggle to the settings page', tier: 'standard' },
  { prompt: "add an endpoint that returns the user's weekly summary", tier: 'standard' },
  { prompt: 'write unit tests for the money() helper', tier: 'standard' },
  { prompt: 'create a migration that adds a nullable timezone column to users', tier: 'standard' },
  { prompt: "the login form doesn't show validation errors, fix it", tier: 'standard' },
  { prompt: 'build a settings screen with a toggle for notifications', tier: 'standard' },
  { prompt: 'implement pagination on the orders list', tier: 'standard' },
  { prompt: "the build is failing with 'Cannot find module zod', fix it", tier: 'standard' },
  { prompt: 'add a /stats command that shows tokens used this session', tier: 'standard' },
  { prompt: 'hook up the contact form to send an email via Mailgun', tier: 'standard' },
  { prompt: 'write a script that exports the body log CSV to JSON', tier: 'standard' },
  { prompt: 'add validation so the weight field rejects negative numbers', tier: 'standard' },
  { prompt: 'create a React component for the macro tracker card', tier: 'standard' },
  { prompt: 'fix the bug where the date shows in UTC instead of Manila time', tier: 'standard' },
  { prompt: 'add caching to the weather API call', tier: 'standard' },
  { prompt: 'write a test for the follow-on logic', tier: 'standard' },
  { prompt: "the save button doesn't work on mobile", tier: 'standard' },
  { prompt: 'add a CSV export button to the reports page', tier: 'standard' },
  { prompt: 'generate TypeScript types from the OpenAPI spec', tier: 'standard' },
  { prompt: 'set up GitHub Actions to run the tests on every PR', tier: 'standard' },
  { prompt: 'add error handling to the fetch calls in api.ts', tier: 'standard' },
  { prompt: 'implement the forgot password flow', tier: 'standard' },
  { prompt: 'add retries with exponential backoff to the HTTP client', tier: 'standard' },
  { prompt: 'convert this class component to hooks\n```jsx\nclass Card extends React.Component {\n  render() { return <div>{this.props.title}</div> }\n}\n```', tier: 'standard' },
  { prompt: 'how does the auth middleware decide which guard to use?', tier: 'standard' },

  // involved
  { prompt: 'why does the router keep picking the Secretary for Hevy prompts?', tier: 'involved' },
  { prompt: 'refactor the auth flow across all controllers, make sure nothing breaks', tier: 'involved' },
  { prompt: 'start phase 23.7', tier: 'involved' },
  { prompt: 'do the next phase of the plan', tier: 'involved' },
  { prompt: 'investigate why the queue jobs are being processed twice', tier: 'involved' },
  { prompt: 'migrate the app from Vue 2 to Vue 3', tier: 'involved' },
  { prompt: 'review this PR for security issues', tier: 'involved' },
  { prompt: 'the tests pass locally but fail in CI, figure out why', tier: 'involved' },
  { prompt: "rewrite the payment module to use Stripe's new API", tier: 'involved' },
  { prompt: 'add multi-tenant support: each team gets its own data, scoped by team_id across every model', tier: 'involved' },
  { prompt: 'go through the whole codebase and replace moment.js with date-fns', tier: 'involved' },
  { prompt: 'plan out the next release: what needs to change for offline support', tier: 'involved' },
  { prompt: 'debug the memory usage spike on the dashboard', tier: 'involved' },
  { prompt: 'optimize the slow report query, it takes 30s', tier: 'involved' },
  { prompt: 'implement OAuth login with Google and keep the existing email login working', tier: 'involved' },
  { prompt: 'find out why the band never shows on desktop', tier: 'involved' },
  { prompt: 'why is the context token count wrong after compaction?', tier: 'involved' },
  { prompt: 'read through the codebase and write a CLAUDE.md that documents the architecture', tier: 'involved' },
  { prompt: 'upgrade Laravel from 10 to 11', tier: 'involved' },
  { prompt: 'implement step 3 of the migration plan in PLAN.md', tier: 'involved' },
  { prompt: 'audit our dependencies for known vulnerabilities and fix what you can', tier: 'involved' },
  { prompt: 'split the 2000-line UserController into smaller services', tier: 'involved' },
  { prompt: 'the app crashes on startup after the last deploy, find the root cause', tier: 'involved' },
  { prompt: 'write an end-to-end test suite for checkout', tier: 'involved' },
  { prompt: 'compare our current caching approach with Redis and recommend one', tier: 'involved' },
  { prompt: 'this endpoint returns 500 intermittently', tier: 'involved' },
  { prompt: "what's causing the N+1 queries on the orders page?", tier: 'involved' },
  {
    prompt: [
      'Add a weekly report to the fitness tracker:',
      '- read the weigh-ins from data/body-log.csv',
      '- compute the 7-day average weight and the change from last week',
      '- add a /report route in routes/web.php that renders resources/views/report.blade.php',
      '- write feature tests in tests/Feature/ReportTest.php',
      'Keep the existing dashboard working.',
    ].join('\n'),
    tier: 'involved',
  },

  // deep
  { prompt: 'there is a race condition in the queue worker that only happens in production, find the root cause', tier: 'deep' },
  { prompt: 'ultrathink: design the data model for multi-region sync', tier: 'deep' },
  { prompt: 'design the architecture for a plugin system that third parties can extend safely', tier: 'deep' },
  { prompt: 'we have a memory leak in the worker that only shows up after a few hours, track it down', tier: 'deep' },
  { prompt: 'think hard about the trade-offs between event sourcing and CRUD for the ledger', tier: 'deep' },
  { prompt: 'flaky test: OrdersTest sometimes fails with a deadlock, figure out why', tier: 'deep' },
  { prompt: 're-architect the sync engine so offline edits merge without data loss', tier: 'deep' },
  { prompt: 'use fable to review the whole codebase for concurrency bugs', tier: 'deep' },
  { prompt: 'data is getting corrupted when two users edit the same record at once, find out why and fix it', tier: 'deep' },
  { prompt: 'design a system for rate limiting across 20 microservices with consistent quotas, and walk me through the trade-offs', tier: 'deep' },
  { prompt: 'prove that the scheduling algorithm never starves a job', tier: 'deep' },
  {
    prompt:
      'the payments ledger is off by a few cents after the currency migration, only on some accounts, find the root cause before month-end close',
    tier: 'deep',
  },
]

/**
 * Written with CASES and held back for the first round of tuning, to see
 * whether a change generalised; tuned on in the second round.
 */
export const HOLDOUT: readonly Case[] = [
  { prompt: 'ty', tier: 'trivial' },
  { prompt: 'great, push it', tier: 'trivial' },
  { prompt: 'git pull', tier: 'trivial' },
  { prompt: 'delete the branch', tier: 'trivial' },
  { prompt: 'awesome', tier: 'trivial' },
  { prompt: 'sync with main', tier: 'trivial' },
  { prompt: 'what port does the dev server use?', tier: 'light' },
  { prompt: 'rename the variable x to count', tier: 'light' },
  { prompt: 'add a newline at the end of the file', tier: 'light' },
  { prompt: 'what version of PHP are we on?', tier: 'light' },
  { prompt: 'list the routes', tier: 'light' },
  { prompt: 'explain what this regex does: /^\\d{3}$/', tier: 'light' },
  { prompt: 'add a loading spinner while the data fetches', tier: 'standard' },
  { prompt: 'write a seeder for 50 fake users', tier: 'standard' },
  { prompt: 'the dropdown closes when I click inside it', tier: 'standard' },
  { prompt: 'add a dark theme to the band', tier: 'standard' },
  { prompt: 'make the /advise command accept a --json flag', tier: 'standard' },
  { prompt: 'create an API resource for orders', tier: 'standard' },
  { prompt: "why is the advisor reading 'start next phase' as light?", tier: 'involved' },
  { prompt: 'refactor the hooks so assess and words share one type', tier: 'involved' },
  { prompt: 'move the app from MySQL to Postgres', tier: 'involved' },
  { prompt: 'the queue keeps retrying failed jobs forever, figure out why', tier: 'involved' },
  { prompt: 'review the whole PR carefully before I merge', tier: 'involved' },
  { prompt: 'implement phase 2 from the plan doc', tier: 'involved' },
  { prompt: 'intermittent 502s only under load in production, find the root cause', tier: 'deep' },
  { prompt: 'design a sharding strategy for the events table and weigh the trade-offs', tier: 'deep' },
  { prompt: 'ultrathink about how to make the advisor learn from past sessions', tier: 'deep' },
  { prompt: 'two workers sometimes process the same payment twice, track down the race', tier: 'deep' },
  { prompt: 'think deeply about whether we should split the monolith into services', tier: 'deep' },
  { prompt: 'the cache returns stale balances for some users after deploys, only in production', tier: 'deep' },
]

/**
 * Written once HOLDOUT had been tuned on, and never tuned on itself: how well
 * the weights read prompts they were not fitted to.
 */
export const FRESH: readonly Case[] = [
  { prompt: 'thank you!!', tier: 'trivial' },
  { prompt: 'git diff', tier: 'trivial' },
  { prompt: 'push', tier: 'trivial' },
  { prompt: 'commit and push', tier: 'trivial' },
  { prompt: 'nice work', tier: 'trivial' },
  { prompt: 'what does the FOLLOW_ON regex match?', tier: 'light' },
  { prompt: "rename the 'sent' atom to 'lastPrompt'", tier: 'light' },
  { prompt: 'where do we set the default mode?', tier: 'light' },
  { prompt: 'update the README install command', tier: 'light' },
  { prompt: "change the label 'Hide' to 'Dismiss'", tier: 'light' },
  { prompt: 'how many tests are there?', tier: 'light' },
  { prompt: 'add a /advise history command that lists the last 10 readings', tier: 'standard' },
  { prompt: 'write a test that covers the Hide button', tier: 'standard' },
  { prompt: 'fix the 404 on the profile page', tier: 'standard' },
  { prompt: "the total calories don't add up in the weekly view", tier: 'standard' },
  { prompt: 'add a migration and model for workouts', tier: 'standard' },
  { prompt: 'create a Blade component for the macro card', tier: 'standard' },
  { prompt: 'debug why auto mode keeps switching back to Opus', tier: 'involved' },
  { prompt: 'migrate the tests from PHPUnit to Pest', tier: 'involved' },
  { prompt: 'rework the band so it reads from one state atom instead of three, across register.tsx and words.ts', tier: 'involved' },
  { prompt: 'audit the plugin for anything that could leak the prompt text', tier: 'involved' },
  { prompt: "figure out what's making the dashboard load slowly", tier: 'involved' },
  { prompt: 'carry out phase 3', tier: 'involved' },
  { prompt: 'think hard about how the advisor should price a switch when the cache has expired', tier: 'deep' },
  { prompt: 'find the root cause of the intermittent deadlock in the job scheduler', tier: 'deep' },
  { prompt: 'design the architecture for syncing workouts between the phone and the web app offline', tier: 'deep' },
  { prompt: 'users are occasionally double-charged on renewal, find out why before it happens again', tier: 'deep' },
  { prompt: 'ultrathink and plan the migration from a monolith to services without downtime', tier: 'deep' },
  { prompt: 'the replication lag spikes randomly and reads come back stale, track it down', tier: 'deep' },
]

/** A prompt read after another: whether it carries the last reading, and the tier it ends on. */
export const FOLLOW_ONS: readonly FollowOnCase[] = [
  { after: 'refactor the auth flow across all controllers, make sure nothing breaks', prompt: 'continue', tier: 'involved', isFollowOn: true },
  { after: 'add a dark mode toggle to the settings page', prompt: 'yes do it', tier: 'standard', isFollowOn: true },
  { after: 'add a dark mode toggle to the settings page', prompt: 'same for the profile page', tier: 'standard', isFollowOn: true },
  { after: 'investigate why the queue jobs are being processed twice', prompt: 'keep going', tier: 'involved', isFollowOn: true },
  { after: 'investigate why the queue jobs are being processed twice', prompt: 'try again', tier: 'involved', isFollowOn: true },
  { after: 'investigate why the queue jobs are being processed twice', prompt: "that's wrong, the jobs only run once in staging", tier: 'involved', isFollowOn: true },
  { after: 'implement the forgot password flow', prompt: 'no, use the existing mailer instead', tier: 'standard', isFollowOn: true },
  { after: 'fix the typo in README.md', prompt: 'thanks', tier: 'trivial', isFollowOn: false },
  { after: 'refactor the auth flow across all controllers', prompt: 'next, wire up the retry logic', tier: 'standard', isFollowOn: false },
  { after: 'thanks!', prompt: 'next phase start', tier: 'involved', isFollowOn: false },

  // A short prompt that points back at the last prompt's work
  { after: 'why does the queue worker deadlock under load?', prompt: 'add a test for it', tier: 'involved', isFollowOn: false },
  { after: 'refactor the auth flow across all controllers, make sure nothing breaks', prompt: 'now write tests for it', tier: 'standard', isFollowOn: false },
  { after: 'add a dark mode toggle to the settings page', prompt: 'document the change in the README', tier: 'light', isFollowOn: false },
  { after: 'fix the typo in README.md', prompt: 'add a test for it', tier: 'standard', isFollowOn: false },
  // A chore or a question stands on its own words
  { after: 'why does the queue worker deadlock under load?', prompt: 'commit this and push', tier: 'trivial', isFollowOn: false },
  { after: 'why does the queue worker deadlock under load?', prompt: 'what does it return?', tier: 'light', isFollowOn: false },

  // After a turn that struggled, the work is a tier harder than it read
  { after: 'fix the typo in README.md', prompt: 'try again', tier: 'standard', isFollowOn: false, struggled: true },
  { after: 'why does the queue worker deadlock under load?', prompt: 'add a test for it', tier: 'deep', isFollowOn: false, struggled: true },
  { after: 'refactor the auth flow across all controllers, make sure nothing breaks', prompt: 'now write tests for it', tier: 'involved', isFollowOn: false, struggled: true },
  { after: 'refactor the auth flow across all controllers, make sure nothing breaks', prompt: 'commit this and push', tier: 'trivial', isFollowOn: false, struggled: true },
]

/**
 * Labelled prompts the advisor reads otherwise today, and what it reads them
 * as. A change that fixes one fails the test until it comes off this list.
 */
export const MISREADS: Readonly<Record<string, Tier>> = {
  // CASES: a bare "add" or "make" reads as building something, however small
  'create a branch called feature/advisor-calibration': 'light',
  'make the default mode auto instead of suggest': 'standard',
  'add a .env.example with the keys we use': 'standard',
  // CASES: one signal where the label wants two
  'go through the whole codebase and replace moment.js with date-fns': 'standard',
  'optimize the slow report query, it takes 30s': 'standard',
  'implement OAuth login with Google and keep the existing email login working': 'standard',
  'prove that the scheduling algorithm never starves a job': 'involved',
  // HOLDOUT
  'add a newline at the end of the file': 'standard',
  'refactor the hooks so assess and words share one type': 'standard',
  'the cache returns stale balances for some users after deploys, only in production': 'involved',
  // FRESH
  push: 'light',
  'nice work': 'light',
  'rework the band so it reads from one state atom instead of three, across register.tsx and words.ts': 'light',
  'users are occasionally double-charged on renewal, find out why before it happens again': 'involved',
}
