/** CHC main-menu + submenu manifest. */

import type { DownloadableBookKey } from '@/types/bookDownloads';

export type CategoryId = 'psalmody' | 'liturgy' | 'veneration' | 'lectionary' | 'agpeya' | 'bible' | 'holy-week';

export interface CategoryDef {
  id: CategoryId;
  title: string;
  arabic: string;
  meta: string;
  /** The offline package this entry installs, when it is a downloadable book. */
  downloadKey?: DownloadableBookKey;
  /** Category screen behavior: 'submenu' shows a list of services; 'direct' opens the single service immediately; 'bible' has its own book/chapter flow; 'lectionary' opens the readings screen directly. */
  kind: 'submenu' | 'direct' | 'bible' | 'lectionary';
  schema?: string;
  table?: string; // only for kind: 'direct'
}

export interface ServiceDef {
  id: string;
  schema: string;
  table: string;
  title: string;
  arabic: string;
  /** Extra condition flags forced true for this entry point (e.g. Vespers/Matins/Liturgy). */
  extraContext?: Record<string, boolean>;
}

/** A navigational group within a category's submenu (e.g. Liturgy → Raising of Incense / Divine Liturgy). Not itself bookmarkable. */
export interface ServiceGroupDef {
  id: string;
  title: string;
  arabic: string;
}

/** A submenu entry that opens an existing document but forces extra condition flags (e.g. Vespers/Matins both open raising_of_incense). */
export interface ServiceOptionDef extends ServiceDef {
  extraContext: Record<string, boolean>;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'psalmody',
    title: 'Psalmody',
    arabic: 'الإبصلمودية',
    meta: 'Vespers · Midnight · Morning',
    downloadKey: 'psalmody',
    kind: 'submenu',
    schema: 'psalmody',
  },
  {
    id: 'liturgy',
    title: 'Liturgy',
    arabic: 'القداس',
    meta: 'Raising of Incense · Divine Liturgy',
    downloadKey: 'liturgy',
    kind: 'submenu',
    schema: 'liturgy',
  },
  {
    id: 'veneration',
    title: 'Veneration',
    arabic: 'تمجيد',
    meta: 'Doxologies of the saints',
    downloadKey: 'veneration',
    kind: 'direct',
    schema: 'veneration',
    table: 'veneration',
  },
  {
    id: 'lectionary',
    title: 'Lectionary',
    arabic: 'القطمارس',
    meta: "Today's readings",
    kind: 'lectionary',
  },
  {
    id: 'agpeya',
    title: 'Agpeya',
    arabic: 'الأجبية',
    meta: 'The book of the seven hours',
    downloadKey: 'agpeya',
    kind: 'submenu',
    schema: 'agpeya',
  },
  {
    id: 'bible',
    title: 'Bible',
    arabic: 'الكتاب المقدس',
    meta: 'Old & New Testament',
    downloadKey: 'bible',
    kind: 'bible',
  },
  {
    id: 'holy-week',
    title: 'Holy Week',
    arabic: 'أسبوع الآلام',
    meta: 'Pascha · Covenant Thursday · Good Friday',
    downloadKey: 'holy_week',
    kind: 'submenu',
    schema: 'holy_week',
  },
];

