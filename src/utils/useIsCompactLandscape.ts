import * as Device from 'expo-device';
import { Platform, useWindowDimensions } from 'react-native';

import { useIsMobileWeb } from './useIsMobileWeb';

const UNKNOWN_DEVICE_PHONE_MAX_SHORT_EDGE = 599;

interface CompactLandscapeViewport {
  width: number;
  height: number;
  deviceType: Device.DeviceType | null;
  isWeb: boolean;
  isMobileWeb: boolean;
}

export function isCompactPhoneLandscape({
  width,
  height,
  deviceType,
  isWeb,
  isMobileWeb,
}: CompactLandscapeViewport): boolean {
  if (width <= height) return false;

  const isPhone =
    deviceType === Device.DeviceType.PHONE ||
    ((deviceType === Device.DeviceType.UNKNOWN || deviceType === null) &&
      Math.min(width, height) <= UNKNOWN_DEVICE_PHONE_MAX_SHORT_EDGE);

  return isPhone && (!isWeb || isMobileWeb);
}

/**
 * True only when a phone is held sideways. Tablets keep the standard layout
 * even when their viewport is short because of rotation or split view.
 *
 * A desktop browser window is almost always wider than it is tall, so plain
 * `width > height` would drag the desktop layout into this mode as well. Web
 * therefore also has to satisfy useIsMobileWeb's phone-sized viewport check.
 */
export function useIsCompactLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  const isMobileWeb = useIsMobileWeb();

  return isCompactPhoneLandscape({
    width,
    height,
    deviceType: Device.deviceType,
    isWeb: Platform.OS === 'web',
    isMobileWeb,
  });
}
