import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold, { TileRow } from './BookMenuScaffold';
import CopticCross from '../ui/CopticCross';
import Icon from '../ui/Icon';
import JewelTile from '../ui/JewelTile';
import { PASCHA_TILE_THEMES, type BookTheme } from '../../../constants/bookTheme';
import { bookmarkKeyFor, HOLY_WEEK_ROWS, holyWeekHourHref, type HolyWeekDayDef, type HolyWeekHourDef } from '../../../constants/manifest';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatLongDate, formatMonthDay, holyWeekRowDate, toArabicDigits, weekdayName } from '../../../utils/holyWeek';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

const MAX_FONT_SCALE = 1.25;

type Block = { kind: 'hours'; hours: HolyWeekHourDef[] } | { kind: 'service'; hour: HolyWeekHourDef };

/** The date the day or eve is prayed on — only while the week is in progress; otherwise its name says it all. */
function whenLine(day: HolyWeekDayDef, rowIndex: number, palmSunday: Date | null, arabic: boolean): string | undefined {
  if (!palmSunday) return undefined;
  const date = holyWeekRowDate(palmSunday, rowIndex);
  if (!day.id.endsWith('-eve')) return formatLongDate(date, arabic);
  // An eve belongs to the evening before its day.
  return arabic ? `مساء ${formatLongDate(date, true)}` : `${weekdayName(rowIndex, false)} evening · ${formatMonthDay(date)}`;
}

/** Runs of consecutive hours become grids; the services that aren't hours stand on their own, all in prayer order. */
function blocksOf(hours: HolyWeekHourDef[]): Block[] {
  const blocks: Block[] = [];
  for (const hour of hours) {
    const last = blocks[blocks.length - 1];
    if (!hour.hourNumber) blocks.push({ kind: 'service', hour });
    else if (last?.kind === 'hours') last.hours.push(hour);
    else blocks.push({ kind: 'hours', hours: [hour] });
  }
  return blocks;
}

/** At most three hours to a row, spread evenly: four as two pairs, five as three and two. */
function gridRows(hours: HolyWeekHourDef[]): HolyWeekHourDef[][] {
  const size = Math.ceil(hours.length / Math.ceil(hours.length / 3));
  const rows: HolyWeekHourDef[][] = [];
  for (let i = 0; i < hours.length; i += size) rows.push(hours.slice(i, i + size));
  return rows;
}

/**
 * One Holy Week day or eve: its hours as numbered tiles — crimson by day,
 * midnight blue by night — and the services that aren't hours (the General
 * Funeral Prayer, the Liturgy of the Waters, the Divine Liturgy) as rows
 * marked with the cross, all in the order they are prayed.
 */
