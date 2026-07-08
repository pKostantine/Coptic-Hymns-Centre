/**
 * React Native's <Modal> defaults to portrait-only on iOS unless
 * supportedOrientations is passed explicitly — it otherwise ignores the
 * app's own orientation lock (see _layout.tsx's OrientationLock), so every
 * Modal in the app needs this or it won't rotate even when Auto Rotate is on.
 */
export const MODAL_SUPPORTED_ORIENTATIONS: (
  | 'portrait'
  | 'portrait-upside-down'
  | 'landscape'
  | 'landscape-left'
  | 'landscape-right'
)[] = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];
