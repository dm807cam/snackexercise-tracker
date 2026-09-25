# Security

## Reporting a vulnerability

Please report it privately, through GitHub's **Report a vulnerability** button
on the repository's Security tab, rather than in a public issue. Say what an
attacker can do, what they need first (an account? network access to the
instance?), and how to reproduce it. You will get an answer, and credit in the
fix if you want it.

Only the latest `main` is supported; there are no release branches.

## What the app protects, and how

The app holds people's training logs, their places, their daily routine and,
through nudges and busy times, a fair picture of their day. The design goal is
that one account can never read or change another's, that a stolen database
copy does not yield working credentials, and that the instance can be exposed
to the internet behind HTTPS.

| Concern | Control | Where |
| --- | --- | --- |
| One account reading another's data | Every personal row has an owner; every query takes the owner's id first; another account's row answers exactly like a missing one | [ADR 0023](./docs/adr/0023-accounts-own-their-data.md), `lib/queries.ts`, `lib/auth/guard.ts` |
| Administrators reading logs | The console shows accounts, counts and dates, never entries; no admin route returns another person's training | `app/api/admin/*` |
| Stolen database copy | Session cookies, API tokens and one-time links are stored only as SHA-256 hashes; passwords as scrypt (N=2^15, r=8, p=3) | `lib/auth/*` |
| Cross-site request forgery | `SameSite=Lax` cookies **and** a `Sec-Fetch-Site`/`Origin` check on every state-changing request made with a cookie, sign-in included | `lib/request-info.ts` |
| Password guessing | Per account-and-address, per-account and per-address limits in the database; one answer for every failure | `app/api/auth/login/route.ts`, `lib/rate-limit.ts` |
| Leaked automation credential | API tokens are scoped, default deny, revocable, optionally expiring, and can never manage an account | [ADR 0024](./docs/adr/0024-sessions-for-people-tokens-for-automations.md), `lib/auth/scopes.ts` |
| Lost device | Sessions are listed per device and can be ended individually; a password change or reset ends every other session | Settings → Account |
| Script injection | Nonce-based Content-Security-Policy with `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` | `proxy.ts` |
| Clickjacking, sniffing, leaks via Referer | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, COOP/CORP same-origin, a restrictive `Permissions-Policy` | `next.config.ts` |
| Downgrade | HSTS when served over HTTPS; the session cookie is `Secure` whenever the request was | `proxy.ts`, `lib/auth/session.ts` |
| Takeover of a fresh instance | `SETUP_TOKEN` gates `/setup`; or `ADMIN_EMAIL`/`ADMIN_PASSWORD` create the admin before the port opens | `app/api/auth/setup/route.ts` |
| Secrets in logs | Structured logs redact credential-shaped fields; the OpenRouter key never reaches a browser or an export | `lib/logger.ts` |
| Investigating an incident | Sign-ins, failures, throttling, credential changes, tokens, invitations, resets, admin actions, exports and imports are audited, with no credentials in the detail | `lib/audit.ts`, the console's audit log |
| Notification contents | Web Push payloads are end-to-end encrypted to the subscribed browser; the push service cannot read them | `lib/push.ts` |

The integration tests in `tests/integration/` exercise these against the real
route handlers: isolation between accounts, the account flows, token scopes, and
the nudge job.

## Running it safely

- **Put anything reachable from outside behind HTTPS**, with a reverse proxy
  (Caddy, Traefik, nginx) or a tunnel. Set `APP_URL` to the public address and
  `TRUST_PROXY` to the number of proxies in front, so client addresses — which
  the rate limits key on — are read correctly. Nudges need HTTPS anyway.
- **Close the setup window**: set `SETUP_TOKEN`, or create the admin from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` and remove the password from the environment
  afterwards.
- **Keep sign-up by invitation** (the default) unless the instance is on a
  private network. `REGISTRATION=open` lets anyone who can reach it make an
  account.
- **Treat backups as personal data.** The database file and the JSON exports
  contain everyone's logs.
- **Protect the metrics endpoint.** It exists only when `METRICS_TOKEN` is set,
  and serves counts, never per-person figures.

## Known advisories

`npm audit` currently reports the following. None is reachable in this app;
each is tracked by Dependabot and will be taken as soon as a non-breaking fix
exists.

| Package | Advisory | Why it does not apply |
| --- | --- | --- |
| `mysql2` (via the `prisma` CLI) | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3 | The CLI bundles drivers for every database it supports. This app only ever connects to SQLite, so no MySQL connection — the only place the flaws live — is ever made. |
| `deepmerge-ts` (via `@prisma/config`) | GHSA-ggr8-5vv4-36mx | Used by the Prisma CLI to merge its own configuration, which is `prisma.config.mjs` in this repository. No input from a user of the app reaches it. |
| `vitest`, `@vitest/mocker` (dev only) | GHSA-82fw-gwwq-j7x9 | The test runner, run by developers and CI on this repository's own tests. It is not in the container. The fix is Vitest 5, a major upgrade to take separately. |

The suggested `npm audit fix --force` downgrades Prisma to 6.x, which this code
does not support.
