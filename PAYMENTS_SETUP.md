# Payments integration setup

This is a sandbox-first Flutterwave integration for the existing static portfolio. The API is implemented as Vercel serverless functions; GitHub Pages does not execute these API routes.

## Required Vercel environment variables

Set these on the **Preview** environment for branch `feat/payment-system-foundation` first:

- `SUPABASE_URL` — `https://wygzleiabazmvezouvcl.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable key (safe for public use)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase service-role secret; never use a publishable key here
- `ADMIN_EMAIL` — the single email address authorised for dashboard access
- `FLW_SECRET_KEY` — Flutterwave **test** secret key while sandbox testing
- `FLW_WEBHOOK_SECRET_HASH` — a long random webhook secret hash configured to match the Flutterwave dashboard
- `PAYMENTS_SITE_URL` — exact Vercel preview origin used for checkout return URLs
- `APP_ORIGINS` — comma-separated trusted browser origins (optional; a restrictive default is included)

Never add secret values to GitHub, source code, client-side JavaScript, issues or logs. Do not use a production Flutterwave key until the owner separately approves live payments.

## Flutterwave webhook

Configure the webhook URL as:

`https://YOUR-VERCEL-PREVIEW-DOMAIN/api/flutterwave-webhook`

The endpoint currently validates the Flutterwave v3 `verif-hash` secret-hash header. If the merchant dashboard is configured for the newer HMAC signature scheme, switch the endpoint to the corresponding raw-body `flutterwave-signature` validation before enabling that mode.

## Routes

- `/pay.html` — service and invoice checkout
- `/payment-result.html` — verified payment result
- `/admin.html` — email OTP protected dashboard
- `/api/services` — public active service catalogue
- `/api/invoice-preview` — safe invoice lookup
- `/api/checkout` — server-validated payment initiation
- `/api/payment-status` — payment status and receipt lookup
- `/api/verify-payment` — independent provider verification
- `/api/flutterwave-webhook` — signed provider webhook
- `/api/admin-auth` — allowlisted email OTP login
- `/api/admin` — protected management, reporting and invoice creation

## Operational notes

- Add services and their separate UGX/USD prices in the admin dashboard.
- Custom amounts must be issued as invoices by the administrator; the browser cannot choose an arbitrary amount.
- Do not collect card numbers, CVVs, PINs or OTPs on this website.
- Reconcile pending transactions with Flutterwave; the return URL alone never confirms payment.
- Before live release, verify merchant KYC, payment methods enabled for the account, webhook settings, refund handling, settlement and fee disclosures.
- The Supabase database schema was applied directly to the new project and verified. Keep a formal versioned migration in source control before adopting a local Supabase CLI migration workflow.
