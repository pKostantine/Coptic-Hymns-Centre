import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SHADOWS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { getBookAppearance } from '../../../constants/bookAppearance';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import Icon from './Icon';

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicNumbers(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

interface CategoryCardProps {
  /** Which book this is, so the card can pick up its icon and accent. */
  categoryId?: string;
  title: string;
  arabic?: string;
  /** A short line under the title describing what the book holds, in the language being shown. */
  subtitle?: string;
  onPress?: () => void;
  /** Both default true — the main menu's App Language setting passes only one of these, so the card shows a single title instead of the normal bilingual pair. */
  showEnglish?: boolean;
  showArabic?: boolean;
  downloadStatus?: string;
  downloadProgress?: number;
  onDownloadPress?: () => void;
}

/** Book-menu text never grows past this multiple of its design size. */
const MAX_FONT_SCALE = 1.35;

/**
 * The download states worth a line of words. Downloading says it with its
 * progress bar, and the two resting states — never downloaded, and installed —
 * are already what the button's own icon shows.
 */
const DOWNLOAD_STATUS_TEXT: Record<string, string> = {
  paused: 'Paused',
  update_available: 'Update available',
  failed: "Couldn't download",
};

/**
 * A book on the Books menu: its own icon in an accent chip, the title with a
 * short description beneath, an optional download control, and a chevron.
 *
 * The text is aligned to the reading edge rather than centred. Centring it
 * inside a row that already has an icon on one side and a chevron on the other
 * left every title floating at a different optical position, which is most of
 * what made the old menu look unconsidered. When only Arabic is shown the whole
 * card mirrors, so the reading edge is the right one.
 */
export default function CategoryCard({
  categoryId,
  title,
  arabic,
  subtitle,
  onPress,
  showEnglish = true,
  showArabic: showArabicProp = true,
  downloadStatus,
  downloadProgress = 0,
  onDownloadPress,
}: CategoryCardProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const arabicOnly = showArabic && !showEnglish;
  const appearance = getBookAppearance(categoryId ?? '');
  const installed = downloadStatus === 'installed';
  const downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
  const failed = downloadStatus === 'failed';
  const statusText = downloadStatus ? DOWNLOAD_STATUS_TEXT[downloadStatus] : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, SHADOWS.card, arabicOnly && styles.mirrored, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: appearance.accentSoft, borderColor: appearance.accentLine }]}>
        <Icon name={appearance.icon} size={22} color={appearance.accent} />
      </View>

      <View style={styles.content}>
        {showEnglish ? (
          <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {formatEnglishDisplayText(title)}
          </Text>
        ) : null}
        {showArabic ? (
          <Text style={[styles.title, styles.arabicTitle]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {formatArabicNumbers(arabic!)}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[styles.subtitle, arabicOnly && styles.arabicSubtitle]}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {subtitle}
          </Text>
        ) : null}
        {downloading ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(3, Math.round(downloadProgress * 100))}%`, backgroundColor: appearance.accent },
              ]}
            />
          </View>
        ) : null}
        {statusText ? (
          <Text
            style={[styles.downloadStatus, failed && styles.downloadFailed, arabicOnly && styles.arabicSubtitle]}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {statusText}
          </Text>
        ) : null}
      </View>

      {onDownloadPress ? (
        <Pressable
          accessibilityLabel={`${installed ? 'Manage' : 'Download'} ${title}`}
          hitSlop={8}
          style={[styles.downloadButton, installed && { borderColor: appearance.accentLine, backgroundColor: appearance.accentSoft }]}
          onPress={(event) => { event.stopPropagation(); onDownloadPress(); }}
        >
          <Icon
            name={installed ? 'checkmark' : downloading ? 'pause' : 'download-outline'}
            size={18}
            color={installed ? appearance.accent : failed ? COLORS.priest : COLORS.muted}
          />
        </Pressable>
      ) : null}

      <Icon name={arabicOnly ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.cardLine,
    borderRadius: RADII.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 10,
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  cardPressed: { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.goldLine },
  mirrored: { flexDirection: 'row-reverse' },
  content: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 17,
    fontWeight: '700',
  },
  arabicTitle: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  arabicSubtitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  iconWrap: {
    alignItems: 'center',
    borderRadius: RADII.md - 2,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  downloadButton: {
    alignItems: 'center',
    borderColor: COLORS.cardLine,
    borderRadius: RADII.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  progressTrack: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: RADII.pill,
    height: 3,
    marginTop: SPACING.xs,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { borderRadius: RADII.pill, height: 3 },
  downloadStatus: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 11.5,
    marginTop: 2,
  },
  downloadFailed: { color: COLORS.priest },
});
