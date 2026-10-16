---
name: SignalForge
description: Research workspace drawn as an emission-line plate. Every source is a line on one calibrated rail.
colors:
  plate-ground: "#121314"
  plate-surface: "#1a1b1d"
  plate-raised: "#222326"
  plate-rule: "#33353a"
  plate-rule-strong: "#4b4e54"
  bone: "#e6e1d6"
  bone-dim: "#aaa59a"
  bone-faint: "#918d84"
  lightbox-ground: "#ecebe7"
  lightbox-surface: "#f8f7f4"
  lightbox-raised: "#ffffff"
  lightbox-rule: "#d2d0c9"
  lightbox-rule-strong: "#a9a69e"
  ink: "#1a1b1d"
  ink-dim: "#55534d"
  ink-faint: "#6b6962"
  lightbox-line-405: "#6a4fd8"
  lightbox-line-436: "#4352cc"
  lightbox-line-486: "#0b7aa3"
  lightbox-line-546: "#287a3d"
  lightbox-line-589: "#8a6400"
  lightbox-line-615: "#b2560f"
  lightbox-line-656: "#c23a2e"
  plate-continuum-1: "#151617"
  plate-continuum-2: "#1c1d1f"
  plate-continuum-3: "#2d2c2a"
  plate-continuum-peak: "#3b3933"
  plate-continuum-5: "#242425"
  plate-continuum-6: "#161718"
  lightbox-continuum-1: "#e6e4de"
  lightbox-continuum-2: "#deddd6"
  lightbox-continuum-3: "#d9d6ce"
  lightbox-continuum-peak: "#d0ccc1"
  lightbox-continuum-5: "#dad8d1"
  lightbox-continuum-6: "#e4e2dc"
  print-ink: "#000"
  print-rule: "#999"
  line-405-violet: "#a68bff"
  line-436-indigo: "#8792ff"
  line-486-cyan: "#5cc8ec"
  line-546-green: "#7fd48c"
  line-589-sodium: "#f2c94c"
  line-615-orange: "#f39a4f"
  line-656-red: "#ef6b5f"
typography:
  display:
    fontFamily: "'Sofia Sans Extra Condensed', 'Noto Sans Devanagari', 'Arial Narrow', sans-serif"
    fontSize: "clamp(3.4rem, 6.6vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.005em"
  section:
    fontFamily: "'Sofia Sans Extra Condensed', 'Noto Sans Devanagari', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.5rem, 4.6vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 0.95
  page:
    fontFamily: "'Sofia Sans Extra Condensed', 'Noto Sans Devanagari', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.4rem, 3.6vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 0.95
  panel:
    fontFamily: "'Sofia Sans Extra Condensed', 'Noto Sans Devanagari', 'Arial Narrow', sans-serif"
    fontSize: "2.1rem"
    fontWeight: 600
    lineHeight: 1
  title:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  report:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  heading:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
  lead:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  small:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  wordmark:
    fontFamily: "'Sofia Sans Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1
  label:
    fontFamily: "'Sofia Sans', 'Noto Sans Devanagari', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 650
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  control: "3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "72px"
  rail-gutter: "200px"
components:
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.plate-ground}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.control}"
    padding: "13px 19px"
  input:
    backgroundColor: "{colors.plate-raised}"
    textColor: "{colors.bone}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
---

# SignalForge design system

Tokens above are the dark plate and light lightbox values. The live source of truth is the custom properties at the top of `app/site.css`; keep both in step.

## Overview

**The emission-line plate.** A spectrogram on a viewing box: a charcoal continuum crossed by thin bright lines, read against one calibrated rail. SignalForge borrows the instrument's grammar because the product has the same job. It turns noise into a small number of lines you can trace.

- **One rail.** An off-centre vertical rail runs down every surface. Section labels, navigation ticks and status marks hang off it. It is a visual signature, never a replacement for navigation: links and buttons stay labeled and in familiar places.
- **Seven lines, seven templates.** Each research template owns one line color. Pitch is drawn as a doubled line, its identifying glyph, at the same weight as every other line. Pitch is featured, not ranked above the other workflows.
- **State is line form plus a word.** Color identifies; form and label carry state. Every mark that encodes meaning has a readable text label next to it.
- **No line means "verified".** A line shows where a claim came from. Citation copy never implies a fact-check.

Surfaces: marketing is always the dark plate (Persuade). The workspace, sign-in, and shared reports follow the viewer's theme: dark plate or light lightbox (Operate/Read). Print is always light.

## Colors

- **Plate (dark):** ground `#121314`, surface `#1a1b1d` for prose plates and panels, raised `#222326` for inputs and selected rows. Text is bone, never pure white.
- **Lightbox (light):** ground `#ecebe7`, surface `#f8f7f4`, raised `#ffffff`. Text is ink `#1a1b1d`.
- **Emission lines** (dark-plate values; the light theme uses the deeper `lightbox-line-*` variants):

  | Line | Template |
  |---|---|
  | 486 cyan | Brand intelligence |
  | 656 red | Competitive landscape |
  | 546 green | Audience research |
  | 589 sodium (doubled) | Pitch playbook |
  | 405 violet | Trend radar |
  | 615 orange | Category deep dive |
  | 436 indigo | Your own question |

