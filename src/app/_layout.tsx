import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useCormorantFonts, CormorantGaramond_500Medium, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond';
import { useFonts as useAmiriFonts, Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { useFonts as useLocalFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { COLORS } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [cormorantLoaded] = useCormorantFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
  });
  const [amiriLoaded] = useAmiriFonts({ Amiri_400Regular, Amiri_700Bold });
  const [copticLoaded] = useLocalFonts({
    'CopticCHC-Regular': require('../../assets/fonts/CopticCHC-Regular-V3.ttf'),
  });

  const fontsReady = cormorantLoaded && amiriLoaded && copticLoaded;

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
      <StatusBar style="light" backgroundColor={COLORS.navy} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.black },
        }}
      />
    </SafeAreaProvider>
  );
}
