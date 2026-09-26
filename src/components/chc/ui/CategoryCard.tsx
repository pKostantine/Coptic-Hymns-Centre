import Icon from './Icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SHADOWS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { formatEnglishDisplayText } from '../../../utils/displayText';

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicNumbers(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

interface CategoryCardProps {
  title: string;
  arabic?: string;
  /** A short line under the title describing what the book holds, in the language being shown. */
  subtitle?: string;
  onPress?: () => void;
  /** Both default true — the main menu's App Language setting passes only one of these, so the card shows a single centered title instead of the normal bilingual pair. */
  showEnglish?: boolean;
  showArabic?: boolean;
  downloadStatus?: string;
  downloadProgress?: number;
  onDownloadPress?: () => void;
}

/** Book-menu text never grows past this multiple of its design size. */
const MAX_FONT_SCALE = 1.35;

/** CHC CategoryCard — Books menu row: a gold book chip, the title with a short description under it, the download control and a chevron. Mirrors when only Arabic shows. */
export default function CategoryCard({ title, arabic, subtitle, onPress, showEnglish = true, showArabic: showArabicProp = true, downloadStatus, downloadProgress = 0, onDownloadPress }: CategoryCardProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const showEnglishTitle = showEnglish;
  const arabicOnly = showArabic && !showEnglishTitle;

  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.card, SHADOWS.card, arabicOnly && styles.mirrored, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Icon name="book" size={22} color={COLORS.gold} />
      </View>
      <View style={styles.content}>
        <View style={[styles.titleTable, arabicOnly && styles.mirrored]}>
          {showEnglishTitle ? (
            <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatEnglishDisplayText(title)}</Text>
          ) : null}
          {showArabic ? (
            <Text style={[styles.title, styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatArabicNumbers(arabic!)}</Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, arabicOnly && styles.arabicSubtitle]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{subtitle}</Text>
        ) : null}
        {/* Not-downloaded is the resting state the download button already shows; only a status worth reading gets a line. */}
        {downloadStatus && downloadStatus !== 'not_downloaded' ? <Text style={[styles.downloadStatus, arabicOnly && styles.arabicSubtitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{downloadStatus === 'downloading' ? `Downloading ${Math.round(downloadProgress * 100)}%` : downloadStatus.replaceAll('_', ' ')}</Text> : null}
      </View>
      {onDownloadPress ? (
        <Pressable
          accessibilityLabel={`${downloadStatus === 'installed' ? 'Manage' : 'Download'} ${title}`}
          hitSlop={8}
          style={styles.downloadButton}
          onPress={(event) => { event.stopPropagation(); onDownloadPress(); }}
        >
          <Icon name={downloadStatus === 'installed' ? 'checkmark' : downloadStatus === 'downloading' ? 'pause' : 'download-outline'} size={20} color={COLORS.gold} />
        </Pressable>
      ) : null}
      <Icon name={arabicOnly ? 'chevron-back' : 'chevron-forward'} size={20} color={COLORS.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.cardLine,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardPressed: { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.goldLine },
  mirrored: { flexDirection: 'row-reverse' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 3 },
  arabicSubtitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  content: { flex: 1 },
  downloadButton: { alignItems: 'center', borderColor: COLORS.goldLine, borderRadius: 18, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  downloadStatus: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: 'rgba(201, 162, 39, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  title: {
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0,
    color: COLORS.white,
  },
  arabicTitle: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  titleTable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
