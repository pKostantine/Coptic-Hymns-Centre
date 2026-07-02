import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '../../../constants/theme';

type Tone = 'gold' | 'goldSoft' | 'navy' | 'outline' | 'priest' | 'deacon' | 'people' | 'refrain' | 'comment';

const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
  gold: { fg: COLORS.navyDark, bg: COLORS.gold, bd: COLORS.gold },
  goldSoft: { fg: COLORS.gold, bg: COLORS.goldSoft, bd: COLORS.goldLine },
  navy: { fg: COLORS.white, bg: COLORS.navy, bd: COLORS.navy },
  outline: { fg: COLORS.muted, bg: 'transparent', bd: COLORS.border },
  priest: { fg: COLORS.priest, bg: 'transparent', bd: COLORS.priest },
  deacon: { fg: COLORS.deacon, bg: 'transparent', bd: COLORS.deacon },
  people: { fg: COLORS.people, bg: 'transparent', bd: COLORS.people },
  refrain: { fg: COLORS.refrain, bg: 'transparent', bd: COLORS.refrain },
  comment: { fg: COLORS.comment, bg: 'transparent', bd: COLORS.comment },
};

/** CHC Badge — small label pill, incl. liturgical rubric tones. */
export default function Badge({ children, tone = 'goldSoft' }: { children: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Text style={[styles.label, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  label: {
    fontFamily: TYPOGRAPHY.body,
    fontSize: TYPOGRAPHY.fsXs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
