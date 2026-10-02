'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookPage, { PageGutter } from './BookPage';
import Icon from '../ui/Icon';
import { BuddedCross } from '../ui/Ornaments';
import { TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, tr } from '../../../utils/appText';

const MAX_FONT_SCALE = 1.25;

/** Each testament's card: what it holds, and its vine green — the New a shade brighter. */
const COVERS: Record<Testament, { kicker: { english: string; arabic: string; french: string }; gradient: readonly [string, string, ...string[]]; locations: readonly [number, number, ...number[]] }> = {
  OT: {
    kicker: { english: 'The Law and the Prophets', arabic: 'الناموس والأنبياء', french: 'La Loi et les Prophètes' },
    gradient: ['#2B5A30', '#14301B'],
    locations: [0, 0.75],
  },
  NT: {
    kicker: { english: 'The Gospels and Epistles', arabic: 'الأناجيل والرسائل', french: 'Les Évangiles et les Épîtres' },
    gradient: ['#2F6435', '#1A3F22', '#14301B'],
    locations: [0, 0.45, 1],
  },
};

/**
 * The Bible (Coptic Vine design, "Book Pages"): a search for any verse, word or
 * reference beside the saved chapters, then the two testaments.
 */
export default function BibleMenu() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';

  return (
    <BookPage
      title={{ english: 'Bible', arabic: 'الكتاب المقدس', french: 'Bible' }}
      kicker={tr('Holy Scripture', 'Saintes Écritures', 'الأسفار المقدسة')}
      arabic={arabic}
      backHref="/books"
      wide="single"
    >
      <PageGutter>
        <View style={[styles.searchBar, arabic && styles.rowReverse]}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={tr('Search the Bible', 'Rechercher dans la Bible', 'ابحث في الكتاب المقدس')}
            onPress={() => router.push('/bible/search')}
            style={({ pressed }) => [styles.search, arabic && styles.rowReverse, pressed && styles.pressed]}
          >
            <Icon name="search-outline" size={19} color={COLORS.gold} />
            <Text style={[styles.searchText, arabic && styles.arabic]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {tr('Search a verse, word or reference', 'Rechercher un verset, un mot ou une référence', 'ابحث عن آية أو كلمة أو شاهد')}
            </Text>
          </Pressable>
          {/* The chapters saved from their verse lists. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Bible bookmarks', 'Signets de la Bible', 'محفوظات الكتاب المقدس')}
            onPress={() => router.push('/bible/bookmarks')}
            style={({ pressed }) => [styles.bookmarks, pressed && styles.pressed]}
          >
            <Icon name="bookmark-outline" size={20} color={COLORS.gold} />
          </Pressable>
        </View>

        <View style={styles.testaments}>
          {(Object.keys(TESTAMENTS) as Testament[]).map((key) => (
            <TestamentCard
              key={key}
              testament={key}
              arabic={arabic}
              onPress={() => router.push({ pathname: '/bible/[bookKey]', params: { bookKey: key } })}
            />
          ))}
        </View>
      </PageGutter>
    </BookPage>
  );
}

function TestamentCard({ testament, arabic, onPress }: { testament: Testament; arabic: boolean; onPress: () => void }) {
  const look = TESTAMENTS[testament];
  const cover = COVERS[testament];
  const title = appText(look);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${appText(look.range)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, arabic && styles.rowReverse, pressed && styles.pressed]}
    >
      <LinearGradient colors={cover.gradient} locations={cover.locations} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.watermark, arabic ? styles.watermarkArabic : null]} pointerEvents="none">
        <BuddedCross size={96} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardKicker, arabic && styles.cardKickerArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {arabic ? cover.kicker.arabic : appText(cover.kicker).toUpperCase()}
        </Text>
        <Text style={[styles.cardTitle, arabic && styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
        <Text style={[styles.cardRange, arabic && styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{appText(look.range)}</Text>
      </View>
      {/* Wrapped so it stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
      <View><Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={20} color={COLORS.gold} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: 'row-reverse' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, fontSize: 25, lineHeight: 38, textAlign: 'right', writingDirection: 'rtl' },
  pressed: { opacity: 0.8 },

  searchBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  search: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderColor: COLORS.goldLine,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
  },
  searchText: { color: COLORS.muted, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 15 },
  bookmarks: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderColor: COLORS.goldLine,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },

  testaments: { gap: 12 },
  card: {
    alignItems: 'center',
    borderColor: 'rgba(227, 181, 59, 0.3)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  watermark: { marginTop: -48, opacity: 0.12, position: 'absolute', right: 34, top: '50%' },
  watermarkArabic: { left: 34, right: undefined },
  cardText: { flex: 1, minWidth: 0 },
  cardKicker: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.8 },
  cardKickerArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13, letterSpacing: 0, textAlign: 'right', writingDirection: 'rtl' },
  cardTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 26, fontWeight: '700', marginTop: 6 },
  cardRange: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, marginTop: 4 },
});
