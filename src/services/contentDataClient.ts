import { hasLocalSchema, readLocalRpc, readLocalTable } from '@/services/bookContentDatabase';
import { supabase } from '@/utils/supabase';

type Filter = { kind: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike'; column: string; value: unknown };
type Ordering = { column: string; ascending: boolean };
type QueryResult = { data: any; error: any };

function comparable(value: unknown): string | number {
  if (typeof value === 'number') return value;
  return String(value ?? '');
}

function applyFilter(row: Record<string, unknown>, filter: Filter): boolean {
  const value = row[filter.column];
  if (filter.kind === 'eq') return value === filter.value || String(value) === String(filter.value);
  if (filter.kind === 'in') return (filter.value as unknown[]).some((candidate) => value === candidate || String(value) === String(candidate));
  if (filter.kind === 'ilike') {
    const needle = String(filter.value ?? '').replace(/^%|%$/g, '').toLocaleLowerCase();
    return String(value ?? '').toLocaleLowerCase().includes(needle);
  }
  const left = comparable(value);
  const right = comparable(filter.value);
  if (filter.kind === 'gt') return left > right;
  if (filter.kind === 'gte') return left >= right;
  if (filter.kind === 'lt') return left < right;
  return left <= right;
}

function projectRow(row: Record<string, unknown>, selection: string): Record<string, unknown> {
  if (!selection || selection.trim() === '*') return { ...row };
  const projected: Record<string, unknown> = {};
  for (const token of selection.split(',').map((part) => part.trim()).filter(Boolean)) {
    const separator = token.indexOf(':');
    const output = separator > 0 ? token.slice(0, separator).trim() : token;
    const source = separator > 0 ? token.slice(separator + 1).trim() : token;
    projected[output] = row[source];
  }
  return projected;
}

class HybridQuery implements PromiseLike<QueryResult> {
  private selection = '*';
  private filters: Filter[] = [];
  private orderings: Ordering[] = [];
  private rowLimit: number | null = null;
  private singleMode: 'none' | 'maybe' | 'single' = 'none';
  private signal: AbortSignal | undefined;

  constructor(private schemaName: string, private tableName: string) {}

  select(selection = '*') { this.selection = selection; return this; }
  eq(column: string, value: unknown) { this.filters.push({ kind: 'eq', column, value }); return this; }
  gt(column: string, value: unknown) { this.filters.push({ kind: 'gt', column, value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ kind: 'gte', column, value }); return this; }
  lt(column: string, value: unknown) { this.filters.push({ kind: 'lt', column, value }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ kind: 'lte', column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ kind: 'in', column, value }); return this; }
  ilike(column: string, value: string) { this.filters.push({ kind: 'ilike', column, value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderings.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'single'; return this; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }

  private online(): Promise<QueryResult> {
    let query: any = supabase.schema(this.schemaName).from(this.tableName).select(this.selection);
    for (const filter of this.filters) query = query[filter.kind](filter.column, filter.value);
    for (const ordering of this.orderings) query = query.order(ordering.column, { ascending: ordering.ascending });
    if (this.rowLimit != null) query = query.limit(this.rowLimit);
    if (this.singleMode === 'maybe') query = query.maybeSingle();
    else if (this.singleMode === 'single') query = query.single();
    if (this.signal) query = query.abortSignal(this.signal);
    return query;
  }

  private async execute(): Promise<QueryResult> {
    const rows = await readLocalTable(this.schemaName, this.tableName);
    if (rows === null) return this.online();
    let filtered = rows.filter((row) => this.filters.every((filter) => applyFilter(row, filter)));
    if (this.orderings.length) {
      filtered = [...filtered].sort((a, b) => {
        for (const ordering of this.orderings) {
          const left = comparable(a[ordering.column]);
          const right = comparable(b[ordering.column]);
          if (left === right) continue;
          const direction = left < right ? -1 : 1;
          return ordering.ascending ? direction : -direction;
        }
        return 0;
      });
    }
    if (this.rowLimit != null) filtered = filtered.slice(0, this.rowLimit);
    const projected = filtered.map((row) => projectRow(row, this.selection));
    if (this.singleMode === 'maybe') return { data: projected[0] ?? null, error: null };
    if (this.singleMode === 'single') {
      return projected.length === 1
        ? { data: projected[0], error: null }
        : { data: null, error: { message: `Expected one local ${this.schemaName}.${this.tableName} row.`, code: 'PGRST116' } };
    }
    return { data: projected, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function snippet(text: string, query: string): string {
  const normalized = text.toLocaleLowerCase();
  const at = normalized.indexOf(query.toLocaleLowerCase());
  if (at < 0) return text.slice(0, 180);
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + query.length + 70);
  return `${start ? '…' : ''}${text.slice(start, at)}{{{${text.slice(at, at + query.length)}}}}${text.slice(at + query.length, end)}${end < text.length ? '…' : ''}`;
}

async function localBibleRpc(functionName: string, args: Record<string, any>): Promise<{ found: boolean; data: unknown }> {
  const books = await readLocalTable('bible', 'books');
  if (books === null) return { found: false, data: null };
  const normalizedBooks: Record<string, unknown>[] = books.map((book) => ({
    ...book,
    book_order: book.book_order ?? book.source_number,
    aliases_json: book.aliases_json ?? book.aliases ?? [],
  }));
  if (functionName === 'get_bible_books') {
    return { found: true, data: normalizedBooks.filter((book) => book.toggled !== false).sort((a, b) => Number(a.book_order) - Number(b.book_order)) };
  }
  if (functionName === 'get_bible_chapter_list') {
    const verses = await readLocalTable('bible', 'verses') || [];
    const counts = new Map<number, number>();
    for (const verse of verses.filter((row) => row.book_key === args.p_book_key)) {
      const chapter = Number(verse.chapter_number);
      counts.set(chapter, (counts.get(chapter) || 0) + 1);
    }
    return { found: true, data: [...counts].sort(([a], [b]) => a - b).map(([chapter_number, verse_count]) => ({ chapter_number, verse_count })) };
  }
  if (functionName === 'get_book_key_by_calendar_number') {
    const book = normalizedBooks.find((row) => Number(row.calendar_number) === Number(args.p_calendar_number));
    return { found: true, data: book?.book_key ?? null };
  }
  if (functionName === 'get_verse_part_by_calendar') {
    const book = normalizedBooks.find((row) => Number(row.calendar_number) === Number(args.p_calendar_book_number));
    const parts = await readLocalTable('bible', 'verse_parts') || [];
    const part = parts.find((row) => row.book_key === book?.book_key
      && Number(row.chapter_number) === Number(args.p_chapter)
      && Number(row.verse_number) === Number(args.p_verse)
      && String(row.part_label) === String(args.p_part_label));
    return { found: true, data: part ? [part] : [] };
  }
  if (functionName === 'search_verses') {
    const verses = await readLocalTable('bible', 'verses') || [];
    const query = String(args.p_query || '').trim();
    const languages = (args.p_languages || ['english', 'english_nkjv', 'english_from_coptic', 'coptic', 'greek', 'arabic', 'arabic_from_coptic', 'french']) as string[];
    const selectedBooks = args.p_book_keys as string[] | null;
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches: any[] = verses.flatMap((verse): any[] => {
      const book = normalizedBooks.find((candidate) => candidate.book_key === verse.book_key);
      if (!book || (args.p_testament && book.testament !== args.p_testament) || (selectedBooks?.length && !selectedBooks.includes(String(verse.book_key)))) return [];
      const matched = languages.filter((language) => {
        const value = String(verse[language] || '').toLocaleLowerCase();
        const contains = (word: string) => args.p_prefix
          ? value.split(/\s+/).some((candidate) => candidate.startsWith(word))
          : value.includes(word);
        if (args.p_mode === 'phrase') return value.includes(query.toLocaleLowerCase());
        if (args.p_mode === 'any') return words.some(contains);
        return words.every(contains);
      });
      if (!matched.length) return [];
      const snippetNeedle = args.p_mode === 'phrase' ? query : words.find((word) => String(verse[matched[0]] || '').toLocaleLowerCase().includes(word)) || query;
      return [{ ...verse, ...book, matched_languages: matched,
        snippets: Object.fromEntries(matched.map((language) => [language, snippet(String(verse[language] || ''), snippetNeedle)])), rank: matched.length }];
    });
    matches.sort((a, b) => args.p_sort === 'canonical'
      ? Number(a.book_order) - Number(b.book_order) || Number(a.chapter_number) - Number(b.chapter_number) || Number(a.verse_number) - Number(b.verse_number)
      : Number(b.rank) - Number(a.rank));
    const total = matches.length;
    const offset = Number(args.p_offset) || 0;
    const limit = Number(args.p_limit) || 25;
    return { found: true, data: matches.slice(offset, offset + limit).map((row) => ({ ...row, total_count: total })) };
  }
  return { found: false, data: null };
}

class HybridRpc implements PromiseLike<QueryResult> {
  private signal: AbortSignal | undefined;
  constructor(private schemaName: string, private functionName: string, private args: Record<string, unknown>) {}
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }

  private async execute(): Promise<QueryResult> {
    const published = await readLocalRpc(this.schemaName, this.functionName, this.args);
    if (published.found) return { data: published.data, error: null };
    if (this.schemaName === 'calendar' && this.functionName === 'get_context_flags' && this.args.p_date) {
      const base = await readLocalRpc('calendar', 'get_context_flags', { p_date: this.args.p_date, p_extra_context: {} });
      if (base.found) return { data: { ...(base.data as Record<string, unknown> || {}), ...(this.args.p_extra_context as Record<string, unknown> || {}) }, error: null };
    }
    if (this.schemaName === 'bible' || ['get_bible_books', 'get_bible_chapter_list'].includes(this.functionName)) {
      const derived = await localBibleRpc(this.functionName, this.args);
      if (derived.found) return { data: derived.data, error: null };
    }
    const localResourceSchema = this.functionName === 'get_readings_for_date' ? 'calendar' : this.schemaName;
    if (await hasLocalSchema(localResourceSchema)) {
      return { data: null, error: { message: `Offline package does not contain ${this.schemaName}.${this.functionName}.`, code: 'CHC_OFFLINE_RPC_MISSING' } };
    }
    let query: any = supabase.schema(this.schemaName).rpc(this.functionName, this.args);
    if (this.signal) query = query.abortSignal(this.signal);
    return query;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected); }
}

function schemaClient(schemaName: string) {
  return {
    from: (tableName: string) => new HybridQuery(schemaName, tableName),
    rpc: (functionName: string, args: Record<string, unknown> = {}) => new HybridRpc(schemaName, functionName, args),
  };
}

export const contentDataClient: typeof supabase = {
  schema: (schemaName: string) => schemaClient(schemaName),
  from: (tableName: string) => new HybridQuery('public', tableName),
  rpc: (functionName: string, args: Record<string, unknown> = {}) => new HybridRpc('public', functionName, args),
} as unknown as typeof supabase;
