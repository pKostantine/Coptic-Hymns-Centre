import { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useLocalFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { COLORS } from '@/constants/theme';
import { ReadingPreferencesProvider, useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { CalendarProvider } from '@/context/CalendarContext';

SplashScreen.preventAutoHideAsync();

const ORIENTATION_LOCKS = {
  auto: 'UNLOCK',
  landscape: 'LANDSCAPE_RIGHT',
  reverseLandscape: 'LANDSCAPE_LEFT',
  portrait: 'PORTRAIT_UP',
} as const;

function OrientationLock() {
  const { preferences } = useReadingPreferences();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      const ScreenOrientation = await import('expo-screen-orientation');
      const mode = ORIENTATION_LOCKS[preferences.orientationMode];
      if (mode === 'UNLOCK') {
        await ScreenOrientation.unlockAsync();
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock[mode]);
      }
    })();
  }, [preferences.orientationMode]);

  return null;
}

export default function RootLayout() {
  // Matches the old app's App.js exactly: only the bundled Coptic font is
  // loaded via expo-font. Georgia/Arial/System are OS fonts, not bundled.
  const [copticLoaded] = useLocalFonts({
    'CopticCHC-Regular': require('../../assets/fonts/CopticCHC-Regular-V3.ttf'),
  });

  const fontsReady = copticLoaded;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: COLORS.black }} />;
  }

  return (
    <SafeAreaProvider>
      <ReadingPreferencesProvider>
        <CalendarProvider>
          <StatusBar style="light" />
          <OrientationLock />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.black },
            }}
          >
            {/* Books <-> App Settings behaves like switching tabs, not pushing a
                subpage — no slide transition between them. */}
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="app-settings" options={{ animation: 'none' }} />
          </Stack>
        </CalendarProvider>
      </ReadingPreferencesProvider>
    </SafeAreaProvider>
  );
}