- **Signal accent:** sodium is also the focus and selection color.
- **Continuum:** spectrum plates (hero library, passes, research in progress, overview library) sit on a six-stop horizontal gradient (`*-continuum-*`) with 1px banding every 4px. This is the instrument's own surface; it never appears behind ordinary content.
- Lines are 1–2px hairlines or small glyphs. They never become fills, gradients, or glows, and never color body text.
- Contrast (verified): text tokens ≥4.6:1 on ground, surface, and raised in both themes; body text 12–17:1. Every line color ≥3:1 against every ground, including the continuum peak. Faint text never sits on the continuum.
- Print uses black ink and `#999` rules on white. The mobile drawer is the only shadow (`rgba(0,0,0,.28)`).

## Typography

- **Headlines only:** Sofia Sans Extra Condensed, 600, tight leading. Page titles, hero lines, report titles, section headlines.
- **Everything else:** Sofia Sans text cut. Body, forms, tables, reports, labels, buttons.
- **Devanagari:** Noto Sans Devanagari sits in every stack as a fallback, loaded by `unicode-range`, so Hindi and Marathi subjects, questions, and report text render properly without extra cost for Latin-only pages.
- **Headline steps:** display (hero, closing), section (marketing band headings, sign-in story), page (page titles, report titles, product names), panel (form and panel titles, stats, pricing).
- **Text steps:** 13 / 14 / 15 / 16 / 17 / 18 / 20 / 23px. 13 is the floor (labels, fine print); 16 is body; 17 is report prose; 20 and 23 are text-cut titles inside documents. The wordmark is a fixed 26px logo size. Label case: sentence case by default; tracked caps only for the rail-gutter section labels.
- **Monospace** (system `ui-monospace`) only for code, keys, and URLs.

## Layout

- **Rail gutter:** on desktop, content sits in a grid of `[rail-gutter 200px][content]`. The rail line runs at the gutter's left edge; section labels sit in the gutter on a tick. Below 900px the rail moves to the left edge, labels stack above content, and the gutter collapses.
- **Workspace:** the left sidebar keeps its labeled nav buttons. The rail runs through the nav as a vertical line; each item has a short tick, and the active item's tick extends in the sodium signal color. The overview's library spectrum is a non-interactive summary (one line per real report, colored by template, captioned with the count); reports open from the labeled list below it, and the template list on the same page is the color key.
- **Measure:** report prose max 68ch. Marketing body copy max 60ch.
- **Spacing rhythm:** 4 / 8 / 16 / 24 / 40 / 72. More space above a heading than below it.

## Motion

- One authored moment per surface. Marketing: the four passes advance once when scrolled into view (1.5s per pass) and stop as soon as a visitor picks a pass; source lines land with a single damped overshoot (`cubic-bezier(.34,1.4,.64,1)`), the instrument's own settling motion. Workspace: running research drifts its dashed lines.
- Everything else uses the exponential ease-out `cubic-bezier(.16,1,.3,1)` on color, opacity, and transform only.
- Reduced motion: animations stop, the passes jump straight to the final pass, and smooth scrolling is off.

## Elevation & Depth

Flat. Depth comes from tonal steps (ground → surface → raised) and 1px rules, never from shadows. The only shadow is on the mobile navigation drawer, to separate it from the content underneath.

## Shapes

Square instrument plates: 0 radius on panels and plates, 3px on controls and citation chips. No pills except the small status label. Dividers are 1px rules in `--rule`.

## Components

- **Buttons:** primary is a solid bone (dark) or ink (light) plate with ground-colored text. Secondary is a 1px outline with a short colored tick at its left edge. Focus everywhere: a 2px dashed sodium outline offset 3px.
- **Status label:** a small line glyph plus a word. Running is dashed and drifts slowly (static under reduced motion). Ready is solid. Partial is half-height. Needs attention and cancelled are struck through. Labels come straight from the report's real status.
- **Template glyph:** a short vertical line in the template's color (pitch doubled) followed by the template name.
- **Citations:** 13px numbered chips (24px hit area) that link to their entry in the report's source trail; each trail entry links back to the first place its source is cited. They work with keyboard and touch, carry an accessible name ("Source 3: title"), and the targeted entry highlights. Each trail entry shows title, hostname, and an external link.
- **Coverage:** connected sources show a solid line and "Available". Missing sources show a struck line and "Not connected". Setup-pending shows dashed and "Setup needed".
- **Monitors:** enabled rules show a solid line, paused rules a half-height line, both labeled. "Due now" appears only when the rule's real next-run time has passed.

## Do's and Don'ts

- **Do** label every line with words. Color is never the only carrier.
- **Do** mark illustrative content as illustrative wherever a visitor could mistake it for real research.
- **Do** keep navigation, buttons, and form controls in their conventional form and position.
- **Don't** show loading, stale, cited, or coverage states the application data does not report.
- **Don't** use "verified", "fact-checked", or equivalent wording for citations.
- **Don't** add glows, gradient haze, glass, or floating mockups. Lines stay flat and crisp.
- **Don't** put condensed type on body copy, forms, tables, or report paragraphs.
- **Don't** give pitch more size, brightness, or position than the other templates.
