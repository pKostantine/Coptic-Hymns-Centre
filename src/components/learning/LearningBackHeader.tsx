import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { goBack } from '@/utils/navigation';

export default function LearningBackHeader({
  title,
  isArabic = false,
  onBack,
}: {
  title: string;
  isArabic?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={onBack ?? (() => goBack(router, '/learn'))} style={styles.backButton}>
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
