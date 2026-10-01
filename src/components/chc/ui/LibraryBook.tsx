'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { appText } from '../../../utils/appText';
import Icon from './Icon';
import { BuddedCross } from './Ornaments';

/** Book text never grows past this multiple of its design size, so large accessibility text keeps the shelf intact. */
const MAX_FONT_SCALE = 1.3;

/** Download states worth words; the button's own icon already says "not downloaded", "installed" and "downloading". */
const STATUS_TEXT: Record<string, { english: string; arabic: string; french?: string }> = {
  paused: { english: 'Download paused', arabic: 'التنزيل متوقف', french: 'Téléchargement en pause' },
  update_available: { english: 'Update available', arabic: 'يوجد تحديث', french: 'Mise à jour disponible' },
  failed: { english: "Couldn't download", arabic: 'تعذّر التنزيل', french: 'Échec du téléchargement' },
};

interface LibraryBookProps {
  title: string;
  description: string;
  arabic: boolean;
  /** A row across the shelf (Agpeya, Bible, Holy Week) rather than a tile. */
  wide?: boolean;
  onPress: () => void;
  downloadStatus?: string;
  downloadProgress?: number;
  onDownloadPress?: () => void;
}

/**
 * A book in the Books library (CHC design, "Library"): the budded cross in a
 * gold medallion, the book's name and what it holds. Most books are tiles two
 * to a row; the last are rows across the shelf with a chevron. The whole card
 * is one tap target lying behind the text, and the download control sits beside
 * it rather than inside it, so no button is ever nested in another (invalid on
 * web).
 */
export default function LibraryBook({
  title,
  description,
  arabic,
  wide = false,
  onPress,
  downloadStatus,
  downloadProgress = 0,
  onDownloadPress,
}: LibraryBookProps) {
  const installed = downloadStatus === 'installed';
  const downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
  const failed = downloadStatus === 'failed';
  const updatable = downloadStatus === 'update_available';
  const status = downloadStatus ? STATUS_TEXT[downloadStatus] : undefined;

  const download = onDownloadPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${installed ? 'Manage download' : downloading ? 'Pause download' : 'Download'}: ${title}`}
      hitSlop={10}
      onPress={(event) => { event.stopPropagation(); onDownloadPress(); }}
      style={[styles.download, wide ? null : arabic ? styles.downloadCornerLeft : styles.downloadCornerRight, (installed || updatable) && styles.downloadActive]}
    >
      <Icon
        name={installed ? 'checkmark' : downloading ? 'pause' : 'download-outline'}
        size={13}
        color={installed || updatable ? COLORS.gold : failed ? COLORS.priest : 'rgba(255, 255, 255, 0.75)'}
      />
    </Pressable>
  ) : null;

  return (
    <View style={[styles.book, wide ? styles.bookWide : styles.bookTile]}>
      <LinearGradient colors={[COLORS.surfaceDeep, COLORS.surface]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${description}`}
        onPress={onPress}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
      />

      <View style={[styles.content, wide && styles.contentWide, wide && arabic && styles.rowReverse]} pointerEvents="box-none">
        <View style={[styles.medallion, wide && styles.medallionWide]} pointerEvents="none">
          <BuddedCross size={wide ? 26 : 32} />
        </View>
        <View style={[wide && styles.wideText]} pointerEvents="none">
          <Text
            style={[styles.title, wide && styles.titleWide, arabic && styles.arabicTitle, arabic && wide && styles.alignRight]}
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {title}
          </Text>
          <Text
            style={[styles.description, !wide && styles.centered, arabic && styles.arabicText, arabic && wide && styles.alignRight]}
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {status ? appText(status) : description}
          </Text>
        </View>
        {wide ? download : null}
        {wide ? <Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.gold} /> : null}
      </View>
      {wide ? null : download}

      {downloading ? (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${Math.max(4, Math.round(downloadProgress * 100))}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  book: { borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  bookTile: { flex: 1 },
  bookWide: { flex: 1 },
  pressed: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  rowReverse: { flexDirection: 'row-reverse' },
  content: { alignItems: 'center', paddingBottom: 18, paddingHorizontal: 14, paddingTop: 20 },
  contentWide: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
  wideText: { flex: 1, minWidth: 0 },
  medallion: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: 'rgba(227, 181, 59, 0.35)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  medallionWide: { borderRadius: 20, height: 40, width: 40 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  titleWide: { marginTop: 0, textAlign: 'left' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  centered: { textAlign: 'center' },
  alignRight: { textAlign: 'right' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  download: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  downloadCornerRight: { position: 'absolute', right: 10, top: 10 },
  downloadCornerLeft: { left: 10, position: 'absolute', top: 10 },
  downloadActive: { borderColor: COLORS.goldLine },
  progressTrack: { backgroundColor: 'rgba(255, 255, 255, 0.08)', bottom: 0, height: 3, left: 0, position: 'absolute', right: 0 },
  progressFill: { backgroundColor: COLORS.gold, height: 3 },
});
