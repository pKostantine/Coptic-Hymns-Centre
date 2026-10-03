import { useFonts as useLocalFonts } from 'expo-font';
import { Stack, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BookSyncBootstrap from '@/components/BookSyncBootstrap';
import NotificationBootstrap from '@/components/NotificationBootstrap';
import SideBar from '@/components/vine/ui/SideBar';
import GlobalNowPlayingOverlay from '@/components/playback/GlobalNowPlayingOverlay';
import { COLORS } from '@/constants/theme';
import { AuthProvider } from '@/context/AuthContext';
import { BottomChromeProvider, useBottomChrome } from '@/context/BottomChromeContext';
import { CalendarProvider } from '@/context/CalendarContext';
import { MusicPlayerProvider } from '@/context/MusicPlayerContext';
import { ReadingPreferencesProvider, useReadingPreferences } from '@/context/ReadingPreferencesContext';
import type { OrientationMode } from '@/utils/preferencesStorage';
import { keepsWholeWindow } from '@/utils/desktopChrome';
import { useLayoutMode } from '@/utils/useLayoutMode';

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

/**
 * On a desktop browser the app sits beside the left sidebar (Coptic Vine,
 * "Layout and spacing"), which takes the place of the bottom tab bar; on the
 * phone and the iPad the pages fill the window and carry the tab bar
 * themselves.
 */
function AppFrame() {
  const layout = useLayoutMode();
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const { preferences } = useReadingPreferences();
  // A full now-playing screen is an overlay, not a route, so the segments alone
  // cannot tell us it is open — the overlay reports it instead.
  const { nowPlayingExpanded } = useBottomChrome();
  const showSideBar = layout === 'desktop' && !keepsWholeWindow(segments) && !nowPlayingExpanded;

  return (
    <View style={{ flex: 1, flexDirection: preferences.appLanguage === 'ar' ? 'row-reverse' : 'row', backgroundColor: COLORS.black }}>
      {showSideBar ? <SideBar pathname={pathname} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppStack />
        <GlobalNowPlayingOverlay />
      </View>
    </View>
  );
}

export default function RootLayout() {
  // Keep the two Coptic fonts deliberately separate: Books/readers use the
  // Coptic Vine custom face, while Music synchronized lyrics use Athanasius.
  const [copticLoaded] = useLocalFonts({
    'CopticVine-Regular': require('../../assets/fonts/CopticVine-Regular-v3.1.ttf'),
    Athanasius: require('../../assets/fonts/CopticVine-Athanasius-v1.0.ttf'),
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
        <NotificationBootstrap />
        <BookSyncBootstrap />
        <ReadingPreferencesProvider>
          <CalendarProvider>
            <MusicPlayerProvider>
              <StatusBar style="light" />
              <BottomChromeProvider>
                <AppFrame />
              </BottomChromeProvider>
            </MusicPlayerProvider>
          </CalendarProvider>
        </ReadingPreferencesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
