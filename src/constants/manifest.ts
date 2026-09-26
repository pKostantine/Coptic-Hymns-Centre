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
  // Each document is only ever prayed on its own day, so it forces that day's
  // flag (the source sheets' "Data Control" row) rather than depending on the
  // calendar — otherwise opening it outside Holy Week would hide most of it.
  'holy-week': [
    { id: 'general_funeral_prayer', schema: 'holy_week', table: 'general_funeral_prayer', title: 'General Funeral Prayer', arabic: 'صلاة الجناز العام', extraContext: { GeneralFuneralPrayer: true } },
    { id: 'pascha_common_hymns', schema: 'holy_week', table: 'pascha_common_hymns', title: 'Pascha Week Common Hymns', arabic: 'الألحان المشتركة لأسبوع البصخة', extraContext: { HolyWeek: true } },
    { id: 'liturgy_of_the_waters', schema: 'holy_week', table: 'liturgy_of_the_waters', title: 'Liturgy of the Waters', arabic: 'قداس اللقان', extraContext: { HolyWeek: true, LiturgyOfTheWaters: true } },
    { id: 'covenant_thursday', schema: 'holy_week', table: 'covenant_thursday', title: 'Covenant Thursday', arabic: 'خميس العهد', extraContext: { HolyWeek: true, CovenantThursday: true, Matins: true } },
    { id: 'good_friday', schema: 'holy_week', table: 'good_friday', title: 'Good Friday', arabic: 'الجمعة العظيمة', extraContext: { HolyWeek: true, GoodFriday: true } },
    { id: 'bright_saturday', schema: 'holy_week', table: 'bright_saturday', title: 'Bright Saturday', arabic: 'سبت الفرح', extraContext: { HolyWeek: true, BrightSaturday: true } },
  ],
};

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
