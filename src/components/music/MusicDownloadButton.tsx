import OfflineDownloadButton from '@/components/offline/OfflineDownloadButton';
import type { OfflineDownloadRequest } from '@/types/offlineDownloads';

export default function MusicDownloadButton({
  packageKey,
  request,
  label,
  isArabic = false,
  compact = false,
  menuRow = false,
  onAction,
}: {
  packageKey: string;
  request: OfflineDownloadRequest | (() => Promise<OfflineDownloadRequest>);
  label?: string;
  isArabic?: boolean;
  compact?: boolean;
  menuRow?: boolean;
  onAction?: () => void;
}) {
  return (
    <OfflineDownloadButton
      packageKey={packageKey}
      request={request}
      theme="music"
      label={label}
      isArabic={isArabic}
      compact={compact}
      menuRow={menuRow}
      onAction={onAction}
    />
  );
}
