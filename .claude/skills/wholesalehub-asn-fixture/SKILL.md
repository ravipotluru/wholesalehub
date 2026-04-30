---
description: Generate a properly HMAC-signed test ASN webhook for /api/webhooks/inventory. Use when QA-ing the receiving flow, when reproducing a webhook bug, or when a wholesaler asks for a sample payload to integrate against.
allowed-tools: [Bash, Read, Write, PowerShell]
paths:
  - src/app/api/webhooks/inventory/**
  - src/lib/hmac.ts
  - src/lib/validators.ts
---

# wholesalehub-asn-fixture

Build and (optionally) send a properly-signed ASN webhook payload to
`/api/webhooks/inventory`. Saves the 5-minute "where's the secret, how
do I compute the HMAC, what fields does Zod want" detour every time
someone needs to test the receiving flow.

## What this skill does

1. Reads `WEBHOOK_SECRET` from `.env.local` (or asks for it if missing — never echoes it)
2. Builds a payload that satisfies `inventoryWebhookSchema` from `src/lib/validators.ts`
3. Computes `HMAC-SHA256(rawBody, secret).hex()` via the production code path in `src/lib/hmac.ts`
4. Either:
   - Writes the curl command + payload to a file the user copies, OR
   - Sends it directly with the `--send` flag (defaults to `http://localhost:3000`)

## Args

`$ARGUMENTS` may include:
- `--send` — actually POST it (otherwise just print the curl)
- `--url <url>` — target URL (default `http://localhost:3000/api/webhooks/inventory`)
- `--supplier-id <id>` — defaults to `WS001` (matches seed data)
- `--lines <n>` — number of line items (default 3)
- `--invalid <field>` — break a field for negative testing (e.g. `quantity` produces a negative qty)
- `--duplicate` — reuse an existing po_number to test idempotency

## How to use

```
/wholesalehub-asn-fixture
/wholesalehub-asn-fixture --lines 10 --send
/wholesalehub-asn-fixture --invalid quantity
/wholesalehub-asn-fixture --duplicate --send
```

## Output

A copy-paste-ready `curl` command with:
- `X-API-Key` header
- `X-Signature` header (the computed HMAC)
- The JSON body

If `--send` is passed, the skill executes the curl and reports the
status code + response body.

## Implementation notes (for the skill runtime)

- Use the `hmacSha256Hex` helper in `src/lib/hmac.ts` so the signature
  is computed by the same code path the route uses to verify
- Validate the payload against `inventoryWebhookSchema` BEFORE printing
  the curl so callers get instant feedback if a field is missing
- Never log the secret value; reference it by `process.env.WEBHOOK_SECRET`
- For `--invalid quantity`, deliberately violate the Zod schema so the
  API returns 400 — useful for testing that the route rejects bad input
- For `--duplicate`, reuse the latest `inventoryReceipt.poNumber` from
  the seeded DB; route should return 200 with a "duplicate" message

## Why a skill instead of a script

A standalone script in `scripts/` would be fine, but as a skill it:
1. Is discoverable via `/skills` and tab-completion
2. Can read `.env.local` and the seed DB through the same context the
  rest of the project uses
3. Composes naturally with other skills (`/wholesalehub-checks` after,
  to confirm CI is clean)
