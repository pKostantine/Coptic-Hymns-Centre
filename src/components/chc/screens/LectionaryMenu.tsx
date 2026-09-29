'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold, { MenuSectionLabel, TileRow } from './BookMenuScaffold';
import Icon, { type IconName } from '../ui/Icon';
import JewelTile from '../ui/JewelTile';
import { getBookTheme } from '../../../constants/bookTheme';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY, type ServiceDef } from '../../../constants/manifest';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatWeekdayDate, toEasternArabicDigits } from '../../../utils/localeFormat';
import { getServiceReadingCitations, type LectionaryReadingKind, type LectionaryService, type ReadingCitation } from '../../../utils/readingsService';

import { appText, entryLabel, tr } from '../../../utils/appText';
const MAX_FONT_SCALE = 1.25;

type Gradient = readonly [string, string, string];
type ReadingLine = { key: string; label: { english: string; arabic: string; french?: string }; value: string | null; fullRow?: boolean };

const READING_LABELS: Record<LectionaryReadingKind, { english: string; arabic: string; french?: string }> = {
  Psalm: { english: 'Psalm', arabic: 'المزمور', french: 'Psaume' },
  Gospel: { english: 'Gospel', arabic: 'الإنجيل', french: 'Évangile' },
  Prophecy: { english: 'Prophecy', arabic: 'النبوة', french: 'Prophétie' },
  Pauline: { english: 'Pauline', arabic: 'البولس', french: 'Paul' },
  Catholic: { english: 'Catholic', arabic: 'الكاثوليكون', french: 'Catholique' },
  Praxis: { english: 'Acts', arabic: 'الإبركسيس', french: 'Actes' },
};

/** What each service always reads — its outline until the day's citations arrive, and wherever one can't be found. */
const EXPECTED: Record<LectionaryService, LectionaryReadingKind[]> = {
  Vespers: ['Psalm', 'Gospel'],
  Matins: ['Psalm', 'Gospel'],
  Liturgy: ['Pauline', 'Catholic', 'Praxis', 'Psalm', 'Gospel'],
};

/** In the Liturgy's two columns the Acts takes a row of its own, between the two epistles and the Psalm with its Gospel. */
const FULL_ROW: LectionaryReadingKind[] = ['Praxis'];

/** "Prophecy 2" / "النبوة ٢" when several are read. */
function numberedLabel(label: { english: string; arabic: string; french?: string }, number: number | null) {
  if (number === null) return label;
  return { english: `${label.english} ${number}`, arabic: toEasternArabicDigits(`${label.arabic} ${number}`) };
}

const SERVICES: Record<LectionaryService, { id: string; gradient: Gradient; accent: string; icon: IconName }> = {
  Vespers: { id: 'vespers', gradient: ['#1A5570', '#0C2E40', '#061821'], accent: '#B5E3EF', icon: 'sunset' },
  Matins: { id: 'matins', gradient: ['#12708A', '#0A4254', '#05212A'], accent: '#C8F0F7', icon: 'sunrise' },
  Liturgy: { id: 'liturgy', gradient: ['#0B7A86', '#064A53', '#032529'], accent: '#D2F5F2', icon: 'sunny' },
};

type DayReadings = { key: string; citations: Record<LectionaryService, ReadingCitation[]> };

/**
 * The Lectionary: the day's readings service by service. Vespers and Matins
 * each read a Psalm and a Gospel (a Lenten Matins its prophecies first);
 * the Liturgy of the Word reads the Pauline, Catholic, Acts, Psalm and
 * Gospel — every card lists what its service reads today. Then the books
 * read alongside them: the Antiphonary and the Sermon Planner.
 */
