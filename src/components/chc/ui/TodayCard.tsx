import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { getCopticDateLabel } from '../../../utils/calendarService';
import Icon from './Icon';

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function toEasternDigits(text: string) {
  return text.replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

/**
 * The day, at the top of the Books menu.
 *
 * Almost everything in this app is read against a date, and the menu never said
 * which one. This does, and gives the one shortcut a daily reader actually
 * wants — the day's readings — rather than making them find Lectionary in the
 * list below.
 *
 * It also absorbs the old "you are viewing another date" banner. Being pinned
 * to a date is a property of the day being shown, not a separate warning strip,
 * so the same card says so and offers the way back to today.
 */
export default function TodayCard({
  arabic,
  onOpenReadings,
}: {
  /** True when the app is in Arabic, so the card follows the reading direction. */
  arabic: boolean;
  onOpenReadings: () => void;
}) {
  const { isLive, effectiveDate, goLive } = useCalendar();
  const dateKey = effectiveDate.toISOString().slice(0, 10);
  // The label is kept with the day it belongs to rather than cleared when the
  // day changes: clearing it would be a synchronous setState inside the effect,
  // and comparing keys drops a stale label just as well.
  const [resolved, setResolved] = useState<{ key: string; label: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    void getCopticDateLabel(effectiveDate).then((label) => {
      if (active) setResolved({ key: dateKey, label });
    });
    return () => { active = false; };
  }, [effectiveDate, dateKey]);

  const copticLabel = resolved?.key === dateKey ? resolved.label : null;

  const gregorian = effectiveDate.toLocaleDateString(arabic ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const heading = copticLabel
    ? (arabic ? toEasternDigits(copticLabel) : copticLabel)
    : gregorian;
  const sub = copticLabel ? gregorian : null;

  return (
    <View style={styles.card}>
      <View style={[styles.topRow, arabic && styles.rtlRow]}>
        <View style={styles.dateBlock}>
          <Text style={[styles.eyebrow, arabic && styles.arabicEyebrow]}>
            {isLive ? (arabic ? 'اليوم' : 'Today') : (arabic ? 'تعرض' : 'Viewing')}
          </Text>
          <Text style={[styles.heading, arabic && styles.arabicHeading]} numberOfLines={1}>{heading}</Text>
          {sub ? <Text style={[styles.sub, arabic && styles.arabicText]} numberOfLines={1}>{sub}</Text> : null}
        </View>

        {!isLive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to today"
            style={styles.goLive}
            onPress={goLive}
            hitSlop={6}
          >
            <Icon name="time-outline" size={15} color={COLORS.gold} />
            <Text style={styles.goLiveText}>{arabic ? 'اليوم' : 'Go to today'}</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.readings, arabic && styles.rtlRow, pressed && styles.readingsPressed]}
        onPress={onOpenReadings}
      >
        <Icon name="document-text-outline" size={18} color={COLORS.subdoc} />
        <Text style={[styles.readingsText, arabic && styles.arabicText]}>
          {arabic ? 'قراءات اليوم' : "Today's readings"}
        </Text>
        <Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={16} color={COLORS.subdoc} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.goldLine,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.md,
    padding: 14,
  },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', gap: SPACING.sm, justifyContent: 'space-between' },
  rtlRow: { flexDirection: 'row-reverse' },
  dateBlock: { flex: 1, gap: 2, minWidth: 0 },
  eyebrow: {
    color: COLORS.gold,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  arabicEyebrow: {
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'right',
    textTransform: 'none',
    writingDirection: 'rtl',
  },
  heading: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  arabicHeading: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  sub: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12.5 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  goLive: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.goldLine,
    borderRadius: RADII.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  goLiveText: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '700' },
  readings: {
    alignItems: 'center',
    backgroundColor: COLORS.subdocSoft,
    borderColor: COLORS.subdocLine,
    borderRadius: RADII.sm + 4,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readingsPressed: { backgroundColor: 'rgba(142, 197, 255, 0.2)' },
  readingsText: { color: COLORS.subdoc, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
});
