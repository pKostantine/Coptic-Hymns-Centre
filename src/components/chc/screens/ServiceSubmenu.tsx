import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import AppHeader from '../ui/AppHeader';
import ListRow from '../ui/ListRow';
import { COLORS, SPACING } from '../../../constants/theme';
import { CategoryId, ServiceDef } from '../../../constants/manifest';

interface ServiceSubmenuProps {
  categoryId: CategoryId;
  title: string;
  arabic: string;
  services: ServiceDef[];
}

/** Generic submenu screen: lists the order-table services within a category (Psalmody, Liturgy, Agpeya). */
export default function ServiceSubmenu({ categoryId, title, arabic, services }: ServiceSubmenuProps) {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <AppHeader title={title} arabic={arabic} canGoBack onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.list}>
        {services.map((service) => (
          <ListRow
            key={service.id}
            icon="book-outline"
            title={service.title}
            arabic={service.arabic}
            onPress={() => router.push(`/${categoryId}/${service.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  list: { padding: SPACING.md, gap: SPACING.sm + 4 },
});
