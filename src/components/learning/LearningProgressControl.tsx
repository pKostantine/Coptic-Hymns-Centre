import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { learningService } from '@/services/learningService';
import type { LearningProgressState } from '@/types/learningPlatform';

export default function LearningProgressControl({
  hymnId,
  locale,
  isArabic = false,
  onChanged,
}: {
  hymnId: string;
  locale: string;
  isArabic?: boolean;
  onChanged?: (state: LearningProgressState) => void;
}) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [state, setState] = useState<LearningProgressState | null>(null);
  const [saving, setSaving] = useState<LearningProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    learningService.getProgress(locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setAuthenticated(payload.authenticated);
        setState(payload.items.find((item) => item.hymnId === hymnId)?.state ?? null);
      })
      .catch((cause) => {
        if (!active) return;
        setAuthenticated(false);
        setError(cause instanceof Error ? cause.message : 'Unable to load progress.');
      });
    return () => { active = false; };
  }, [hymnId, locale]);

  const choose = async (nextState: LearningProgressState) => {
    if (!authenticated || saving) return;
    setSaving(nextState);
    setError(null);
    try {
      const result = await learningService.setProgress(hymnId, nextState);
      setState(result.state);
      onChanged?.(result.state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update progress.');
    } finally {
      setSaving(null);
    }
  };

  if (authenticated == null) {
    return <ActivityIndicator color={COLORS.learning} style={styles.loader} />;
  }

  if (!authenticated) {
    return (
      <View style={styles.authCard}>
        <Text style={[styles.authTitle, isArabic && styles.arabic]}>
          {isArabic ? 'سجّل الدخول لحفظ تقدّمك' : 'Sign in to save your progress'}
        </Text>
        <Text style={[styles.authBody, isArabic && styles.arabic]}>
          {isArabic
            ? 'يمكنك الاستماع والمشاهدة بدون حساب، لكن حالات التعلّم مرتبطة بحساب CHC.'
            : 'You can listen and watch without an account, but learning states are tied to your CHC account.'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  const options: { id: LearningProgressState; label: string }[] = [
    { id: 'will_learn', label: isArabic ? 'سأتعلّم' : 'Will Learn' },
    { id: 'learning', label: isArabic ? 'أتعلّم الآن' : 'Currently Learning' },
    { id: 'finished', label: isArabic ? 'أكملت التعلّم' : 'Finished Learning' },
  ];

  return (
    <View>
      <Text style={[styles.heading, isArabic && styles.arabic]}>
        {isArabic ? 'تقدّم التعلّم' : 'Learning progress'}
      </Text>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = state === option.id;
          return (
            <Pressable
              key={option.id}
              disabled={Boolean(saving)}
              onPress={() => void choose(option.id)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, isArabic && styles.arabic, selected && styles.optionTextSelected]}>
                {saving === option.id ? '…' : selected ? '✓  ' + option.label : option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: SPACING.md },
  heading: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  option: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionSelected: { backgroundColor: COLORS.learningSoft, borderColor: COLORS.learningLine },
  optionText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  optionTextSelected: { color: COLORS.learningBright },
  authCard: {
    padding: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: SPACING.xs },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
