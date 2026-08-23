import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover extends the app into the notch/safe-area in
            landscape on mobile — without it, the browser leaves white bars on
            the sides. Safe-area insets are then handled by SafeAreaProvider. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        {/* Match the splash/loading background so safe-area gutters in landscape
            show navy instead of the browser's default white. */}
        <style
          dangerouslySetInnerHTML={{
            __html: 'html,body{background-color:#003566;}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
