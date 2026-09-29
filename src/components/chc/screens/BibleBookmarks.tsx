import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold, { MenuSectionLabel } from './BookMenuScaffold';
import Icon from '../ui/Icon';
import { TESTAMENTS, type Testament } from '../../../constants/bibleTestaments';
import { getBookTheme } from '../../../constants/bookTheme';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterDisplayLabel, type BibleBook } from '../../../utils/bibleService';

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
    const bookTitle = arabic ? entry.book.titleArabic || entry.book.titleEnglish : entry.book.titleEnglish;
    return `${bookTitle} ${getBibleChapterDisplayLabel(entry.book.bookKey, entry.chapter, arabic ? 'ar' : 'en')}`;
  };

  return (
    <BookMenuScaffold
      theme={getBookTheme('bible')}
      title={{ english: 'Bookmarks', arabic: 'المحفوظات' }}
      overline={arabic ? 'الكتاب المقدس' : 'BIBLE'}
      arabic={arabic}
      backHref="/bible"
    >
      {books && !chapters.length ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {arabic ? 'لا توجد إصحاحات محفوظة بعد' : 'No bookmarked chapters yet'}
          </Text>
          <Text style={[styles.emptyHint, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {arabic ? 'احفظ إصحاحاً من قائمة آياته.' : 'Bookmark a chapter from its list of verses.'}
          </Text>
        </View>
      ) : null}
      {groups.map((group) => (
        <View key={group.testament} style={styles.group}>
          <MenuSectionLabel
            text={arabic ? TESTAMENTS[group.testament].arabic : TESTAMENTS[group.testament].english}
            arabic={arabic}
            accent={TESTAMENTS[group.testament].theme.accent}
          />
          {group.chapters.map((entry) => (
            <BookmarkRow
              key={entry.id}
              title={title(entry)}
              testament={group.testament}
              arabic={arabic}
              onPress={() => router.push({
                pathname: '/bible/[bookKey]/[chapter]',
                params: { bookKey: entry.book.bookKey, chapter: String(entry.chapter) },
              })}
              onRemove={() => toggleBookmark(entry.id)}
            />
          ))}
        </View>
      ))}
    </BookMenuScaffold>
  );
}

interface BookmarkRowProps {
  title: string;
  testament: Testament;
  arabic: boolean;
  onPress: () => void;
  onRemove: () => void;
}

/** A saved chapter, on the same bound-spine tile as the testaments' books; its bookmark takes it off the list. */
function BookmarkRow({ title, testament, arabic, onPress, onRemove }: BookmarkRowProps) {
  const theme = TESTAMENTS[testament].theme;
  return (
    <View style={[styles.row, arabic && styles.rowReverse]}>
      <LinearGradient
        colors={theme.gradient}
        start={{ x: arabic ? 1 : 0, y: 0 }}
        end={{ x: arabic ? 0 : 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.fill]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => [styles.open, arabic && styles.rowReverse, pressed && styles.pressed]}
      >
        <View style={[styles.spine, { backgroundColor: theme.accent }]} />
        <Text style={[styles.title, arabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {title}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={arabic ? `إزالة ${title} من المحفوظات` : `Remove ${title} from bookmarks`}
        hitSlop={8}
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      >
        {/* Wrapped so it stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
        <View><Icon name="bookmark" size={20} color={COLORS.gold} /></View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  empty: { alignItems: 'center', gap: SPACING.xs, paddingTop: SPACING.xl },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: 'rgba(255, 255, 255, 0.6)', fontFamily: TYPOGRAPHY.body, fontSize: 14, textAlign: 'center' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  rowReverse: { flexDirection: 'row-reverse' },
  row: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    overflow: 'hidden',
  },
  fill: { borderRadius: 13 },
  open: { alignItems: 'center', alignSelf: 'stretch', flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  spine: { alignSelf: 'stretch', borderRadius: 2, marginVertical: 4, opacity: 0.55, width: 3 },
  title: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  remove: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, alignSelf: 'stretch' },
  pressed: { opacity: 0.8 },
});
