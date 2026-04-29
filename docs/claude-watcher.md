# Claude Watcher — scheduled & on-demand code review agent

A GitHub Actions workflow runs Claude Code on a schedule (every 10 min by default) and on-demand. It reviews the repo for actionable improvements and opens **draft** pull requests when it finds something.

## One-time setup

1. **Add secrets** at `Settings → Secrets and variables → Actions → New repository secret`:

   | Secret | Required? | Value |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | yes | API key from [console.anthropic.com](https://console.anthropic.com) |
   | `CLAUDE_TRACKING_ISSUE` | optional | Issue number (e.g. `42`) where every run posts a one-line summary. Make a fresh issue first ("Claude Watcher feed"), then add the secret. |

2. **Verify the workflow runs.** Trigger it manually:
   - Go to **Actions → WholesaleHub Watcher (Claude) → Run workflow**
   - Pick **model** = `claude-sonnet-4-6` for the first run
   - Click Run

3. The workflow auto-skips silently when `ANTHROPIC_API_KEY` is missing, so it won't spam failures while you're getting set up.

## Triggering on demand (mobile-friendly)

From the GitHub mobile app or web UI:

1. Open the repo → **Actions** tab
2. Tap **WholesaleHub Watcher (Claude)**
3. Tap **Run workflow**
4. Pick a model (Opus = deep run, Sonnet = default, Haiku = cheap probe)
5. Optionally paste a custom prompt to focus the run on a specific area

The Step Summary at the end of the run is mobile-readable and lists any draft PRs the agent opened.

## Pausing the schedule

If you want to keep the manual button but pause the cron:

- **Actions** → **WholesaleHub Watcher (Claude)** → **`...` menu** → **Disable workflow**

That keeps `workflow_dispatch` available; only the schedule stops. Re-enable any time.

Or edit the cron line in `.github/workflows/wholesalehub-watcher.yml`:
- `*/10 * * * *` → every 10 minutes (default)
- `*/30 * * * *` → every 30 minutes
- `0 * * * *`    → hourly
- `0 7 * * *`    → daily at 07:00 UTC

## Cost guardrails

The default config is **conservative**: Sonnet model, max 8 turns per run, draft PRs only. Rough monthly bill at 10-min cadence:

| Model | Per run | 4320 runs/month |
|---|---|---|
| Sonnet 4.6 | $0.20 – $0.60 | **~$865 – $2,600** |
| Opus 4.7 | $0.65 – $2.00 | ~$2,800 – $8,640 |
| Haiku 4.5 | ~$0.05 – $0.15 | ~$220 – $650 |

Real spend will be lower because the agent should exit early ("no actionable findings this run") on most ticks once the repo is in good shape.

## What the agent IS allowed to do

- Read everything in the repo, including `CLAUDE.md`
- Run `npm run lint`, `npm run typecheck`, `npm test`
- Create a feature branch and push it
- Open a **draft** pull request

## What the agent is NOT allowed to do

- Push to `main`
- Merge any PR (even its own)
- Mark a PR ready-for-review
- Modify `prisma/schema.prisma` without flagging the migration
- Touch UI files (`src/app/(dashboard)/**`, `src/app/(auth)/**`, `src/components/**`) — those need browser validation that CI cannot do
- Disable tests or lint rules to make CI green
- Make sweeping refactors. Cap is one focused change per run.

These rules are encoded in the prompt at `.github/workflows/wholesalehub-watcher.yml`. Edit them there if you want to tighten or loosen.

## Reading the agent's output

Two surfaces:

1. **Draft PRs** with branch prefix `claude/`. Each has a "Why / What / Tests" body.
2. **Tracking issue** (if you set `CLAUDE_TRACKING_ISSUE`) — one comment per run with a link to the run and any drafts it opened. This gives you a single mobile feed.

## Killing a runaway

If the agent ever opens a bad PR:

1. Close the PR (don't merge)
2. Disable the workflow temporarily (Actions → workflow → `...` → Disable)
3. Edit the prompt in `.github/workflows/wholesalehub-watcher.yml` to be stricter
4. Re-enable the workflow

If you suspect a prompt-injection attack via something the agent reads (e.g. a malicious PR description from an outside contributor), rotate the `ANTHROPIC_API_KEY` and revoke the watcher's branch-push permission via the workflow's `permissions:` block.
