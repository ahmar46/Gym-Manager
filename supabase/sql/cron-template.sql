-- Replace the placeholders before running this in the Supabase SQL editor.
-- This schedules the WhatsApp reminder sync every day at 09:00 UTC.

select cron.schedule(
  'fitpro-whatsapp-reminders-daily',
  '0 9 * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-whatsapp-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_REMINDER_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $$
);
