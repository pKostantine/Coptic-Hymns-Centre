import { Href, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import HymnCard from '../ui/HymnCard';
import { COLORS, SPACING } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { goBack } from '../../../utils/navigation';

interface ServiceSubmenuItem {
  id: string;
  title: string;
  arabic: string;
  /** Present only for actual bookmarkable services — omitted for pure navigational groups (e.g. Liturgy's Raising of Incense / Divine Liturgy). */
  schema?: string;
  table?: string;
}

interface ServiceSubmenuProps {
  /** Base path this submenu navigates into, e.g. "liturgy" or "liturgy/raising-of-incense". */
  basePath: string;
  title: string;
  arabic: string;
  services: ServiceSubmenuItem[];
  /** Where "back" should land when there's no navigation history to pop (direct deep link, page reload). */
  backHref: Href;
}

/** Generic submenu screen: lists the order-table services (or navigational sub-groups) within a category. Ported from HymnListScreen.js. */
export default function ServiceSubmenu({ basePath, title, arabic, services, backHref }: ServiceSubmenuProps) {
  const router = useRouter();
  const { isBookmarked, preferences } = useReadingPreferences();
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>{`CHC ${title}`}</title>
      </Head>
      <AppHeader title={{ english: title, arabic }} canGoBack onBack={() => goBack(router, backHref)} visibleLanguages={{ english: showEnglish, arabic: showArabic }} />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HymnCard
            title={item.title}
            arabic={item.arabic}
            showEnglish={showEnglish}
            showArabic={showArabic}
            isBookmarked={item.schema && item.table ? isBookmarked(`${item.schema}:${item.table}`) : false}
            onPress={() => router.push(`/${basePath}/${item.id}` as never)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
});
