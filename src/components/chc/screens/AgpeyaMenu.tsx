'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold from './BookMenuScaffold';
import Icon from '../ui/Icon';
import JewelTile from '../ui/JewelTile';
import { getBookTheme } from '../../../constants/bookTheme';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY, type ServiceDef } from '../../../constants/manifest';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { toEasternArabicDigits } from '../../../utils/localeFormat';

import { appText, entryLabel, tr } from '../../../utils/appText';
const MAX_FONT_SCALE = 1.25;
const THEME = getBookTheme('agpeya');
const HOUR_TILE_GRADIENT = ['#4B2463', '#331744', '#24112F'] as const;
const MIDNIGHT_GRADIENT = ['#16244D', '#0A1128', '#03050D'] as const;
const OTHER_PRAYERS_GRADIENT = ['#3A1B4D', '#24112F', '#140A1B'] as const;

/** The canonical hours, in the order they are prayed through the day, with the traditional name each goes by. */
const HOURS: { id: string; number: number; english: string; arabic: string; french?: string }[] = [
  { id: 'first_hour', number: 1, english: 'Prime', arabic: 'باكر', french: 'Prime' },
  { id: 'third_hour', number: 3, english: 'Terce', arabic: '', french: 'Tierce' },
  { id: 'sixth_hour', number: 6, english: 'Sext', arabic: '', french: 'Sexte' },
  { id: 'ninth_hour', number: 9, english: 'None', arabic: '', french: 'None' },
  { id: 'eleventh_hour', number: 11, english: 'Vespers', arabic: 'الغروب', french: 'Vêpres' },
  { id: 'twelfth_hour', number: 12, english: 'Compline', arabic: 'النوم', french: 'Complies' },
];

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * The Agpeya: the introduction said before every hour, then the day's hours
 * as numbered tiles — the number is how the hours are known — the Midnight
 * hour on a night tile of its own, and the remaining prayers as a list.
 */
export default function AgpeyaMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const services = SERVICES_BY_CATEGORY.agpeya;
  const byId = (id: string) => services.find((service) => service.id === id);
  const open = (service: ServiceDef) => router.push(`/agpeya/${service.id}` as never);
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));

  const introduction = byId('introduction_to_every_hour');
  const midnight = byId('midnight_hour');
  const others = [byId('prayer_of_the_veil'), byId('other_prayers')].filter((service): service is ServiceDef => Boolean(service));

  return (
    <BookMenuScaffold
      theme={THEME}
      title={{ english: 'Agpeya', arabic: 'الأجبية', french: 'Agpia' }}
      overline={tr('THE BOOK OF HOURS', 'LE LIVRE DES HEURES', 'كتاب السواعي')}
      arabic={arabic}
      backHref="/books"
    >
      {introduction ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(introduction)}
          style={({ pressed }) => [styles.introCard, arabic && styles.rowReverse, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <Text style={[styles.introOverline, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {tr('BEFORE EVERY HOUR', 'AVANT CHAQUE HEURE', 'قبل كل ساعة')}
            </Text>
            <Text style={[styles.introTitle, arabic && styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {entryLabel(introduction)}
            </Text>
          </View>
          {bookmarked(introduction) ? <View><Icon name="bookmark" size={16} color={COLORS.gold} /></View> : null}
          <View><Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={17} color={THEME.accent} /></View>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {chunk(HOURS, 3).map((row) => (
          <View key={row[0].id} style={[styles.gridRow, arabic && styles.rowReverse]}>
            {row.map((hour) => {
              const service = byId(hour.id);
              if (!service) return <View key={hour.id} style={styles.flex} />;
              const traditional = appText(hour);
              return (
                <Pressable
                  key={hour.id}
                  accessibilityRole="button"
                  accessibilityLabel={entryLabel(service)}
                  onPress={() => open(service)}
                  style={({ pressed }) => [styles.hourTile, pressed && styles.pressed]}
                >
                  <LinearGradient colors={HOUR_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
                  <View style={[styles.hourTop, arabic && styles.rowReverse]}>
                    <Text style={styles.hourNumber} maxFontSizeMultiplier={1.15}>{arabic ? toEasternArabicDigits(hour.number) : hour.number}</Text>
                    {bookmarked(service) ? <View><Icon name="bookmark" size={14} color={COLORS.gold} /></View> : null}
                  </View>
                  <View>
                    <Text style={[styles.hourTitle, arabic && styles.arabicTitle]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {entryLabel(service)}
                    </Text>
                    {traditional ? (
                      <Text style={[styles.hourSubtitle, arabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{traditional}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {midnight ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(midnight)}
          style={({ pressed }) => [styles.midnight, arabic && styles.rowReverse, pressed && styles.pressed]}
        >
          <LinearGradient colors={MIDNIGHT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
          {/* Wrapped so the icon stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
          <View><Icon name="moon" size={28} color={COLORS.night} /></View>
          <View style={styles.flex}>
            <Text style={[styles.midnightTitle, arabic && styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{entryLabel(midnight)}</Text>
          </View>
          {bookmarked(midnight) ? <View><Icon name="bookmark" size={16} color={COLORS.gold} /></View> : null}
          <View><Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={17} color={COLORS.night} /></View>
        </Pressable>
      ) : null}

      {others.map((service) => (
        <JewelTile
          key={service.id}
          layout="row"
          gradient={OTHER_PRAYERS_GRADIENT}
          accent={THEME.accent}
          title={entryLabel(service)}
          minHeight={64}
          arabic={arabic}
          bookmarked={bookmarked(service)}
          onPress={() => open(service)}
        />
      ))}
    </BookMenuScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowReverse: { flexDirection: 'row-reverse' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },

  introCard: {
    alignItems: 'center',
    backgroundColor: '#140B1C',
    borderColor: 'rgba(190, 140, 230, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  introOverline: { color: THEME.accent, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  introTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700', marginTop: 3 },

  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  hourTile: {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 110,
    overflow: 'hidden',
    padding: 12,
  },
  hourTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  hourNumber: { color: THEME.accent, fontFamily: TYPOGRAPHY.title, fontSize: 34, fontWeight: '700', lineHeight: 38 },
  hourTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  hourSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontFamily: TYPOGRAPHY.body, fontSize: 11.5, marginTop: 1 },

  midnight: {
    alignItems: 'center',
    borderColor: COLORS.nightLine,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 88,
    overflow: 'hidden',
    paddingHorizontal: 18,
  },
  midnightTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '700' },
});
