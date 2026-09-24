/**
 * Generic, domain-agnostic UI primitives shared across feature components: the
 * shared tone record and class-join helper, plus Badge, Callout, Combobox,
 * Drawer, Marker, Meter and Segmented (see docs/design-system.md).
 * @packageDocumentation
 */

import { useId, useState, useRef, useEffect } from 'react';
import { ChevronGlyph } from './Glyphs';

/** Hoisted out of the render: 235 <li>s each allocating an identical style
 *  object is 235 allocations per keystroke, and the object never varies.
 *  contentVisibility skips layout+paint for the off-screen rows, which is what
 *  keeps opening the list cheap; containIntrinsicSize supplies the row height
 *  those skipped rows would have had, so the scrollbar and `scrollIntoView`
 *  still land in the right place. */
const OPTION_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 34px',
};

interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text shown muted after the label in the list only — never in
   *  the closed trigger, which has room for one line. Not searched: the query
   *  matches what the reader typed the name of. */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** What this picker selects ("Character", "Weapon", …). Without it the
   *  control's only accessible name is its current value, so a screen-reader
   *  user hears "Raiden Shogun, button" with no idea what it sets. */
  label?: string;
  /** Applied to whichever control is showing (button when closed, input when
   *  open) so a sibling `<label htmlFor>` targets it. Both are labelable
   *  elements, so clicking the label opens the list. */
  id?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  label,
  id,
}: ComboboxProps) {
  const listId = useId(); // three of these render on one page — ids must differ
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Open/closed swap <input> for <button> at the same position, so React
  // unmounts whichever element had focus and it lands on <body>. Track that
  // the user was in here to hand focus back to the trigger on close.
  const wasOpen = useRef(false);
  // Scrolling the list is right when the *keyboard* moved the cursor, and
  // wrong when the pointer did: hovering an option set activeIndex, which
  // scrolled the row under the cursor and hovered a different one.
  const keyboardNav = useRef(false);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? placeholder ?? '';

  // Lowercased once per render, not once per option.
  const needle = query.toLowerCase();
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options;

  function changeQuery(next: string) {
    setQuery(next);
    setActiveIndex(0);
  }

  /** Open with the cursor on the current selection, not on option 0 — a
   *  235-option list opened at the top every time, so "next character" meant
   *  scrolling back to where you already were. */
  function openList() {
    keyboardNav.current = true;
    const i = options.findIndex((o) => o.value === value);
    setActiveIndex(i >= 0 ? i : 0);
    setOpen(true);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // `aria-activedescendant` moves the assistive cursor but never scrolls the
  // listbox: 15 ArrowDowns left scrollTop at 0 and the highlight off-screen.
  // Runs on `query` too, because filtering renumbers the options.
  useEffect(() => {
    if (!open || !keyboardNav.current) return;
    const el = listRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query]);

  useEffect(() => {
    if (!open) return;
    function onOutsideMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        changeQuery('');
      }
    }
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown);
  }, [open]);

  function handleSelect(opt: ComboboxOption) {
    onChange(opt.value);
    setOpen(false);
    changeQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // Dismissing the list is the whole of the Escape press: without
      // stopPropagation an ancestor drawer/dialog closed at the same time,
      // and without preventDefault the browser could reset the field too.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      changeQuery('');
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (filtered.length === 0) return;
      e.preventDefault();
      keyboardNav.current = true;
      setActiveIndex(e.key === 'Home' ? 0 : filtered.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      // Always swallowed while open. This input usually sits inside a <form>,
      // and an Enter that matched nothing used to fall through as an implicit
      // submit — the list closing *and* the form submitting on one press.
      e.preventDefault();
      if (filtered[activeIndex]) handleSelect(filtered[activeIndex]);
      else {
        setOpen(false);
        changeQuery('');
      }
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      keyboardNav.current = true;
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      keyboardNav.current = true;
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  }

  // Tabbing out of the input (or clicking past it) must close the listbox —
  // mousedown-outside alone leaves it open under keyboard navigation.
  function onBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      wasOpen.current = false; // focus left deliberately; don't yank it back
      setOpen(false);
      changeQuery('');
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={onBlur}>
      {open ? (
        <input
          ref={inputRef}
          id={id}
          className="field"
          role="combobox"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={
            filtered[activeIndex] ? optionId(activeIndex) : undefined
          }
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
        />
      ) : (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-label={label}
          aria-haspopup="listbox"
          // No `aria-controls` while closed: the listbox it names does not
          // exist, and a dangling idref is a broken relationship, not an
          // empty one.
          aria-expanded="false"
          className="field flex w-full items-center justify-between gap-2 text-left"
          onClick={openList}
          // Down/Up opening the list is the combobox convention; without it
          // the only keyboard way in was Enter/Space.
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              openList();
            }
          }}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronGlyph className="rotate-90 text-accent" />
        </button>
      )}
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          // Keep focus in the input while an option is clicked; otherwise the
          // blur-close below fires first and the click lands on nothing.
          onMouseDown={(e) => e.preventDefault()}
          // overscroll-contain: hitting the end of 235 options must not hand
          // the wheel to the page (or, on mobile, to the drawer behind it).
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-surface-900 shadow-popover"
        >
          {filtered.length === 0 ? (
            // role=presentation: a listbox may only own option/group children.
            <li role="presentation" className="px-3 py-2 text-sm text-muted">
              No results
            </li>
          ) : (
            filtered.map((opt, i) => (
              // Row is ~34-36px tall, under the 44px .touch-target floor used
              // elsewhere — deliberate density trade-off for a 235-option
              // list; see issue #101 (informational AAA finding, not AA).
              <li
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={opt.value === value}
                className={[
                  'cursor-pointer px-3 py-2 text-sm',
                  opt.value === value ? 'text-accent' : 'text-paper',
                  i === activeIndex ? 'bg-white/5' : 'hover:bg-white/5',
                ].join(' ')}
                style={OPTION_STYLE}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => {
                  keyboardNav.current = false;
                  setActiveIndex(i);
                }}
              >
                {opt.label}
                {opt.hint && (
                  <span className="ml-2 text-2xs text-muted">{opt.hint}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
