# CHC Notification Dispatcher

Cloudflare Worker for native CHC push delivery.

## Required secrets

Set these with Wrangler before deployment:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_WORKER_SECRET`
- `EXPO_ACCESS_TOKEN` only if Expo Push enhanced security is enabled

`SUPABASE_URL` is a non-secret Worker variable in `wrangler.jsonc`.

## Deploy

```bash
npx wrangler deploy -c workers/notification-dispatcher/wrangler.jsonc
```

The cron runs once per minute. It claims queued deliveries through service-role-only
Supabase RPCs, sends batches of up to 100 through Expo Push, and checks delivery
receipts after the database's 15-minute receipt delay.

Do not put Apple, Firebase, Expo, Supabase service-role, VAPID, or WNS secrets in
the repository.
