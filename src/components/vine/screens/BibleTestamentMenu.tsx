'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import BookPage, { BookRow, RowList, SectionHeading } from './BookPage';
import { sectionIndexFor, TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, tr } from '../../../utils/appText';
import { getBibleBooks, getBibleChapterKeys, getCachedBibleChapterKeys, type BibleBook } from '../../../utils/bibleService';
import { toEasternArabicDigits } from '../../../utils/localeFormat';

type LoadedBooks = { testament: Testament; books: BibleBook[] };

function prefetchBookChapters(book: BibleBook) {
  // Speculative failures are shown by the destination page if its retry fails.
  void getBibleChapterKeys(book.bookKey).catch(() => {});
}

/**
 * Warms each book's chapter list in reading order, one at a time, so a
 * one-chapter book can open straight onto its text — and so each book's
 * chapter count can be shown as it arrives.
 */
async function prefetchInTurn(books: BibleBook[], cancelled: () => boolean, onLoaded: () => void) {
  for (const book of books) {
    if (cancelled()) return;
    const cached = getCachedBibleChapterKeys(book.bookKey);
    if (cached) continue;
    await getBibleChapterKeys(book.bookKey).then(onLoaded, () => {});
  }
}

/**
 * One testament's books as a contents list (Coptic Vine design, "Book Pages"),
 * grouped as the Church reads them — the Law, the Historical Books, the
 * Psalms and Wisdom, the Prophets; the Gospels, the Pauline and Catholic
 * Epistles, the Apocalypse — each with its number of chapters.
 */
export default function BibleTestamentMenu({ testament }: { testament: Testament }) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const look = TESTAMENTS[testament];
  const [loaded, setLoaded] = useState<LoadedBooks | null>(null);
  const [error, setError] = useState<{ testament: Testament; message: string } | null>(null);
  // Bumped as each book's chapter list arrives, so its count appears.
  const [, setChaptersLoaded] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getBibleBooks()
      .then((allBooks) => {
        if (cancelled) return;
        const books = allBooks.filter((book) => book.testament === testament).sort((a, b) => a.bookOrder - b.bookOrder);
        setLoaded({ testament, books });
        void prefetchInTurn(books, () => cancelled, () => setChaptersLoaded((count) => count + 1));
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

  const chapterCount = (book: BibleBook) => {
    const chapters = getCachedBibleChapterKeys(book.bookKey);
    if (!chapters) return '';
    return arabic ? toEasternArabicDigits(chapters.length) : String(chapters.length);
  };

  return (
    <BookPage
      title={{ english: look.english, arabic: look.arabic, french: look.french }}
      kicker={tr('Bible', 'Bible', 'الكتاب المقدس')}
      subtitle={appText(look.range)}
      arabic={arabic}
      backHref="/bible"
      action={{ icon: 'search-outline', label: tr('Search the Bible', 'Rechercher dans la Bible', 'ابحث في الكتاب المقدس'), onPress: () => router.push('/bible/search') }}
    >
      {failure ? (
        <Text style={styles.error}>{failure}</Text>
      ) : !books ? (
        <ActivityIndicator style={styles.loading} color={COLORS.gold} />
      ) : (
        groups.map(({ section, books: sectionBooks }) => (
          <View key={section.from}>
            <SectionHeading title={appText(section)} arabic={arabic} />
            <RowList>
              {sectionBooks.map((book) => (
                <BookRow
                  key={book.bookKey}
                  title={appText({ english: book.titleEnglish, arabic: book.titleArabic, french: book.titleFrench })}
                  count={chapterCount(book)}
                  arabic={arabic}
                  onPrefetch={() => prefetchBookChapters(book)}
                  onPress={() => openBook(book)}
                />
              ))}
            </RowList>
          </View>
        ))
      )}
    </BookPage>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 16, marginHorizontal: 16, marginTop: SPACING.lg, textAlign: 'center' },
});
