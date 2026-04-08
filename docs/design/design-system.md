# NUUDL - Design System

## 1. Farbpalette (Dark Mode First)
Das Farbsystem basiert auf funktionalen Rollen, um Chaos zu vermeiden und visuelle Ruhe zu schaffen. Das resultierende System transportiert den Charakter eines "dark premium social products" – markant, aber reif und kontrolliert.

- **Backgrounds**
  - `bg-base`: `#0A0A0A` (Tiefstes Schwarz, App-Hintergrund fuer optimale Tiefe)
  - `bg-surface`: `#141414` (Feed-Posts, BottomNav)
  - `bg-surface-elevated`: `#1F1F1F` (Sheets, Modals, Dropdowns)
- **Text**
  - `text-primary`: `#FFFFFF` (Headings, Post-Content, aktive Tabs)
  - `text-secondary`: `#A3A3A3` (Meta-Daten, Timestamps, inaktive Elemente)
  - `text-tertiary`: `#525252` (Placeholder, Disabled States)
- **Accent (Refined Neon Edge)**
  - `accent-primary`: `#E83D6D` (Gesättigtes, reifes Rosé-Pink. Stark, aber nicht aggressiv grell.)
  - `accent-muted`: `rgba(232, 61, 109, 0.15)` (Subtile Hintergrund-Highlights, Active States)
- **Status**
  - `status-success`: `#10B981` (Tipping Erfolg, Profil verifiziert)
  - `status-warning`: `#F59E0B` (NSFW-Warnung, Alters-Gate)
  - `status-danger`: `#EF4444` (Account-Sperre, Delete-Actions)

## 2. Accent & Visual Discipline Rules
Der Akzent ist das wichtigste Werkzeug fuer die Lenkung der Aufmerksamkeit. Er wird streng reglementiert:
- **15%-Regel:** Die Akzentfarbe darf maximal 10 bis 15 % der sichtbaren Screen-Flaeche dominieren.
- **Usage:** Akzente werden ausschliesslich fuer Primary Actions (z.B. der zentrale "Post"-Button), Votes, aktive Navigationselemente und wichtige Highlights benutzt.
- **Disziplin:** Wenn alles leuchtet, leuchtet nichts. Vermeide den inflationaeren Einsatz von Pink. Text-Hyperlinks oder sekundaere Buttons bleiben monochrom (`text-primary` oder `text-secondary`), bis sie essenziell werden.

## 3. Typografie-System
Font: Inter oder Roboto (Clean, modern, extrem gut lesbar).

- `Heading-L`: 24px, Bold, Tracking -0.5px (Screen Titles)
- `Heading-M`: 18px, SemiBold (Post Titles, Sheet Headers)
- `Body-Primary`: 16px, Regular, Line-Height 1.5 (Post Content, optimal fuer Lesbarkeit im Feed)
- `Body-Secondary`: 14px, Medium (Button Texte, Usernamen, Tags)
- `Meta`: 12px, Regular (Timestamps, Distance, winzige Labels)

## 4. Spacing-System (8px Grid)
Stringente Abstaende, um Ordnung zu schaffen und das UI atmen zu lassen.
- `4px` (xs): Innerhalb von kleinen Components (Icon + Label)
- `8px` (sm): Zwischen Text-Elementen in einem Post
- `16px` (md): Standard-Padding fuer Posts, Cards, Screen-Raender
- `24px` (lg): Zwischen Sektionen
- `32px` (xl): Bottom Spacing vor der BottomNav

## 5. Radius-System
Moderne, konsistente Edge-Geometrie, die erwachsen wirkt.
- `radius-sm`: 8px (Tags, Badges, kleine Buttons)
- `radius-md`: 12px (Media-Container, Standard-Buttons)
- `radius-lg`: 20px (Feed-Posts, Interaktions-Container)
- `radius-xl`: 24px (Bottom Sheets top-left/right)

## 6. Shadow & Border-Regeln
Tiefe entsteht im Dark-Mode durch Helligkeitsunterschiede (Surface Elevating) und feine Linien, nicht durch weiche Schatten.
- **Borders:** Wir nutzen hauchduenne Borders (`1px solid #262626`) zur strukturellen Trennung.
  - Keine Borders um dominante Inhaltsbloecke. Divider funktionieren besser als Box-Borders.
  - `border-focus`: `1px solid #E83D6D` fuer aktive Inputs.
- **Shadows:** Stark zurueckhaltend.
  - Nur fuer schwebende Elemente (Bottom Nav, Modals).
  - Keine grellen Glow-Effekte. Ein sehr weicher, dunkler Drop-Shadow (`0 8px 30px rgba(0,0,0,0.5)`) reicht aus, um Elevated Elements optisch ueber die Base-Layer zu heben.

## 7. State-System
- **Hover** (Desktop/Web): `bg-surface` wird punktuell zu `bg-surface-elevated`
- **Active/Press** (Mobile): Scale down to 0.98 (fuer direktes, hochwertiges taktiles Feedback).
- **Selected**: Text wird `text-primary`, Icon bekommt `accent-primary`.
