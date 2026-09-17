export interface EditableLyricLine {
  id?: string;
  sequence: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
}

export interface ParsedLrcLine extends EditableLyricLine {
  sourceIndex: number;
}

const TIMESTAMP_RE = /\[(\d{1,}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;

function assertNonnegativeMilliseconds(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative finite millisecond value.`);
  }
}

function normalizeSequence(index: number): number {
  return index + 1;
}

export function parseLrcTimestamp(timestamp: string): number | null {
  const match = timestamp.trim().match(/^\[?(\d{1,}):([0-5]\d)(?:[.:](\d{1,3}))?\]?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number((match[3] || '0').padEnd(3, '0').slice(0, 3));

  return minutes * 60_000 + seconds * 1_000 + milliseconds;
}

export function formatLrcTimestamp(milliseconds: number): string {
  assertNonnegativeMilliseconds(milliseconds, 'milliseconds');

  const roundedMilliseconds = Math.round(milliseconds);
  const totalSeconds = Math.floor(roundedMilliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = roundedMilliseconds % 1_000;

  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`;
}

export function createLyricLinesFromText(text: string): EditableLyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      sequence: normalizeSequence(index),
      startMs: null,
      endMs: null,
      text: line,
    }));
}

export function renumberLyricLines<T extends EditableLyricLine>(lines: T[]): T[] {
  return lines.map((line, index) => ({
    ...line,
    sequence: normalizeSequence(index),
  }));
}

export function applyLyricLineTimestamp<T extends EditableLyricLine>(
  lines: T[],
  sequence: number,
  startMs: number,
): T[] {
  assertNonnegativeMilliseconds(startMs, 'startMs');

  return lines.map((line) => (
    line.sequence === sequence
      ? { ...line, startMs }
      : line
  ));
}

export function parseLrc(lrc: string): ParsedLrcLine[] {
  const parsed: Array<Omit<ParsedLrcLine, 'sequence' | 'startMs'> & { startMs: number }> = [];

  lrc.split(/\r?\n/).forEach((rawLine, sourceIndex) => {
    const timestamps = [...rawLine.matchAll(TIMESTAMP_RE)];
    if (!timestamps.length) return;

    const text = rawLine.replace(TIMESTAMP_RE, '').trim();
    if (!text) return;

    timestamps.forEach((timestamp) => {
      const startMs = parseLrcTimestamp(timestamp[0]);
      if (startMs === null) return;
      parsed.push({
        sourceIndex,
        startMs,
        endMs: null,
        text,
      });
    });
  });

  return parsed
    .sort((a, b) => a.startMs - b.startMs || a.sourceIndex - b.sourceIndex)
    .map((line, index) => ({
      ...line,
      sequence: normalizeSequence(index),
    }));
}

export function formatLrc(lines: readonly EditableLyricLine[]): string {
  return [...lines]
    .filter((line): line is EditableLyricLine & { startMs: number } => line.startMs !== null)
    .sort((a, b) => a.startMs - b.startMs || a.sequence - b.sequence)
    .map((line) => `${formatLrcTimestamp(line.startMs)}${line.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export function getLyricLineWindow(
  lines: readonly EditableLyricLine[],
  index: number,
): { startMs: number; endMs: number | null } | null {
  const line = lines[index];
  if (!line || line.startMs === null) return null;

  const nextStartedLine = lines
    .slice(index + 1)
    .find((candidate) => candidate.startMs !== null);

  return {
    startMs: line.startMs,
    endMs: line.endMs ?? nextStartedLine?.startMs ?? null,
  };
}

export function findActiveLyricLineIndex(
  lines: readonly EditableLyricLine[],
  positionMs: number,
): number {
  assertNonnegativeMilliseconds(positionMs, 'positionMs');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const window = getLyricLineWindow(lines, index);
    if (!window || positionMs < window.startMs) continue;
    if (window.endMs !== null && positionMs >= window.endMs) continue;
    return index;
  }

  return -1;
}

export function getActiveLyricLine<T extends EditableLyricLine>(
  lines: readonly T[],
  positionMs: number,
): T | null {
  const activeIndex = findActiveLyricLineIndex(lines, positionMs);
  return activeIndex >= 0 ? lines[activeIndex] : null;
}
