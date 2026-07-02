import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import IconButton from '@/components/chc/ui/IconButton';
import ListRow from '@/components/chc/ui/ListRow';
import { COLORS, SPACING } from '@/constants/theme';
import { CATEGORIES } from '@/constants/manifest';

export default function MainMenu() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <AppHeader title="Coptic Hymns Centre" showLogo />

      <View style={styles.toolbar}>
        <IconButton icon="bookmark-outline" label="Bookmarks" size="lg" onPress={() => {}} />
        <IconButton icon="calendar-outline" label="Calendar" size="lg" onPress={() => {}} />
        <IconButton icon="settings-outline" label="Settings" size="lg" onPress={() => {}} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {CATEGORIES.map((category) => (
          <ListRow
            key={category.id}
            iconImage={category.icon}
            title={category.title}
            arabic={category.arabic}
            meta={category.meta}
            onPress={() => router.push(`/${category.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.sm + 4,
  },
});
