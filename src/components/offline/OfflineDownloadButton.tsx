import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { downloadManager } from '@/services/downloadManager';
import type { OfflineDownloadProgress, OfflineDownloadRequest } from '@/types/offlineDownloads';

type DownloadTheme = 'music' | 'learning';

export interface OfflineDownloadButtonProps {
  packageKey: string;
  request: OfflineDownloadRequest | (() => Promise<OfflineDownloadRequest>);
  theme: DownloadTheme;
  isArabic?: boolean;
  compact?: boolean;
  label?: string;
  style?: ViewStyle;
}

function percentage(progress: number): string {
  return `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
}

export default function OfflineDownloadButton({
  packageKey,
  request,
  theme,
  isArabic = false,
  compact = false,
  label,
  style,
}: OfflineDownloadButtonProps) {
  useSyncExternalStore(downloadManager.subscribe, downloadManager.getRevision, downloadManager.getRevision);
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    let active = true;
    void downloadManager.getProgress(packageKey).then((value) => {
      if (active) setProgress(value);
    });
    return () => { active = false; };
  }, [packageKey]);

  useEffect(() => refresh(), [refresh, downloadManager.getRevision()]);

  const action = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (progress?.status === 'complete') {
        Alert.alert(
          isArabic ? 'إزالة التنزيل؟' : 'Remove download?',
          isArabic ? 'سيتم حذف النسخة المحفوظة من هذا الجهاز.' : 'The saved offline copy will be removed from this device.',
          [
            { text: isArabic ? 'إلغاء' : 'Cancel', style: 'cancel' },
            {
              text: isArabic ? 'إزالة' : 'Remove',
              style: 'destructive',
              onPress: () => { void downloadManager.remove(packageKey); },
            },
          ],
        );
        return;
      }
      if (progress?.status === 'downloading' || progress?.status === 'queued') {
        await downloadManager.pause(packageKey);
        return;
      }
      if (progress?.status === 'paused') {
        await downloadManager.resume(packageKey);
        return;
      }
      if (progress?.status === 'failed' || progress?.status === 'cancelled') {
        await downloadManager.retry(packageKey);
        return;
      }
      const prepared = typeof request === 'function' ? await request() : request;
      await downloadManager.enqueue(prepared);
    } catch (cause) {
      Alert.alert(
        isArabic ? 'تعذر التنزيل' : 'Download unavailable',
        cause instanceof Error ? cause.message : (isArabic ? 'تعذر بدء التنزيل.' : 'Unable to start this download.'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, isArabic, packageKey, progress?.status, request]);

  const active = progress?.status === 'downloading' || progress?.status === 'queued';
  const failed = progress?.status === 'failed' || progress?.status === 'cancelled';
  const text = progress?.status === 'complete'
    ? (isArabic ? 'تم التنزيل' : 'Downloaded')
    : active
      ? `${isArabic ? 'تنزيل' : 'Downloading'} ${percentage(progress?.progress ?? 0)}`
      : progress?.status === 'paused'
        ? (isArabic ? 'متوقف مؤقتًا' : 'Resume')
        : failed
          ? (isArabic ? 'إعادة المحاولة' : 'Retry')
          : label ?? (isArabic ? 'تنزيل' : 'Download');
  const accent = theme === 'learning' ? COLORS.learningBright : COLORS.goldBright;
  const soft = theme === 'learning' ? COLORS.learningSoft : COLORS.goldSoft;
  const line = theme === 'learning' ? COLORS.learningLine : COLORS.goldLine;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={active ? (isArabic ? 'اضغط للإيقاف المؤقت' : 'Tap to pause') : undefined}
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
        {progress?.status === 'complete' ? '✓  ' : active ? 'Ⅱ  ' : progress?.status === 'paused' ? '▶  ' : '↓  '}
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
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
