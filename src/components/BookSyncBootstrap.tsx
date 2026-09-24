import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { bookDownloadManager, getAutomaticBookUpdatesEnabled } from '@/services/bookDownloadManager';

function isWifi(type: Network.NetworkStateType | undefined): boolean {
  return type === Network.NetworkStateType.WIFI || type === Network.NetworkStateType.ETHERNET;
}

export default function BookSyncBootstrap() {
  useEffect(() => {
    let active = true;
    let syncing = false;
    const sync = async () => {
      if (!active || syncing) return;
      const network = await Network.getNetworkStateAsync();
      if (!active || network.isConnected === false || !isWifi(network.type)) return;
      syncing = true;
      try {
        // Calendar is a mandatory system resource, independent of the user's
        // optional automatic-book-update preference.
        await bookDownloadManager.ensureCalendar();
        // A dropped connection marks only the incomplete chunk failed. Resume
        // user-requested initial installs when Wi-Fi returns; intentionally
        // paused books remain paused.
        const interrupted = (await bookDownloadManager.listBooks())
          .filter((book) => book.status === 'failed' && book.totalBytes != null);
        for (const book of interrupted) await bookDownloadManager.retry(book.bookKey);
        if (await getAutomaticBookUpdatesEnabled()) await bookDownloadManager.checkForUpdates(false);
      } catch (error) {
        // Offline/unreachable startup is expected. Installed content remains
        // active and the network listener retries when Wi-Fi returns.
        console.warn('Offline book synchronization deferred:', error instanceof Error ? error.message : error);
      } finally { syncing = false; }
    };

    void sync();
    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected !== false && isWifi(state.type)) void sync();
    });
    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      active = false;
      networkSubscription.remove();
      appSubscription.remove();
    };
  }, []);

  return null;
}
