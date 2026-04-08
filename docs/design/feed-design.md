# NUUDL - Feed Design

## 1. Scroll-Speed & Proportionen (Die Flow-Regel)
Ein Feed lebt von Frequenz und Reibungslosigkeit. Das Design muss sicherstellen, dass der Nutzer nicht in riesigen Content-Bloecken "feststeckt":
- **Screen-Limit:** Ein einzelner Feed-Post sollte idealerweise nicht mehr als 1.2 Screenhoehen dominieren.
- **Line truncation:** Text ab 4–5 Zeilen wird sanft gekuerzt (Fade-Out oder "Mehr"-Button), um das Scroll-Tempo hoch zu halten.
- **Zuegiger Rhythmus:** Mit einem einfachen Wisch muss sofort der Beginn neuen Contents ins Sichtfeld fliessen. Bilder/Videos duerfen gross sein, aber nicht den Fluss blockieren.

## 2. Struktur eines perfekten Feed-Posts
Die Struktur folgt strikt der Relevanz fuer den Nutzwert (von oben nach unten):

1. **Header (Meta-Daten):**
   - Elemente: Entfernung (z. B. "2 km"), Zeit ("2h").
   - Funktion: Liefert lediglich stummen Kontext. Setzt sich visuell stark zurueck (extrem small, `text-secondary`).
2. **Content (The Meat):**
   - Klar definierter Text (`Body-Primary`), linksbuendig.
   - Absoluter Kontrast (`text-primary`), exzellente Zeilenabstaende (`line-height: 1.5`).
3. **Media (Bilder / Videos):**
   - Media nutzt die volle Post-Breite (minus 16px Padding links/rechts). Bilderrahmen: `12px` Radius.
   - **NSFW-Handling:** Medien, die gefiltert sind, erhalten einen tiefen Blur. Ein klares Overlay-Icon (z.B. durchgestrichenes Auge) signalisiert den State, Ein Tap entfernt den Blur lokal und sofort.
4. **Action Bar (Footer):**
   - Votes (Up/Down) ganz links.
   - Comments (mit Icon + Counter) in der Mitte.
   - Bookmark / Options ganz rechts.
   - Zustand: Dezent (Grau), leuchtet nur bei aktiver User-Interaktion (z.B. getaetigter Upvote) zielgerichtet in der System-Akzentfarbe auf.

## 3. Visuelle Hierarchie im Feed
1. **Der User-Content (Media/Text):** Dominiert optisch alles andere im Frame.
2. **Engagement-Indikatoren (Upvotes):** Muessen sofort scannbar sein, um den Social Proof des Posts zu verdeutlichen.
3. **Metadaten:** Erspaeht man nur, wenn man gezielt danach sucht.

## 4. Klare Do's and Don'ts
- **DO:** Nutze minimale Haarlinien-Divider (`border-subtle`), um Posts zu separieren. Das fuehrt zu einer aufgeraeumten, ununterbrochenen vertikalen Achse.
- **DO:** Lass den Content horizontal atmen (16px Spacer Kante Screen zu Content ist Pflicht).
- **DON'T:** Niemals dicke Boxen oder Card-Raender um Standard-Posts ziehen. Das stoert den "Endless Scroll" Vibe optisch extrem.
- **DON'T:** Stopfe die Action-Bar mit irrelevanten Funktionen voll. Reduziere sie kompromisslos auf Vote und Comment. Der Rest wandert in ein Action-Menu (...).
