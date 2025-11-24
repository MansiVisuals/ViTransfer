# ViTransfer 0.6.0 Authentication & Security Migration

## Summary
- Switched to bearer-only authentication for admin and share flows.
- Removed all implicit browser-managed auth; Authorization headers are required everywhere.
- Share access now uses dedicated “share” tokens (scoped to project/permissions).
- CSP tightened (no unsafe-inline/eval; nonce-based styles) and referrer policy set to same-origin.

## Impact
- All existing browser sessions are invalid; admins must re-login and store returned tokens (refresh in sessionStorage, access in memory).
- Share links require new share tokens issued after password/OTP/guest entry.
- Any client code must send `Authorization: Bearer <token>`; `credentials: 'include'` is no longer supported.

## Admin Flow (after upgrade)
1. POST `/api/auth/login` -> save `tokens.accessToken` (memory) and `tokens.refreshToken` (sessionStorage).
2. Refresh via POST `/api/auth/refresh` with `Authorization: Bearer <refreshToken>`.
3. Logout via POST `/api/auth/logout` sending both access (Authorization) and refresh (X-Refresh-Token or body).

## Share Flow (after upgrade)
- Password/OTP/guest endpoints return `shareToken`; store in memory only and send `Authorization: Bearer <shareToken>` for all share API calls and asset/comment fetches.
- Admin mode on share pages now requires an explicit admin token (no ambient browser state).

## Checklist for Deployers
- Rotate JWT secrets if reusing older keys; ensure `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SHARE_TOKEN_SECRET` are set.
- Clear any reverse-proxy expectations about browser-managed auth; rely on headers only.
- If you maintain CSP overrides, ensure they allow the Next.js nonce and required connect-src entries (API + TUS).

## Testing Guide
- Verify admin login/refresh/logout works with headers only.
- Ensure share page flows (password/OTP/guest) fetch project/comments/assets using Authorization headers.
- Confirm legacy endpoints for cross-site tokens return 410.
- Stream/download videos and assets to confirm TUS/content endpoints still function with tokens.
