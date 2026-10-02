'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import Icon, { type IconName } from '@/components/vine/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { downloadManager } from '@/services/downloadManager';
import type { OfflineDownloadProgress, OfflineDownloadRequest } from '@/types/offlineDownloads';

import { tr } from '../../utils/appText';
type DownloadTheme = 'music' | 'learning';

export interface OfflineDownloadButtonProps {
  packageKey: string;
  request: OfflineDownloadRequest | (() => Promise<OfflineDownloadRequest>);
  theme: DownloadTheme;
  isArabic?: boolean;
  compact?: boolean;
  menuRow?: boolean;
  label?: string;
  style?: ViewStyle;
  onAction?: () => void;
}

function percentage(progress: number): string {
  return `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
}

export default function OfflineDownloadButton(props: OfflineDownloadButtonProps) {
  if (Platform.OS === 'web') return null;
  return <NativeOfflineDownloadButton {...props} />;
}

function NativeOfflineDownloadButton({
  packageKey,
  request,
  theme,
  isArabic = false,
  compact = false,
  menuRow = false,
  label,
  style,
  onAction,
}: OfflineDownloadButtonProps) {
  const revision = useSyncExternalStore(
    downloadManager.subscribe,
    downloadManager.getRevision,
    downloadManager.getRevision,
  );
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  const prepare = useCallback(
    async () => typeof request === 'function' ? request() : request,
    [request],
  );

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      try {
        const value = await downloadManager.getProgress(packageKey);
        if (!active) return;

        setStorageAvailable(true);
        setProgress(value);

        if (value?.status === 'complete') {
          try {
            setUpdateAvailable(await downloadManager.checkForUpdate(await prepare()));
          } catch {
            if (active) setUpdateAvailable(false);
          }
        } else {
          setUpdateAvailable(false);
        }
      } catch {
        // Offline storage is optional UI. A damaged/unavailable local database
        // must never take down Music, Learn & Study, or an authenticated
        // Library screen while download state is being restored.
        if (!active) return;
        setProgress(null);
        setUpdateAvailable(false);
        setStorageAvailable(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [packageKey, prepare]);

  useEffect(() => refresh(), [refresh, revision]);

  const action = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (progress?.status === 'complete' && updateAvailable) {
        await downloadManager.update(await prepare());
        setUpdateAvailable(false);
        onAction?.();
        return;
      }

      if (progress?.status === 'complete') {
        Alert.alert(
          tr('Remove download?', 'Supprimer le téléchargement ?', 'إزالة التنزيل؟'),
          tr('The saved offline copy will be removed from this device.', 'La copie hors ligne enregistrée sera supprimée de cet appareil.', 'سيتم حذف النسخة المحفوظة من هذا الجهاز.'),
          [
            { text: tr('Cancel', 'Annuler', 'إلغاء'), style: 'cancel' },
            {
              text: tr('Remove', 'Retirer', 'إزالة'),
              style: 'destructive',
              onPress: () => {
                void downloadManager.remove(packageKey);
              },
            },
          ],
        );
        onAction?.();
        return;
      }

      if (progress?.status === 'downloading' || progress?.status === 'queued') {
        await downloadManager.pause(packageKey);
        onAction?.();
        return;
      }

      if (progress?.status === 'paused') {
        await downloadManager.resume(packageKey);
        onAction?.();
        return;
      }

      if (progress?.status === 'failed' || progress?.status === 'cancelled') {
        await downloadManager.retry(packageKey);
        onAction?.();
        return;
      }

      await downloadManager.enqueue(await prepare());
      setStorageAvailable(true);
      onAction?.();
    } catch (cause) {
      Alert.alert(
        tr('Download unavailable', 'Téléchargement indisponible', 'تعذر التنزيل'),
        cause instanceof Error
          ? cause.message
          : (tr('Unable to start this download.', 'Impossible de lancer ce téléchargement.', 'تعذر بدء التنزيل.')),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, isArabic, onAction, packageKey, prepare, progress, updateAvailable]);

  if (!storageAvailable) return null;

  const active = progress?.status === 'downloading' || progress?.status === 'queued';
  const failed = progress?.status === 'failed' || progress?.status === 'cancelled';
  const text = progress?.status === 'complete'
    ? (updateAvailable ? (tr('Update', 'Mettre à jour', 'تحديث')) : (tr('Downloaded', 'Téléchargé', 'تم التنزيل')))
    : active
      ? `${tr('Downloading', 'Téléchargement', 'تنزيل')} ${percentage(progress?.progress ?? 0)}`
      : progress?.status === 'paused'
        ? (tr('Resume', 'Reprendre', 'متوقف مؤقتًا'))
        : failed
          ? (tr('Retry', 'Réessayer', 'إعادة المحاولة'))
          : label ?? (tr('Download', 'Télécharger', 'تنزيل'));

  const accent = theme === 'learning' ? COLORS.learningBright : COLORS.goldBright;
  const soft = theme === 'learning' ? COLORS.learningSoft : COLORS.goldSoft;
  const line = theme === 'learning' ? COLORS.learningLine : COLORS.goldLine;

  if (menuRow) {
    const removing = progress?.status === 'complete' && !updateAvailable;
    const menuText = removing
      ? (tr('Remove download', 'Supprimer le téléchargement', 'إزالة التنزيل'))
      : text;
    const menuDetail = updateAvailable
      ? (tr('A newer version is available', 'Une version plus récente est disponible', 'يتوفر إصدار أحدث'))
      : removing
        ? (tr('Delete the offline copy from this device', 'Supprimer la copie hors ligne de cet appareil', 'حذف النسخة المحفوظة من هذا الجهاز'))
        : active
          ? (tr('Tap to pause', 'Touchez pour mettre en pause', 'اضغط للإيقاف المؤقت'))
          : progress?.status === 'paused'
            ? (tr('Continue this download', 'Poursuivre ce téléchargement', 'متابعة التنزيل'))
            : failed
              ? (tr('Try downloading again', 'Réessayer le téléchargement', 'حاول التنزيل مرة أخرى'))
              : (tr('Save for offline listening', 'Enregistrer pour l’écoute hors ligne', 'الحفظ للاستماع بلا اتصال'));
    const menuIcon: IconName = updateAvailable
      ? 'repeat'
      : removing
        ? 'trash-outline'
        : active
          ? 'pause'
          : progress?.status === 'paused'
            ? 'play'
            : failed
              ? 'repeat'
              : 'download-outline';
    const menuColor = removing ? '#FF8A8A' : accent;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menuText}
        accessibilityHint={active ? (tr('Tap to pause', 'Touchez pour mettre en pause', 'اضغط للإيقاف المؤقت')) : undefined}
        disabled={busy}
        onPress={action}
        style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed, busy && styles.disabled]}
      >
        <View style={[styles.menuIcon, { backgroundColor: soft }]}>
          {busy ? <ActivityIndicator size="small" color={menuColor} /> : <Icon name={menuIcon} size={20} color={menuColor} />}
        </View>
        <View style={styles.menuTextGroup}>
          <Text style={[styles.menuLabel, removing && styles.menuLabelDanger, isArabic && styles.arabic]}>{menuText}</Text>
          <Text style={[styles.menuDetail, isArabic && styles.arabic]}>{menuDetail}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={active ? (tr('Tap to pause', 'Touchez pour mettre en pause', 'اضغط للإيقاف المؤقت')) : undefined}
      disabled={busy}
      onPress={action}
      style={[
        styles.button,
        compact && styles.compact,
        { backgroundColor: soft, borderColor: line },
        busy && styles.disabled,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={accent} /> : null}
      <Text style={[styles.text, { color: accent }, isArabic && styles.arabic]}>
        {updateAvailable
          ? '↻  '
          : progress?.status === 'complete'
            ? '✓  '
            : active
              ? 'Ⅱ  '
              : progress?.status === 'paused'
                ? '▶  '
                : '↓  '}
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  compact: { minHeight: 36, paddingHorizontal: SPACING.md },
  disabled: { opacity: 0.65 },
  text: { fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  menuRow: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: SPACING.md, minHeight: 62, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  menuRowPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  menuIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  menuTextGroup: { flex: 1, minWidth: 0 },
  menuLabel: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700' },
  menuLabelDanger: { color: '#FF8A8A' },
  menuDetail: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
