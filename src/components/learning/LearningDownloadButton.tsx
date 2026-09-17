import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';

export default function LearningDownloadButton({
  label,
  isArabic = false,
  compact = false,
}: {
  label?: string;
  isArabic?: boolean;
  compact?: boolean;
}) {
  const title = isArabic ? 'التنزيل' : 'Download';
  const message = isArabic
    ? 'إجراء التنزيل جاهز في تجربة التعلّم. سيتم تفعيل التخزين الكامل والعمل بلا اتصال في مرحلة التنزيلات.'
    : 'This learning download action is ready. Persistent local storage and complete offline use arrive in the dedicated Offline Downloads phase.';

  return (
    <Pressable
      accessibilityLabel={title}
      style={[styles.button, compact && styles.compact]}
      onPress={() => Alert.alert(title, message)}
    >
      <Text style={[styles.text, isArabic && styles.arabic]}>
        ↓  {label ?? title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.learningSoft,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  compact: { minHeight: 36, paddingHorizontal: SPACING.md },
  text: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
