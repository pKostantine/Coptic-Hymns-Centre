# CHC Notification Dispatcher

Cloudflare Worker for CHC native push and standards-based Web Push.

## Required Worker secrets

Set these with Wrangler before deployment:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_WORKER_SECRET`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_SUBJECT` (for example `mailto:admin@coptichymnscentre.com`)
- `EXPO_ACCESS_TOKEN` only if Expo Push enhanced security is enabled

`SUPABASE_URL` is a non-secret Worker variable in `wrangler.jsonc`.

The same VAPID public key must be supplied to the CHC web build as
`EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`. Never expose the VAPID private key to
the app or website.

## Deploy

```bash
npx wrangler deploy -c workers/notification-dispatcher/wrangler.jsonc
```

The cron runs once per minute. Native delivery claims batches of up to 100,
sends them through Expo Push, then checks Expo delivery receipts after the
database's 15-minute receipt delay. Web Push claims a conservative batch of 40
and sends encrypted VAPID-authenticated notifications directly to each browser
push service.

Do not put Apple, Firebase, Expo, Supabase service-role, VAPID private, or WNS
secrets in the repository.
