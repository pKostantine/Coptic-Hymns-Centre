import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useLocalFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import { ReadingPreferencesProvider, useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { CalendarProvider } from '@/context/CalendarContext';
import { MusicPlayerProvider } from '@/context/MusicPlayerContext';
import type { OrientationMode } from '@/utils/preferencesStorage';

SplashScreen.preventAutoHideAsync();

type StackOrientation = 'default' | 'landscape_right' | 'landscape_left' | 'portrait_up';

const STACK_ORIENTATIONS: Record<OrientationMode, StackOrientation> = {
  auto: 'default',
  landscape: 'landscape_right',
  reverseLandscape: 'landscape_left',
  portrait: 'portrait_up',
};

function AppStack() {
  const { preferences } = useReadingPreferences();
  const orientation = STACK_ORIENTATIONS[preferences.orientationMode];

  // Expo Router delegates this option to the native screen controller. That
  // keeps its bounds and orientation in one lifecycle, including when an iPad
  // scene returns from the background. Calling lockAsync from AppState's
  // immediate "active" event can race the scene's restored dimensions and
  // leave the route rendered with portrait-width bounds in landscape.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.black },
        orientation,
      }}
    >
      {/* Books, Music, and App Settings behave like peer top-level sections,
          not subpages, so switching between them never grows a back stack. */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="music" options={{ animation: 'none' }} />
      <Stack.Screen name="app-settings" options={{ animation: 'none' }} />
    </Stack>
  );
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
          <MusicPlayerProvider>
            <StatusBar style="light" />
            <AppStack />
          </MusicPlayerProvider>
        </CalendarProvider>
      </ReadingPreferencesProvider>
    </SafeAreaProvider>
  );
}