export const SERVICES_BY_CATEGORY: Record<string, ServiceDef[]> = {
  lectionary: [
    { id: 'antiphonary', schema: 'psalmody', table: 'antiphonary', title: 'Antiphonary', arabic: 'الدفنار' },
    { id: 'vespers', schema: 'liturgy', table: 'lectionary_vespers', title: 'Vespers', arabic: 'العشية', extraContext: { Vespers: true } },
    { id: 'matins', schema: 'liturgy', table: 'lectionary_matins', title: 'Matins', arabic: 'الباكر', extraContext: { Matins: true } },
    { id: 'liturgy', schema: 'liturgy', table: 'lectionary_liturgy', title: 'Liturgy', arabic: 'قداس الكلمة', extraContext: { Liturgy: true } },
    { id: 'sermon_planner', schema: 'liturgy', table: 'sermon_planner', title: 'Sermon Planner', arabic: 'مخطط العظة' },
  ],
  psalmody: [
    { id: 'vespers_praises', schema: 'psalmody', table: 'vespers_praises', title: 'Vespers Praises', arabic: 'تسبحة عشية' },
    { id: 'midnight_praises', schema: 'psalmody', table: 'midnight_praises', title: 'Midnight Praises', arabic: 'تسبحة نصف الليل' },
    { id: 'morning_doxology', schema: 'psalmody', table: 'morning_doxology', title: 'Morning Doxology', arabic: 'تسبحة باكر' },
    // Antiphonary is not a standalone book — it's only ever opened as the
    // subdocument Midnight Praises references internally (see the
    // isAntiphonaryButton handling in documentHtml.ts/ServiceDocument.tsx).
  ],
  agpeya: [
    { id: 'introduction_to_every_hour', schema: 'agpeya', table: 'introduction_to_every_hour', title: 'Introduction to Every Hour', arabic: 'مقدمة كل ساعة' },
    { id: 'first_hour', schema: 'agpeya', table: 'first_hour', title: '1st Hour', arabic: 'الساعة الأولى' },
    { id: 'third_hour', schema: 'agpeya', table: 'third_hour', title: '3rd Hour', arabic: 'الساعة الثالثة' },
    { id: 'sixth_hour', schema: 'agpeya', table: 'sixth_hour', title: '6th Hour', arabic: 'الساعة السادسة' },
    { id: 'ninth_hour', schema: 'agpeya', table: 'ninth_hour', title: '9th Hour', arabic: 'الساعة التاسعة' },
    { id: 'eleventh_hour', schema: 'agpeya', table: 'eleventh_hour', title: '11th Hour', arabic: 'الساعة الحادية عشرة' },
    { id: 'twelfth_hour', schema: 'agpeya', table: 'twelfth_hour', title: '12th Hour', arabic: 'الساعة الثانية عشرة' },
    { id: 'midnight_hour', schema: 'agpeya', table: 'midnight_hour', title: 'Midnight Hour', arabic: 'ساعة نصف الليل' },
    { id: 'prayer_of_the_veil', schema: 'agpeya', table: 'prayer_of_the_veil', title: 'Prayer of the Veil', arabic: 'صلاة الستار' },
    { id: 'other_prayers', schema: 'agpeya', table: 'other_prayers', title: 'Other Prayers', arabic: 'صلوات أخرى' },
  ],
};

/**
 * Holy Week (Pascha). The category opens a menu of rows, one per day: the
 * day itself beside the eve prayed on its evening (Palm Sunday | Monday Eve,
 * Monday | Tuesday Eve, … Holy Thursday | Friday Eve), then Good Friday and
 * Bright Saturday on their own. Each day and each eve opens only its own
 * hours.
 *
 * Nearly every hour opens the same holy_week.pascha_hour document and is told
 * apart purely by its extraContext: exactly one day token (PalmSunday …
 * GoodFriday, all the others forced false so the calendar date can't leak one
 * in), PaschaEveHour or PaschaDayHour, and one hour token (FirstHour …
 * TwelfthHour). An eve counts as the day it leads into — Monday Eve's hours
 * are HolyMonday's eve hours, exactly as holy_week.reading_rules keys them.
 * Holy Thursday's 1st hour and Good Friday's 6th, 9th and 12th hours differ
 * too much from that shape and have tables of their own. Each hour ends with
 * a link on to the next one (nextHyperlinkKey).
 */
const HOLY_WEEK_DAY_TOKENS = ['PalmSunday', 'HolyMonday', 'HolyTuesday', 'HolyWednesday', 'HolyThursday', 'GoodFriday'] as const;
type HolyWeekDayToken = (typeof HOLY_WEEK_DAY_TOKENS)[number];

