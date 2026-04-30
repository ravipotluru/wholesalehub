---
description: Run the full pre-PR check suite (install, lint, typecheck, test, prisma generate, build) on the current branch and produce a single PASS/FAIL summary. Use before opening or merging any PR. Faster than waiting for CI to fail you.
allowed-tools: [Bash, PowerShell, Read]
---

# wholesalehub-checks

One-shot pre-PR validation. Mirrors the GitHub Actions `CI Pipeline`
workflow but runs locally so you find failures in 90 seconds instead
of after `git push`.

## What this skill does

1. `npm ci` (or `npm install` if no lock changes)
2. `npx prisma generate`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test -- --runInBand` (no coverage, faster)
6. `npm run build` (DATABASE_URL set to a placeholder)

Then prints:

```
[PASS / FAIL]    install
[PASS / FAIL]    prisma generate
[PASS / FAIL]    lint           (errors: 0, warnings: N)
[PASS / FAIL]    typecheck      (errors: 0)
[PASS / FAIL]    test           (passed: N, failed: 0, total: N)
[PASS / FAIL]    build

OVERALL: PASS — safe to push
```

## Args

- `--quick` — skip `build` (the slowest step). Still runs lint + typecheck + test.
- `--changed-only` — only lint/typecheck files changed vs `main`
- `--fix` — pass `--fix` to lint, then re-run

## Failure handling

On the first FAIL the skill stops and prints:
- The failing step
- The first 50 lines of its output
- A suggested next action (e.g. "run `npm run lint -- --fix` and try again")

## Why a skill, not a make target

`npm run build` is slow and often skipped. Lint warnings get
normalized away over time. A skill enforces the consistent ordering
and gives one PASS/FAIL summary, which is what you actually want
before opening a PR.

## Companion: /wholesalehub-asn-fixture

Run this skill, then run the asn-fixture skill with `--send` to confirm
the receiving flow works end-to-end. Two skills = full pre-PR
validation in under 3 minutes.
