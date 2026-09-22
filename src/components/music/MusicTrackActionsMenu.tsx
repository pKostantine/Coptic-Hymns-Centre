import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon, { type IconName } from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicPlaylistPicker from '@/components/music/MusicPlaylistPicker';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type MusicQueueItem, useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import { musicTrackDownloadRequest } from '@/services/offlineDownloadRequests';
import { publicShareUrl } from '@/utils/publicUrl';
import { shareLink } from '@/utils/shareLink';

interface MusicTrackActionsMenuProps {
  item: MusicQueueItem;
  isArabic?: boolean;
  size?: number;
}

export default function MusicTrackActionsMenu({
  item,
  isArabic = false,
  size = 36,
}: MusicTrackActionsMenuProps) {
  const [visible, setVisible] = useState(false);
  const { addNext, addToEnd } = useMusicPlayer();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const downloadRequest = useMemo(() => musicTrackDownloadRequest({
    track: item.track,
    locale,
    releaseTitle: item.releaseTitle,
    coverAsset: item.coverAsset,
  }), [item.coverAsset, item.releaseTitle, item.track, locale]);

  const close = () => setVisible(false);

  const prepareDownload = useCallback(async () => {
    let lyrics = null;
    try {
      lyrics = await musicService.getLyrics(item.track.id, locale);
    } catch {
      // Lyrics are useful offline metadata, but the audio download can proceed without them.
    }
    return musicTrackDownloadRequest({
      track: item.track,
      locale,
      releaseTitle: item.releaseTitle,
      coverAsset: item.coverAsset,
      lyrics,
    });
  }, [item.coverAsset, item.releaseTitle, item.track, locale]);

  const shareTrack = async () => {
    close();
    await shareLink({
      title: item.track.title,
      text: item.releaseTitle
        ? `${item.track.title} — ${item.releaseTitle}`
        : item.track.title,
      url: publicShareUrl(
        `/share/music/track/${item.track.id}`,
        item.coverAsset?.id,
      ),
    });
  };

  const addTrackNext = () => {
    addNext(item);
    close();
  };

  const addTrackToEnd = () => {
    addToEnd(item);
    close();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isArabic ? 'خيارات المقطع' : 'Track options'}
        hitSlop={4}
        onPress={(event) => {
          event.stopPropagation();
          setVisible(true);
        }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.trigger,
          { width: size, height: size, borderRadius: size / 2 },
          hovered && styles.triggerHovered,
          pressed && styles.triggerPressed,
        ]}
      >
        <Icon name="ellipsis-vertical" size={Math.max(20, Math.round(size * 0.56))} color={COLORS.muted} />
      </Pressable>

      {visible ? (
      <Modal
        animationType="fade"
        transparent
        visible
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close track options" style={styles.backdrop} onPress={close} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <MusicArtwork asset={item.coverAsset} size={52} radius={6} label={item.releaseTitle ?? item.track.title} />
              <View style={styles.sheetHeaderText}>
                <Text numberOfLines={1} style={[styles.title, isArabic && styles.arabic]}>{item.track.title}</Text>
                {item.releaseTitle ? (
                  <Text numberOfLines={1} style={[styles.subtitle, isArabic && styles.arabic]}>{item.releaseTitle}</Text>
                ) : null}
              </View>
              <Pressable accessibilityLabel={isArabic ? 'إغلاق' : 'Close'} onPress={close} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Icon name="close" size={20} color={COLORS.muted} />
              </Pressable>
            </View>

            <View style={styles.actions}>
              {Platform.OS !== 'web' ? (
                <MusicDownloadButton
                  packageKey={downloadRequest.packageKey}
                  request={prepareDownload}
                  isArabic={isArabic}
                  menuRow
                  onAction={close}
                />
              ) : null}
              <MusicPlaylistPicker
                trackId={item.track.id}
                label={isArabic ? 'إضافة إلى قائمة تشغيل' : 'Add to playlist'}
                menuRow
                onDismiss={close}
              />
              <ActionRow
                icon="play-skip-forward"
                label={isArabic ? 'تشغيل تالياً' : 'Add next'}
                onPress={addTrackNext}
              />
              <ActionRow
                icon="list-outline"
                label={isArabic ? 'إضافة إلى نهاية قائمة الانتظار' : 'Add to end of queue'}
                onPress={addTrackToEnd}
              />
              <ActionRow
                icon="share-outline"
                label={isArabic ? 'مشاركة' : 'Share'}
                onPress={() => void shareTrack()}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      ) : null}
    </>
  );
}

function ActionRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}
    >
      <Icon name={icon} size={20} color={COLORS.goldBright} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 1,
  },
  triggerHovered: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine },
  triggerPressed: { backgroundColor: COLORS.goldSoft, opacity: 0.78 },
  pressed: { opacity: 0.7 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
    backgroundColor: COLORS.black,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: 9,
    marginBottom: SPACING.md,
  },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  sheetHeaderText: { flex: 1, minWidth: 0 },
  closeButton: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  title: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12,
    marginTop: 3,
  },
  actions: {
    marginTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.xs,
  },
  actionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 10,
  },
  actionPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  actionText: {
    flex: 1,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 15,
    fontWeight: '700',
  },
  arabic: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