type PaschaHourNumber = 1 | 3 | 6 | 9 | 11 | 12;
const PASCHA_HOUR_TOKENS: Record<PaschaHourNumber, string> = {
  1: 'FirstHour',
  3: 'ThirdHour',
  6: 'SixthHour',
  9: 'NinthHour',
  11: 'EleventhHour',
  12: 'TwelfthHour',
};
const PASCHA_HOUR_NAMES: Record<PaschaHourNumber, { english: string; arabic: string }> = {
  1: { english: 'First Hour', arabic: 'الساعة الأولى' },
  3: { english: 'Third Hour', arabic: 'الساعة الثالثة' },
  6: { english: 'Sixth Hour', arabic: 'الساعة السادسة' },
  9: { english: 'Ninth Hour', arabic: 'الساعة التاسعة' },
  11: { english: 'Eleventh Hour', arabic: 'الساعة الحادية عشرة' },
  12: { english: 'Twelfth Hour', arabic: 'الساعة الثانية عشرة' },
};

export interface HolyWeekHourDef extends ServiceDef {
  /** The day or eve this hour is listed under (a HOLY_WEEK_DAYS id). */
  dayId: string;
  /** The hour's name within its day's list ("First Hour"); `title` carries the day too, for the document header and bookmarks. */
  shortTitle: string;
  shortArabic: string;
  /** This hour's HYPERLINK_TARGETS key (HW_<ID>), i.e. how the previous hour links on to it. */
  hyperlinkKey: string;
  /** HYPERLINK_TARGETS key of the next service in Holy Week order; absent on the last one. */
  nextHyperlinkKey?: string;
}

/** A day or an eve — opens a list of just its own hours. */
export interface HolyWeekDayDef extends ServiceGroupDef {
  hours: HolyWeekHourDef[];
}

/** One row of the Holy Week menu: a day and, beside it, the eve prayed that evening. */
export interface HolyWeekRowDef {
  id: string;
  days: HolyWeekDayDef[];
}

type HolyWeekHourSeed = Omit<HolyWeekHourDef, 'dayId' | 'title' | 'arabic' | 'hyperlinkKey' | 'nextHyperlinkKey'>;

/** One day token true, every other Holy Week day token false — so the date the reader happens to open it on can't switch on another day's hymns. */
function holyWeekContext(day: HolyWeekDayToken | null, extra: Record<string, boolean> = {}): Record<string, boolean> {
  const flags: Record<string, boolean> = { HolyWeek: true, BrightSaturday: false };
  for (const token of HOLY_WEEK_DAY_TOKENS) flags[token] = token === day;
  return { ...flags, ...extra };
}

function paschaHour(
  id: string,
  day: HolyWeekDayToken,
  part: 'Eve' | 'Day',
  hour: PaschaHourNumber,
  table = 'pascha_hour',
  extra: Record<string, boolean> = {},
): HolyWeekHourSeed {
  const name = PASCHA_HOUR_NAMES[hour];
  return {
    id,
    schema: 'holy_week',
    table,
    shortTitle: name.english,
    shortArabic: name.arabic,
    extraContext: holyWeekContext(day, {
      [part === 'Eve' ? 'PaschaEveHour' : 'PaschaDayHour']: true,
      [PASCHA_HOUR_TOKENS[hour]]: true,
      ...extra,
    }),
  };
}

function hourSuffix(hour: PaschaHourNumber): string {
  return `${hour}${hour === 1 ? 'st' : hour === 3 ? 'rd' : 'th'}`;
}

/** The five hours of an eve (1st, 3rd, 6th, 9th, 11th), all on the shared pascha_hour document. */
function paschaEveHours(prefix: string, day: HolyWeekDayToken): HolyWeekHourSeed[] {
  return ([1, 3, 6, 9, 11] as const).map((hour) => paschaHour(`${prefix}_eve_${hourSuffix(hour)}`, day, 'Eve', hour));
}

/** The daytime hours (1st, 3rd, 6th, 9th, 11th) on the shared pascha_hour document. */
function paschaDayHours(prefix: string, day: HolyWeekDayToken): HolyWeekHourSeed[] {
  return ([1, 3, 6, 9, 11] as const).map((hour) => paschaHour(`${prefix}_${hourSuffix(hour)}`, day, 'Day', hour));
}

/** A standalone Holy Week service (its own table, not an hour of pascha_hour). */
function holyWeekService(id: string, table: string, english: string, arabic: string, extraContext: Record<string, boolean>): HolyWeekHourSeed {
  return { id, schema: 'holy_week', table, shortTitle: english, shortArabic: arabic, extraContext };
}

