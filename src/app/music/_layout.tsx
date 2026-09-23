import { Stack } from 'expo-router';

import { COLORS } from '@/constants/theme';

export default function MusicLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.black } }}>
      <Stack.Screen name="index" options={{ animation: 'none', gestureEnabled: false }} />
      <Stack.Screen name="search" options={{ animation: 'none', gestureEnabled: false }} />
      <Stack.Screen name="library" options={{ animation: 'none', gestureEnabled: false }} />
    </Stack>
  );
}
