# NUUDL - UI Grundprinzipien

## 1. Fokus und Visuelle Ruhe: Jede Ansicht hat EINEN Star
- Jedes Screen-Layout darf nur **EIN** Hauptfokus-Element besitzen.
- Wenn zwei Elemente gleichzeitig um Aufmerksamkeit schreien, ist das Design falsch kalibriert.
- Visuelle Spannung entsteht bei NUUDL nicht durch optisches Chaos oder bunte Farben, sondern durch harten Kontrast (`text-primary` gegen `bg-base`) und klare Hierarchien.
- Das Produkt soll sich zu jeder Zeit **schnell, kontrolliert und hochwertig** anfuehlen.

## 2. Visuelle Priorisierung: Der Feed ist King
- Der Feed muss maximalen Platz einnehmen. Alles andere ordnet sich visuell und raeumlich unter.
- Top-Bar und Bottom-Nav duerfen beim Scrollen visuell in den Hintergrund treten (z.B. Halftransparenz, leichter Blur-Effekt oder Ausblenden bei Scroll-Down).
- **Content (Texte und Bilder im Feed)** ist das einzige Element, das absolutes Weiss (`#FFFFFF`) beanspruchen darf. Metadaten, Menues und Rahmen treten stark abgedimmt (`text-secondary`) in den Hintergrund, um den Fokus auf den Kern-Nutzwert zu lenken.

## 3. Flat vs. Elevated (Klare Ebenen-Struktur)
- **Flat (Base Level 0):** Der Hintergrund der App ist tiefschwarz (`bg-base`).
- **Surface (Level 1):** Posts im Feed liegen flach auf (ohne Schatten). Sie werden horizontal durch feine `border-subtle` Divider getrennt. Wir verzichten auf das Einkapseln von Posts in separate "Cards", um maximale Screen-Flaeche und Klarheit zu bewahren. Das wirkt unruhiger. Der Scroll-Fluss muss nahtlos bleiben.
- **Elevated (Level 2):** Menues, Bottom-Sheets, Notification-Popups. Diese bekommen `bg-surface-elevated` und evtl. einen harten Top-Radius. Sie heben sich durch ihre Aufhellung (und optional einen dunklen Foundation-Schatten) vom Feed ab.

## 4. Visuelle Disziplin
- Sekundaere Elemente sind strikt monochrom. Navigations- und Action-Icons sind einfarbig (`text-secondary`), es sei denn sie repraesentieren den aktiven State oder die primaere Call-to-Action.
- Der Wechsel zwischen den Screens und Sheets muss vorhersehbar und fliessend sein (angemessene, physikalisch korrekte Animationen).

## 5. Umgang mit NSFW, Paywalls & Alters-Gates
- **Systematisierte Verschleierung:** Wir begegnen NSFW im Feed erwachsen. Extreme Unschaerfe (`backdrop-filter: blur(24px)`) erzeugt die noetige Distanz und regt die Neugierde durch organische Farbdurchlaessigkeit an. Kein aufgesetzter Growth-Hack-Vibe, sondern funktionale Aesthetik.
- **Monetarisierung (Creator/Premium):** Premium-Features koennen ueber eine sekundaere Akzentfarbe (Gold / dunkles Violett) signalisiert werden, um sich von der Basis-App-Mechanik abzuheben, ohne den Premium-Charakter in Frage zu stellen.
