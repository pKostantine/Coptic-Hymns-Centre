import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import Icon, { type IconName } from './Icon';

interface PageTitleAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

interface PageTitleProps {
  title: string;
  arabic: boolean;
  actions?: PageTitleAction[];
}

/** A tab's own page (CHC design, "Books"): its name large at the head, round gold buttons beside it. */
export default function PageTitle({ title, arabic, actions = [] }: PageTitleProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + 6 }, arabic && styles.rowReverse]}>
      <Text style={[styles.title, arabic && styles.arabic]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.actions, arabic && styles.rowReverse]}>
        {actions.map((action) => (
          <Pressable
            key={action.icon}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={4}
            onPress={action.onPress}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Icon name={action.icon} size={22} color={COLORS.gold} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16 },
  rowReverse: { flexDirection: 'row-reverse' },
  title: { color: COLORS.white, flexShrink: 1, fontFamily: TYPOGRAPHY.title, fontSize: 34, fontWeight: '700' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  actions: { flexDirection: 'row', gap: 8 },
  button: {
    alignItems: 'center',
    borderColor: COLORS.goldLine,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: { opacity: 0.7 },
});