export default function LectionaryMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const { effectiveDate } = useCalendar();
  const arabic = preferences.appLanguage === 'ar';
  const theme = getBookTheme('lectionary');
  const services = SERVICES_BY_CATEGORY.lectionary;
  const byId = (id: string) => services.find((service) => service.id === id);
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));
  const open = (service: ServiceDef) => router.push(`/lectionary/${service.id}` as never);
  const dateKey = effectiveDate.toISOString().slice(0, 10);
  const [day, setDay] = useState<DayReadings | null>(null);

  useEffect(() => {
    let active = true;
    const date = new Date(`${dateKey}T00:00:00Z`);
    getServiceReadingCitations(date)
      .then((citations) => { if (active) setDay({ key: dateKey, citations }); })
      // The citations are a preview; the services open fine without them.
      .catch(() => undefined);
    return () => { active = false; };
  }, [dateKey]);

  const today = day?.key === dateKey ? day : null;

  const cite = (citation: ReadingCitation) => (arabic ? toEasternArabicDigits(citation.arabic) : tr(citation.english, citation.french || citation.english, citation.arabic));
  const prophecies = (today?.citations.Matins ?? []).filter((citation) => citation.kind === 'Prophecy');

  /** The service's readings in reading order, falling back to its outline for any not (yet) known. */
  const linesFor = (service: LectionaryService, columns: 1 | 2): ReadingLine[] => {
    const citations = today?.citations[service] ?? [];
    // A Lenten Matins reads its prophecies first, each numbered when there are
    // several; in two columns an odd last one takes its own row, so the Psalm
    // and Gospel stay side by side.
    const prophecyLines: ReadingLine[] = (service === 'Matins' ? prophecies : []).map((citation, index, all) => ({
      key: `Prophecy-${index + 1}`,
      label: numberedLabel(READING_LABELS.Prophecy, all.length > 1 ? index + 1 : null),
      value: cite(citation),
      fullRow: columns === 2 && all.length % 2 === 1 && index === all.length - 1,
    }));
    return [
      ...prophecyLines,
      ...EXPECTED[service].map((kind) => {
        const found = citations.find((citation) => citation.kind === kind);
        return { key: kind, label: READING_LABELS[kind], value: found ? cite(found) : null, fullRow: FULL_ROW.includes(kind) };
      }),
    ];
  };

  const card = (service: LectionaryService, columns: 1 | 2) => {
    const look = SERVICES[service];
    const def = byId(look.id);
    if (!def) return null;
    return (
      <ServiceReadingsCard
        key={service}
        // The manifest's short "Liturgy" is, in full, the Liturgy of the Word — as its Arabic, قداس الكلمة, already says.
        title={service === 'Liturgy' ? tr('Liturgy of the Word', 'Liturgie de la Parole', def.arabic) : entryLabel(def)}
        gradient={look.gradient}
        accent={look.accent}
        icon={look.icon}
        lines={linesFor(service, columns)}
        columns={columns}
        arabic={arabic}
        bookmarked={bookmarked(def)}
        onPress={() => open(def)}
      />
    );
  };

  const antiphonary = byId('antiphonary');
  const sermonPlanner = byId('sermon_planner');

  return (
    <BookMenuScaffold
      theme={theme}
      title={{ english: 'Lectionary', arabic: 'القطمارس', french: 'Lectionnaire' }}
      overline={tr("TODAY'S READINGS", 'LECTURES DU JOUR', 'قراءات اليوم')}
      description={formatWeekdayDate(effectiveDate, arabic)}
      arabic={arabic}
      backHref="/books"
    >
      {prophecies.length ? (
        // A Lenten morning's list of prophecies needs the full width.
        <>
          {card('Vespers', 2)}
          {card('Matins', 2)}
        </>
      ) : (
        <TileRow arabic={arabic}>
          {card('Vespers', 1)}
          {card('Matins', 1)}
        </TileRow>
      )}
      {card('Liturgy', 2)}

      <MenuSectionLabel text={tr('With the readings', 'Avec les lectures', 'مع القراءات')} arabic={arabic} accent={theme.accent} />
      {antiphonary ? (
        <JewelTile
          layout="row"
          gradient={['#0B4F5F', '#062A33', '#03161B']}
          accent={theme.accent}
          title={entryLabel(antiphonary)}
          arabic={arabic}
          bookmarked={bookmarked(antiphonary)}
          onPress={() => open(antiphonary)}
        />
      ) : null}
      {sermonPlanner ? (
        <JewelTile
          layout="row"
          gradient={['#123C4A', '#08212A', '#030F13']}
          accent={theme.accent}
          title={entryLabel(sermonPlanner)}
          arabic={arabic}
          bookmarked={bookmarked(sermonPlanner)}
          onPress={() => open(sermonPlanner)}
        />
      ) : null}
    </BookMenuScaffold>
  );
}

interface ServiceReadingsCardProps {
  title: string;
  gradient: Gradient;
  accent: string;
  icon: IconName;
  lines: ReadingLine[];
  columns: 1 | 2;
  arabic: boolean;
  bookmarked: boolean;
  onPress: () => void;
}

/** One service of the day's readings: its name, then each reading it reads — label over citation. */
function ServiceReadingsCard({ title, gradient, accent, icon, lines, columns, arabic, bookmarked, onPress }: ServiceReadingsCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, ...lines.map((line) => line.value).filter(Boolean)].join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, styles.fill]} />
      {/* Icons are wrapped so they stack above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
      <View style={[styles.head, arabic && styles.rowReverse]}>
        <View><Icon name={icon} size={20} color={accent} /></View>
        <Text style={[styles.title, arabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
        {bookmarked ? <View><Icon name="bookmark" size={14} color={COLORS.gold} /></View> : null}
        <View><Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={16} color={accent} /></View>
      </View>
      <View style={[styles.rule, { backgroundColor: accent }]} />
      <View style={[styles.lines, arabic && styles.rowReverse]}>
        {lines.map((line) => (
          <View key={line.key} style={[styles.line, columns === 2 && !line.fullRow ? styles.halfLine : styles.fullLine]}>
            <Text style={[styles.label, { color: accent }, arabic && styles.arabicLabel]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {(arabic ? line.label.arabic : appText(line.label).toUpperCase())}
            </Text>
            <Text style={[styles.value, !line.value && styles.valueMissing, arabic && styles.arabicText]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {line.value ?? '—'}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  card: {
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  fill: { borderRadius: 17 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  head: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth, marginBottom: 4, marginTop: 12, opacity: 0.3 },
  lines: { flexDirection: 'row', flexWrap: 'wrap' },
  line: { paddingVertical: 6 },
  fullLine: { width: '100%' },
  halfLine: { paddingHorizontal: 2, width: '50%' },
  label: { fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, opacity: 0.9 },
  arabicLabel: { fontFamily: TYPOGRAPHY.arabic, fontSize: 12, letterSpacing: 0, textAlign: 'right', writingDirection: 'rtl' },
  value: { color: 'rgba(255, 255, 255, 0.92)', fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '600', marginTop: 2 },
  valueMissing: { color: 'rgba(255, 255, 255, 0.35)' },
});
