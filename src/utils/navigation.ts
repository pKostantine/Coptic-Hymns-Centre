import { Href, ImperativeRouter } from 'expo-router';

/**
 * router.back() silently no-ops (with a dev-only "GO_BACK was not handled by
 * any navigator" warning) when there's no navigation history to pop — e.g. a
 * direct deep link or a page reload on web. Falls back to replacing with a
 * known parent route so the back affordance always does something.
 */
export function goBack(router: ImperativeRouter, fallbackHref: Href) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}
