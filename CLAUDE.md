# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SprayBossPro Online — a multi-tenant web app for lawn care / pest control businesses. Pure static HTML/CSS/JS with no build step. Deployed to Vercel as a static site.

## No build system

There is no `package.json`, no bundler, no compiler, and no test runner. Files are served directly. To "run" the app, open `index.html` in a browser or deploy to Vercel.

## Supabase Edge Functions

The `supabase/functions/` directory contains Deno/TypeScript edge functions deployed to Supabase. They are NOT part of the static site.

To deploy a function:
```
supabase functions deploy <function-name>
```

Functions use `Deno.env.get("SUPABASE_URL")` and `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` for credentials — except `add-card/index.ts` which has hardcoded keys (known issue).

## Architecture

- **Auth**: Supabase Auth via the `@supabase/supabase-js` CDN client. Login is `index.html` + `Login.js`. After login, `user_profiles.role` is checked — `mobile` role users are blocked from the web app and redirected back.
- **Multi-tenancy**: Most Supabase tables have a `user_id` column scoping data per company account.
- **Navigation**: Every page is a standalone `.html` file. The sidebar in `dashboard.html` uses `<iframe>` or `window.location` to navigate between pages.
- **Data**: All persistence goes through Supabase (no localStorage). Key tables: `Services`, `Properties`, `Clients`, `company_info`, `estimates`, `user_profiles`.
- **Scheduled services**: Use the `Services` table (not a Jobs table). Filter by `property_id`; `dispatched=false` = upcoming, `dispatched=true` = history.
- **Map pins**: When rows come from `Services` (not `Properties`), join `Properties(lat, lng)` in the select query rather than doing a separate lookup.

## Edge functions

| Function | Purpose |
|---|---|
| `add-card` | Stripe — attach/detach payment methods to customers |
| `stripe-setup-card` | Stripe setup intent flow |
| `send-estimate-email` | Send estimate via Resend email API; reads template from `email_templates` table |
| `send-sms-alert` | Send SMS via Twilio; reads credentials from `twilio_settings` table per `user_id` |
| `sms-webhook` | Receive inbound Twilio SMS |
| `manage-users` | Admin CRUD for Supabase Auth users (create/update password/delete/list) |

## Supabase project

URL: `https://knjdbgroiyhvqwrpqzcx.supabase.co`
