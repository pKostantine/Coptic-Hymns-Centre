'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { Href, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { forwardRef, useId, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import BottomTabBar from '../ui/BottomTabBar';
import Icon, { type IconName } from '../ui/Icon';
import { BuddedCross, VineRule } from '../ui/Ornaments';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { appText, tr } from '../../../utils/appText';
import { goBack } from '../../../utils/navigation';

const MAX_FONT_SCALE = 1.25;
/** A desktop browser is far wider than a book page wants to be; past this it centres. */
export const BOOK_PAGE_MAX_WIDTH = 680;

export interface BookPageAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

interface BookPageProps {
  title: { english: string; arabic: string; french?: string };
  /** The small gold line over the title: "The Praises", "Pascha". */
  kicker?: string;
  /** Under the title: "Genesis – Daniel", Holy Week's dates. */
  subtitle?: string;
  arabic: boolean;
  backHref: Href;
  /** Holy Week's pages glow crimson; every other book, vine green. */
  glow?: 'green' | 'crimson';
  /** The round button opposite Back. Bookmarks unless given another; null for none. */
  action?: BookPageAction | null;
  /** Sets the content in the page's 16pt gutter with 12pt between its pieces (for content that doesn't set its own margins). */
  padded?: boolean;
  children: ReactNode;
}

/**
 * The frame every book's own page shares (Coptic Vine design system, "BookHero"): a glow
 * falling from the top of the page, round gold Back and Bookmarks buttons,
 * the book's medallion with its name beneath, then the page's own sections —
 * each a heading drawn out into a vine over a list of rows. The Books tab
 * stays at the foot, as it does on the Books screen.
 */
const BookPage = forwardRef<ScrollView, BookPageProps>(function BookPage(
  { title, kicker, subtitle, arabic, backHref, glow = 'green', action, padded = false, children },
  ref,
) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trailing = action === undefined
    ? { icon: 'bookmark-outline' as const, label: tr('Open bookmarks', 'Ouvrir les signets', 'افتح العلامات'), onPress: () => router.push('/bookmarks') }
    : action;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{`Coptic Vine ${title.english}`}</title>
      </Head>
      <NowPlayingAwareScrollView ref={ref} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageGlow kind={glow} />
        <View style={styles.column}>
          <View style={[styles.nav, { paddingTop: insets.top + 4 }, arabic && styles.rowReverse]}>
            <RoundButton
              icon={arabic ? 'chevron-forward' : 'chevron-back'}
              label={tr('Back', 'Retour', 'رجوع')}
              onPress={() => goBack(router, backHref)}
            />
            {trailing ? <RoundButton icon={trailing.icon} label={trailing.label} onPress={trailing.onPress} /> : null}
          </View>

          <View style={styles.hero}>
            <View style={styles.medallion}>
              <BuddedCross size={30} />
            </View>
            {kicker ? (
              <Text style={[styles.kicker, arabic && styles.kickerArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {arabic ? kicker : kicker.toUpperCase()}
              </Text>
            ) : null}
            <Text style={[styles.title, arabic && styles.titleArabic]} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {appText(title)}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, arabic && styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {padded ? <View style={styles.padded}>{children}</View> : children}
        </View>
      </NowPlayingAwareScrollView>
      <BottomTabBar active="books" />
    </SafeAreaView>
  );
});

export default BookPage;

/** A round gold icon button in the page's top row. */
function RoundButton({ icon, label, onPress }: BookPageAction) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={COLORS.gold} />
    </Pressable>
  );
}

/** The page's colour falling from the top to black, under its glow. */
const GREEN_FALL: [string, string][] = [['0', '#1D4424'], ['0.36', '#14301B'], ['1', '#000000']];
const CRIMSON_FALL: [string, string][] = [['0', '#160203'], ['0.3', '#070101'], ['1', '#000000']];