type HolyWeekDaySeed = ServiceGroupDef & { hours: HolyWeekHourSeed[] };

/** Menu rows in prayer order. Within a row the day comes first, then the eve prayed on its evening. */
const HOLY_WEEK_ROW_SEEDS: HolyWeekDaySeed[][] = [
  [
    {
      id: 'palm-sunday',
      title: 'Palm Sunday',
      arabic: 'أحد الشعانين',
      hours: [
        holyWeekService('general_funeral_prayer', 'general_funeral_prayer', 'General Funeral Prayer', 'صلاة الجناز العام', holyWeekContext('PalmSunday', { GeneralFuneralPrayer: true })),
        paschaHour('sunday_9th', 'PalmSunday', 'Day', 9),
        paschaHour('sunday_11th', 'PalmSunday', 'Day', 11),
      ],
    },
    { id: 'monday-eve', title: 'Monday Eve', arabic: 'ليلة الاثنين', hours: paschaEveHours('monday', 'HolyMonday') },
  ],
  [
    { id: 'monday', title: 'Monday', arabic: 'يوم الاثنين', hours: paschaDayHours('monday', 'HolyMonday') },
    { id: 'tuesday-eve', title: 'Tuesday Eve', arabic: 'ليلة الثلاثاء', hours: paschaEveHours('tuesday', 'HolyTuesday') },
  ],
  [
    { id: 'tuesday', title: 'Tuesday', arabic: 'يوم الثلاثاء', hours: paschaDayHours('tuesday', 'HolyTuesday') },
    { id: 'wednesday-eve', title: 'Wednesday Eve', arabic: 'ليلة الأربعاء', hours: paschaEveHours('wednesday', 'HolyWednesday') },
  ],
  [
    { id: 'wednesday', title: 'Wednesday', arabic: 'يوم الأربعاء', hours: paschaDayHours('wednesday', 'HolyWednesday') },
    { id: 'thursday-eve', title: 'Thursday Eve', arabic: 'ليلة الخميس', hours: paschaEveHours('thursday', 'HolyThursday') },
  ],
  [
    {
      id: 'holy-thursday',
      title: 'Holy Thursday',
      arabic: 'خميس العهد',
      hours: [
        paschaHour('thursday_1st', 'HolyThursday', 'Day', 1, 'thursday_first_hour', { Matins: true }),
        paschaHour('thursday_3rd', 'HolyThursday', 'Day', 3),
        paschaHour('thursday_6th', 'HolyThursday', 'Day', 6),
        paschaHour('thursday_9th', 'HolyThursday', 'Day', 9),
        holyWeekService('liturgy_of_the_waters', 'liturgy_of_the_waters', 'Liturgy of the Waters', 'قداس اللقان', holyWeekContext('HolyThursday', { LiturgyOfTheWaters: true })),
        holyWeekService('holy_thursday_liturgy', 'holy_thursday_liturgy', 'Divine Liturgy', 'القداس الإلهي', holyWeekContext('HolyThursday', { Liturgy: true })),
        paschaHour('thursday_11th', 'HolyThursday', 'Day', 11, 'pascha_hour', { CovenantThursday11thHour: true }),
      ],
    },
    { id: 'friday-eve', title: 'Friday Eve', arabic: 'ليلة الجمعة', hours: paschaEveHours('friday', 'GoodFriday') },
  ],
  [
    {
      id: 'good-friday',
      title: 'Good Friday',
      arabic: 'الجمعة العظيمة',
      hours: [
        paschaHour('friday_1st', 'GoodFriday', 'Day', 1),
        paschaHour('friday_3rd', 'GoodFriday', 'Day', 3),
        paschaHour('friday_6th', 'GoodFriday', 'Day', 6, 'good_friday_sixth_hour'),
        paschaHour('friday_9th', 'GoodFriday', 'Day', 9, 'good_friday_ninth_hour'),
        paschaHour('friday_11th', 'GoodFriday', 'Day', 11),
        paschaHour('friday_12th', 'GoodFriday', 'Day', 12, 'good_friday_twelfth_hour'),
      ],
    },
  ],
  [
    {
      id: 'bright-saturday',
      title: 'Bright Saturday',
      arabic: 'سبت الفرح',
      hours: [holyWeekService('bright_saturday', 'bright_saturday', 'Bright Saturday', 'سبت الفرح', holyWeekContext(null, { BrightSaturday: true }))],
    },
  ],
];

