import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '@/components/chc/ui/Icon';
import MusicPlaylistPicker from '@/components/music/MusicPlaylistPicker';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type MusicQueueItem, useMusicPlayer } from '@/context/MusicPlayerContext';
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

  const close = () => setVisible(false);

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
          pressed && styles.pressed,
        ]}
      >
        <Icon name="ellipsis-horizontal" size={Math.round(size * 0.5)} color={COLORS.white} />
      </Pressable>

      <Modal
        animationType="fade"
        transparent
        visible={visible}
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close track options" style={styles.backdrop} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text numberOfLines={1} style={[styles.title, isArabic && styles.arabic]}>{item.track.title}</Text>
            {item.releaseTitle ? (
              <Text numberOfLines={1} style={[styles.subtitle, isArabic && styles.arabic]}>{item.releaseTitle}</Text>
            ) : null}

            <View style={styles.actions}>
              <ActionRow
                icon="share-outline"
                label={isArabic ? 'مشاركة' : 'Share'}
                onPress={() => void shareTrack()}
              />
              <MusicPlaylistPicker
                trackId={item.track.id}
                label={isArabic ? 'إضافة إلى قائمة تشغيل' : 'Add to playlist'}
                menuRow
                onOpen={close}
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
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  triggerHovered: { backgroundColor: 'rgba(255,255,255,0.10)' },
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
