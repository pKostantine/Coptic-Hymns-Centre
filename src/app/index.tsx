import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import CategoryCard from '@/components/chc/ui/CategoryCard';
import Icon from '@/components/chc/ui/Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { CATEGORIES } from '@/constants/manifest';
import { useCalendar } from '@/context/CalendarContext';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

/** Main menu — ported 1:1 from HomeScreen.js/HomeScreen.web.js: Header, an action row (web adds a fullscreen toggle), then the category list. */
export default function MainMenu() {
  const router = useRouter();
  const { isLive, effectiveDate, goLive } = useCalendar();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>Coptic Hymns Centre</title>
      </Head>
      <AppHeader title="Coptic Hymns Centre" />

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

      {!isLive ? (
        <Pressable style={styles.notLiveBanner} onPress={goLive}>
          <Icon name="time-outline" size={16} color={COLORS.gold} />
          <Text style={styles.notLiveText}>
            Viewing {effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — tap to go live
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        contentContainerStyle={styles.listContent}
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
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  notLiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.md,
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
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
});
