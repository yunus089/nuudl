# NUUDL - Implementation Guide fuer den Coding-Agent (Codex)

**WICHTIG AN CODEX:**
Lies dieses Dokument penibel, bevor du Code modifizierst. Deine Aufgabe ist der **Frontend Design-Makeover & Architectural UI-Cleanup** von NUUDL in Richtung **Refined Neon Edge**.
- Du aenderst **nichts** an der Server-Logik, Datenbank-Routen, Auth-State, Hooks oder der grundlegenden Datenstruktur.
- Du fokussierst dich 100% auf die View-Layer Optimierung. Ziel ist eine kontrollierte, erwachsene und disziplinierte Umsetzung der Styling-Tokens.

---

## 1. Strenge Styling-Regeln (System Obedience)
- **Keine Design-Alleingaenge:** Ab sofort sind neue, systemfremde Farben streng verboten. Nutze ausschliesslich die in `design-system.md` definierten Variables (`bg-base`, `bg-surface`, `accent-primary` etc.).
- **Keine Border-Radius Freestyle:** Nutze nur noch die vordefinierten Radien (`radius-sm`, `radius-md`, `radius-lg`, `radius-xl`).
- **Keine zusaetzlichen Shadows:** Fuege keine Drop-Shadows zu Standard-Cards/Posts hinzu. Shadows existieren nur subtil unter Bottom Sheets oder Modals (`bg-surface-elevated`).
- **Accent-Disziplin:** Jede View muss als dieselbe App erkennbar sein. Setze die Akzentfarbe extrem sparsam ein, nur dort, wo User zwingend hingeleitet werden sollen.

---

## 2. Reihenfolge der Umsetzung
Die Ueberarbeitung muss inkrementell und strikt von aussen nach innen verlaufen, damit die Konsistenz nie bricht.

### Step 1: Lokale Theme Tokens (Tailwind / globals.css)
- Implementiere das Farb- und Radius-System in der `tailwind.config.ts` und dem Root-Stylesheet.
- Entferne alle unkontrollierten Global-Hintergruende im Body und setze starr auf `bg-base`.

### Step 2: Die Application Shell
- **TopBar:** Reduziere die Opulenz. Verringere das visuelle Gewicht, streiche starke Hintergrundfarben und dicke Borders. Ersetze es durch einen weichen Blur (`backdrop-blur`) oder pures schwarz mit einem 1px `border-subtle`.
- **BottomNav:** Ebenfalls beruhigen. Nutze `bg-surface`, mach das UI erwachsen und ruhig. Einziger Kontrastpunkt ist das "Active Item" (ggf. via `accent-primary`).

### Step 3: Der Feed (Das Herzstueck)
- Der Feed bleibt minimalistisch und ruhig. Die Action darf "sprechen", das Layout schweigt.
- Optimiere die Post-Komponente auf Full-Width (mit Side-Margins). Ersetze klobige Box-Karten durch einen cleanen Fluss, separiert mit `border-subtle` Dividern.
- Text-Groessen und Abstaende anhand der Typografie-Regeln nachkalibrieren.

### Step 4: Elevated Elements (Sheets & Overlays)
- Wende das `bg-surface-elevated` Schema konsequent auf alle Dialoge und Bottom-Sheets an. Diese benoetigen einen grosszuegigeren Top-Radius (z.B. `radius-xl`).

### Step 5: Copy & Text Replacement
- Aktualisiere in einem eigenen Sweep die UI-Texte, Empty-States, Auth-Labels und Alerts streng nach den Vorgaben der neuen `microcopy.md`.

### Step 6: Consistency Audit
- Ueberpruefe Querschnitts-Komponenten (Chips, Badges, Switches, Inputs), ob sie sich nahtlos in das verfeinerte Design-System einfuegen.

---

## 3. Final Quality Check (Fuer Codex vor Abschluss)
Bevor du einen Task als erledigt markierst, bewerte ihn anhand dieser Kriterien:

1. **[ ] System-Treue:** Wurden alle hardcodierten Grautoene / Farben entfernt und durch Variablen (`bg-base`, `text-secondary`, etc.) ersetzt?
2. **[ ] Fokus-Check:** Gibt es in der Screen-View genau EINE primaere Aktion, die visuell dominant ist? Weisen nicht versehentlich zwei Elemente dieselbe Akzent-Prioritaet auf?
3. **[ ] Flat Feed:** Sind alle unruhigen Schatten von den Standard-Posts entfernt? Fliesst der Content flach ueber den Divider?
4. **[ ] Accent-Ratio:** Liegt der Anteil der Akzentfarbe (`accent-primary`) unter der 15% Marke der Viewport-Flaeche?
5. **[ ] Tone of Voice:** Ist die Sprache langlebig, kurz und professionell (keine Slang-Auswuechse, die gegen die Guardrails verstossen)?
6. **[ ] Keine Backend-Modifikation:** Ist das DOM intakt geblieben und wurden APIs, State und Data-Fetching unangetastet gelassen?
