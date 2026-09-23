import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';

export type MusicSection = 'home' | 'search' | 'library';

export default function MusicSectionNav({ active }: { active: MusicSection }) {
  const router = useRouter();
  const items: { id: MusicSection; label: string; route: '/music' | '/music/search' | '/music/library' }[] = [
    { id: 'home', label: 'Home', route: '/music' },
    { id: 'search', label: 'Search', route: '/music/search' },
    { id: 'library', label: 'Library', route: '/music/library' },
  ];

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => router.replace(item.route)}
          style={[styles.item, active === item.id && styles.itemActive]}
        >
          <Text style={[styles.label, active === item.id && styles.labelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: 4,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: RADII.pill,
  },
  itemActive: { backgroundColor: COLORS.goldSoft },
  label: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700' },
  labelActive: { color: COLORS.goldBright },
});
