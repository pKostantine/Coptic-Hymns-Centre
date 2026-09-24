# CHC native content package Worker

This Worker publishes immutable, gzip-encoded book-resource chunks to the
private `chc-content` R2 bucket and exposes only the current root manifest and
published package objects. It never exposes Supabase service credentials.

Configure the `SUPABASE_SERVICE_ROLE_KEY` and `PUBLISH_TOKEN` Worker secrets,
create/bind `chc-content`, apply the matching Supabase migration, then deploy:

```sh
npx wrangler r2 bucket create chc-content
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c workers/content-packages/wrangler.jsonc
npx wrangler secret put PUBLISH_TOKEN -c workers/content-packages/wrangler.jsonc
npx wrangler deploy -c workers/content-packages/wrangler.jsonc
```

Set the app's `EXPO_PUBLIC_CONTENT_PACKAGES_URL` to the deployed Worker URL.
The 15-minute schedule drains publication requests raised by database triggers.
`POST /publish` with the publish token is the manual/CI publication path.