function holyWeekHyperlinkKey(hourId: string): string {
  return `HW_${hourId.toUpperCase()}`;
}

/** Every Holy Week service in the order it is prayed — each one links on to the next. */
export const HOLY_WEEK_HOURS: HolyWeekHourDef[] = HOLY_WEEK_ROW_SEEDS.flat().flatMap((day) =>
  day.hours.map((hour) => ({
    ...hour,
    dayId: day.id,
    // A day whose only service is the day itself (Bright Saturday) doesn't repeat its name.
    title: day.hours.length === 1 ? day.title : `${day.title} – ${hour.shortTitle}`,
    arabic: day.hours.length === 1 ? day.arabic : `${hour.shortArabic} – ${day.arabic}`,
    hyperlinkKey: holyWeekHyperlinkKey(hour.id),
  })),
).map((hour, index, all) => (index + 1 < all.length ? { ...hour, nextHyperlinkKey: all[index + 1].hyperlinkKey } : hour));

function holyWeekDay(seed: HolyWeekDaySeed): HolyWeekDayDef {
  return { id: seed.id, title: seed.title, arabic: seed.arabic, hours: HOLY_WEEK_HOURS.filter((hour) => hour.dayId === seed.id) };
}

export const HOLY_WEEK_ROWS: HolyWeekRowDef[] = HOLY_WEEK_ROW_SEEDS.map((row) => ({ id: row[0].id, days: row.map(holyWeekDay) }));

/** Every day and eve, flattened — what the /holy-week/[dayId] route looks up. */
export const HOLY_WEEK_DAYS: HolyWeekDayDef[] = HOLY_WEEK_ROWS.flatMap((row) => row.days);

export function holyWeekHourHref(hour: Pick<HolyWeekHourDef, 'dayId' | 'id'>): string {
  return `/holy-week/${hour.dayId}/${hour.id}`;
}

/** Where a day or eve opens: straight into its service when it has only one (Bright Saturday), otherwise its list of hours. */
export function holyWeekDayHref(day: HolyWeekDayDef): string {
  return day.hours.length === 1 ? holyWeekHourHref(day.hours[0]) : `/holy-week/${day.id}`;
}

/** Liturgy top-level submenu: Raising of Incense (its own nested submenu) and the Divine Liturgy (its own list of services). */
export const LITURGY_GROUPS: ServiceGroupDef[] = [
  { id: 'raising-of-incense', title: 'Raising of Incense', arabic: 'رفع بخور' },
  { id: 'divine-liturgy', title: 'The Divine Liturgy', arabic: 'القداس الإلهي' },
];

/** Vespers and Matins both open liturgy.raising_of_incense, differing only in which condition flag is forced true. */
export const RAISING_OF_INCENSE_OPTIONS: ServiceOptionDef[] = [
  {
    id: 'vespers',
    schema: 'liturgy',
    table: 'raising_of_incense',
    title: 'Vespers',
    arabic: 'عشية',
    extraContext: { Vespers: true },
  },
  {
    id: 'matins',
    schema: 'liturgy',
    table: 'raising_of_incense',
    title: 'Matins',
    arabic: 'باكر',
    extraContext: { Matins: true },
  },
];

export const DIVINE_LITURGY_SERVICES: ServiceDef[] = [
  { id: 'offering_of_the_lamb', schema: 'liturgy', table: 'offering_of_the_lamb', title: 'Offering of the Lamb', arabic: 'تقديم الحمل' },
  { id: 'liturgy_of_the_word', schema: 'liturgy', table: 'liturgy_of_the_word', title: 'Liturgy of the Word', arabic: 'قداس الكلمة' },
  { id: 'liturgy_of_st_basil', schema: 'liturgy', table: 'liturgy_of_st_basil', title: 'Liturgy of St. Basil', arabic: 'قداس القديس باسيليوس' },
  { id: 'liturgy_of_st_gregory', schema: 'liturgy', table: 'liturgy_of_st_gregory', title: 'Liturgy of St. Gregory', arabic: 'قداس القديس غريغوريوس' },
  { id: 'liturgy_of_st_cyril', schema: 'liturgy', table: 'liturgy_of_st_cyril', title: 'Liturgy of St. Cyril', arabic: 'قداس القديس كيرلس' },
  { id: 'distribution', schema: 'liturgy', table: 'distribution', title: 'Distribution', arabic: 'التوزيع' },
];

