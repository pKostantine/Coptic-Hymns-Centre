import { CATEGORIES } from '@/constants/manifest';

/**
 * Books' own sections. They are top-level routes rather than children of
 * `/books` — books/index pushes `/${category.id}` — so the route root is what
 * identifies them. `season-selector` joins them because it is reached the same
 * way and reads as the same kind of page.
 */
const BOOK_SUBPAGE_ROOTS: ReadonlySet<string> = new Set<string>([
  ...CATEGORIES.map((category) => category.id),
  'season-selector',
]);

/**
 * Whether a route takes the whole window on a desktop browser, with no sidebar
 * beside it.
 *
 * Two kinds qualify. The reader and the full players are immersive: the page
 * is the content, and its own controls get you out. A submenu of Books is the
 * second kind — it carries no tab bar on a phone, so it gets no sidebar on a
 * desktop either, and navigates by its own back button.
 *
 * A full now-playing screen also qualifies but cannot be seen here: it is an
 * overlay rather than a route, so it reports itself through BottomChromeContext
 * instead.
 */
export function keepsWholeWindow(segments: string[]): boolean {
  if (segments.some((segment) => segment === '[serviceId]' || segment === '[chapter]' || segment === '[hourId]' || segment === 'now-playing')) {
    return true;
  }
  return BOOK_SUBPAGE_ROOTS.has(segments[0] ?? '');
}
