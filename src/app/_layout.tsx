import { useFonts as useLocalFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GlobalNowPlayingOverlay from '@/components/playback/GlobalNowPlayingOverlay';
import { COLORS } from '@/constants/theme';
import { AuthProvider } from '@/context/AuthContext';
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
      {/* Home, Books, Music, Learn & Study, and Account are peer sections,
          so switching between them never grows a back stack. */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="books" options={{ animation: 'none' }} />
      <Stack.Screen name="music" options={{ animation: 'none' }} />
      <Stack.Screen name="learn" options={{ animation: 'none' }} />
      <Stack.Screen name="search" options={{ animation: 'none' }} />
      <Stack.Screen name="account" options={{ animation: 'none' }} />
      <Stack.Screen name="settings" options={{ animation: 'none' }} />
      <Stack.Screen name="synaxarium" options={{ animation: 'default' }} />
      <Stack.Screen name="app-settings" options={{ animation: 'none' }} />

      {/* The now-playing views are floating overlays that sit on top of the
          current page instead of acting like a separate app screen. */}
    </Stack>
  );
}

export default function RootLayout() {
  // Keep the two Coptic fonts deliberately separate: Books/readers use the
  // CHC custom face, while Music synchronized lyrics use Athanasius.
  const [copticLoaded] = useLocalFonts({
    'CopticCHC-Regular': require('../../assets/fonts/CopticCHC-Regular-V3.ttf'),
    Athanasius: require('../../assets/fonts/CopticCHC-Athanasius-V1.0.ttf'),
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
      <AuthProvider>
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
      </AuthProvider>
    </SafeAreaProvider>
  );
}
