# NUUDL Design System v1.0

**Direction: Brutally Minimal + Editorial**
Darkness as privacy. Typography as the only decoration. Accent only on action.

---

## Principles

1. **The post is the UI.** Typography carries everything. No decorative chrome, no illustration, no icons that explain themselves. If you can remove it, do.
2. **Darkness is privacy.** A dark background signals: what you share here disappears into the night. Bright UIs feel surveilled.
3. **Accent = action only.** The rose `#e83d6d` appears exclusively on active interaction states — a voted post, the compose FAB, notification badge. Never in a resting feed. Scarcity is meaning.

---

## Typography

| Role | Font | Weight | Size range | Usage |
|------|------|--------|------------|-------|
| Display / Post body | Fraunces | 300 | 13–48px | Post text, headings, composer textarea |
| UI / Labels / Nav | DM Sans | 400, 500 | 11–15px | Buttons, nav labels, sheet headers, input text |
| Timestamps / Counts / Metadata | DM Mono | 400 | 9–12px | Timestamps, vote counts, presence signal, char counter, channel slugs |

**Loading:** Google Fonts, `display=swap`. Fallbacks: Georgia (Fraunces), system-ui (DM Sans), monospace (DM Mono).

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400;500&display=swap');
```

**Rules:**
- Never use `font-weight: bold` or `700` anywhere in the app.
- DM Sans caps at `500` (medium).
- Fraunces italic is available and appropriate for placeholder text in the composer.
- Inter is fully removed.

---

## Color Tokens

```css
--bg: #0a0a0a;              /* App background */
--surface: #111111;          /* Cards, sheets */
--surface-raised: #161616;   /* Elevated elements within sheets */
--border: #1e1e1e;           /* Dividers, outlines */
--text-primary: #f0eaf5;     /* Post body, headings — warm off-white */
--text-secondary: #9d9393;   /* Timestamps, labels, muted — warm gray */
--accent: #e83d6d;           /* Active vote, compose FAB, notification dot ONLY */
```

**Accent rule (strict):** `--accent` (#e83d6d) appears on:
- Vote button when the current user has voted (`voted` state)
- Compose FAB (the `+` button)
- Notification count badge dot

It does **not** appear on: resting post cards, navigation items, channel labels, headings, dividers, input borders, or any text.

**Migrating from previous tokens:**
- `#ffffff` → `#f0eaf5`
- `#a3a3a3` → `#9d9393`
- `#262626` → `#1e1e1e`
- Accent `#e83d6d` is kept but scope is reduced to the three states above.

---

## Border Radius

```css
--radius-xl: 16px;   /* Bottom sheets, large cards */
--radius-lg: 12px;   /* Cards, channel icons */
--radius-md: 6px;    /* Inputs, buttons, badges */
--radius-sm: 4px;    /* Small chips, inline tags */
```

Previous values (`24px`, `20px`, `12px`, `8px`) are replaced entirely.

---

## Spacing

Base unit: `4px`. Scale: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.

Key layout values:
- Post padding: `14px` vertical, `16px` horizontal
- Top bar: `9px` vertical, `14px` horizontal
- Sheet padding: `14px` horizontal, `16px` vertical
- Bottom nav: `7px` top, `10px` bottom

---

## Component Notes

### Post card
- Body: Fraunces 300, 13px, line-height 1.6, `--text-primary`
- Channel slug + timestamp: DM Mono 9px, `--text-secondary`
- Vote action: DM Mono 9px — gray when unvoted, rose when voted
- "Antworten" / "Chat": DM Mono 9px, `--text-secondary`, no underline

### Composer sheet
- Sheet handle: 32px wide, 3px tall, `#2a2a2a`
- Textarea font: Fraunces 300, 16px, `--text-primary`
- Placeholder: Fraunces 300 italic, `#3a3a3a`
- Cursor: `--accent` color
- Char counter: DM Mono 9px, `--text-secondary`
- Submit button: DM Sans 500, 11px, bg `--text-primary`, text `--bg`

### Presence signal
```css
.presenceSignal {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-secondary);
  padding: 4px 14px;
  letter-spacing: 0.02em;
}
```
Only rendered when `activeCount >= 2`.

### Bottom navigation
- DM Mono 7px, uppercase, letter-spacing 0.04em
- Active item: `--text-primary`; inactive: `--text-secondary`
- Active icon: `--text-primary` fill; inactive: `#1e1e1e` fill
- No accent on nav items ever

### Buttons
| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| primary | `--text-primary` | `--bg` | none |
| ghost | transparent | `--text-secondary` | `--border` |
| accent | `--accent` | white | none |
| danger | transparent | `--accent` | `--accent` at 20% opacity |

### Inputs
- Background: `--bg`
- Border: `--border` (1px)
- Border-radius: `--radius-md` (6px)
- Text: DM Sans 13px, `--text-primary`
- Placeholder: `--text-secondary`
- Focus: border `#2a2a2a` — no glow, no shadow

---

## Implementation Plan

### Phase 1 — Typography
1. Add Google Fonts import to `apps/consumer/app/globals.css`
2. Remove Inter import
3. Set `--font-display: 'Fraunces', Georgia, serif`
4. Set `--font-ui: 'DM Sans', system-ui, sans-serif`
5. Set `--font-mono: 'DM Mono', monospace`
6. Apply `var(--font-display)` to post body, composer textarea, display headings
7. Apply `var(--font-mono)` to timestamps, vote counts, presence signal, char counter, channel slugs

### Phase 2 — Color + Tokens
1. Update all six CSS custom properties in `globals.css`
2. Audit every `#e83d6d` / `var(--accent)` usage — remove from any non-active-state
3. Confirm `--text-primary` reads as warm off-white on OLED displays

### Phase 3 — Border Radius
1. Update `--radius-xl/lg/md/sm` variables

### Phase 4 — QA
- iPhone + Android visual check
- OLED black rendering
- Font loading fallback (Georgia for Fraunces)
- Presence signal legibility at 9px
