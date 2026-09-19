import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { PublishedLyricSet } from '@/types/musicConsumer';

export function lyricSetLabel(set: PublishedLyricSet): string {
  const localeNames: Record<string, string> = { en: 'English', ar: 'Arabic', cop: 'Coptic', fr: 'French' };
  const base = localeNames[set.locale] ?? set.locale.toUpperCase();
  if (set.kind === 'transliteration') return `${base} Transliteration`;
  if (set.kind === 'translation') return `${base} Translation`;
  return base;
}

interface MusicLyricsViewProps {
  lyricSets: PublishedLyricSet[];
  selectedSetId: string | null;
  onSelectSet: (id: string) => void;
  activeLineId: string | null;
  loading: boolean;
  onSeekLine: (startMs: number) => void;
  /** `fullscreen` uses large centred type for reading from a distance. */
  variant?: 'panel' | 'fullscreen';
  style?: StyleProp<ViewStyle>;
}

/**
 * Language tabs plus the synchronized lines. Owns its own scroll view so it
 * can keep the active line in view without moving the rest of the page.
 */
export default function MusicLyricsView({
  lyricSets,
  selectedSetId,
  onSelectSet,
  activeLineId,
  loading,
  onSeekLine,
  variant = 'panel',
  style,
}: MusicLyricsViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef(new Map<string, number>());
  const viewportHeight = useRef(0);
  const fullscreen = variant === 'fullscreen';
  const selectedSet = lyricSets.find((set) => set.id === selectedSetId) ?? null;
  const rtl = selectedSet?.locale === 'ar';

  useEffect(() => {
    lineOffsets.current.clear();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [selectedSetId]);

  useEffect(() => {
    if (!activeLineId) return;
    const y = lineOffsets.current.get(activeLineId);
    if (y == null) return;
    // Hold the active line a little above centre, where the eye reads.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - viewportHeight.current * 0.35), animated: true });
  }, [activeLineId]);

  return (
    <View style={[styles.root, style]}>
      {lyricSets.length > 1 ? (
        <View style={[styles.tabs, fullscreen && styles.tabsFullscreen]}>
          {lyricSets.map((set) => {
            const selected = set.id === selectedSetId;
            return (
              <Pressable
                key={set.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onSelectSet(set.id)}
                style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={[styles.tabText, selected && styles.tabTextActive]}>{lyricSetLabel(set)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, fullscreen && styles.contentFullscreen]}
        showsVerticalScrollIndicator={!fullscreen}
        nestedScrollEnabled
        onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; }}
      >
        {loading && !selectedSet ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}

        {selectedSet ? (
          <View style={rtl ? styles.rtl : undefined}>
            {selectedSet.lines.map((line) => {
              const active = line.id === activeLineId;
              return (
                <Pressable
                  key={line.id}
                  disabled={line.startMs == null}
                  onLayout={(event) => lineOffsets.current.set(line.id, event.nativeEvent.layout.y)}
                  onPress={() => line.startMs != null && onSeekLine(line.startMs)}
                  style={({ pressed }) => [styles.line, pressed && styles.pressed]}
                >
                  <Text
                    style={[
                      styles.lineText,
                      fullscreen && styles.lineTextFullscreen,
                      selectedSet.locale === 'ar' && styles.arabic,
                      selectedSet.locale === 'cop' && styles.coptic,
                      active && styles.lineTextActive,
                      active && fullscreen && styles.lineTextActiveFullscreen,
                    ]}
                  >
                    {line.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : !loading ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, fullscreen && styles.emptyTitleFullscreen]}>No lyrics yet</Text>
            <Text style={styles.emptyBody}>This recording can still be played normally.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: 4,
    borderRadius: RADII.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabsFullscreen: { alignSelf: 'center', minWidth: 360 },
  tab: { flex: 1, minHeight: 34, paddingHorizontal: 10, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: COLORS.gold },
  tabText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: COLORS.black },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.md + 4, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  // Generous top/bottom space so the first and last lines can still scroll to
  // the reading position.
  contentFullscreen: { paddingHorizontal: SPACING.lg, paddingTop: 80, paddingBottom: 240, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  loader: { marginTop: SPACING.xl },
  rtl: { direction: 'rtl' } as ViewStyle,
  line: { paddingVertical: 7, borderRadius: 8 },
  lineText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 20, lineHeight: 30, fontWeight: '600', opacity: 0.55 },
  lineTextFullscreen: { fontSize: 40, lineHeight: 56, textAlign: 'center', opacity: 0.38 },
  lineTextActive: { color: COLORS.white, opacity: 1 },
  lineTextActiveFullscreen: { fontSize: 46, lineHeight: 62 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  coptic: { fontFamily: TYPOGRAPHY.coptic },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.md },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  emptyTitleFullscreen: { fontSize: 28 },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: SPACING.sm, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
