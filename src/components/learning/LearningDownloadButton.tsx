import OfflineDownloadButton from '@/components/offline/OfflineDownloadButton';
import type { OfflineDownloadRequest } from '@/types/offlineDownloads';

export default function LearningDownloadButton({
  packageKey,
  request,
  label,
  isArabic = false,
  compact = false,
}: {
  packageKey: string;
  request: OfflineDownloadRequest | (() => Promise<OfflineDownloadRequest>);
  label?: string;
  isArabic?: boolean;
  compact?: boolean;
}) {
  return (
    <OfflineDownloadButton
      packageKey={packageKey}
      request={request}
      theme="learning"
      label={label}
      isArabic={isArabic}
      compact={compact}
    />
  );
}
