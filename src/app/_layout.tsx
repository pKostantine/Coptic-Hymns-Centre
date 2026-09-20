import { useFonts as useLocalFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GlobalNowPlayingOverlay from '@/components/playback/GlobalNowPlayingOverlay';
import { COLORS } from '@/constants/theme';
import { BottomChromeProvider } from '@/context/BottomChromeContext';
import { CalendarProvider } from '@/context/CalendarContext';
import { MusicPlayerProvider } from '@/context/MusicPlayerContext';
import { ReadingPreferencesProvider, useReadingPreferences } from '@/context/ReadingPreferencesContext';
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
      {/* Books, Music, Learn & Study, and App Settings are peer sections,
          not subpages, so switching between them never grows a back stack. */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="music" options={{ animation: 'none' }} />
      <Stack.Screen name="learn" options={{ animation: 'none' }} />
      <Stack.Screen name="search" options={{ animation: 'none' }} />
      <Stack.Screen name="app-settings" options={{ animation: 'none' }} />

      {/* The now-playing views are floating overlays that sit on top of the
          current page instead of acting like a separate app screen. */}
    </Stack>
  );
}

export default function RootLayout() {
  // Matches the old app's App.js exactly: only the bundled Coptic font is
  // loaded via expo-font. Georgia/Arial/System are OS fonts, not bundled.
  const [copticLoaded] = useLocalFonts({
    Athanasius: require('../../assets/fonts/Athanasius.ttf'),
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
            <BottomChromeProvider>
              <AppStack />
              <GlobalNowPlayingOverlay />
            </BottomChromeProvider>
          </MusicPlayerProvider>
        </CalendarProvider>
      </ReadingPreferencesProvider>
    </SafeAreaProvider>
  );
}
