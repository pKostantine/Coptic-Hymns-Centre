import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import CategoryCard from '@/components/chc/ui/CategoryCard';
import Icon from '@/components/chc/ui/Icon';
import { CATEGORIES } from '@/constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { useIsMobileWeb } from '@/utils/useIsMobileWeb';

/**
 * Web home page. Phone-width web (isMobileWeb) renders the exact same
 * stacked header-then-centered-buttons layout as index.tsx (same AppHeader,
 * same actionRow) so the mobile website looks like the mobile app -- a phone
 * browser is still a phone. Only desktop-width web gets the wide/horizontal
 * layout below: a single full-width header row (logo + title on the left,
 * the toolbar on the right), which has room to spare that a phone-width
 * header doesn't.
 */
export default function MainMenuWeb() {
  const router = useRouter();
  const { isLive, effectiveDate, goLive } = useCalendar();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { preferences } = useReadingPreferences();
  const isMobileWeb = useIsMobileWeb();
  const iconSize = isMobileWeb ? 20 : 26;
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';
  const appTitle = showArabic ? 'كوبتك هيمنز سنتر' : 'Coptic Hymns Centre';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{appTitle}</title>
      </Head>

      {isMobileWeb ? (
        <>
          <AppHeader
            title={{ english: 'Coptic Hymns Centre', arabic: 'كوبتك هيمنز سنتر' }}
            visibleLanguages={{ english: showEnglish, arabic: showArabic }}
          />
          <View style={styles.actionRow}>
            {shouldShowFullscreen ? (
              <Pressable accessibilityLabel="Toggle full screen" style={styles.actionButton} onPress={toggleFullscreen}>
                <Icon name={isFullscreen ? 'close-fullscreen' : 'open-in-full'} size={24} color={COLORS.gold} />
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Open bookmarks" style={styles.actionButton} onPress={() => router.push('/bookmarks')}>
              <Icon name="bookmark-outline" size={26} color={COLORS.gold} />
            </Pressable>
            <Pressable accessibilityLabel="Open calendar" style={styles.actionButton} onPress={() => router.push('/calendar')}>
              <Icon name="calendar-outline" size={27} color={COLORS.gold} />
            </Pressable>
            <Pressable accessibilityLabel="Open settings" style={styles.actionButton} onPress={() => router.push('/settings')}>
              <Icon name="settings-outline" size={27} color={COLORS.gold} />
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={require('../../assets/images/CHC_sm_web.png')} style={styles.logo} />
          </View>
          {/* Absolutely positioned (spanning the full header width, independent
              of the logo/toolbar's own widths) so the title is truly centered
              on the header line, matching AppHeader — not just centered in
              whatever space happens to be left between the logo and however
              many toolbar buttons are showing. pointerEvents="none" so it
              never intercepts a tap meant for the logo or toolbar in the rare
              case its (untappable, decorative) bounding box overlaps them. */}
          <Text
            style={[styles.centeredHeaderTitle, showArabic && styles.brandTextArabic]}
            numberOfLines={1}
            pointerEvents="none"
          >
            {appTitle}
          </Text>
          <View style={styles.toolbar}>
            {shouldShowFullscreen ? (
              <Pressable accessibilityLabel="Toggle full screen" style={styles.toolbarButton} onPress={toggleFullscreen}>
                <Icon name={isFullscreen ? 'close-fullscreen' : 'open-in-full'} size={iconSize} color={COLORS.gold} />
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Open bookmarks" style={styles.toolbarButton} onPress={() => router.push('/bookmarks')}>
              <Icon name="bookmark-outline" size={iconSize} color={COLORS.gold} />
            </Pressable>
            <Pressable accessibilityLabel="Open calendar" style={styles.toolbarButton} onPress={() => router.push('/calendar')}>
              <Icon name="calendar-outline" size={iconSize} color={COLORS.gold} />
            </Pressable>
            <Pressable accessibilityLabel="Open settings" style={styles.toolbarButton} onPress={() => router.push('/settings')}>
              <Icon name="settings-outline" size={iconSize} color={COLORS.gold} />
            </Pressable>
          </View>
        </View>
      )}

      {!isLive ? (
        <Pressable style={styles.notLiveBanner} onPress={goLive}>
          <Icon name="time-outline" size={16} color={COLORS.gold} />
          <Text style={styles.notLiveText}>
            Viewing {effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — tap to go live
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.listContent, isMobileWeb && styles.listContentMobile]}
        data={CATEGORIES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryCard
            title={item.title}
            arabic={item.arabic}
            showEnglish={showEnglish}
            showArabic={showArabic}
            onPress={() => router.push(`/${item.id}`)}
          />
        )}
      />
      <BottomTabBar active="books" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  // Web-only: react-native-web's browser-flexbox layout doesn't give this
  // FlatList the remaining column height the way native Yoga does without an
  // explicit flex:1, leaving a sliver of unfilled background between the
  // scrolled content and BottomTabBar's top border -- which reads as a
  // stray thin line floating above the tab bar.
  list: { flex: 1 },
  // Mobile-web's stacked header-then-centered-buttons layout, identical to
  // index.tsx's own actionRow/actionButton.
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  // Padding matches AppHeader.web.tsx's own desktop container exactly (same
  // horizontal inset, same asymmetric top/bottom, same logo/title/button
  // dimensions below) so this screen's custom wide header lines up pixel-for-
  // pixel with every other screen's header — same overall height AND the
  // logo/back-button sitting at the same x position — even though its
  // brand-left/toolbar-right layout is structurally different from
  // AppHeader's centered-title one.
  header: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderBottomColor: COLORS.gold,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg + 4,
    paddingBottom: SPACING.md + 4,
    position: 'relative',
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  logo: {
    height: 48,
    width: 48,
    resizeMode: 'contain',
  },
  // Positioned against `header` (position: "relative" above), not `brand` —
  // spans the header's full width so centering is independent of the logo's
  // and toolbar's own widths, same guarantee AppHeader's centered title has.
  centeredHeaderTitle: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    left: SPACING.md,
    position: 'absolute',
    right: SPACING.md,
    textAlign: 'center',
  },
  brandTextArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
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