/** The light falling from the top of the page: green for the books, crimson for Holy Week. */
function PageGlow({ kind }: { kind: 'green' | 'crimson' }) {
  // Unique per page: on web the pages of a stack share one document.
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const crimson = kind === 'crimson';
  return (
    <View style={styles.glow} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
            {(crimson ? CRIMSON_FALL : GREEN_FALL).map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />)}
          </SvgLinearGradient>
          {crimson ? (
            <RadialGradient id={`${id}r`} cx="50%" cy="4%" rx="90%" ry="55%" fx="50%" fy="4%">
              <Stop offset="0" stopColor="#5C010F" stopOpacity="0.7" />
              <Stop offset="0.35" stopColor="#290105" stopOpacity="0.4" />
              <Stop offset="0.7" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          ) : (
            <RadialGradient id={`${id}r`} cx="50%" cy="12%" rx="110%" ry="70%" fx="50%" fy="12%">
              <Stop offset="0" stopColor="#346E3A" stopOpacity="0.75" />
              <Stop offset="0.3" stopColor="#224C28" stopOpacity="0.55" />
              <Stop offset="0.58" stopColor="#14301B" stopOpacity="0.3" />
              <Stop offset="0.85" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}l)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}r)`} />
      </Svg>
    </View>
  );
}

/** Sets a piece of the page (a day card, the search bar) in the page's 16pt gutter. */
export function PageGutter({ children }: { children: ReactNode }) {
  return <View style={styles.gutter}>{children}</View>;
}

/** A section's name, the vine drawn out from it to the edge of the page. */
export function SectionHeading({ title, arabic, trailing }: { title: string; arabic: boolean; trailing?: ReactNode }) {
  return (
    <View style={[styles.section, arabic && styles.rowReverse]}>
      <Text style={[styles.sectionTitle, arabic && styles.arabic]} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
        {title}
      </Text>
      <VineRule arabic={arabic} />
      {trailing}
    </View>
  );
}

/** A section's rows, each on a card of its own. */
export function RowList({ children }: { children: ReactNode }) {
  return <View style={styles.rows}>{children}</View>;
}

interface BookRowProps {
  title: string;
  arabic: boolean;
  onPress: () => void;
  /** A gold outline icon before the title: the hour a service is prayed at, what a book is. */
  icon?: IconName;
  /** A muted line under the title: "Evening", "Before every hour". */
  detail?: string;
  /** Muted, before the chevron: a book's chapter count. */
  count?: string;
  bookmarked?: boolean;
  /** Warm what the row opens (the Bible's chapter lists). */
  onPrefetch?: () => void;
}

/** One entry in a book page's list: its icon, its name over a short line, and the chevron. */
export function BookRow({ title, arabic, onPress, icon, detail, count, bookmarked, onPrefetch }: BookRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      onPressIn={onPrefetch}
      onHoverIn={onPrefetch}
      style={({ pressed }) => [styles.row, arabic && styles.rowReverse, pressed && styles.rowPressed]}
    >
      {icon ? (
        <View style={[styles.rowIcon, arabic && styles.rowIconArabic]}>
          <Icon name={icon} size={24} color={COLORS.gold} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, arabic && styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {title}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, arabic && styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {detail}
          </Text>
        ) : null}
      </View>
      {bookmarked ? <Icon name="bookmark" size={14} color={COLORS.gold} /> : null}
      {count !== undefined ? (
        <Text style={[styles.count, arabic && styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {count}
        </Text>
      ) : null}
      <Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={17} color={COLORS.gold} />
    </Pressable>
  );
}

interface ReadingRowProps {
  /** What is read: "Psalm", "Pauline". */
  kind: string;
  /** Its citation, or null while unknown. */
  value: string | null;
  arabic: boolean;
  onPress: () => void;
  /** Wide enough for the longest kind in its list ("Prophecy 2"). */
  kindWidth?: number;
}

/** A reading in the Lectionary: what is read, then where — opening the service that reads it. */
export function ReadingRow({ kind, value, arabic, onPress, kindWidth = 74 }: ReadingRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${kind}, ${value}` : kind}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.readingRow, arabic && styles.rowReverse, pressed && styles.rowPressed]}
    >
      <Text style={[styles.kind, { width: kindWidth }, arabic && styles.kindArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
        {arabic ? kind : kind.toUpperCase()}
      </Text>
      <Text style={[styles.reading, !value && styles.readingMissing, arabic && styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {value ?? '—'}
      </Text>
      <Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={17} color={COLORS.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: 28 },
  column: { alignSelf: 'center', maxWidth: BOOK_PAGE_MAX_WIDTH, width: '100%' },
  padded: { gap: 12, paddingHorizontal: 16 },
  gutter: { paddingHorizontal: 16 },
  rowReverse: { flexDirection: 'row-reverse' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, fontSize: 18, textAlign: 'right', writingDirection: 'rtl' },
  pressed: { opacity: 0.7 },

  glow: { height: 520, left: 0, position: 'absolute', right: 0, top: 0 },
  nav: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  roundButton: {
    alignItems: 'center',
    borderColor: COLORS.goldLine,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },

  hero: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 24 },
  medallion: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: 'rgba(227, 181, 59, 0.35)',
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0px 0px 30px rgba(227, 181, 59, 0.22)',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  kicker: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', letterSpacing: 2.2, marginTop: 12, textAlign: 'center' },
  kickerArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13.5, letterSpacing: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 36, fontWeight: '700', lineHeight: 40, marginTop: 6, textAlign: 'center' },
  titleArabic: { fontFamily: TYPOGRAPHY.arabic, lineHeight: 52, writingDirection: 'rtl' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14.5, marginTop: 8, textAlign: 'center' },

  section: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 10, marginTop: 26, paddingHorizontal: 16 },
  sectionTitle: { color: COLORS.white, flexShrink: 1, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },

  rows: { gap: 8, marginHorizontal: 16 },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: COLORS.surfaceSoft },
  rowIcon: { alignItems: 'flex-start', width: 32 },
  rowIconArabic: { alignItems: 'flex-end' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  rowDetail: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 2 },
  count: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13.5 },

  readingRow: { gap: 12 },
  kind: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.4 },
  kindArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13, letterSpacing: 0, textAlign: 'right', writingDirection: 'rtl' },
  reading: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 16.5, fontWeight: '600' },
  readingMissing: { color: 'rgba(255, 255, 255, 0.35)' },
});