export default function HolyWeekDay({ day }: { day: HolyWeekDayDef }) {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();

  const eve = day.id.endsWith('-eve');
  const rowIndex = Math.max(0, HOLY_WEEK_ROWS.findIndex((row) => row.days.some((entry) => entry.id === day.id)));
  const isCurrent = schedule?.currentDayId === day.id;
  // The band carries the colour of this day's tile on the Holy Week menu.
  const bandTheme = day.id === 'good-friday'
    ? PASCHA_TILE_THEMES.goodFriday
    : day.id === 'bright-saturday'
      ? PASCHA_TILE_THEMES.brightSaturday
      : eve ? PASCHA_TILE_THEMES.eveNow : PASCHA_TILE_THEMES.dayNow;
  const tileTheme = day.id === 'good-friday' ? PASCHA_TILE_THEMES.goodFriday : eve ? PASCHA_TILE_THEMES.eve : PASCHA_TILE_THEMES.day;
  const kind = eve ? (isArabic ? 'ليلة' : 'EVE') : (isArabic ? 'نهار' : 'DAY');
  const now = eve ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'الآن' : 'NOW');

  const bookmarked = (hour: HolyWeekHourDef) => isBookmarked(bookmarkKeyFor(hour.schema, hour.table, hour.id));
  const open = (hour: HolyWeekHourDef) => router.push(holyWeekHourHref(hour) as never);

  return (
    <BookMenuScaffold
      theme={bandTheme}
      title={{ english: day.title, arabic: day.arabic }}
      overline={isCurrent ? `${kind} · ${now}` : kind}
      description={whenLine(day, rowIndex, schedule?.palmSunday ?? null, isArabic)}
      arabic={isArabic}
      backHref="/holy-week"
    >
      {blocksOf(day.hours).map((block) =>
        block.kind === 'hours' && block.hours.length === 1 ? (
          // An hour standing alone between services reads as a row like them, its number in the ring.
          <JewelTile
            key={block.hours[0].id}
            layout="row"
            gradient={tileTheme.gradient}
            accent={tileTheme.accent}
            leading={<NumberBadge hour={block.hours[0]} accent={tileTheme.accent} arabic={isArabic} />}
            title={isArabic ? block.hours[0].shortArabic : block.hours[0].shortTitle}
            minHeight={72}
            arabic={isArabic}
            bookmarked={bookmarked(block.hours[0])}
            onPress={() => open(block.hours[0])}
          />
        ) : block.kind === 'service' ? (
          <JewelTile
            key={block.hour.id}
            layout="row"
            gradient={PASCHA_TILE_THEMES.dayNow.gradient}
            accent={PASCHA_TILE_THEMES.dayNow.accent}
            leading={<CrossBadge accent={PASCHA_TILE_THEMES.dayNow.accent} />}
            title={isArabic ? block.hour.shortArabic : block.hour.shortTitle}
            minHeight={72}
            arabic={isArabic}
            outlined
            bookmarked={bookmarked(block.hour)}
            onPress={() => open(block.hour)}
          />
        ) : (
          <View key={block.hours[0].id} style={styles.grid}>
            {gridRows(block.hours).map((row) => (
              <TileRow key={row[0].id} arabic={isArabic}>
                {row.map((hour) => (
                  <HourTile
                    key={hour.id}
                    hour={hour}
                    theme={tileTheme}
                    eve={eve}
                    arabic={isArabic}
                    bookmarked={bookmarked(hour)}
                    onPress={() => open(hour)}
                  />
                ))}
              </TileRow>
            ))}
          </View>
        ),
      )}
    </BookMenuScaffold>
  );
}

/** The cross in a ring, marking the services that aren't hours. */
function CrossBadge({ accent }: { accent: string }) {
  return (
    <View style={[styles.badge, { borderColor: `${accent}66` }]}>
      <CopticCross size={20} color={accent} />
    </View>
  );
}

/** An hour's number in the same ring. */
function NumberBadge({ hour, accent, arabic }: { hour: HolyWeekHourDef; accent: string; arabic: boolean }) {
  return (
    <View style={[styles.badge, { borderColor: `${accent}66` }]}>
      <Text style={[styles.badgeNumber, { color: accent }]} maxFontSizeMultiplier={1.15}>
        {arabic ? toArabicDigits(hour.hourNumber ?? '') : hour.hourNumber}
      </Text>
    </View>
  );
}

interface HourTileProps {
  hour: HolyWeekHourDef;
  theme: BookTheme;
  eve: boolean;
  arabic: boolean;
  bookmarked: boolean;
  onPress: () => void;
}

/** An hour of the day or eve: its number set large, its name beneath — as the Agpeya's hours are. */
function HourTile({ hour, theme, eve, arabic, bookmarked, onPress }: HourTileProps) {
  const title = arabic ? hour.shortArabic : hour.shortTitle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.hourTile, { borderColor: eve ? 'rgba(156, 201, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)' }, pressed && styles.pressed]}
    >
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[StyleSheet.absoluteFill, styles.fill]} />
      <View style={[styles.hourTop, arabic && styles.rowReverse]}>
        <Text style={[styles.hourNumber, { color: theme.accent }]} maxFontSizeMultiplier={1.15}>
          {arabic ? toArabicDigits(hour.hourNumber ?? '') : hour.hourNumber}
        </Text>
        {/* Wrapped so it stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
        {bookmarked ? <View><Icon name="bookmark" size={14} color={COLORS.gold} /></View> : null}
      </View>
      <Text style={[styles.hourTitle, arabic && styles.arabicText]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  fill: { borderRadius: 17 },
  badge: { alignItems: 'center', borderRadius: 19, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  badgeNumber: { fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  hourTile: {
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'space-between',
    minHeight: 104,
    overflow: 'hidden',
    padding: 12,
  },
  hourTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  hourNumber: { fontFamily: TYPOGRAPHY.title, fontSize: 34, fontWeight: '700', lineHeight: 38 },
  hourTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700', marginTop: 8 },
});
