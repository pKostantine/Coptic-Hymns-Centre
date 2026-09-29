import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold, { TileRow } from './BookMenuScaffold';
import CopticCross from '../ui/CopticCross';
import Icon from '../ui/Icon';
import { getBookTheme } from '../../../constants/bookTheme';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';

const MAX_FONT_SCALE = 1.25;

/**
 * The Bible: a search field to find any passage, then the two testaments as
 * a pair of covers — each opening on its first words, "In the beginning".
 */
export default function BibleMenu() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const theme = getBookTheme('bible');

  return (
    <BookMenuScaffold
      theme={theme}
      title={{ english: 'Bible', arabic: 'الكتاب المقدس' }}
      overline={arabic ? 'الأسفار المقدسة' : 'HOLY SCRIPTURE'}
      arabic={arabic}
      backHref="/books"
      headerAction={{
        icon: 'bookmark-outline',
        label: arabic ? 'محفوظات الكتاب المقدس' : 'Bible bookmarks',
        onPress: () => router.push('/bible/bookmarks'),
      }}
    >
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={arabic ? 'ابحث في الكتاب المقدس' : 'Search the Bible'}
        onPress={() => router.push('/bible/search')}
        style={({ pressed }) => [styles.search, { borderColor: `${theme.accent}40` }, arabic && styles.rowReverse, pressed && styles.searchPressed]}
      >
        <View><Icon name="search-outline" size={19} color={theme.accent} /></View>
        <Text style={[styles.searchText, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {arabic ? 'ابحث عن آية أو كلمة أو شاهد' : 'Search a verse, word or reference'}
        </Text>
      </Pressable>

      <TileRow arabic={arabic}>
        {(Object.keys(TESTAMENTS) as Testament[]).map((key) => (
          <TestamentCover
            key={key}
            testament={key}
            arabic={arabic}
            onPress={() => router.push({ pathname: '/bible/[bookKey]', params: { bookKey: key } })}
          />
        ))}
      </TileRow>
    </BookMenuScaffold>
  );
}

function TestamentCover({ testament, arabic, onPress }: { testament: Testament; arabic: boolean; onPress: () => void }) {
  const look = TESTAMENTS[testament];
  const title = arabic ? look.arabic : look.english;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.cover, { borderColor: `${look.theme.accent}33` }, pressed && styles.coverPressed]}
    >
      <LinearGradient colors={look.theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, styles.coverFill]} />
      <View style={[styles.frame, { borderColor: `${look.theme.accent}2E` }]} pointerEvents="none" />
      <View style={[styles.watermark, arabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
        <CopticCross size={132} color={`${look.theme.accent}1F`} />
      </View>

      <View>
        <Text style={[styles.coverTitle, arabic && styles.coverTitleArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
        <Text style={[styles.verse, { color: `${look.theme.accent}CC` }, arabic && styles.verseArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {arabic ? look.verse.arabic : look.verse.english}
        </Text>
      </View>
      <Text style={[styles.range, { color: look.theme.accent }, arabic && styles.rangeArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {arabic ? look.range.arabic : look.range.english}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  search: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 17, 6, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  searchPressed: { backgroundColor: 'rgba(60, 45, 12, 0.95)' },
  searchText: { color: 'rgba(255, 255, 255, 0.6)', flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 15 },
  cover: {
    borderRadius: 20,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'space-between',
    minHeight: 236,
    overflow: 'hidden',
    padding: 18,
  },
  coverFill: { borderRadius: 19 },
  coverPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  // A hairline set in from the edge, like the tooled frame on a bound cover.
  frame: { borderRadius: 14, borderWidth: 1, bottom: 7, left: 7, position: 'absolute', right: 7, top: 7 },
  watermark: { bottom: -22, position: 'absolute' },
  watermarkRight: { right: -26 },
  watermarkLeft: { left: -26 },
  coverTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '700', lineHeight: 29 },
  coverTitleArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 24, lineHeight: 36, textAlign: 'right', writingDirection: 'rtl' },
  verse: { fontFamily: TYPOGRAPHY.title, fontSize: 13.5, fontStyle: 'italic', lineHeight: 19, marginTop: 12 },
  verseArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 14.5, fontStyle: 'normal', lineHeight: 24, textAlign: 'right', writingDirection: 'rtl' },
  range: { fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2, marginTop: 16 },
  rangeArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 12.5, letterSpacing: 0, textAlign: 'right', writingDirection: 'rtl' },
});
