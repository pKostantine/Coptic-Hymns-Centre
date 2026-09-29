/**
 * The highlighting layer shared by the Sermon Planner and the Bible reader —
 * persistent range highlights over text marked `.sermon-annotatable-text`
 * (carrying `data-sermon-verse-id`/`data-sermon-language`, and optionally
 * `data-sermon-section-id`), a floating colour toolbar for a selection, and
 * Apple Pencil strokes that highlight the words they pass over.
 *
 * Each host posts its own actions (the `emit` function and `actions` names)
 * and chooses its extras: the Bible adds Copy, lets a tapped highlight be
 * recoloured, copied or removed in place, and keeps a selection inside the one
 * language column it started in; the Sermon Planner opens a tapped
 * highlight's note instead.
 */

export interface TextHighlightScriptOptions {
  /** A JavaScript function expression, `function (type, payload) {…}`, that posts an action to the host. */
  emit: string;
  actions: {
    /** Payload `{ anchors, color }`. */
    create: string;
    /** Payload `{ active }` — the host suspends its edge swipes while a Pencil stroke is down. */
    pencil: string;
    /** Payload `{ highlightId }` — tapping a highlight when it isn't edited in place. */
    openNote?: string;
    /** Payload `{ highlightId, color }`. */
    recolor?: string;
    /** Payload `{ highlightId }`. */
    remove?: string;
    /** Payload `{ text, html? }` — only when the page's own copy command is refused. */
    copy?: string;
  };
  /** Tapping a highlight selects it and offers recolour/copy/remove in the toolbar. */
  tapToEdit?: boolean;
  /** Adds Copy to the toolbar. */
  copy?: boolean;
  /** A JavaScript expression for the page's `function (selection) { return { text, html } | null; }` that formats what Copy puts on the clipboard; read when Copy is tapped. */
  copyPayload?: string;
  /** A selection only highlights within the language column it started in. */
  singleLanguage?: boolean;
  labels?: { copy?: string; remove?: string };
}

export function textHighlightStyles() {
  return `
      .sermon-annotatable-text {
        -webkit-user-select: text;
        user-select: text;
      }
      mark.sermon-highlight {
        border-radius: 3px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        color: inherit;
        cursor: pointer;
        padding: 0 0.05em;
      }
      mark.sermon-highlight[data-sermon-color="gold"] { background: rgba(235, 190, 52, 0.46); }
      mark.sermon-highlight[data-sermon-color="rose"] { background: rgba(232, 91, 120, 0.42); }
      mark.sermon-highlight[data-sermon-color="blue"] { background: rgba(75, 154, 219, 0.46); }
      mark.sermon-highlight[data-sermon-color="green"] { background: rgba(74, 173, 116, 0.44); }
      mark.sermon-highlight.sermon-highlight-pulse { animation: sermon-highlight-pulse 900ms ease-out; }
      @keyframes sermon-highlight-pulse {
        0%, 100% { outline: 0 solid rgba(235, 190, 52, 0); }
        35% { outline: 5px solid rgba(235, 190, 52, 0.42); }
      }
      #sermon-highlight-tools {
        align-items: center;
        background: #151719;
        border: 1px solid rgba(235, 190, 52, 0.5);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.48);
        display: none;
        gap: 8px;
        padding: 8px 10px;
        position: fixed;
        transform: translate(-50%, -100%);
        z-index: 2147483647;
      }
      #sermon-highlight-tools.is-visible { display: flex; }
      #sermon-highlight-tools.is-below { transform: translate(-50%, 0); }
      #sermon-highlight-tools.is-copy-only .sermon-color-button,
      #sermon-highlight-tools.is-copy-only .text-highlight-divider { display: none; }
      .sermon-color-button {
        border: 2px solid rgba(255, 255, 255, 0.72);
        border-radius: 999px;
        height: 28px;
        padding: 0;
        width: 28px;
      }
      .sermon-color-button[data-color="gold"] { background: #d7ad2c; }
      .sermon-color-button[data-color="rose"] { background: #d65b75; }
      .sermon-color-button[data-color="blue"] { background: #4c9ad8; }
      .sermon-color-button[data-color="green"] { background: #4aaa73; }
      .text-highlight-divider {
        align-self: stretch;
        background: rgba(235, 190, 52, 0.35);
        width: 1px;
      }
      .text-highlight-action {
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: #f4f1e8;
        cursor: pointer;
        font: 700 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        padding: 7px 6px;
        white-space: nowrap;
      }
      .text-highlight-action:active { background: rgba(235, 190, 52, 0.22); }
      .text-highlight-action[hidden] { display: none; }
      #sermon-highlight-tools:not(.is-editing) .text-highlight-divider.edit-only { display: none; }
  `;
}

