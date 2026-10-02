'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import BookPage, { BookRow, ReadingRow, RowList, SectionHeading } from './BookPage';
import DayControls from '../ui/DayControls';
import Icon from '../ui/Icon';
import TodayCard from '../ui/TodayCard';
import { useLiturgicalDay } from '../ui/useLiturgicalDay';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY, type ServiceDef } from '../../../constants/manifest';
import { COLORS } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, entryLabel, tr } from '../../../utils/appText';
import { formatCopticDayMonth, formatDayMonthYearDate, toEasternArabicDigits } from '../../../utils/localeFormat';
import { getServiceReadingCitations, type LectionaryReadingKind, type LectionaryService, type ReadingCitation } from '../../../utils/readingsService';

type Name = { english: string; arabic: string; french?: string };
type ReadingLine = { key: string; label: Name; value: string | null };

const READING_LABELS: Record<LectionaryReadingKind, Name> = {
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

const SERVICE_IDS: Record<LectionaryService, string> = { Vespers: 'vespers', Matins: 'matins', Liturgy: 'liturgy' };

/** "Prophecy 2" / "النبوة ٢" when several are read. */
function numberedLabel(label: Name, number: number | null): Name {
  if (number === null) return label;
  return { english: `${label.english} ${number}`, arabic: toEasternArabicDigits(`${label.arabic} ${number}`), french: `${label.french ?? label.english} ${number}` };
}

type DayReadings = { key: string; citations: Record<LectionaryService, ReadingCitation[]> };

/**
 * The Lectionary (Coptic Vine design, "Book Pages"): the day it reads — stepped a day
 * at a time — then each service's readings, reading by reading. Vespers and
 * Matins each read a Psalm and a Gospel (a Lenten Matins its prophecies
 * first); the Liturgy the Pauline, Catholic, Acts, Psalm and Gospel. Then the
 * books read alongside them: the Antiphonary and the Sermon Planner.
 */
export default function LectionaryMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const { effectiveDate } = useCalendar();
  const day = useLiturgicalDay();
  const arabic = preferences.appLanguage === 'ar';
  const services = SERVICES_BY_CATEGORY.lectionary;
  const byId = (id: string) => services.find((service) => service.id === id);
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));
  const open = (service: ServiceDef) => router.push(`/lectionary/${service.id}` as never);
  // The readings are the rite's: after the eve, the next morning's.
  const dateKey = effectiveDate.toISOString().slice(0, 10);
  const [readings, setReadings] = useState<DayReadings | null>(null);

  useEffect(() => {
    let active = true;
    getServiceReadingCitations(new Date(`${dateKey}T00:00:00Z`))
      .then((citations) => { if (active) setReadings({ key: dateKey, citations }); })
      // The citations are a preview; the services open fine without them.
      .catch(() => undefined);
    return () => { active = false; };
  }, [dateKey]);

  const today = readings?.key === dateKey ? readings : null;
  const cite = (citation: ReadingCitation) => (arabic ? toEasternArabicDigits(citation.arabic) : tr(citation.english, citation.french || citation.english, citation.arabic));

  /** The service's readings in reading order, falling back to its outline for any not (yet) known. */
  const linesFor = (service: LectionaryService): ReadingLine[] => {
    const citations = today?.citations[service] ?? [];
    // A Lenten Matins reads its prophecies first, each numbered when there are several.
    const prophecies = service === 'Matins' ? citations.filter((citation) => citation.kind === 'Prophecy') : [];
    return [
      ...prophecies.map((citation, index, all) => ({
        key: `Prophecy-${index + 1}`,
        label: numberedLabel(READING_LABELS.Prophecy, all.length > 1 ? index + 1 : null),
        value: cite(citation),
      })),
      ...EXPECTED[service].map((kind) => {
        const found = citations.find((citation) => citation.kind === kind);
        return { key: kind, label: READING_LABELS[kind], value: found ? cite(found) : null };
      }),
    ];
  };

  const serviceSection = (service: LectionaryService) => {
    const def = byId(SERVICE_IDS[service]);
    if (!def) return null;
    const lines = linesFor(service);
    // "PROPHECY 2" is wider than the other kinds; its list makes room for it.
    const kindWidth = lines.some((line) => line.key.startsWith('Prophecy')) ? 96 : 74;
    return (
      <View key={service}>
        <SectionHeading
          title={entryLabel(def)}
          arabic={arabic}
          trailing={bookmarked(def) ? <Icon name="bookmark" size={14} color={COLORS.gold} /> : undefined}
        />
        <RowList>
          {lines.map((line) => (
            <ReadingRow
              key={line.key}
              kind={appText(line.label)}
              value={line.value}
              arabic={arabic}
              kindWidth={kindWidth}
              onPress={() => open(def)}
            />
          ))}
        </RowList>
      </View>
    );
  };

  const antiphonary = byId('antiphonary');
  const sermonPlanner = byId('sermon_planner');

  return (
    <BookPage
      title={{ english: 'Lectionary', arabic: 'القطمارس', french: 'Lectionnaire' }}
      kicker={tr('Today’s Readings', 'Lectures du jour', 'قراءات اليوم')}
      arabic={arabic}
      backHref="/books"
      aside={(
          <TodayCard
            theme={day.theme}
            arabic={arabic}
            controls={(
              <DayControls
                theme={day.theme}
                arabic={arabic}
                seasonLabel={day.seasonLabel}
                onOpenSeasons={() => router.push('/season-selector')}
                trailing="arrows"
              />
            )}
            heading={day.coptic ? formatCopticDayMonth(day.coptic.monthName, day.coptic.day, arabic) : ' '}
            subheading={formatDayMonthYearDate(day.date, arabic)}
          />
      )}
    >

      {serviceSection('Vespers')}
      {serviceSection('Matins')}
      {serviceSection('Liturgy')}

      <SectionHeading title={tr('With the Readings', 'Avec les lectures', 'مع القراءات')} arabic={arabic} />
      <RowList>
        {antiphonary ? (
          <BookRow icon="musical-notes-outline" title={entryLabel(antiphonary)} arabic={arabic} bookmarked={bookmarked(antiphonary)} onPress={() => open(antiphonary)} />
        ) : null}
        {sermonPlanner ? (
          <BookRow icon="create-outline" title={entryLabel(sermonPlanner)} arabic={arabic} bookmarked={bookmarked(sermonPlanner)} onPress={() => open(sermonPlanner)} />
        ) : null}
      </RowList>
    </BookPage>
  );
}
