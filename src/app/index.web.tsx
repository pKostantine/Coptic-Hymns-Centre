import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryCard from '@/components/chc/ui/CategoryCard';
import Icon from '@/components/chc/ui/Icon';
import { CATEGORIES } from '@/constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { useIsMobileWeb } from '@/utils/useIsMobileWeb';

/**
 * Web home page — wide/horizontal layout: a single full-width header row
 * (logo + title on the left, the toolbar on the right) instead of mobile's
 * stacked header-then-centered-buttons, and shallow wide category rows
 * (English left / Arabic right / chevron) instead of mobile's tall cards.
 * Web uses width; mobile uses depth — see index.tsx for the mobile layout.
 */
export default function MainMenuWeb() {
  const router = useRouter();
  const { isLive, effectiveDate, goLive } = useCalendar();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const isMobileWeb = useIsMobileWeb();
  const iconSize = isMobileWeb ? 20 : 26;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>Coptic Hymns Centre</title>
      </Head>

      <View style={[styles.header, isMobileWeb && styles.headerMobile]}>
        <View style={styles.brand}>
          <Image source={require('../../assets/images/CHC_sm_web.png')} style={[styles.logo, isMobileWeb && styles.logoMobile]} />
          <Text style={[styles.brandText, isMobileWeb && styles.brandTextMobile]} numberOfLines={1}>
            Coptic Hymns Centre
          </Text>
        </View>
        <View style={styles.toolbar}>
          {shouldShowFullscreen ? (
            <Pressable
              accessibilityLabel="Toggle full screen"
              style={[styles.toolbarButton, isMobileWeb && styles.toolbarButtonMobile]}
              onPress={toggleFullscreen}
            >
              <Icon name={isFullscreen ? 'close-fullscreen' : 'open-in-full'} size={iconSize} color={COLORS.gold} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Open bookmarks"
            style={[styles.toolbarButton, isMobileWeb && styles.toolbarButtonMobile]}
            onPress={() => router.push('/bookmarks')}
          >
            <Icon name="bookmark-outline" size={iconSize} color={COLORS.gold} />
          </Pressable>
          <Pressable
            accessibilityLabel="Open calendar"
            style={[styles.toolbarButton, isMobileWeb && styles.toolbarButtonMobile]}
            onPress={() => router.push('/calendar')}
          >
            <Icon name="calendar-outline" size={iconSize} color={COLORS.gold} />
          </Pressable>
          <Pressable
            accessibilityLabel="Open settings"
            style={[styles.toolbarButton, isMobileWeb && styles.toolbarButtonMobile]}
            onPress={() => router.push('/settings')}
          >
            <Icon name="settings-outline" size={iconSize} color={COLORS.gold} />
          </Pressable>
        </View>
      </View>

      {!isLive ? (
        <Pressable style={styles.notLiveBanner} onPress={goLive}>
          <Icon name="time-outline" size={16} color={COLORS.gold} />
          <Text style={styles.notLiveText}>
            Viewing {effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — tap to go live
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        contentContainerStyle={[styles.listContent, isMobileWeb && styles.listContentMobile]}
        data={CATEGORIES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryCard title={item.title} arabic={item.arabic} onPress={() => router.push(`/${item.id}`)} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderBottomColor: COLORS.gold,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 4,
  },
  headerMobile: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: SPACING.md,
  },
  logo: {
    height: 48,
    width: 48,
    resizeMode: 'contain',
  },
  logoMobile: {
    height: 32,
    width: 32,
  },
  brandText: {
    color: COLORS.white,
    flexShrink: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
  },
  brandTextMobile: {
    fontSize: 16,
  },
  toolbar: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  toolbarButton: {
    alignItems: 'center',
    borderColor: 'rgba(201, 162, 39, 0.45)',
    borderRadius: 20,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  toolbarButtonMobile: {
    borderRadius: 16,
    height: 36,
    width: 36,
  },
  notLiveBanner: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
  },
  notLiveText: {
    fontFamily: TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  listContentMobile: {
    padding: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
});
