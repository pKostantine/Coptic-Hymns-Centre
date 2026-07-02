import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import IconButton from './IconButton';

interface AppHeaderProps {
  title: string;
  arabic?: string;
  canGoBack?: boolean;
  onBack?: () => void;
  showLogo?: boolean;
  right?: React.ReactNode;
}

/** CHC AppHeader — solid navy chrome with a 1px gold bottom border. */
export default function AppHeader({ title, arabic, canGoBack, onBack, showLogo, right }: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
      {canGoBack ? (
        <IconButton icon="chevron-back" label="Back" size="sm" onPress={onBack} />
      ) : showLogo ? (
        <Image source={require('../../../../assets/images/CHC_App.png')} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={{ width: 40 }} />
      )}

      <View style={styles.titleRow}>
        <Text style={styles.titleEn} numberOfLines={1}>
          {title}
        </Text>
        {arabic ? (
          <Text style={styles.titleAr} numberOfLines={1}>
            {arabic}
          </Text>
        ) : null}
      </View>

      {right || <View style={{ width: canGoBack ? 40 : 0 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm + 6,
    backgroundColor: COLORS.navy,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gold,
  },
  logo: {
    width: 40,
    height: 40,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minWidth: 0,
  },
  titleEn: {
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: TYPOGRAPHY.fsH2,
    fontWeight: '700',
    color: COLORS.white,
  },
  titleAr: {
    flex: 1,
    fontFamily: TYPOGRAPHY.arabicBold,
    fontSize: TYPOGRAPHY.fsH2 + 1,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
