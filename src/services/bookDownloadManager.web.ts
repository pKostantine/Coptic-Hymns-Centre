import { DOWNLOADABLE_BOOKS } from '@/constants/bookDependencyRegistry';
import type { BookDownloadManager, BookDownloadProgress, DownloadableBookKey } from '@/types/bookDownloads';

const unavailable = () => new Error('Offline books are available only in the CHC iOS and Android apps.');

class WebBookDownloadManager implements BookDownloadManager {
  subscribe = (_listener: () => void) => () => undefined;
  getRevision = () => 0;
  install(_key: DownloadableBookKey) { return Promise.reject(unavailable()); }
  pause(_key: DownloadableBookKey) { return Promise.reject(unavailable()); }
  resume(_key: DownloadableBookKey) { return Promise.reject(unavailable()); }
  retry(_key: DownloadableBookKey) { return Promise.reject(unavailable()); }
  remove(_key: DownloadableBookKey) { return Promise.reject(unavailable()); }
  checkForUpdates(_manual?: boolean) { return Promise.resolve(); }
  ensureCalendar() { return Promise.resolve(); }
  listBooks(): Promise<BookDownloadProgress[]> { return Promise.resolve([]); }
  listResources() { return Promise.resolve([]); }
  getBook(bookKey: DownloadableBookKey): Promise<BookDownloadProgress> {
    return Promise.resolve({ bookKey, title: DOWNLOADABLE_BOOKS[bookKey].title, status: 'not_downloaded',
      progress: 0, bytesWritten: 0, totalBytes: null, error: null, installedAt: null, updatedAt: '' });
  }
}

export const bookDownloadManager: BookDownloadManager = new WebBookDownloadManager();
export async function getAutomaticBookUpdatesEnabled(): Promise<boolean> { return false; }
export async function setAutomaticBookUpdatesEnabled(_enabled: boolean): Promise<void> {}
