import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryCard from '@/components/chc/ui/CategoryCard';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { CATEGORIES } from '@/constants/manifest';
import { useCalendar } from '@/context/CalendarContext';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

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
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>Coptic Hymns Centre</title>
      </Head>

      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={require('../../assets/images/CHC_sm_web.png')} style={styles.logo} />
          <Text style={styles.brandText}>Coptic Hymns Centre</Text>
        </View>
        <View style={styles.toolbar}>
          <Pressable accessibilityLabel="Toggle full screen" style={styles.toolbarButton} onPress={toggleFullscreen}>
            <MaterialIcons name={isFullscreen ? 'close-fullscreen' : 'open-in-full'} size={26} color={COLORS.gold} />
          </Pressable>
          <Pressable accessibilityLabel="Open bookmarks" style={styles.toolbarButton} onPress={() => router.push('/bookmarks')}>
            <Ionicons name="bookmark-outline" size={26} color={COLORS.gold} />
          </Pressable>
          <Pressable accessibilityLabel="Open calendar" style={styles.toolbarButton} onPress={() => router.push('/calendar')}>
            <Ionicons name="calendar-outline" size={26} color={COLORS.gold} />
          </Pressable>
          <Pressable accessibilityLabel="Open settings" style={styles.toolbarButton} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={26} color={COLORS.gold} />
          </Pressable>
        </View>
      </View>

      {!isLive ? (
        <Pressable style={styles.notLiveBanner} onPress={goLive}>
          <Ionicons name="time-outline" size={16} color={COLORS.gold} />
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
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  logo: {
    height: 48,
    width: 48,
    resizeMode: 'contain',
  },
  brandText: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
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
});
