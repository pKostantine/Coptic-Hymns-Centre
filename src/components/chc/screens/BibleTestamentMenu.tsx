'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold, { MenuSectionLabel, TileRow } from './BookMenuScaffold';
import { sectionIndexFor, TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterKeys, getCachedBibleChapterKeys, type BibleBook } from '../../../utils/bibleService';

import { appText, tr } from '../../../utils/appText';
const MAX_FONT_SCALE = 1.25;

type LoadedBooks = { testament: Testament; books: BibleBook[] };

function prefetchBookChapters(book: BibleBook) {
  // Speculative failures are shown by the destination page if its retry fails.
  void getBibleChapterKeys(book.bookKey).catch(() => {});
}

/** Warms each book's chapter list in reading order, one at a time, so a one-chapter book can open straight onto its text. */
async function prefetchInTurn(books: BibleBook[], cancelled: () => boolean) {
  for (const book of books) {
    if (cancelled()) return;
    await getBibleChapterKeys(book.bookKey).catch(() => {});
  }
}

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/**
 * One testament's books, grouped as the Church reads them — the Law, the
 * Historical Books, the Psalms and Wisdom, the Prophets; the Gospels, the
 * Pauline and Catholic Epistles, the Apocalypse — two to a row, each group in
 * its own shade of the Bible's bronze.
 */
export default function BibleTestamentMenu({ testament }: { testament: Testament }) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const look = TESTAMENTS[testament];
  const [loaded, setLoaded] = useState<LoadedBooks | null>(null);
  const [error, setError] = useState<{ testament: Testament; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBibleBooks()
      .then((allBooks) => {
        if (cancelled) return;
        const books = allBooks.filter((book) => book.testament === testament).sort((a, b) => a.bookOrder - b.bookOrder);
        setLoaded({ testament, books });
        void prefetchInTurn(books, () => cancelled);
      })
      .catch((err) => {
        if (!cancelled) setError({ testament, message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [testament]);

  const books = loaded?.testament === testament ? loaded.books : null;
  const failure = error?.testament === testament ? error.message : null;
  const groups = books
    ? look.sections
        .map((section, index) => ({ section, books: books.filter((book) => sectionIndexFor(testament, book.bookOrder) === index) }))
        .filter((group) => group.books.length > 0)
    : [];

  const openBook = (book: BibleBook) => {
    const chapters = getCachedBibleChapterKeys(book.bookKey);
    if (chapters?.length === 1) {
      router.push({ pathname: '/bible/[bookKey]/[chapter]', params: { bookKey: book.bookKey, chapter: String(chapters[0]) } });
      return;
    }
    // Open the page on the tap; an uncached chapter list loads on that page.
    router.push({ pathname: '/bible/[bookKey]', params: { bookKey: book.bookKey } });
  };

  return (
    <BookMenuScaffold
      theme={look.theme}
      title={{ english: look.english, arabic: look.arabic, french: look.french }}
      overline={tr('BIBLE', 'BIBLE', 'الكتاب المقدس')}
      description={appText(look.range)}
      arabic={arabic}
      backHref="/bible"
    >
      {failure ? (
        <Text style={styles.error}>{failure}</Text>
      ) : !books ? (
        <ActivityIndicator style={styles.loading} color={look.theme.accent} />
      ) : (
        groups.map(({ section, books: sectionBooks }) => (
          <View key={section.from} style={styles.group}>
            <MenuSectionLabel text={appText(section)} arabic={arabic} accent={look.theme.accent} />
            {pairs(sectionBooks).map((row) => (
              <TileRow key={row[0].bookKey} arabic={arabic}>
                {row.map((book) => (
                  <BookTile
                    key={book.bookKey}
                    title={appText({ english: book.titleEnglish, arabic: book.titleArabic, french: book.titleFrench })}
                    gradient={section.gradient}
                    accent={look.theme.accent}
                    arabic={arabic}
                    onPrefetch={() => prefetchBookChapters(book)}
                    onPress={() => openBook(book)}
                  />
                ))}
              </TileRow>
            ))}
          </View>
        ))
      )}
    </BookMenuScaffold>
  );
}

interface BookTileProps {
  title: string;
  gradient: readonly [string, string, ...string[]];
  accent: string;
  arabic: boolean;
  onPrefetch: () => void;
  onPress: () => void;
}

/** A book of the Bible on its shelf: a short bound spine of colour down its leading edge, and its name. */
function BookTile({ title, gradient, accent, arabic, onPrefetch, onPress }: BookTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={onPrefetch}
      onHoverIn={onPrefetch}
      style={({ pressed }) => [styles.tile, arabic && styles.rowReverse, pressed && styles.pressed]}
    >
      {/* Lit from the spine's side, which is the right in Arabic. */}
      <LinearGradient colors={gradient} start={{ x: arabic ? 1 : 0, y: 0 }} end={{ x: arabic ? 0 : 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.fill]} />
      <View style={[styles.spine, { backgroundColor: accent }]} />
      <Text style={[styles.tileTitle, arabic && styles.arabicText]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 16, marginTop: SPACING.lg, textAlign: 'center' },
  group: { gap: 10 },
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, fontSize: 16.5, textAlign: 'right', writingDirection: 'rtl' },
  tile: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 12,
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fill: { borderRadius: 13 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  spine: { alignSelf: 'stretch', borderRadius: 2, marginVertical: 4, opacity: 0.55, width: 3 },
  tileTitle: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 15.5, fontWeight: '700', lineHeight: 20 },
});
