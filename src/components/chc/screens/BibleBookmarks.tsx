'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookPage, { RowList, SectionHeading } from './BookPage';
import Icon from '../ui/Icon';
import { TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterDisplayLabel, type BibleBook } from '../../../utils/bibleService';

import { appText, tr } from '../../../utils/appText';
import { getCurrentAppLanguage } from '../../../utils/preferencesStorage';
const MAX_FONT_SCALE = 1.25;

/** A bookmarked chapter: "bible:<testament>:<bookKey>:<chapter>", as the chapter reader saves it. */
export function isBibleBookmark(id: string): boolean {
  return id.startsWith('bible:');
}

interface BookmarkedChapter {
  id: string;
  book: BibleBook;
  chapter: number;
}

/**
 * The Bible's own bookmarks — the chapters saved from a chapter's verse list,
 * kept here in the Bible rather than among the services' bookmarks, in
 * Bible order under their testament.
 */
export default function BibleBookmarks() {
  const router = useRouter();
  const { bookmarks, toggleBookmark, preferences } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const [books, setBooks] = useState<BibleBook[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBibleBooks()
      .then((next) => { if (!cancelled) setBooks(next); })
      .catch(() => { if (!cancelled) setBooks([]); });
    return () => { cancelled = true; };
  }, []);

  const chapters = useMemo(() => {
    if (!books) return [];
    return bookmarks
      .filter(isBibleBookmark)
      .map((id): BookmarkedChapter | null => {
        const [, , bookKey, chapter] = id.split(':');
        const book = books.find((candidate) => candidate.bookKey === bookKey);
        const chapterNumber = Number(chapter);
        return book && Number.isFinite(chapterNumber) ? { id, book, chapter: chapterNumber } : null;
      })
      .filter((entry): entry is BookmarkedChapter => entry !== null)
      .sort((a, b) => a.book.bookOrder - b.book.bookOrder || a.chapter - b.chapter);
  }, [bookmarks, books]);

  const groups = (['OT', 'NT'] as Testament[])
    .map((testament) => ({ testament, chapters: chapters.filter((entry) => entry.book.testament === testament) }))
    .filter((group) => group.chapters.length > 0);

  const title = (entry: BookmarkedChapter) => {
    const bookTitle = appText({ english: entry.book.titleEnglish, arabic: entry.book.titleArabic, french: entry.book.titleFrench });
    return `${bookTitle} ${getBibleChapterDisplayLabel(entry.book.bookKey, entry.chapter, getCurrentAppLanguage())}`;
  };

  return (
    <BookPage
      title={{ english: 'Bookmarks', arabic: 'المحفوظات', french: 'Favoris' }}
      kicker={tr('Bible', 'Bible', 'الكتاب المقدس')}
      arabic={arabic}
      backHref="/bible"
      action={null}
    >
      {books && !chapters.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {tr('No bookmarked chapters yet', 'Aucun chapitre en favori pour l’instant', 'لا توجد إصحاحات محفوظة بعد')}
          </Text>
          <Text style={[styles.emptyHint, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {tr('Bookmark a chapter from its list of verses.', 'Ajoutez un chapitre aux favoris depuis sa liste de versets.', 'احفظ إصحاحاً من قائمة آياته.')}
          </Text>
        </View>
      ) : null}
      {groups.map((group) => (
        <View key={group.testament}>
          <SectionHeading title={appText(TESTAMENTS[group.testament])} arabic={arabic} />
          <RowList>
            {group.chapters.map((entry) => (
              <BookmarkRow
                key={entry.id}
                title={title(entry)}
                arabic={arabic}
                onPress={() => router.push({
                  pathname: '/bible/[bookKey]/[chapter]',
                  params: { bookKey: entry.book.bookKey, chapter: String(entry.chapter) },
                })}
                onRemove={() => toggleBookmark(entry.id)}
              />
            ))}
          </RowList>
        </View>
      ))}
    </BookPage>
  );
}

interface BookmarkRowProps {
  title: string;
  arabic: boolean;
  onPress: () => void;
  onRemove: () => void;
}

/** A saved chapter, on a row like the testaments' books; its bookmark takes it off the list. */
function BookmarkRow({ title, arabic, onPress, onRemove }: BookmarkRowProps) {
  return (
    <View style={[styles.row, arabic && styles.rowReverse]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => [styles.open, arabic && styles.rowReverse, pressed && styles.pressed]}
      >
        <Text style={[styles.title, arabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {title}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr(`Remove ${title} from bookmarks`, `Retirer ${title} des favoris`, `إزالة ${title} من المحفوظات`)}
        hitSlop={8}
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      >
        <Icon name="bookmark" size={20} color={COLORS.gold} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: SPACING.xs, paddingHorizontal: 16, paddingTop: SPACING.lg },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: 'rgba(255, 255, 255, 0.6)', fontFamily: TYPOGRAPHY.body, fontSize: 14, textAlign: 'center' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  rowReverse: { flexDirection: 'row-reverse' },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    overflow: 'hidden',
  },
  open: { alignItems: 'center', alignSelf: 'stretch', flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  remove: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, alignSelf: 'stretch' },
  pressed: { opacity: 0.8 },
});
