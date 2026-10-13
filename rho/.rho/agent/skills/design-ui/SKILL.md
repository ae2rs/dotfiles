---
name: design-ui
description: Design good-looking web app UI — a new screen as a self-contained HTML prototype built from a seed, or a restyle of real components in an existing app — held to a DESIGN.md brand contract, an anti-slop checklist and a scored self-critique. Use when asked to design, mock up, prototype or restyle a screen, page, dashboard, form or component, or to critique or review a UI.
---

# Design web app UI

Good UI comes from four habits: a written brand contract, a direction locked before building,
hard rules, and an honest critique. Files next to this one:

- `template.html` — the prototype seed: app shell, tokens with a dark theme, component classes,
  icon sprite. Its header comment lists every class.
- `checklist.md` — P0/P1/P2 rules and the anti-slop spot-check. Read it before building, not
  only after.
- `check.mjs` — measures page overflow at 375 and 1280 px in both themes, and runtime errors.
  Usage is in its header.

Two modes:

- **Prototype** — a new screen as one self-contained HTML file. For "mock up", "prototype",
  "explore", or when there is no app yet.
- **In app** — change real components in the repo's own stack. For changes to screens the app
  already has, or when asked to build it for real.

Ask with `questionnaire` when the mode is unclear. To only review a UI, go to step 4.

You cannot see rendered pages or images. Reason from the source, measure with `check.mjs`, and
ask the user to look when a judgement is purely visual.

## 0. Find or write DESIGN.md

Look for `DESIGN.md` at the repo root, then in `docs/` and `design/`. Read it whole; it
overrides every default in this skill and in the seed.

If there is none, write one before designing:

- **In app**: derive it from what exists — CSS custom properties, `tailwind.config.*` or a
  Tailwind `@theme`, the component library's theme, global styles. Record what is there; fill
  only gaps with defaults.
- **From a reference URL**: fetch its CSS with `curl` and extract the palette, font stacks,
  radii and spacing. Describe the feel, don't copy the brand.
- **From nothing**: offer three directions with `questionnaire`, each with its palette, type and
  density in one line, the first recommended:
  1. *Quiet utility* — warm greys, one blue accent, system sans, 6 px radius, compact (the seed).
  2. *Warm editorial* — paper off-white, ink text, terracotta accent, serif headings over sans
     body, roomy spacing.
  3. *Crisp contrast* — pure white and near-black, one saturated green accent, 2 px radius, mono
     for data, dense.

Write it to the repo root (or next to the prototype outside a repo):

```markdown
# <Product> design

## Direction
Who uses it and for what; the feel in three adjectives; what to avoid.

## Colour
| token     | light   | dark    | use                                   |
|-----------|---------|---------|---------------------------------------|
| bg        | #…      | #…      | page background                       |
| surface   |         |         | cards, sidebar, inputs                |
| fg        |         |         | primary text                          |
| muted     |         |         | secondary text, ≥4.5:1 on surface     |
| border    |         |         | dividers, control borders             |
| accent    |         |         | primary action and selection only     |
| accent-fg |         |         | text on accent                        |
| danger / success / warning |  |  | status text and badges          |

## Type
Sans and mono stacks; sizes 12 / 13 / 14 / 18 / 24; weights 400 / 500 / 600.

## Space and shape
4 px scale; radius; control height (32 px default); density.

## Components
Only where they differ from the defaults: buttons, inputs, tables, cards, badges, dialogs.

## Voice
Sentence case; verb-first labels; date, number and currency formats.
```

## 1. State the plan

Ask what the user does first on this screen, and make that the most prominent thing. Then state
the plan in one sentence and continue — the user can redirect cheaply now and not after 300
lines. Name the regions in reading order, the key components and the states you will show:

> Invoices: sidebar shell; header with New invoice; three summary stats; tabbed table with
> customer filter and bulk reminder; showing loaded, empty and error states of the table.

If the request is too vague to plan, ask instead.

App layout defaults, unless `DESIGN.md` says otherwise:

- Sidebar navigation for more than five sections, a top bar otherwise.
- A page header with the title on the left and one primary action on the right.
- Filters and bulk actions in a toolbar directly above the data they act on.
- Tables for comparable records, cards for heterogeneous items. A dashboard earns each stat
  card by a decision it supports.
- Forms in one column, 480–640 px wide, labels above fields, the primary button last.
- Dialogs for short focused tasks; a page for anything long or linkable. Destructive actions
  confirm and name the thing destroyed.

## 2. Build

### Prototype

1. `cp` `template.html` to the destination: `prototypes/<screen>.html` in a repo, else the
   working directory.
2. Read it through the end of `<style>`.
3. Set the `:root` tokens from `DESIGN.md`. Change font stacks only if it names fonts.
4. Replace the brand, the nav and everything inside `<main>` with the planned screen, composed
   from the seed's classes. Delete EXAMPLE markup you don't use; keep the CSS.
5. When a component is missing, add a class to the stylesheet built from tokens. No inline
   styles, no new colours, no new font sizes.
6. Show the non-default states in the same file: as extra sections below the main view, or a
   small state switcher in the topbar labelled "Prototype state".
7. Several screens: one file each, sharing identical tokens, linked from the nav.

### In app

1. Find the app's primitives — tokens, Button, Input, Table, Dialog, layout components — with
   `grep`, and read how they are used.
2. Map `DESIGN.md` onto the existing token system. Where they disagree, change token values in
   their one home, not per component. Never add a parallel token set or a second component
   library.
3. Edit real components in the repo's own conventions (CSS modules, Tailwind, styled
   components…), reusing primitives before writing new ones.
4. Run the repo's checks (types, lint, tests, stories) and find the route that shows the change.

## 3. Check

Go through `checklist.md` top to bottom and fix every P0 failure. For a prototype, run
`check.mjs` on the file; in app, run it on the dev server URL when one is running. Grep for raw
colours outside the token block. Then do the anti-slop spot-check.

## 4. Critique

Score five dimensions 0–10. Bands: 0–4 broken · 5–6 functional · 7–8 strong · 9–10 exceptional.

1. **Consistency** — one direction held through every decision: tokens, radii, icon style,
   density, copy voice.
2. **Hierarchy** — the eye lands on the user's first task; one primary action per region;
   `--fg` and `--muted` used deliberately.
3. **Detail** — alignment, spacing rhythm, numeric alignment, truncation, icon-label centring,
   both themes.
4. **Usability and states** — keyboard path, focus, labels, targets ≥ 24 px, field errors,
   empty, loading and error states, 375 px.
5. **Distinctiveness** — looks like this product, not a template; one specific, earned detail.
   5–6 is fine for internal tools.

Discipline:

- Cite evidence for every score: elements, class names, lines. A score without evidence doesn't
  count.
- Score the worst sustained band: one broken region caps the dimension.
- Don't inflate. If every score is 7 or more, you are not looking hard enough.
- Don't punish appropriate restraint in Distinctiveness.

Report in chat:

```
Consistency 7 — <30–80 words of evidence>
Hierarchy 5 — …
Detail 6 — …
Usability and states 8 — …
Distinctiveness 5 — …

Keep: what works; don't touch it.
Fix: P0/P1 problems, most expensive first.
Quick wins: small changes with outsized effect.
```

After building, fix the P0 and P1 items under Fix once, then stop; list what remains. When only
asked to review, read the stylesheet and 6–8 representative blocks before scoring, and change
nothing unless asked.

## 5. Hand off

- Prototype: the path and `open <path>`. In app: the route or dev server URL.
- One short summary: what is on the screen, which states are shown, P1 items skipped and why,
  the five scores on one line.
- Never paste the HTML into chat.
