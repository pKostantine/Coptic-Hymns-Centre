import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareFlatList } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '../ui/AppHeader';
import HymnCard from '../ui/HymnCard';
import { HOLY_WEEK_ROWS, holyWeekDayHref } from '../../../constants/manifest';
import { COLORS, SPACING } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { goBack } from '../../../utils/navigation';

/** Holy Week menu: one row per day, the day beside the eve prayed on its evening (see HOLY_WEEK_ROWS). */
export default function HolyWeekMenu() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Holy Week</title>
      </Head>
      <AppHeader
        title={{ english: 'Holy Week', arabic: 'أسبوع الآلام' }}
        canGoBack
        onBack={() => goBack(router, '/books')}
        visibleLanguages={{ english: showEnglish, arabic: showArabic }}
      />
      <NowPlayingAwareFlatList
        contentContainerStyle={styles.listContent}
        data={HOLY_WEEK_ROWS}
        keyExtractor={(row) => row.id}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.days.map((day) => (
              <View key={day.id} style={styles.cell}>
                <HymnCard
                  title={day.title}
                  arabic={day.arabic}
                  showEnglish={showEnglish}
                  showArabic={showArabic}
                  onPress={() => router.push(holyWeekDayHref(day) as never)}
                />
              </View>
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  row: { flexDirection: 'row', gap: SPACING.sm },
  cell: { flex: 1 },
});
