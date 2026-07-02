import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import { COLORS, SPACING } from '@/constants/theme';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

const TESTAMENTS = [
  { key: 'OT', title: 'Old Testament', arabic: 'العهد القديم' },
  { key: 'NT', title: 'New Testament', arabic: 'العهد الجديد' },
] as const;

export default function BibleTestamentList() {
  const router = useRouter();
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <AppHeader
        title={{ english: 'Bible', arabic: 'الكتاب المقدس' }}
        canGoBack
        onBack={() => router.back()}
        rightLeadingIcon={isFullscreen ? 'close-fullscreen' : 'open-in-full'}
        rightLeadingIconFamily="material"
        onRightLeadingPress={toggleFullscreen}
      />
      <ScrollView contentContainerStyle={styles.list}>
        {TESTAMENTS.map((testament) => (
          <HymnCard
            key={testament.key}
            title={testament.title}
            arabic={testament.arabic}
            onPress={() =>
              router.push({
                pathname: '/bible/[bookKey]',
                params: { bookKey: testament.key, title: testament.title, arabic: testament.arabic },
              })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  list: { padding: SPACING.md, gap: SPACING.md },
});
