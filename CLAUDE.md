# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FieldBossPro Online — a multi-tenant web app for lawn care / pest control businesses. Pure static HTML/CSS/JS with no build step. Deployed to Vercel as a static site.

## No build system

There is no `package.json`, no bundler, no compiler, and no test runner. Files are served directly. To "run" the app, open `index.html` in a browser or deploy to Vercel.

To deploy changes: push to GitHub — Vercel auto-deploys from `main`.

## Supabase Edge Functions

The `supabase/functions/` directory contains Deno/TypeScript edge functions deployed to Supabase. They are NOT part of the static site.

To deploy a function:
```
supabase functions deploy <function-name>
```

Functions use `Deno.env.get("SUPABASE_URL")` and `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` for credentials — except `add-card/index.ts` which has hardcoded keys (known issue).

## Architecture

- **Auth**: Supabase Auth via the `@supabase/supabase-js` CDN client. Login is `index.html` + `Login.js`. After login, `user_profiles.role` is checked — `mobile` role users are blocked from the web app and redirected back.
- **Multi-tenancy**: Most Supabase tables have a `user_id` column scoping data per company account. Always filter by `user_id` in queries.
- **Navigation**: Every page is a standalone `.html` file. The sidebar in `dashboard.html` uses `<iframe>` to load pages. Pages navigate via `window.parent.loadPage('pagename')` or fall back to `window.location.href`.
- **Data**: All persistence goes through Supabase (no localStorage). 
- **Scheduled services**: Use the `Services` table (not a Jobs table). Filter by `property_id`; `dispatched=false` = upcoming, `dispatched=true` = history.
- **Map pins**: When rows come from `Services` (not `Properties`), join `Properties(lat, lng)` in the select query rather than doing a separate lookup.

## Key tables

| Table | Purpose |
|---|---|
| `Services` | Scheduled service appointments (not a Jobs table) |
| `Properties` | Service addresses linked to clients via `customer_id` |
| `Clients` | Existing customers |
| `Leads` | Prospects — used for estimates. `closed=false` = active leads |
| `company_info` | Per-account settings: `resend_api_key`, `site_url`, `company_name` |
| `estimates` | Estimates linking to Leads, Clients, or Properties |
| `estimate_services` | Catalog of services available for estimate line items |
| `Packages` | Package plans; line items in `package_services` |
| `sms_messages` | All inbound/outbound SMS (`direction`: `inbound`/`outbound`) |
| `twilio_settings` | VoIP.ms credentials per `user_id` (named `twilio_settings` for legacy reasons — actually stores VoIP.ms `account_sid`, `auth_token`, `phone_number`) |
| `alert_settings` | SMS alert templates per `user_id` and `alert_type` |
| `email_templates` | Email templates keyed by `key` (e.g. `estimate_email`) |
| `user_profiles` | Role per user — `mobile` role blocks web app access |

## Edge functions

| Function | Purpose |
|---|---|
| `add-card` | Stripe — attach/detach payment methods to customers |
| `stripe-setup-card` | Stripe setup intent flow |
| `send-estimate-email` | Send estimate via Resend (`mail@fieldbossprohq.com`); reads template from `email_templates`; falls back to `Leads` table if no client email found |
| `send-sms-alert` | Send automated SMS alerts via VoIP.ms API; reads credentials from `twilio_settings` |
| `send-manual-sms` | Send a one-off SMS from the Texts page via VoIP.ms |
| `sms-webhook` | Receive inbound VoIP.ms SMS; matches DID to `twilio_settings.phone_number` (tries full, digits-only, and last-10-digit formats); saves to `sms_messages` |
| `manage-users` | Admin CRUD for Supabase Auth users |

## SMS system (VoIP.ms)

- Outbound alerts: `send-sms-alert` calls the VoIP.ms REST API directly
- Outbound manual: `send-manual-sms` called from `Texts.html`
- Inbound: VoIP.ms POSTs to `sms-webhook` edge function URL; webhook saves to `sms_messages` with `direction='inbound'`
- `Texts.html` polls `sms_messages` every 5 seconds for real-time updates

## Email system (Resend)

- Resend API key stored in `company_info.resend_api_key` per account
- From address: `mail@fieldbossprohq.com`
- `site_url` in `company_info` is used to build the estimate view link in emails

## Supabase project

URL: `https://knjdbgroiyhvqwrpqzcx.supabase.co`
