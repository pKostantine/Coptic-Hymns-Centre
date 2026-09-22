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
- Now Playing clearance was included in scroll mode but not in either
  slideshow page budget.

## Implemented Changes

This section is updated as each change lands.

- Added shared document chrome metrics as the source of truth for scroll and
  slideshow title/button sizing.

## Verification

Verification results will be recorded here after implementation.
