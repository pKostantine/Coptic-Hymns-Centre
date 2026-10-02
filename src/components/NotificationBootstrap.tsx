import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
  installNativeNotificationRuntime,
  syncNativeNotificationDevice,
} from '@/services/notificationService';
import { syncWebPushDevice } from '@/services/webPushService';
import { supabase } from '@/utils/supabase';

export default function NotificationBootstrap() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      void syncWebPushDevice({ requestPermission: false }).catch((error) => {
        console.warn('Unable to synchronize Coptic Vine web notifications:', error);
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) return;
        void syncWebPushDevice({ requestPermission: false }).catch((error) => {
          console.warn('Unable to synchronize Coptic Vine web notifications after sign-in:', error);
        });
      });

      return () => data.subscription.unsubscribe();
    }

    let active = true;
    let removeRuntime = () => {};

    void installNativeNotificationRuntime((path) => {
      router.push(path as Href);
    }).then((remove) => {
      if (!active) {
        remove();
        return;
      }
      removeRuntime = remove;
    }).catch((error) => {
      console.warn('Unable to start Coptic Vine notifications:', error);
    });

    void syncNativeNotificationDevice({ requestPermission: false }).catch((error) => {
      console.warn('Unable to synchronize Coptic Vine notifications:', error);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      void syncNativeNotificationDevice({ requestPermission: false }).catch((error) => {
        console.warn('Unable to synchronize Coptic Vine notifications after sign-in:', error);
      });
    });

    return () => {
      active = false;
      removeRuntime();
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
