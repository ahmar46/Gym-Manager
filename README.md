# FitPro Cloud

FitPro Cloud is a gym management SaaS frontend backed by Supabase Auth, Postgres, Row Level Security, and Edge Functions. It includes:

- owner sign in and gym creation
- cloud member data and attendance tracking
- staff user provisioning through an Edge Function
- Chart.js profit, churn, and attendance charts
- automatic WhatsApp reminders using Twilio or Meta WhatsApp Cloud API

## 1. Create the frontend config

Copy `config.example.js` to `config.js` and fill in:

- `supabaseUrl`
- `supabaseAnonKey`
- `functionsBaseUrl`

## 2. Create the Supabase project

Run the SQL migration in:

- `supabase/migrations/20260423_fitpro_cloud.sql`

This creates the tables, helper functions, and RLS policies.

## 3. Configure Supabase Auth

Use email/password auth.

For the easiest owner onboarding flow, disable email confirmation during initial setup, or update the frontend to handle delayed workspace creation after confirmation.

## 4. Deploy the Edge Functions

Functions included:

- `supabase/functions/send-whatsapp-reminders`
- `supabase/functions/create-staff-user`

Deploy them with the Supabase CLI:

```bash
supabase functions deploy send-whatsapp-reminders
supabase functions deploy create-staff-user
```

## 5. Set required secrets

Set these in Supabase project secrets:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REMINDER_CRON_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
```

Use either the Twilio values or the Meta values, depending on the `whatsapp_provider` stored for the gym.

## 6. Schedule automatic reminders

Create a Supabase Cron job that calls the Edge Function once or twice daily.

Template SQL is included in:

- `supabase/sql/cron-template.sql`

Example request:

```http
POST https://YOUR-PROJECT.supabase.co/functions/v1/send-whatsapp-reminders
Authorization: Bearer YOUR_REMINDER_CRON_SECRET
Content-Type: application/json

{}
```

Recommended schedule:

- every day at 09:00 local time for absence reminders
- every day at 18:00 local time for fee reminders

## 7. Deploy the frontend

This frontend is static and can be deployed to:

- Vercel
- Netlify
- Cloudflare Pages
- any static host

Make sure `config.js` is deployed with the real Supabase values.

## Notes

- staff creation is owner-only and runs through the secure `create-staff-user` Edge Function
- manual reminder sync from the dashboard invokes the same reminder function with the signed-in owner JWT
- automatic reminders are fully backend-driven through the scheduled Edge Function