/**
 * Hyperlink targets — where an order row with `item_type = "Hyperlink"` sends
 * you. Unlike a Subdocument (a modal over the current document) or an Inline
 * (content spliced into it), a Hyperlink *leaves* the current document for
 * another service entirely, so it resolves to a route rather than to a
 * schema/table pair.
 *
 * The all-caps key is the order row's own `hymn_key`. Titles are read back out
 * of the service definitions above rather than restated here, so a service
 * renamed in one place can't end up labelled two different ways.
 */
export interface HyperlinkTarget {
  href: string;
  title: string;
  arabic: string;
}

function hyperlinkTarget(href: string, services: ServiceDef[], serviceId: string): HyperlinkTarget {
  const service = services.find((entry) => entry.id === serviceId);
  return { href, title: service?.title || serviceId, arabic: service?.arabic || '' };
}

export const HYPERLINK_TARGETS: Record<string, HyperlinkTarget> = {
  MIDNIGHT_PRAISES: hyperlinkTarget('/psalmody/midnight_praises', SERVICES_BY_CATEGORY.psalmody, 'midnight_praises'),
  MORNING_DOXOLOGY: hyperlinkTarget('/psalmody/morning_doxology', SERVICES_BY_CATEGORY.psalmody, 'morning_doxology'),
  VESPERS_PRAISES: hyperlinkTarget('/psalmody/vespers_praises', SERVICES_BY_CATEGORY.psalmody, 'vespers_praises'),
  VESPERS: hyperlinkTarget('/liturgy/raising-of-incense/vespers', RAISING_OF_INCENSE_OPTIONS, 'vespers'),
  MATINS: hyperlinkTarget('/liturgy/raising-of-incense/matins', RAISING_OF_INCENSE_OPTIONS, 'matins'),
  OFFERING_OF_THE_LAMB: hyperlinkTarget('/liturgy/divine-liturgy/offering_of_the_lamb', DIVINE_LITURGY_SERVICES, 'offering_of_the_lamb'),
  LITURGY_OF_THE_WORD: hyperlinkTarget('/liturgy/divine-liturgy/liturgy_of_the_word', DIVINE_LITURGY_SERVICES, 'liturgy_of_the_word'),
  LITURGY_OF_ST_BASIL: hyperlinkTarget('/liturgy/divine-liturgy/liturgy_of_st_basil', DIVINE_LITURGY_SERVICES, 'liturgy_of_st_basil'),
  LITURGY_OF_ST_GREGORY: hyperlinkTarget('/liturgy/divine-liturgy/liturgy_of_st_gregory', DIVINE_LITURGY_SERVICES, 'liturgy_of_st_gregory'),
  LITURGY_OF_ST_CYRIL: hyperlinkTarget('/liturgy/divine-liturgy/liturgy_of_st_cyril', DIVINE_LITURGY_SERVICES, 'liturgy_of_st_cyril'),
  DISTRIBUTION: hyperlinkTarget('/liturgy/divine-liturgy/distribution', DIVINE_LITURGY_SERVICES, 'distribution'),
  // The lectionary's three services link on from one to the next. Their keys
  // carry the LECTIONARY_ prefix because VESPERS and MATINS above already
  // name the Raising of Incense services, which are a different document.
  LECTIONARY_VESPERS: hyperlinkTarget('/lectionary/vespers', SERVICES_BY_CATEGORY.lectionary, 'vespers'),
  LECTIONARY_MATINS: hyperlinkTarget('/lectionary/matins', SERVICES_BY_CATEGORY.lectionary, 'matins'),
  LECTIONARY_LITURGY: hyperlinkTarget('/lectionary/liturgy', SERVICES_BY_CATEGORY.lectionary, 'liturgy'),
  INTRODUCTION_TO_EVERY_HOUR: hyperlinkTarget('/agpeya/introduction_to_every_hour', SERVICES_BY_CATEGORY.agpeya, 'introduction_to_every_hour'),
  FIRST_HOUR: hyperlinkTarget('/agpeya/first_hour', SERVICES_BY_CATEGORY.agpeya, 'first_hour'),
  THIRD_HOUR: hyperlinkTarget('/agpeya/third_hour', SERVICES_BY_CATEGORY.agpeya, 'third_hour'),
  SIXTH_HOUR: hyperlinkTarget('/agpeya/sixth_hour', SERVICES_BY_CATEGORY.agpeya, 'sixth_hour'),
  NINTH_HOUR: hyperlinkTarget('/agpeya/ninth_hour', SERVICES_BY_CATEGORY.agpeya, 'ninth_hour'),
  ELEVENTH_HOUR: hyperlinkTarget('/agpeya/eleventh_hour', SERVICES_BY_CATEGORY.agpeya, 'eleventh_hour'),
  TWELFTH_HOUR: hyperlinkTarget('/agpeya/twelfth_hour', SERVICES_BY_CATEGORY.agpeya, 'twelfth_hour'),
  MIDNIGHT_HOUR: hyperlinkTarget('/agpeya/midnight_hour', SERVICES_BY_CATEGORY.agpeya, 'midnight_hour'),
  PRAYER_OF_THE_VEIL: hyperlinkTarget('/agpeya/prayer_of_the_veil', SERVICES_BY_CATEGORY.agpeya, 'prayer_of_the_veil'),
  OTHER_PRAYERS: hyperlinkTarget('/agpeya/other_prayers', SERVICES_BY_CATEGORY.agpeya, 'other_prayers'),
  // Holy Week: every hour links on to the next (HW_<HOUR ID>).
  ...Object.fromEntries(HOLY_WEEK_HOURS.map((hour) => [hour.hyperlinkKey, { href: holyWeekHourHref(hour), title: hour.title, arabic: hour.arabic }])),
};

