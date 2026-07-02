import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import HymnCard from '../ui/HymnCard';
import { COLORS, SPACING } from '../../../constants/theme';
import { CategoryId, ServiceDef } from '../../../constants/manifest';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';

interface ServiceSubmenuProps {
  categoryId: CategoryId;
  title: string;
  arabic: string;
  services: ServiceDef[];
}

/** Generic submenu screen: lists the order-table services within a category (Psalmody, Liturgy, Agpeya). Ported from HymnListScreen.js. */
export default function ServiceSubmenu({ categoryId, title, arabic, services }: ServiceSubmenuProps) {
  const router = useRouter();
  const { isBookmarked } = useReadingPreferences();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>{`CHC ${title}`}</title>
      </Head>
      <AppHeader title={{ english: title, arabic }} canGoBack onBack={() => router.back()} />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HymnCard
            title={item.title}
            arabic={item.arabic}
            isBookmarked={isBookmarked(`${item.schema}:${item.table}`)}
            onPress={() => router.push(`/${categoryId}/${item.id}` as never)}
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
