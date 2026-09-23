# Slideshow Parity and Performance Pass

Date: September 22, 2026

## Objective

Make slideshow mode render the same document content and visual hierarchy as
scroll mode, then reduce presentation startup work, repagination churn, and
navigation bugs across the liturgical and Bible slideshow engines.

## External Review

- [Coptic Reader](https://www.copticreader.org/features/index.html) treats
  slideshow as another presentation mode for the same generated document and
  supports keyboard/remote navigation.
- [Coptic Reader release notes](https://copticreader.org/releases/index.html)
  repeatedly call out rotation crashes, blank slides, section-toggle jumps,
  unresponsive links, selection conflicts, and external-display drift. These
  are useful failure cases for CHC's regression plan.
- [In Spirit and Truth](https://apps.apple.com/us/app/in-spirit-and-truth/id1498587179)
  supports projector presentation and presentation clickers. Its recent notes
  specifically mention fixing taps at button edges, side-menu jumps/black
  screens, and presentation performance.

The useful design lesson is not to copy another interface. It is to keep one
content model, make controls win over page-turn gestures, preserve a semantic
reading anchor during repagination, and avoid laying out an entire long service
on the interaction-critical frame.

## Audit Findings

### Visual parity

- Slideshow title and button typography had maximum clamps that scroll mode did
  not have, making large-text presentations visibly smaller.
- Refrain labels were reduced to half-size only in slideshow mode.
- Refrain and silent-prayer colors differed between renderers.
- Slideshow Bible verse numbers were gold but not bold.
- Slideshow document buttons used different heights, widths, radii, spacing,
  and hyperlink-arrow placement.
- Slideshow verse weight differed for reading references and refrains.
- Arabic body text selected a different font family.
- The Bible slideshow removed the row separators visible in scroll mode.

### Performance and reliability

- Web liturgical slides rebuilt justified paragraphs as one React component per
  word instead of using native browser justification.
- The measurement layer continued through the entire document after the nearby
  reading area was ready.
- Native measurement batches could mount 48 complex items in one commit.
- The Bible pager performed two complete startup pagination passes.
- Bible pages were kept in one very wide horizontal flex strip even though page
  transitions were instantaneous.
- Resize events could repeatedly repaginate during an orientation change.
- A follow-up change incorrectly fed the global Now Playing inset into the
  slideshow page budget even though the player intentionally overlays a
  presentation. In landscape this could remove a large part of the usable
  slide and change every page break when the player appeared or disappeared.
- Native justified-text probes were absolutely positioned while measuring.
  Their outer verse wrappers could therefore cache a padding-only height
  before line measurement completed, causing long prayers to be treated as
  short rows and clipped by the slide viewport.
- Completed translations retained their alignment column on continuation
  slides, but still mounted a native text renderer. A stale measurement line
  could consequently appear as visible content in an otherwise empty column.

## Implemented Changes

### Liturgical visual parity

- Added shared document chrome metrics as the source of truth for scroll and
  slideshow section titles, subdocument cards, hyperlinks, collapse controls,
  and Gospel Rite controls. Large text is no longer clamped to a smaller size
  in slideshow mode.
- Matched subdocument and hyperlink width, height, padding, border radius,
  label scale, Arabic label scale, and inline arrow placement between modes.
- Matched the Gospel Rite switch's title-sized label, line height, spacing,
  colors, and control shape.
- Restored full-size speaker and refrain labels. Slideshow had previously
  reduced refrain labels to half the normal reading size.
- Unified refrain, silent-prayer, speaker, People-response, Metropolitan, and
  alternating-row colors with the scroll renderer's theme values.
- Made Bible/readings verse numbers gold and bold in every slideshow text
  path, including justified native text and split-verse continuations.
- Matched English, Coptic, and Arabic font families, font weights, line
  heights, title padding, and per-language column behavior.
- Preserved Coptic digits when a source row requests it, matching scroll mode.
- Removed slideshow-only English text rewriting so document titles and verse
  text now display the same source string in both modes.
- Moved alternating-color sequencing to one shared helper used by scroll and
  slideshow. Comments, refrains, reading references, silent prayers, and
  authored White/Blue rows no longer shift the two modes onto different color
  sequences.
- Restored Metropolitan parenthetical highlighting in justified slideshow
  text on native and web.
- Restored Bible row separators in slideshow mode; Bible scroll and slideshow
  now use the same verse-row presentation rules.

### Interaction and pagination reliability

- Made document controls own their taps and horizontal gestures. The parent
  page-turn surface no longer captures a press intended for a collapse
  control, Gospel Rite switch, subdocument card, or hyperlink.
- Kept only the current liturgical slide in native layout flow while
  preloading the immediately adjacent slides as non-interactive overlays.
- Continued to resolve repagination by source row and language-line offsets,
  so rotation, language changes, and font changes retain the reader's content
  instead of trusting an obsolete page number.
- Removed Now Playing geometry from both liturgical and Bible slideshow page
  formation. The player remains an overlay and no longer changes slide
  padding, available height, line splitting, page count, or reading position.
- Stopped the global player overlay from publishing any reserved bottom inset
  while slideshow mode is active. The collapsed control now owns an explicit
  transparent 42 x 42 overlay box instead of being able to participate in a
  full-width bottom region.
- Removed the slideshow container, deck, and current-slide hard clips. The
  screen remains the presentation boundary, while text can paint through the
  rest of the collapsed player's horizontal band instead of being cut at the
  button's top edge.
- Kept the invisible native line-break probe in normal layout flow. The first
  outer measurement now includes the complete paragraph height, preventing a
  temporary padding-only measurement from being cached as final.
- Made completed language columns structurally empty. They retain their width
  for multilingual alignment, but mount no Text/JustifiedText body and ignore
  any stale forced-line payload after that translation has finished.
- Kept responsive top/bottom slide padding bounded on very short landscape
  screens and added explicit maximum-font pagination coverage.
- Changed Bible presentation pages from one viewport-wide horizontal strip to
  stacked pages where only the current page is displayed. This removes the
  enormous off-screen layout surface without changing navigation behavior.
- Made Bible startup pagination idempotent, debounced resize pagination, and
  preserved a verse/progress anchor through the resize.

### Rendering performance

- Replaced the web liturgical slideshow's per-word React tree with browser
  text justification while retaining measured line data for safe verse
  splitting. A paragraph now renders as one text node instead of potentially
  hundreds of nested text components.
- Limited off-screen measurement to 48 items per web commit and 16 per native
  commit, prioritized around the current reading anchor.
- Stopped eager measurement outside an active radius of 96 items on web and
  48 on native. Distant content uses deterministic estimates until the reader
  approaches it.
- Added a bounded 6,000-entry measurement cache keyed by width, font,
  languages, and item content. Unchanged rows retain their measurements when
  sections are collapsed, expanded, or remounted.
- Stopped invalidating text measurements for height-only viewport changes.
  Now Playing changes no longer reach the slideshow paginator at all.
- Batched measurement updates once per animation frame and stabilized item
  callbacks so each batch does not rerender every measuring row.
- Reduced Bible startup to one font-aware pagination pass and debounced the
  burst of resize events produced by rotation.

## Verification

- Pure pagination benchmark: 2,000 synthetic items over 100 runs averaged
  0.548 ms per run. This confirmed that mounted measurement/render work, not
  the pagination loop itself, was the primary bottleneck.
- Focused slideshow regression suite covers multilingual splitting, maximum
  font sizes, seasonal prefixes, bold verse numbers, line-anchor restoration,
  active-window measurement, tap/swipe/keyboard controls, native layout
  structure, shared color sequencing, and Bible HTML generation.
- A real Edge browser interaction test at 390 x 844 verifies one-page keyboard
  navigation, Home restoration, and that the Gospel Rite switch does not turn
  the page. Twelve measured page turns averaged 18 ms with a 45 ms maximum.
- A live 390 x 844 to 844 x 390 resize changed the calculated deck from slide
  13 of 54 to the same anchored content on slide 22 of 82, with nonblank
  visible content after repagination.
- Browser screenshots were reviewed at 1280 x 720, 390 x 844, maximum-font
  390 x 600, and maximum-font 844 x 390 layouts. The checks included the
  Liturgy of St. Basil, the First Hour, and Vespers readings.
- One cold local-development sample reached document content in 23.9 seconds
  in scroll mode and 18.1 seconds in slideshow mode. This variable wait is in
  shared remote document hydration; slideshow presentation was not the slower
  path in that comparison.
- ESLint passed for every slideshow-related file changed in this pass.
- All 61 repository tests passed, including 29 focused slideshow/Bible/native
  measurement tests. New regressions assert that overlay insets cannot change
  page formation, native probes contribute their full height, and completed
  translations cannot render stale line content.
- A fresh maximum-font 844 x 390 browser pass checked eight consecutive
  landscape slides and found zero text nodes outside their clipping bounds.
- A live maximum-font 844 x 390 run with a restored music queue and collapsed
  player verified that the slideshow container and deck both end at viewport
  bottom (390), while the player wrapper is only a transparent 40 x 40 rendered
  box after its animation scale. Across 80 page turns, 37 current slides
  rendered text in that same bottom band outside the button and none rendered
  text outside the slideshow bounds.
- `npm run build` completed successfully and its post-build Cloudflare share
  route verification passed.
- Scoped ESLint passed for the slideshow, player-overlay, and regression-test
  files changed in the final overlay correction. The repository-wide lint
  command still reports 21 pre-existing React Compiler errors elsewhere.
- `tsc --noEmit` still reports 33 existing Expo typed-router errors in Learn
  and Search routes. It reports zero errors in the slideshow, document, Bible,
  or shared presentation files changed in this pass.
