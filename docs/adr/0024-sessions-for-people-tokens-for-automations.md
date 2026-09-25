# 24. Server-side sessions for people, scoped tokens for automations, links instead of email

**Status:** Accepted · 2026-09-25

## Context

With accounts (0023) the app needs to know who is asking. Three kinds of client
ask:

- a person in a browser or an installed Home Screen app;
- an automation — the nightly iOS Shortcut that posts steps, a script;
- a calendar app subscribing to the snack plan, which can send nothing but a URL.

And the app runs as a single container on somebody's shelf, with no mail server
and no wish for one.

## Decision

**Browsers get a server-side session.** A random 32-byte token in an
`HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS); only its SHA-256 is
stored, so a copy of the database cannot be replayed as a login. Sessions slide
(30 days by default, `SESSION_TTL_DAYS`), are listed in Settings with the device
they belong to, and can be ended one at a time or all but the current one.
Changing a password or resetting it ends every other session; disabling an
account ends all of them.

**A state-changing request with a cookie must come from the app's own pages**:
`Sec-Fetch-Site`, else `Origin`, is checked against the app's host. With
`SameSite=Lax` that is two independent defences against cross-site request
forgery, and signing in is checked the same way (login CSRF).

**Automations get API tokens, default deny.** A token (`snk_…`, stored as a
hash) carries scopes — `read`, `entries:write`, `metrics:write`,
`calendar:read` — and reaches only routes that name a scope it holds. A route
that names none refuses every token, so a new route cannot become reachable by
the steps Shortcut by accident. No scope reaches account management: issuing
tokens, changing a password or an email, administering others. An explicit
`Authorization` header that fails never falls back to a cookie.

**The calendar feed is the one place a token travels in a URL**, because
calendar apps can send nothing else. It accepts only `calendar:read`, which can
read planned snack times and nothing more, and never a cookie.

**Passwords are scrypt** (N=2^15, r=8, p=3, the OWASP parameters), stored
self-describing so the cost can rise and old hashes are upgraded at sign-in. The
policy is length (10+) and the obvious: not a common password, not built from
the email address.

**Guessing is slowed per account and per address**, in the database so a
restart does not reset it and replicas share it: ten failures for one
address-and-account pair, fifty per account, a hundred per address, in a
fifteen-minute window. None of it is a lockout; every window resets. Every
failure gets the same answer whether the account exists, the password is wrong
or the account is disabled.

**No email.** An admin creates an invitation or a password-reset link and hands
it over. The link is the whole credential — 32 random bytes, stored as a hash,
spent on first use, dead after seven days (invitation) or one day (reset). An
invitation can be addressed to one email, and then only that address can use
it. The operator CLI (`dist/admin.mjs reset-link`) is the way back in for a sole
admin who forgot their password.

**First boot.** A fresh instance sends its first visitor to `/setup`, which
creates the admin. `SETUP_TOKEN` closes the window in which whoever reaches it
first becomes admin; `ADMIN_EMAIL`/`ADMIN_PASSWORD` do it unattended.

**Everything security-relevant is audited**: sign-ins and failures, throttling,
credential changes, tokens, invitations, resets, account and admin changes,
exports and imports — never with a credential in the detail.

## Why

**Sessions, not JWTs.** Revocation is the feature: ending a session on a lost
phone has to work now, not when a token expires. A session row per device is
cheap at this scale and needs no key management.

**Scoped tokens rather than "an API key"** because the realistic automations
each need one narrow thing, and the realistic failure is a Shortcut shared or
screenshotted. A leaked steps token can write step counts.

**Links rather than email** because a mail server is the most fragile thing a
self-hosted app can depend on, and the people using one instance usually know
each other.

## Consequences

- `tests/integration/accounts.test.ts` and `tokens.test.ts` cover the flows
  above against the real routes.
- The iOS Shortcut recipe gains one header, `Authorization: Bearer snk_…`.
- Over plain HTTP on a LAN, cookies work but lack `Secure`; the README says to
  put anything reachable from outside behind HTTPS — which nudges need anyway.