/**
 * Bookmark keys.
 *
 * A bookmark is normally identified by the document it points at,
 * `schema:table` — but that is not unique when two menu entries open the SAME
 * document with different condition flags. Vespers and Matins are both
 * liturgy.raising_of_incense, separated only by their extraContext, so a
 * bookmark made in Vespers was indistinguishable from one made in Matins and
 * whichever entry was registered last won the label.
 *
 * Rather than special-casing that pair, any (schema, table) reachable from more
 * than one entry point gets its entry id appended. Documents reachable from
 * exactly one entry keep the bare `schema:table` key, so existing bookmarks for
 * them are untouched.
 */
function collectEntryTables(): string[] {
  const tables: string[] = [];
  for (const category of CATEGORIES) {
    if (category.kind === 'direct' && category.schema && category.table) {
      tables.push(`${category.schema}:${category.table}`);
    }
  }
  for (const services of Object.values(SERVICES_BY_CATEGORY)) {
    for (const service of services) tables.push(`${service.schema}:${service.table}`);
  }
  for (const option of RAISING_OF_INCENSE_OPTIONS) tables.push(`${option.schema}:${option.table}`);
  for (const service of DIVINE_LITURGY_SERVICES) tables.push(`${service.schema}:${service.table}`);
  for (const hour of HOLY_WEEK_HOURS) tables.push(`${hour.schema}:${hour.table}`);
  return tables;
}

/** `schema:table` pairs that more than one menu entry opens, so a bookmark there must say which entry it was made from. */
export const SHARED_DOCUMENT_KEYS: ReadonlySet<string> = new Set(
  collectEntryTables().filter((key, index, all) => all.indexOf(key) !== index),
);

/**
 * The bookmark id for a document opened from a given entry point. Falls back to
 * the bare `schema:table` whenever that is already unambiguous, so only the
 * genuinely shared documents change shape.
 */
export function bookmarkKeyFor(schema: string, table: string, entryId?: string | null): string {
  const base = `${schema}:${table}`;
  if (!entryId || !SHARED_DOCUMENT_KEYS.has(base)) return base;
  return `${base}@${entryId}`;
}
