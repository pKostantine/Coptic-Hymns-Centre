import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookTheme } from '../../../constants/bookTheme';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import CopticCross from './CopticCross';
import Icon from './Icon';

/** Book-menu text never grows past this multiple of its design size, so large accessibility text keeps the shelf intact. */
const MAX_FONT_SCALE = 1.3;

/** Download states worth words; the button's own icon already says "not downloaded", "installed" and "downloading". */
const STATUS_TEXT: Record<string, { english: string; arabic: string }> = {
  paused: { english: 'Download paused', arabic: 'التنزيل متوقف' },
  update_available: { english: 'Update available', arabic: 'يوجد تحديث' },
  failed: { english: "Couldn't download", arabic: 'تعذّر التنزيل' },
};

interface BookCoverProps {
  title: string;
  description: string;
  theme: BookTheme;
  /** True when the app is in Arabic: Arabic type, and the cover reads right to left. */
  arabic: boolean;
  /** A cover that spans the whole shelf (the odd one out at the end) is shorter and wider. */
  wide?: boolean;
  /** A small line above a wide cover's title (Holy Week's "Pascha"). */
  overline?: string;
  onPress: () => void;
  downloadStatus?: string;
  downloadProgress?: number;
  onDownloadPress?: () => void;
}

/**
 * A book on the Books shelf: a tall cover in the book's own jewel colour,
 * with a hairline frame set in from the edge like a tooled binding and the
 * Coptic cross pressed faintly into its foot. The title and what the book
 * holds sit at the head of the cover; the download control at its foot.
 */
export default function BookCover({
  title,
  description,
  theme,
  arabic,
  wide = false,
  overline,
  onPress,
  downloadStatus,
  downloadProgress = 0,
  onDownloadPress,
}: BookCoverProps) {
  const installed = downloadStatus === 'installed';
  const downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
  const failed = downloadStatus === 'failed';
  const updatable = downloadStatus === 'update_available';
  const status = downloadStatus ? STATUS_TEXT[downloadStatus] : undefined;

  // The cover is a plain board: one full-size tap target lies behind the
  // text, and the download control sits beside it rather than inside it, so
  // no button is ever nested in another (invalid on web).
  return (
    <View style={[styles.cover, wide ? styles.coverWide : styles.coverTall]}>
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={wide ? { x: 1, y: 0.6 } : { x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.frame, overline ? { borderColor: `${theme.accent}59` } : null]} pointerEvents="none" />
      <View style={[styles.watermark, wide ? styles.watermarkWide : null, arabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
        <CopticCross size={wide ? 150 : 124} color={overline ? `${theme.accent}24` : 'rgba(255, 255, 255, 0.1)'} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${description}`}
        onPress={onPress}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
      />

      <View style={[styles.content, wide && styles.contentWide]} pointerEvents="none">
        {overline ? (
          <Text style={[styles.overline, { color: theme.accent }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{overline}</Text>
        ) : null}
        <Text
          style={[styles.title, wide && styles.titleWide, arabic && styles.arabicTitle]}
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {title}
        </Text>
        <Text style={[styles.description, arabic && styles.arabicText]} numberOfLines={3} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {description}
        </Text>
      </View>

      {status || onDownloadPress ? (
        <View style={[styles.foot, arabic && styles.rowReverse]} pointerEvents="box-none">
          {status ? (
            <View style={styles.statusWrap} pointerEvents="none">
              <Text style={[styles.status, failed && styles.statusFailed, arabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {arabic ? status.arabic : status.english}
              </Text>
            </View>
          ) : <View pointerEvents="none" />}
          {onDownloadPress ? (
            <Pressable
              accessibilityLabel={`${installed ? 'Manage download' : downloading ? 'Pause download' : 'Download'}: ${title}`}
              hitSlop={10}
              onPress={(event) => { event.stopPropagation(); onDownloadPress(); }}
              style={[styles.download, (installed || updatable) && styles.downloadActive]}
            >
              <Icon
                name={installed ? 'checkmark' : downloading ? 'pause' : 'download-outline'}
                size={14}
                color={installed || updatable ? COLORS.gold : failed ? COLORS.priest : 'rgba(255, 255, 255, 0.8)'}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {downloading ? (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${Math.max(4, Math.round(downloadProgress * 100))}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const FRAME_INSET = 8;

const styles = StyleSheet.create({
  cover: {
    borderRadius: 18,
    flex: 1,
    overflow: 'hidden',
    // A lit top edge, as if the board caught the light.
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    borderTopWidth: 1,
  },
  coverTall: { minHeight: 204 },
  coverWide: { minHeight: 124 },
  // Pressing darkens the whole board a touch.
  pressed: { backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  // The tooled border: a hairline set in from the edge of the board.
  frame: {
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
    borderWidth: 1,
    bottom: FRAME_INSET,
    left: FRAME_INSET,
    position: 'absolute',
    right: FRAME_INSET,
    top: FRAME_INSET,
  },
  watermark: { bottom: -26, position: 'absolute' },
  watermarkWide: { bottom: -40 },
  watermarkRight: { right: -26 },
  watermarkLeft: { left: -26 },
  rowReverse: { flexDirection: 'row-reverse' },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 22 },
  contentWide: { justifyContent: 'center', paddingBottom: 18, paddingTop: 18 },
  overline: { fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 4 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  titleWide: { fontSize: 24, lineHeight: 28 },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  description: { color: 'rgba(255, 255, 255, 0.78)', fontFamily: TYPOGRAPHY.body, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  foot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  statusWrap: { flexShrink: 1 },
  status: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '700' },
  statusFailed: { color: COLORS.priest },
  download: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  downloadActive: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine },
  progressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    bottom: FRAME_INSET + 6,
    height: 3,
    left: FRAME_INSET + 14,
    overflow: 'hidden',
    position: 'absolute',
    right: FRAME_INSET + 50,
  },
  progressFill: { backgroundColor: COLORS.gold, borderRadius: 999, height: 3 },
});
