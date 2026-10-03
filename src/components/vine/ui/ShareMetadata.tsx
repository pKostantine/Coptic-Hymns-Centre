import Head from 'expo-router/head';

export default function ShareMetadata({
  title,
  description,
  canonicalUrl,
  imageUrl,
  type = 'website',
}: {
  title: string;
  description?: string | null;
  canonicalUrl: string;
  imageUrl?: string | null;
  type?: 'website' | 'music.song' | 'music.album' | 'profile';
}) {
  const fullTitle = title.includes('Coptic Vine')
    ? title
    : title + ' — Coptic Vine';
  const summary = description?.trim() || 'Coptic Vine';
  // A page with no artwork of its own falls back to the seal card rather than
  // the app icon, which is a 1024 square and reads as a tiny tile in a chat.
  let fallbackImage = 'https://copticvine.ca/coptic-vine-share.png';
  try {
    fallbackImage = new URL('/coptic-vine-share.png', canonicalUrl).toString();
  } catch {
    // Keep the deployed Coptic Vine fallback.
  }
  const image = imageUrl || fallbackImage;
  const isFallbackImage = image === fallbackImage;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={summary} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:site_name" content="Coptic Vine" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={summary} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      {/* Only the card's size is known here; an entity's artwork is whatever it is. */}
      {isFallbackImage ? <meta property="og:image:type" content="image/png" /> : null}
      {isFallbackImage ? <meta property="og:image:width" content="1200" /> : null}
      {isFallbackImage ? <meta property="og:image:height" content="630" /> : null}
      <meta property="og:image:alt" content={title} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={summary} />
      <meta name="twitter:image" content={image} />
    </Head>
  );
}
