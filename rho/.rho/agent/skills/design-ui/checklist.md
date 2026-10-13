# design-ui checklist

Run this on every screen before handing it off. P0 must pass. P1 should pass; say which ones
don't and why. P2 is polish. In app mode, read "tokens" as the app's own tokens (CSS variables,
Tailwind theme, component library theme), not the seed's.

## P0 — must pass

- [ ] **No raw colours outside the token block.** Every colour is a token or a `color-mix()` of
      tokens. Grep `#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(` outside `:root` (or the app's theme file):
      nothing.
- [ ] **One accent, with one job.** The accent marks the primary action and the current
      selection (active nav item, selected tab, focus ring, checked control) and nothing else. At
      most one primary button per view region.
- [ ] **Every interactive element has hover, `:focus-visible` and disabled styles**, and is
      reachable and operable by keyboard in a sensible order. No `outline: none` without a
      replacement.
- [ ] **States are designed, not skipped.** Each data region shows its empty state (what it is,
      how to fill it), loading state (skeleton matching the final layout) and error state
      (what failed, how to retry). Forms show field errors next to the field with `aria-invalid`.
- [ ] **Contrast meets WCAG AA**: 4.5:1 for body and muted text, 3:1 for large text, icons and
      control borders that carry meaning — in both themes.
- [ ] **No horizontal page scroll at 375 px.** Wide tables scroll inside their own container;
      grids collapse; the sidebar folds away; the topbar keeps only essential actions.
- [ ] **Plausible sample data only.** Realistic names, amounts, dates and counts that agree with
      each other (totals add up, a count matches the rows). No lorem ipsum, "Item 1 / Item 2",
      or invented marketing metrics ("10× faster", "99.9% uptime").
- [ ] **Icons are inline SVG in one style.** No emoji as icons, no icon fonts, no mixed sets.
      Icon-only buttons have an `aria-label`.
- [ ] **No external runtime dependencies in prototypes.** No CDN scripts, web fonts or hotlinked
      images unless `DESIGN.md` names them. The file opens offline.
- [ ] **No decorative gradients or glows.** No purple/blue gradient backgrounds, gradient text,
      neon shadows or glassmorphism cards. The seed's frosted topbar and skeleton shimmer are the
      only exceptions.
- [ ] **Semantic HTML.** Real `<button>`, `<a>`, `<label for>`, `<table>` with `<th>`,
      `<dialog>`, landmarks (`<nav>`, `<main>`, `<header>`). No clickable `<div>`.

## P1 — should pass

- [ ] **Type stays on the scale**: five sizes at most, three weights (400, 500, 600). Hierarchy
      comes from size, weight and colour (`--fg` vs `--muted`), not from more sizes.
- [ ] **Spacing stays on the 4/8 px scale** (`--s1`…`--s8`). Related things sit closer than
      unrelated things.
- [ ] **Numbers are tabular and right-aligned** in tables; currency and units are consistent;
      dates use one format.
- [ ] **Labels say what happens.** "Create invoice", "Send reminder", "Delete project" — not
      "Submit", "OK", "Click here". Destructive actions use `.btn-danger` and confirm.
- [ ] **Density fits the task.** Data-heavy screens use 32 px controls and compact rows;
      settings and onboarding can breathe. Don't pad a table to look like a landing page.
- [ ] **Alignment holds.** Left edges line up across header, toolbar and table; card paddings
      match; icons sit centred with their label.
- [ ] **Both themes work.** Switch with the theme toggle (or `prefers-color-scheme`) and look at
      every surface: no white flashes, no invisible borders, badges still legible.
- [ ] **Copy is short and specific.** Headings under eight words; descriptions one sentence;
      empty states say what will appear and offer the next action.
- [ ] **Motion is minimal**: ≤150 ms colour/opacity transitions, nothing that moves layout,
      and `prefers-reduced-motion` turns it off.

## P2 — polish

- [ ] `text-wrap: balance` on headings, `pretty` on paragraphs.
- [ ] Sticky headers (topbar, table header on long lists) where scrolling loses context.
- [ ] Truncation with `text-overflow: ellipsis` and a `title` for long names in dense rows.
- [ ] Keyboard shortcuts shown in tooltips or menus for frequent actions.
- [ ] One considered detail that shows care: a well-designed empty state, a useful inline
      summary, a precise relative date ("due in 3 days").

## Anti-slop spot-check

Look at the screen for two seconds. If your gut says any of:

- "this is a generic SaaS dashboard template"
- "four stat cards, a chart and a table, because that's what dashboards have"
- "every card looks the same weight; nothing tells me where to start"
- "the accent is everywhere"

…go back. Ask what the user does first on this screen and make that the most prominent thing;
cut a region that doesn't serve the task; replace one generic element (a vanity stat, a stock
chart) with something specific to this product's data; remove one use of the accent.
