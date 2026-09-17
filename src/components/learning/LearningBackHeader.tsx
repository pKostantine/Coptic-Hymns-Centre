import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';

export default function LearningBackHeader({
  title,
  isArabic = false,
}: {
  title: string;
  isArabic?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <Text numberOfLines={1} style={[styles.title, isArabic && styles.arabic]}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.learning, fontSize: 38, lineHeight: 40 },
  title: {
    flex: 1,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  spacer: { width: 44 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
