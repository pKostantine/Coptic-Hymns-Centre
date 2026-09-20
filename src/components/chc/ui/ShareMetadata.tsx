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
  const fullTitle = title.includes('Coptic Hymns Centre')
    ? title
    : title + ' — Coptic Hymns Centre';
  const summary = description?.trim() || 'Coptic Hymns Centre';
  let fallbackImage = 'https://chc.pierrek.ca/apple-touch-icon.png';
  try {
    fallbackImage = new URL('/apple-touch-icon.png', canonicalUrl).toString();
  } catch {
    // Keep the deployed CHC fallback.
  }
  const image = imageUrl || fallbackImage;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={summary} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:site_name" content="Coptic Hymns Centre" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={summary} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:alt" content={title} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={summary} />
      <meta name="twitter:image" content={image} />
    </Head>
  );
}
