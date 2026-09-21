import { Platform } from 'react-native';

import { supabase } from '@/utils/supabase';

export type WebPushSyncResult =
  | 'registered'
  | 'permission_required'
  | 'denied'
  | 'signed_out'
  | 'unsupported'
  | 'unconfigured';

const APP_KEY = 'chc';
const PROVIDER = 'web_push';
const LAST_ENDPOINT_KEY = '@chc/notification-token/chc-web';

function vapidPublicKey() {
  return process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || '';
}

function isWindows() {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export async function syncWebPushDevice(options: {
  requestPermission?: boolean;
} = {}): Promise<WebPushSyncResult> {
  if (
    Platform.OS !== 'web'
    || typeof window === 'undefined'
    || typeof navigator === 'undefined'
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)
    || typeof Notification === 'undefined'
  ) {
    return 'unsupported';
  }

  const publicKey = vapidPublicKey();
  if (!publicKey) return 'unconfigured';

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return 'signed_out';

  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default' && !options.requestPermission) {
    return 'permission_required';
  }

  await navigator.serviceWorker.register('/chc-notification-sw.js');

  const { subscribe } = await import('@mmmike/web-push/client');
  const result = await subscribe(publicKey);
  if (result.status === 'unsupported') return 'unsupported';
  if (result.status === 'denied') return 'denied';

  const subscription = result.subscription;
  const { error } = await supabase.rpc('register_notification_device', {
    p_app_key: APP_KEY,
    p_platform: isWindows() ? 'windows' : 'web',
    p_provider: PROVIDER,
    p_push_token: subscription.endpoint,
    p_provider_data: subscription,
    p_device_name: null,
    p_app_version: null,
  });
  if (error) throw new Error('Register web notifications: ' + error.message);

  globalThis.localStorage?.setItem(LAST_ENDPOINT_KEY, subscription.endpoint);
  return 'registered';
}

export async function disableWebPushDevice(): Promise<void> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;

  const endpoint = globalThis.localStorage?.getItem(LAST_ENDPOINT_KEY);
  if (endpoint) {
    const { error } = await supabase.rpc('disable_notification_device', {
      p_app_key: APP_KEY,
      p_provider: PROVIDER,
      p_push_token: endpoint,
    });
    if (error) throw new Error('Disable web notifications: ' + error.message);
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch (error) {
      console.warn('Unable to unsubscribe the browser push subscription:', error);
    }
  }

  globalThis.localStorage?.removeItem(LAST_ENDPOINT_KEY);
}
