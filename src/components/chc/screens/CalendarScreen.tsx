'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CalendarPanel from '@/components/chc/ui/CalendarPanel';
import SubPageHeader from '@/components/chc/ui/SubPageHeader';
import { COLORS } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { goBack } from '@/utils/navigation';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

import { tr } from '../../../utils/appText';

interface CalendarScreenProps {
  /** Set when this screen is rendered inside a modal rather than as its own route (see DocumentModal) — closes the modal instead of popping the navigation stack. */
  onClose?: () => void;
  /** Same idea for the season selector: hosted in a modal there is no route to push, so the host swaps which screen it is showing. */
  onOpenSeasonSelector?: () => void;
}

/**
 * The calendar as a page of its own — reached from a document's header and
 * from Home. On the Books screen the same panel slides up as a sheet instead
 * (CalendarSheet).
 */
export default function CalendarScreen({ onClose, onOpenSeasonSelector }: CalendarScreenProps) {
  const router = useRouter();
  const isHosted = Boolean(onClose);
  const closeScreen = () => (onClose ? onClose() : goBack(router, '/books'));
  const openSeasonSelector = () => (onOpenSeasonSelector ? onOpenSeasonSelector() : router.push('/season-selector'));
  const { preferences } = useReadingPreferences();
  const title = tr('Calendar', 'Calendrier', 'التقويم');

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screen, DISABLED_TEXT_SELECTION_STYLE]}>
      {/* Only the real route owns the browser tab title — rendered as a modal
          over a document, this screen is an overlay on that document's page. */}
      {isHosted ? null : (
        <Head>
          <title>{`Coptic Vine ${title}`}</title>
        </Head>
      )}
      <SubPageHeader title={title} arabic={preferences.appLanguage === 'ar'} onBack={closeScreen} backLabel={tr('Close the calendar', 'Fermer le calendrier', 'أغلق التقويم')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <CalendarPanel onOpenSeasons={openSeasonSelector} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: 28, paddingHorizontal: 16 },
  card: {
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.goldLine,
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 520,
    overflow: 'hidden',
    paddingBottom: 18,
    width: '100%',
  },
});