export function textHighlightScript(options: TextHighlightScriptOptions) {
  const labels = { copy: 'Copy', remove: 'Remove', ...(options.labels || {}) };
  return `
      (function () {
        var emit = ${options.emit};
        var ACTIONS = ${JSON.stringify(options.actions)};
        var TAP_TO_EDIT = ${JSON.stringify(Boolean(options.tapToEdit))};
        var COPY = ${JSON.stringify(Boolean(options.copy))};
        var SINGLE_LANGUAGE = ${JSON.stringify(Boolean(options.singleLanguage))};
        var currentHighlights = [];
        var editingHighlightId = null;
        // The selection the toolbar acts on, kept apart from the live one: on
        // a phone a tap can clear the live selection before a button hears it.
        var savedRange = null;
        var paletteTouch = null;
        var lastTouchActivation = 0;
        var showTimer = 0;
        var mouseDown = false;
        var pendingCopy = null;
        var copyWritten = false;
        // Phones put their own menu (Copy, Look Up…) above a selection.
        var coarsePointer = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        var annotationSelector = '.sermon-annotatable-text[data-sermon-verse-id][data-sermon-language]';
        var palette = document.createElement('div');
        palette.id = 'sermon-highlight-tools';
        palette.setAttribute('role', 'toolbar');
        palette.setAttribute('aria-label', 'Highlight selected text');
        ['gold', 'rose', 'blue', 'green'].forEach(function (color) {
          var button = document.createElement('button');
          button.className = 'sermon-color-button';
          button.type = 'button';
          button.setAttribute('data-color', color);
          button.setAttribute('aria-label', 'Highlight ' + color);
          palette.appendChild(button);
        });
        function addAction(action, label) {
          var divider = document.createElement('span');
          divider.className = 'text-highlight-divider' + (action === 'remove' ? ' edit-only' : '');
          palette.appendChild(divider);
          var button = document.createElement('button');
          button.className = 'text-highlight-action';
          button.type = 'button';
          button.setAttribute('data-action', action);
          button.textContent = label;
          palette.appendChild(button);
          return button;
        }
        var copyButton = COPY ? addAction('copy', ${JSON.stringify(labels.copy)}) : null;
        var removeButton = TAP_TO_EDIT ? addAction('remove', ${JSON.stringify(labels.remove)}) : null;
        // Remove is only for a highlight that already exists (tapped), never a fresh selection.
        if (removeButton) removeButton.hidden = true;
        document.body.appendChild(palette);

        function closestRoot(node) {
          var element = node && node.nodeType === 1 ? node : node && node.parentElement;
          return element && element.closest ? element.closest(annotationSelector) : null;
        }

        function unwrapHighlights() {
          Array.prototype.slice.call(document.querySelectorAll('mark.sermon-highlight')).forEach(function (mark) {
            var parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
          });
        }

        function boundaryForOffset(root, requestedOffset) {
          var offset = Math.max(0, Math.min(Number(requestedOffset) || 0, root.textContent.length));
          var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          var consumed = 0;
          var node;
          while ((node = walker.nextNode())) {
            var next = consumed + node.nodeValue.length;
            if (offset <= next) return { node: node, offset: offset - consumed };
            consumed = next;
          }
          return { node: root, offset: root.childNodes.length };
        }

        function resolveOffsets(root, highlight) {
          var text = root.textContent || '';
          var start = Math.max(0, Math.min(Number(highlight.startOffset) || 0, text.length));
          var end = Math.max(start, Math.min(Number(highlight.endOffset) || start, text.length));
          var quote = String(highlight.quote || '');
          if (quote && text.slice(start, end) !== quote) {
            var nearbyStart = Math.max(0, start - 80);
            var nearby = text.slice(nearbyStart, Math.min(text.length, end + 80));
            var nearbyIndex = nearby.indexOf(quote);
            if (nearbyIndex >= 0) {
              start = nearbyStart + nearbyIndex;
              end = start + quote.length;
            } else {
              var firstIndex = text.indexOf(quote);
              if (firstIndex >= 0 && text.indexOf(quote, firstIndex + 1) < 0) {
                start = firstIndex;
                end = firstIndex + quote.length;
              }
            }
          }
          return { start: start, end: end };
        }

        function applyHighlights() {
          unwrapHighlights();
          var ordered = currentHighlights.slice().sort(function (a, b) {
            return Number(b.startOffset) - Number(a.startOffset);
          });
          ordered.forEach(function (highlight) {
            var selector = annotationSelector
              + '[data-sermon-verse-id="' + CSS.escape(String(highlight.verseId || '')) + '"]'
              + '[data-sermon-language="' + CSS.escape(String(highlight.language || '')) + '"]';
            var root = document.querySelector(selector);
            if (!root) return;
            var offsets = resolveOffsets(root, highlight);
            if (offsets.end <= offsets.start) return;
            var start = boundaryForOffset(root, offsets.start);
            var end = boundaryForOffset(root, offsets.end);
            var range = document.createRange();
            try {
              range.setStart(start.node, start.offset);
              range.setEnd(end.node, end.offset);
              var mark = document.createElement('mark');
              mark.className = 'sermon-highlight';
              mark.setAttribute('data-sermon-highlight-id', String(highlight.id));
              mark.setAttribute('data-sermon-color', String(highlight.color || 'gold'));
              mark.appendChild(range.extractContents());
              range.insertNode(mark);
            } catch (error) {
              // A stale anchor should never make the document unreadable.
            }
          });
        }

        window.setSermonHighlights = function (highlights) {
          currentHighlights = Array.isArray(highlights) ? highlights : [];
          applyHighlights();
        };

        window.scrollToSermonHighlight = function (highlightId) {
          var mark = document.querySelector('mark[data-sermon-highlight-id="' + CSS.escape(String(highlightId || '')) + '"]');
          if (!mark) return false;
          // A document page holds its last jump for a moment (documentHtml.ts);
          // this smooth scroll must not be pulled back to it.
          if (window.releaseHeldJump) window.releaseHeldJump();
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mark.classList.remove('sermon-highlight-pulse');
          void mark.offsetWidth;
          mark.classList.add('sermon-highlight-pulse');
          return true;
        };

        function offsetInRoot(root, node, offset) {
          var range = document.createRange();
          range.selectNodeContents(root);
          try {
            range.setEnd(node, offset);
            return range.toString().length;
          } catch (error) {
            return 0;
          }
        }

        // Intl.Segmenter respects punctuation and multilingual word boundaries
        // (English contractions, Arabic and Coptic); the Unicode fallback
        // handles older embedded WebViews.
        function expandToWholeWords(text, start, end) {
          var segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
            ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
          if (segmenter) {
            var segments = Array.from(segmenter.segment(text));
            segments.forEach(function (part) {
              if (!part.isWordLike) return;
              var wordStart = part.index, wordEnd = part.index + part.segment.length;
              if (wordStart < start && start < wordEnd) start = wordStart;
              if (wordStart < end && end < wordEnd) end = wordEnd;
            });
          } else {
            var wordChar = function (char) { return /[\\p{L}\\p{M}\\p{N}_]/u.test(char); };
            while (start > 0 && wordChar(text.charAt(start)) && wordChar(text.charAt(start - 1))) start -= 1;
            while (end < text.length && wordChar(text.charAt(end - 1)) && wordChar(text.charAt(end))) end += 1;
          }
          return { start: start, end: end };
        }

        // Side-by-side columns interleave in the DOM (verse 1's English,
        // Coptic, Arabic, then verse 2's…), so a selection down one column
        // also crosses the others; it only highlights the column it began in.
        function selectionLanguage(range, roots) {
          var start = closestRoot(range.startContainer) || closestRoot(range.endContainer);
          if (start) return start.getAttribute('data-sermon-language');
          for (var i = 0; i < roots.length; i += 1) {
            try {
              if (range.intersectsNode(roots[i])) return roots[i].getAttribute('data-sermon-language');
            } catch (error) {
              // Keep looking.
            }
          }
          return null;
        }

        function anchorsFromSelection(selection) {
          if (!selection || !selection.rangeCount || selection.isCollapsed) return [];
          var range = selection.getRangeAt(0);
          var anchors = [];
          var roots = Array.prototype.slice.call(document.querySelectorAll(annotationSelector));
          var onlyLanguage = SINGLE_LANGUAGE ? selectionLanguage(range, roots) : null;
          roots.forEach(function (root) {
            if (onlyLanguage && root.getAttribute('data-sermon-language') !== onlyLanguage) return;
            try {
              if (!range.intersectsNode(root)) return;
            } catch (error) {
              return;
            }
            var clipped = document.createRange();
            clipped.selectNodeContents(root);
            if (root.contains(range.startContainer)) clipped.setStart(range.startContainer, range.startOffset);
            if (root.contains(range.endContainer)) clipped.setEnd(range.endContainer, range.endOffset);
            var startOffset = offsetInRoot(root, clipped.startContainer, clipped.startOffset);
            var endOffset = offsetInRoot(root, clipped.endContainer, clipped.endOffset);
            var fullText = root.textContent || '';
            while (startOffset < endOffset && /\\s/.test(fullText.charAt(startOffset))) startOffset += 1;
            while (endOffset > startOffset && /\\s/.test(fullText.charAt(endOffset - 1))) endOffset -= 1;
            if (endOffset <= startOffset) return;
            var expanded = expandToWholeWords(fullText, startOffset, endOffset);
            startOffset = expanded.start;
            endOffset = expanded.end;
            var overlaps = currentHighlights.some(function (highlight) {
              return highlight.verseId === root.getAttribute('data-sermon-verse-id')
                && highlight.language === root.getAttribute('data-sermon-language')
                && startOffset < Number(highlight.endOffset)
                && endOffset > Number(highlight.startOffset);
            });
            if (overlaps) return;
            anchors.push({
              sectionId: root.getAttribute('data-sermon-section-id'),
              verseId: root.getAttribute('data-sermon-verse-id'),
              language: root.getAttribute('data-sermon-language'),
              startOffset: startOffset,
              endOffset: endOffset,
              quote: fullText.slice(startOffset, endOffset),
            });
          });
          return anchors;
        }

        function showExpandedSelection(selection, anchors) {
          if (!selection || !anchors.length) return;
          var first = anchors[0], last = anchors[anchors.length - 1];
          var startRoot = document.querySelector(annotationSelector
            + '[data-sermon-verse-id="' + CSS.escape(first.verseId) + '"]'
            + '[data-sermon-language="' + CSS.escape(first.language) + '"]');
          var endRoot = document.querySelector(annotationSelector
            + '[data-sermon-verse-id="' + CSS.escape(last.verseId) + '"]'
            + '[data-sermon-language="' + CSS.escape(last.language) + '"]');
          if (!startRoot || !endRoot) return;
          var start = boundaryForOffset(startRoot, first.startOffset);
          var end = boundaryForOffset(endRoot, last.endOffset);
          var range = document.createRange();
          try {
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (error) {
            // Keep the user's original selection when the DOM changed mid-drag.
          }
        }

        function setEditing(highlightId) {
          editingHighlightId = highlightId || null;
          palette.classList.toggle('is-editing', Boolean(editingHighlightId));
          if (removeButton) removeButton.hidden = !editingHighlightId;
        }

        function hidePalette() {
          clearTimeout(showTimer);
          palette.classList.remove('is-visible', 'is-copy-only');
          setEditing(null);
        }

        function rememberSelection() {
          var selection = window.getSelection && window.getSelection();
          if (selection && selection.rangeCount && !selection.isCollapsed) savedRange = selection.getRangeAt(0).cloneRange();
        }

        // The live selection, or — when a tap has already cleared it — the one
        // the toolbar kept, shaped like a Selection for the code that reads it.
        function selectionForToolbar() {
          var selection = window.getSelection && window.getSelection();
          if (selection && selection.rangeCount && !selection.isCollapsed) return selection;
          if (!savedRange || savedRange.collapsed) return selection;
          var range = savedRange;
          return {
            rangeCount: 1,
            isCollapsed: false,
            anchorNode: range.startContainer,
            focusNode: range.endContainer,
            getRangeAt: function () { return range; },
            toString: function () { return range.toString(); }
          };
        }

        function restoreLiveSelection() {
          var selection = window.getSelection && window.getSelection();
          if (!selection || !savedRange || (selection.rangeCount && !selection.isCollapsed)) return;
          try {
            selection.removeAllRanges();
            selection.addRange(savedRange);
          } catch (error) {
            // The kept range no longer fits the page; Copy falls back to the host.
          }
        }

        function clearSelection() {
          savedRange = null;
          var selection = window.getSelection && window.getSelection();
          if (selection) selection.removeAllRanges();
        }

        function selectionTouchesText(selection) {
          if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
          var range = selection.getRangeAt(0);
          return Boolean(closestRoot(range.startContainer) || closestRoot(range.endContainer));
        }

        function placePalette(rect) {
          palette.classList.add('is-visible');
          // Centred over the text, but kept whole on screen — measured, since
          // the toolbar is wider with Copy and Remove than colours alone.
          var half = Math.max(78, Math.ceil(palette.offsetWidth / 2) + 8);
          var x = Math.max(half, Math.min(window.innerWidth - half, rect.left + rect.width / 2));
          // On a phone it goes under the selection, clear of the system's own
          // menu above it — unless there's no room there.
          var height = palette.offsetHeight || 46;
          var below = coarsePointer && rect.bottom + 18 + height < window.innerHeight - 8;
          palette.classList.toggle('is-below', below);
          var y = below ? rect.bottom + 18 : Math.max(60, rect.top - 8);
          palette.style.left = x + 'px';
          palette.style.top = y + 'px';
        }

        function showPaletteForSelection(expand) {
          // A tapped highlight's own toolbar stays up until the reader moves on.
          if (editingHighlightId) return;
          var selection = window.getSelection && window.getSelection();
          var anchors = anchorsFromSelection(selection);
          // Text that's already highlighted can't be highlighted again, but
          // can still be copied.
          var copyOnly = !anchors.length && COPY && selectionTouchesText(selection);
          if (!anchors.length && !copyOnly) {
            // Leave the toolbar up while a press on it is in progress.
            if (!paletteTouch) hidePalette();
            return;
          }
          if (anchors.length && expand !== false) showExpandedSelection(selection, anchors);
          rememberSelection();
          palette.classList.toggle('is-copy-only', copyOnly);
          placePalette(selection.getRangeAt(0).getBoundingClientRect());
        }

        function commitSelection(color) {
          var selection = selectionForToolbar();
          if (editingHighlightId) {
            if (ACTIONS.recolor) emit(ACTIONS.recolor, { highlightId: editingHighlightId, color: color || 'gold' });
          } else {
            var anchors = anchorsFromSelection(selection);
            if (anchors.length) emit(ACTIONS.create, { anchors: anchors, color: color || 'gold' });
          }
          clearSelection();
          hidePalette();
        }

        function copyPayloadFor(selection) {
          var build = ${options.copyPayload || 'null'};
          if (typeof build === 'function') {
            try {
              var payload = build(selection);
              if (payload && payload.text) return payload;
            } catch (error) {}
          }
          var text = selection ? selection.toString() : '';
          return text ? { text: text } : null;
        }

        // Copy writes its payload (plain and rich) through the page's own copy
        // command, which the tap allows in a browser and in the app's WebView
        // alike, and which lets the system turn the rich copy into what other
        // apps read. The host writes it only if that command is refused.
        document.addEventListener('copy', function (event) {
          if (!pendingCopy || !event.clipboardData) return;
          event.clipboardData.setData('text/plain', pendingCopy.text);
          if (pendingCopy.html) event.clipboardData.setData('text/html', pendingCopy.html);
          event.preventDefault();
          event.stopImmediatePropagation();
          copyWritten = true;
        }, true);

        function copySelection() {
          var payload = copyPayloadFor(selectionForToolbar());
          if (payload) {
            // The copy command needs a live selection; a tap may have cleared it.
            restoreLiveSelection();
            pendingCopy = payload;
            copyWritten = false;
            try {
              document.execCommand('copy');
            } catch (error) {
              copyWritten = false;
            }
            pendingCopy = null;
            if (!copyWritten && ACTIONS.copy) emit(ACTIONS.copy, payload);
          }
          clearSelection();
          hidePalette();
        }

        function removeEditingHighlight() {
          if (editingHighlightId && ACTIONS.remove) emit(ACTIONS.remove, { highlightId: editingHighlightId });
          clearSelection();
          hidePalette();
        }

        function paletteButton(target) {
          var element = target && target.nodeType === 1 ? target : target && target.parentElement;
          var button = element && element.closest ? element.closest('[data-color], [data-action]') : null;
          return button && palette.contains(button) && !button.hidden ? button : null;
        }

        function pressPaletteButton(button) {
          if (!button) return;
          if (button.hasAttribute('data-color')) commitSelection(button.getAttribute('data-color'));
          else if (button.getAttribute('data-action') === 'copy') copySelection();
          else if (button.getAttribute('data-action') === 'remove') removeEditingHighlight();
        }

        // On a phone a tap clears the selection and hides the toolbar before
        // its click arrives. So the toolbar takes the touch itself: holding it
        // keeps the selection (and stops the tap turning into a click), and
        // lifting over the same button presses it.
        palette.addEventListener('touchstart', function (event) {
          paletteTouch = paletteButton(event.target) || palette;
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
        }, { passive: false });
        palette.addEventListener('touchmove', function (event) {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
        }, { passive: false });
        palette.addEventListener('touchend', function (event) {
          var pressed = paletteTouch;
          paletteTouch = null;
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          var touch = event.changedTouches && event.changedTouches[0];
          var released = touch ? paletteButton(document.elementFromPoint(touch.clientX, touch.clientY)) : null;
          if (!released || released !== pressed) return;
          lastTouchActivation = Date.now();
          pressPaletteButton(released);
        }, { passive: false });
        palette.addEventListener('touchcancel', function () { paletteTouch = null; });
        palette.addEventListener('pointerdown', function (event) {
          event.preventDefault();
          event.stopPropagation();
        });
        palette.addEventListener('click', function (event) {
          // A touch already pressed it.
          if (Date.now() - lastTouchActivation < 800) return;
          pressPaletteButton(paletteButton(event.target));
        });

        function editHighlight(mark) {
          var selection = window.getSelection && window.getSelection();
          var range = document.createRange();
          try {
            range.selectNodeContents(mark);
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } catch (error) {
            return;
          }
          setEditing(mark.getAttribute('data-sermon-highlight-id'));
          placePalette(mark.getBoundingClientRect());
        }

        document.addEventListener('click', function (event) {
          if (palette.contains(event.target)) return;
          var mark = event.target.closest('mark[data-sermon-highlight-id]');
          if (!mark) return;
          if (TAP_TO_EDIT) {
            editHighlight(mark);
            return;
          }
          emit(ACTIONS.openNote, { highlightId: mark.getAttribute('data-sermon-highlight-id') });
        });
        document.addEventListener('selectionchange', function () {
          var selection = window.getSelection && window.getSelection();
          clearTimeout(showTimer);
          if (!selection || selection.isCollapsed) {
            // A press on the toolbar itself keeps it up.
            if (!paletteTouch) hidePalette();
            return;
          }
          rememberSelection();
          // Adjusting the selection away from a tapped highlight leaves editing it.
          if (editingHighlightId) {
            var mark = document.querySelector('mark[data-sermon-highlight-id="' + CSS.escape(editingHighlightId) + '"]');
            if (!mark || selection.toString() !== mark.textContent) setEditing(null);
          }
          // A phone selects with a long press and drag handles, which the page
          // never sees as a finger lifting — so the toolbar also follows the
          // selection itself once it settles (not mid-drag with a mouse, nor
          // mid-stroke with a Pencil).
          if (mouseDown || pencilStart || window.__sermonPencilActive) return;
          showTimer = setTimeout(function () { showPaletteForSelection(false); }, 300);
        });
        document.addEventListener('pointerdown', function (event) {
          if (event.pointerType === 'mouse') mouseDown = true;
        }, true);
        document.addEventListener('pointerup', function (event) {
          if (event.pointerType === 'mouse') mouseDown = false;
          if (event.pointerType !== 'pen') setTimeout(showPaletteForSelection, 0);
        });
        document.addEventListener('pointercancel', function () { mouseDown = false; });
        document.addEventListener('touchend', function () { setTimeout(showPaletteForSelection, 80); }, { passive: true });
        document.addEventListener('keyup', function () { setTimeout(showPaletteForSelection, 0); });

        function caretAtPoint(x, y) {
          if (document.caretPositionFromPoint) {
            var position = document.caretPositionFromPoint(x, y);
            return position ? { node: position.offsetNode, offset: position.offset } : null;
          }
          if (document.caretRangeFromPoint) {
            var range = document.caretRangeFromPoint(x, y);
            return range ? { node: range.startContainer, offset: range.startOffset } : null;
          }
          return null;
        }

        var pencilStart = null;
        window.__sermonPencilActive = false;
        function stopPencil() {
          if (!pencilStart && !window.__sermonPencilActive) return;
          pencilStart = null;
          window.__sermonPencilActive = false;
          emit(ACTIONS.pencil, { active: false });
        }
        function startPencil(x, y, event) {
          var caret = caretAtPoint(x, y);
          var root = caret && closestRoot(caret.node);
          if (!caret || !root) return false;
          pencilStart = { node: caret.node, offset: caret.offset, root: root, x: x, y: y, moved: false };
          window.__sermonPencilActive = true;
          emit(ACTIONS.pencil, { active: true });
          var oldSelection = window.getSelection && window.getSelection();
          if (oldSelection) oldSelection.removeAllRanges();
          if (event && event.cancelable) event.preventDefault();
          return true;
        }
        function movePencil(x, y, event) {
          if (!pencilStart) return;
          var caret = caretAtPoint(x, y);
          if (!caret || closestRoot(caret.node) !== pencilStart.root) return;
          if (event && event.cancelable) event.preventDefault();
          if (Math.hypot(x - pencilStart.x, y - pencilStart.y) >= 4) pencilStart.moved = true;
          if (!pencilStart.moved) return;
          var selection = window.getSelection && window.getSelection();
          if (!selection) return;
          // Pencil strokes stay in one verse: compute only this root's text,
          // not every verse in the entire document on every move.
          var root = pencilStart.root;
          var text = root.textContent || '';
          var anchor = offsetInRoot(root, pencilStart.node, pencilStart.offset);
          var focus = offsetInRoot(root, caret.node, caret.offset);
          var start = Math.min(anchor, focus), end = Math.max(anchor, focus);
          if (start === end) {
            var isWordChar = function (char) { return /[\\p{L}\\p{M}\\p{N}_]/u.test(char); };
            if (isWordChar(text.charAt(start))) end = Math.min(text.length, start + 1);
            else if (start > 0 && isWordChar(text.charAt(start - 1))) start -= 1;
            else return;
          }
          var expanded = expandToWholeWords(text, start, end);
          var left = boundaryForOffset(root, expanded.start);
          var right = boundaryForOffset(root, expanded.end);
          var range = document.createRange();
          try {
            range.setStart(left.node, left.offset);
            range.setEnd(right.node, right.offset);
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (error) {
            // Don't interrupt the stroke if a verse was re-rendered mid-drag.
          }
        }
        function endPencil(x, y, event) {
          if (!pencilStart) return;
          movePencil(x, y, event);
          setEditing(null);
          commitSelection('gold');
          stopPencil();
        }

        document.addEventListener('pointerdown', function (event) {
          if (event.pointerType === 'pen') startPencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointermove', function (event) {
          if (event.pointerType === 'pen') movePencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointerup', function (event) {
          if (event.pointerType === 'pen') endPencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointercancel', stopPencil);

        document.addEventListener('touchstart', function (event) {
          var touch = event.touches && event.touches[0];
          if (touch && touch.touchType === 'stylus') startPencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchmove', function (event) {
          var touch = event.touches && event.touches[0];
          if (touch && touch.touchType === 'stylus') movePencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchend', function (event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (touch && touch.touchType === 'stylus') endPencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchcancel', stopPencil);
      })();
  `;
}
