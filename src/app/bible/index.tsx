import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import { COLORS, SPACING } from '@/constants/theme';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { goBack } from '@/utils/navigation';

const TESTAMENTS = [
  { key: 'OT', title: 'Old Testament', arabic: 'العهد القديم' },
  { key: 'NT', title: 'New Testament', arabic: 'العهد الجديد' },
] as const;

export default function BibleTestamentList() {
  const router = useRouter();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Bible</title>
      </Head>
      <AppHeader
        title={{ english: 'Bible', arabic: 'الكتاب المقدس' }}
        canGoBack
        onBack={() => goBack(router, '/')}
        rightLeadingIcon={shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined}
        onRightLeadingPress={shouldShowFullscreen ? toggleFullscreen : undefined}
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
