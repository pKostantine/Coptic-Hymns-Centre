import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';

export type LearningSection = 'home' | 'search' | 'library';

export default function LearningSectionNav({ active }: { active: LearningSection }) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const items: {
    id: LearningSection;
    label: string;
    route: '/learn' | '/learn/search' | '/learn/library';
  }[] = [
    { id: 'home', label: isArabic ? 'الرئيسية' : 'Discover', route: '/learn' },
    { id: 'search', label: isArabic ? 'بحث' : 'Search', route: '/learn/search' },
    { id: 'library', label: isArabic ? 'تعلّمي' : 'My Learning', route: '/learn/library' },
  ];

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => item.id === 'search' ? router.push(item.route) : router.replace(item.route)}
          style={[styles.item, active === item.id && styles.itemActive]}
        >
          <Text style={[
            styles.label,
            isArabic && styles.arabic,
            active === item.id && styles.labelActive,
          ]}>
            {item.label}
          </Text>
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
  itemActive: { backgroundColor: COLORS.learningSoft },
  label: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: { color: COLORS.learningBright },
  arabic: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
