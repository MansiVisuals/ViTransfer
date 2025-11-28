# Test Plan: Bearer-Only Auth & Share Token Refactor (v0.6.0)

## Authentication (Admin)
- Login returns access/refresh tokens in JSON; admin APIs require `Authorization: Bearer <access>`.
- Refresh with `Authorization: Bearer <refresh>` rotates tokens; old refresh rejected; blacklist applied.
- Logout revokes presented access/refresh; subsequent calls with old tokens return 401.

## Share Flows
- Password/OTP/guest endpoints return `shareToken`; follow-up calls to `/api/share/[token]`, comments, assets, and TUS/content use `Authorization: Bearer <shareToken>`.
- Share tokens scoped to the project; token for project A rejected on project B.
- Guest mode: comments blocked; videos stream/play; downloads respect allowAssetDownload.
- Admin mode not inferred implicitly on share pages; only works when an admin bearer token is intentionally provided.

## No Implicit Browser Auth
- Inspect responses to confirm no auth is set via `Set-Cookie`; `credentials: 'include'` not required anywhere.
- Legacy cross-site token endpoint returns 410; no related headers are validated in API routes.

## Role Separation / Escalation
- Share token cannot access admin endpoints; admin token on share page does not elevate unless explicitly used.
- Comment delete/approve paths reject share tokens; admin-only endpoints return 401/403 for share tokens.

## Content Delivery & TUS
- Video stream/download via `/api/content/[token]` works with token-bound sessionId; no browser credential dependency.
- TUS/uploads still succeed under tightened CSP/connect-src configuration.

## CSP & Headers
- Pages load with CSP free of `unsafe-inline/unsafe-eval`; nonce present for styles; connect-src includes API + TUS endpoints only.
- Referrer-Policy is `same-origin`; frame-ancestors 'none'; X-XSS-Protection header removed.

## Regression Checks
- Admin UI: create/update projects, users, settings using bearer tokens only.
- Share UI: password and OTP flows succeed; incorrect credentials return 401/403; re-auth prompts appear when tokens expire.
- Token theft mitigation: replay of revoked/rotated refresh returns 401 and does not mint new tokens.
