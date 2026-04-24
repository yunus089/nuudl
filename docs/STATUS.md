# NUUDL Statusbericht

Stand: 2026-04-24

Dieser Bericht ist eine Arbeitsstand-Schätzung, keine finale Launch-Freigabe. Die Prozentwerte zeigen, wie nah der jeweilige Block an einem belastbaren Beta-/Launch-Zustand ist.

## Gesamtstatus

| Bereich | Status | Tendenz |
| --- | ---: | --- |
| Phase A: Closed Beta und Betriebsfähigkeit | 99% | steigend |
| Phase B: Sicherheit, Sessions und operative Robustheit | 83% | steigend |
| Phase C: Monetarisierung und Launch-Readiness | 17% | stabil |
| Closed-Beta-Readiness | 99% | steigend |
| Soft-Launch-Readiness | 84% | steigend |

## Teilbereiche

| Block | Status | Einschätzung |
| --- | ---: | --- |
| Consumer/PWA Core | 91% | Kernflows laufen, Shell/UX ist verbessert, Rebranding bleibt späterer großer Sweep. |
| Admin/Backoffice | 95% | Live-Ops, Review-/Finance-Flows, Audit-Kontext, serverseitige Audit-Filter, ehrliche Moderator-Sicht, echte Backoffice-User-/Session-Objekte, Owner-Rollenverwaltung und Break-Glass-Recovery sind sichtbar; zentrale Admin-Regressionstests sind ergänzt. |
| Moderator-Ebene | 84% | Moderation ist nutzbarer, Rollenlogik ist serverkanonisch und Content-Preview/Moderationsaktionen, Audit-Kontext sowie serverseitig gekappte Audit-Sicht sind per API-Test abgesichert. |
| Account-Layer | 83% | Optionaler Account-Layer ist angelegt; Wallet, Notifications, Channel-Präferenzen, Chat, Creator-Status, Votes, Reports, Username-Race-Guards, öffentliche Feed-Anonymität, Geräteübersicht, Remote-Logout, Admin-/Audit-Kontext sowie Logout-/Re-Link-/Account-Wechsel-Kanten sind jetzt per Multi-Device-/Privacy-Regressionstest abgesichert. |
| Persistenz/DB | 78% | Snapshot- und Postgres-Brücke stehen; Core-Content, Chat, Notifications, Wallet/Creator/Tip/Ledger, Admin/Ops sowie Idempotency, Restrictions, Abuse-/Geo-Events, Risk-State und Rate-Limit-Counters sind im normalisierten Mirror/Read-Overlay angekommen. |
| Medien/Uploads | 79% | Upload-Seam ist operativ, proxy-/HTTPS-sichere absolute Medien-URLs, konfigurierbarer Upload-Pfad/Size-Limit, Ops-Sicht und Deploy-Gates fuer Public-Base-/Media-Smoke sind da; Produktionsspeicher/CDN-Hardening bleibt offen. |
| Security/Abuse | 83% | Rate-/Restriction-Grundlagen, account-aware Restriction-Enforcement, Geo-Cooldown/-Jump-Guards, Vote-Dämpfung, Abuse-/Geo-Events, Risk-State, Idempotency, Session-Rotation/-Reuse-Reset, Remote-Session-Revoke, Admin-Security-Override-Tests, Account-Link-Konfliktguards, Logout-/Re-Link-Schutz, auditierbare Account-/Install-Kontexte, Content-Type-Guard, serverseitig begrenzte Moderator-Audit-Sicht, Redis-fähiger Rate-Limit-Store mit Memory-Fallback, kanonische Backoffice-Rollen/Sessions und Owner-Recovery sind aktiv bzw. persistenzfähig. |
| Deploy/Ops | 97% | Coolify-Pfad, Preflight-Profile, Standard-/Strict-Doctor, Clean-State-, Invite-, Media-Origin-, Upload-, Rate-Limit-, Backoffice-Session- und Break-Glass-Schalter-Doku sind jetzt belastbar; Redis-Aktivierung, Medien-Basis-URL und der Admin-Build haben explizite Ops-/Preflight-Gates. |
| SEO/GEO/AEO/Content | 52% | Landingpage, strukturierte Daten, FAQ-/HowTo-Signale, `llms.txt`, Sitemap, Robots und erste programmatische Stadtseiten sind aktiv; Offsite-/Social-Search-Ausbau bleibt offen. |
| Monetarisierung/KYC/Payouts | 17% | bewusst Phase C; echte Provider und Finance-Hardening noch offen. |

## Zuletzt erledigt

- Closed-Beta-Invite-Gate in API und Consumer verdrahtet.
- `preflight:private-beta` und `preflight:soft-launch` eingeführt.
- Deploy-Schalter, Coolify-Regeln und Launch-Fallen dokumentiert.
- `doctor:deploy` eingeführt und auf Standard-Modus `ready` gebracht, wenn keine getrackten Runtime-/Backup-/Build-Artefakte mehr existieren.
- `doctor:deploy:strict` ergänzt, um final vor Push/Deploy einen unsauberen Working Tree bewusst zu markieren.
- `apps/api/.data/` und `backups/` aus dem Git-Index entfernt, aber lokal erhalten.
- Chat-Requests und Chat-Messages in den normalisierten PostgreSQL-Mirror und Read-Overlay aufgenommen.
- Notifications in den normalisierten PostgreSQL-Mirror und Read-Overlay aufgenommen.
- Wallet-Balances, Wallet-Topups, Ledger-Entries, Tip-Events und Creator-Application in den normalisierten PostgreSQL-Mirror und Read-Overlay aufgenommen.
- Feature Flags, City Health, Creator-Reviews, Payout-Accounts, Payouts, Moderation-Actions, Backoffice-Actions und Audit-Logs in den normalisierten PostgreSQL-Mirror und Read-Overlay aufgenommen.
- Runtime-Store um `creatorReviews`, `payoutAccounts`, `payouts`, `cityHealth` und echte `moderationActions` erweitert.
- Creator-Approval und Admin-Payout erzeugen jetzt zusätzlich persistierbare Review-/Payout-Datensätze statt nur Ledger-/Audit-Nebenwirkungen.
- Idempotency-Records, Install-Restrictions, Abuse-/Geo-Events, Device-Risk-State und Rate-Limit-Counters in Mirror und Read-Overlay aufgenommen.
- Geo-Resolve und Install-Register schreiben jetzt nachvollziehbare Geo-Events für spätere Risk-/Audit-Auswertung.
- Restriction-Enforcement ist account-aware: aktive Restrictions auf verknüpften Installs greifen jetzt über den Account-Kontext hinweg.
- Geo-Resolve/Register schützt gegen schnelle City-Wechsel und unrealistische Geo-Sprünge mit Risk-Score, Abuse-Event und `geo_switch_block`.
- Votes haben zusätzlich zur Install-Rate-Limitierung eine account-aware Dämpfung gegen Multi-Device-Bursts.
- API-Regressionstests für Admin/Moderator-Flows ergänzt: Rollenmatrix, Content-Preview in Reports, Moderationsaktionen, Security-Overrides, Owner-Reset, Creator-Review und Payout-Audit.
- API-Regressionstests für Session-Härtung ergänzt: Refresh-Rotation ersetzt Access-/Refresh-Token, Refresh-Reuse widerruft die komplette Token-Family mit Abuse-/Risk-Kontext und Session-Limits halten nur die neuesten aktiven Sessions.
- Session-Limit-Auswahl deterministischer gemacht, damit bei schnellen Logins zuverlässig die älteste nicht-aktuelle Session-Family widerrufen wird.
- API-Regressionstests für Account-Ownership ergänzt: Wallet-Migration, account-weite Notifications, Channel-Präferenzen, Chat-Requests/-Messages, Creator-Status, Vote-Uniqueness und Reports bleiben über mehrere verknüpfte Installs konsistent.
- Öffentliche Post-/Reply-Payloads liefern keine technischen `accountId`s mehr aus; normale Accounts bleiben vollständig anon-first, Creator zeigen nur die bewusst öffentliche Identität (`displayName`, `@username`).
- Alte Gast-Posts und Gast-Replies bleiben auch nach späterem Account-Link und Creator-Upgrade öffentlich anonym; interne Account-Ownership wird von öffentlicher Creator-Identität getrennt.
- E-Mail-Code-Verify prüft Username-Konflikte direkt vor dem Account-Link erneut; parallele Signup-/Recovery-Races geben sauber `409 CONFLICT` zurück und verknüpfen das Gerät nicht falsch.
- Account-Linking schützt zusätzlich gegen widersprüchliche `accountId`-/E-Mail-/Username-Kombinationen und wandelt Identitätskonflikte in eine klare API-Fehlermeldung um.
- Account-Linking schließt veraltete aktive Links desselben Installs automatisch, bevor ein verifizierter Account-Wechsel oder Re-Link abgeschlossen wird.
- `/account/me` liefert jetzt sichere Geräte-/Install-Zusammenfassungen mit Stadtbindung, `current`-Marker und `lastSeenAt`, ohne Token- oder Refresh-Daten offenzulegen.
- Consumer-Settings zeigen die Zahl der verknüpften Geräte, das aktuelle Gerät und weitere aktive Geräte direkt im Account-Bereich.
- Logout ist als Geräte-Logout abgesichert: Das aktuelle Install wird entkoppelt, andere verknüpfte Geräte bleiben mit demselben Account verbunden.
- `/account/me` liefert für verknüpfte Geräte jetzt zusätzlich `deviceLabel`, `status`, `sessionCount` und `canRemoteLogout`, ohne technische Token oder Refresh-Daten offenzulegen.
- `/account/devices/:installIdentityId/logout` ergänzt Remote-Logout für andere Geräte: aktive Sessions und Refresh Tokens des Zielgeräts werden widerrufen, der Account-Link wird getrennt und ein Audit-Event wird geschrieben.
- Consumer-Settings zeigen verknüpfte Geräte mit klarer Gerätebezeichnung, Aktiv-/Session-Status, Stadtbindung und einer echten Abmelden-Aktion für andere Geräte.
- API-Regressionstest deckt Remote-Logout inklusive Session-Revoke, Refresh-Token-Revoke, aktuellem Gerät bleibt verbunden, idempotentem Wiederholklick und Audit-Event ab.
- API-Regressionstests decken verifizierten Account-Wechsel, Re-Link zurück zum ursprünglichen Account und die Regel "maximal ein aktiver Account-Link pro Install" ab.
- Admin-Audit-Logs lösen Zielkontext jetzt nicht mehr nur aus Metadata, sondern auch aus `entityType/entityId` für Account, Install, Post, Reply, Report, Moderation Case, Chat, Ledger, Tip und Creator-Antrag auf.
- API-Regressionstest deckt Account-Link, Post-Create und Report-Create als accountgebundene Audit-Einträge mit Account- und Install-Kontext ab.
- `/admin/audit-logs` unterstützt jetzt serverseitige Filter für `entityType`, `entityId`, `action`, `actorType`, `actorId`, `actorRole`, `accountId`, `installIdentityId`, `q` und `limit`.
- Audit-Suche wertet jetzt auch verschachtelte Metadata wie `before`/`after` aus, damit Channel-/Flag-Änderungen über reale Feldwerte gefunden werden koennen.
- Moderatoren bekommen serverseitig nur die letzten 8 Audit- und Backoffice-Eintraege; die Admin-UI kennzeichnet den geladenen Ausschnitt jetzt explizit gegen die Gesamtzahl.
- API-Regressionstest deckt Audit-Filter, Query-Suche, Actor-Role-Filter und die serverseitige Moderator-Kappung ab.
- Rate-Limit-Mutationen aus `routes.ts` in einen zentralen Store-Seam gezogen: aktueller Beta-Default bleibt `RATE_LIMIT_BACKEND=memory`, Redis kann per `RATE_LIMIT_BACKEND=redis` bewusst aktiviert werden.
- Redis-Rate-Limit-Adapter mit kurzer Connect-Timeout-Regel, `/admin/ops`-Readiness und Memory-Fallback ergänzt, damit ein Redis-Ausfall die API nicht hart vom Netz nimmt.
- `preflight:private-beta` zeigt jetzt `storage.persistence.rateLimit` explizit im Ergebnis und kann Redis mit `--require-redis-rate-limit` hart erzwingen.
- Medien-Uploads liefern jetzt stabile absolute URLs über `API_PUBLIC_BASE_URL` oder Proxy-Header statt blindem Request-Protokoll; das reduziert HTTPS-/Proxy-Fehler im Deploy.
- API-Regressionstest deckt Upload-URLs mit gesetzter Public-Base-URL und mit `x-forwarded-proto`/`x-forwarded-host` ab.
- Medien-Uploads respektieren jetzt `API_UPLOADS_DIR` und `MEDIA_UPLOAD_MAX_BYTES`, damit der Beta-Deploy Pfad und die Dateigroesse bewusst konfiguriert werden koennen.
- API-Regressionstest deckt jetzt auch Upload-Ablehnung oberhalb des konfigurierten Size-Limits ab.
- `preflight:private-beta` blockiert Nicht-Loopback-Deploys jetzt, wenn `storage.uploadsDirectory.publicBaseUrl` fehlt; damit rutschen kaputte Medien-Basis-URLs nicht mehr still in die Beta.
- `smoke:beta` prueft jetzt den Upload nicht nur bis zur API-Response, sondern ruft die ausgelieferte Medien-URL direkt wieder ab.
- Admin-Proxy injiziert auf echten Deploys jetzt eine serverseitige Operator-Session ueber `NUUDL_BACKOFFICE_ID`, `NUUDL_BACKOFFICE_ROLE` und `NUUDL_BACKOFFICE_SHARED_SECRET`, statt Browser-Rollen blind zur API durchzureichen.
- Die API vertraut Backoffice-Rollen jetzt nur noch mit passendem `x-backoffice-secret`; ohne Secret bleibt nur der explizite Loopback-Dev-Fallback.
- Die Admin-UI leitet ihr Rollen-Gating jetzt von `/admin/backoffice/session` ab und der Proxy unterstuetzt `PATCH`, damit Channel-/Flag-Aktionen auch ueber den Next-Backoffice-Seam sauber laufen.
- API-Regressionstest deckt jetzt den Trusted-Proxy-Backoffice-Seam inklusive Shared-Secret-Pflicht ab.
- `preflight:private-beta` prueft bei gesetzter `NUUDL_ADMIN_BASE_URL` jetzt auch die echte Admin-Operator-Session und verlangt auf Nicht-Loopback `authMode=trusted_proxy`.
- Runtime-Store und Schema fuehren jetzt echte `backofficeUsers` und `backofficeSessions`; Operator-Kontext ist damit nicht mehr nur eine lose Header-Behauptung.
- Der Admin-Proxy vergibt jetzt pro Browser eine httpOnly-Session-ID und reicht sie als `x-backoffice-session-id` an die API durch; nicht-loopback Deploys landen dadurch im Modus `trusted_proxy_session`.
- `/admin/backoffice/session` liefert jetzt neben Actor und Rechten auch kanonische `user`- und `session`-Objekte fuer UI, Audit und Deploy-Checks.
- Backoffice-Audit-Metadaten stempeln jetzt `authMode`, `backofficeUserId`, `backofficeSessionId`, `effectiveRole` und `requestId` automatisch mit.
- `/admin/backoffice/users` ergänzt Owner-only Operator-Management mit User-Liste, Rollen, Permission-Summary, aktiven/ widerrufenen Sessions und Disable-Status.
- Backoffice-Rollen sind jetzt kanonisch im Store: bestehende User koennen nicht mehr durch spaetere Header/Proxy-Rollen hochgestuft werden.
- Owner-Rollenverwaltung in der Admin-UI ersetzt den Platzhalter: Rollen ändern, User deaktivieren/aktivieren und aktive Operator-Sessions widerrufen.
- Disabled-Backoffice-User werden serverseitig blockiert; Deaktivierung widerruft aktive Sessions und verhindert Self-Lockout des aktuellen Owners.
- API-Regressionstests decken Owner-Rollenverwaltung, Header-Elevation-Schutz, Session-Revoke und Owner-Self-Lockout ab.
- `npm run backoffice:break-glass` ergänzt einen Offline-Recovery-Pfad fuer ausgesperrte Owner; der Befehl nutzt dieselbe Snapshot-/Postgres-Persistenz wie die API und schreibt Audit-/Backoffice-Action-Eintraege.
- `docs/deploy/BACKOFFICE_BREAK_GLASS.md` dokumentiert den Notfallablauf inklusive API-Stopp/Restart, Session-Reset, Coolify-Hinweisen und Verifikation nach Recovery.
- API-Regressionstests decken Break-Glass-Recovery fuer deaktivierte/heruntergestufte Owner und das Erzeugen eines ersten Owners ab.
- Fastify redacted jetzt auch `x-backoffice-secret` und `x-backoffice-session-id`, damit der Backoffice-Trust-Seam nicht versehentlich in Logs auftaucht.
- `preflight:private-beta` und `smoke:beta` verstehen jetzt den Backoffice-Shared-Secret-Pfad und brechen nicht mehr am echten Trusted-Proxy-Setup.
- `build:deploy` baut jetzt `shared`, `api`, `consumer` und `admin`, damit der Deploy-Check den echten Monorepo-Releasepfad vollständig abnimmt.
- Deploy-/Launch-Doku um `RATE_LIMIT_BACKEND`, `RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS`, `REDIS_URL` und den Pflicht-Check `storage.persistence.rateLimit.status=redis_active` ergänzt.
- HTTP-Guard gegen Content-Type-Header mit Leading-/Trailing-Whitespace ergänzt, um die aktuelle Fastify-Audit-Warnung serverseitig zusätzlich abzufangen, bis ein Upstream-Fix verfügbar ist.
- SEO/GEO/AEO-Discovery-Layer ergänzt: zentrale Discovery-Datenquelle für Städte, Themen und kurze Antwort-Snippets.
- Landingpage um leise Themencluster, City-Links, Answer-Snippets und erweiterte strukturierte Daten ergänzt, ohne die Conversion-Seite mit langen SEO-Blöcken zu überladen.
- Programmatische Local-SEO-Grundlage mit statischen `/stadt/[slug]`-Seiten für priorisierte Startstädte eingeführt.
- `/llms.txt` ergänzt, damit LLM-/Answer-Engines NUUDL als 18+ PWA, lokalen Stadtfeed und anon-first Produkt sauber einordnen können.
- Sitemap und Robots für Landingpage, Stadtseiten und LLM-Datei aktualisiert.
- Search-Discovery-Strategie dokumentiert, inklusive SEO, LLM SEO/GEO, AEO, Social Search, Topical Authority, Parasite SEO, Local SEO und Programmatic SEO.

## Aktuelle harte Hinweise

- Lokale Testdaten existieren weiterhin in `apps/api/.data/`; das ist für interne Arbeit okay.
- Vor externen Beta-Invites muss `npm run preflight:private-beta -- --expect-empty` grün sein.
- Sobald Redis in der Zielumgebung angeschlossen ist, muss zusätzlich `npm run preflight:private-beta -- --require-redis-rate-limit` grün sein.
- Auf Proxy-/HTTPS-Deploys sollte `API_PUBLIC_BASE_URL=https://api.deine-domain.tld` in der API gesetzt sein, damit Medien-URLs nicht aus internen Headern abgeleitet werden.
- Für echte Beta-Deploys sollten `API_UPLOADS_DIR` und `MEDIA_UPLOAD_MAX_BYTES` bewusst gesetzt sein, statt den Upload-Pfad und das Limit implizit dem Default zu überlassen.
- Für echte Admin-Deploys muessen `BACKOFFICE_SHARED_SECRET` in der API sowie `NUUDL_BACKOFFICE_ID`, `NUUDL_BACKOFFICE_ROLE` und `NUUDL_BACKOFFICE_SHARED_SECRET` in der Admin-App gesetzt sein; der Browser ist keine Rollenquelle mehr.
- Auf Nicht-Loopback-Deploys ist `trusted_proxy_session` jetzt der gesunde Zielzustand fuer Admin; `trusted_proxy` ohne Session-ID sollte nur noch als Uebergangs- oder Debug-Seam auftauchen.
- Owner verwalten echte Operatoren jetzt unter Rollenverwaltung; nach Rollenänderungen oder Deaktivierung ist `/admin/backoffice/users` die Quelle der Wahrheit, nicht mehr der alte lokale Rollen-Switch.
- Mindestens ein aktiver Owner muss erhalten bleiben; Self-Downgrade und Self-Disable des aktuellen Owners sind bewusst blockiert.
- Wenn trotzdem kein Owner erreichbar ist, nur den dokumentierten Break-Glass-Pfad verwenden: API stoppen oder direkt danach redeployen/restarten, `npm run backoffice:break-glass -- --owner-id <id> --confirm-break-glass`, danach Admin-Session pruefen.
- `smoke:beta` schreibt weiterhin echte Testdaten; erst nach `preflight` und nur bewusst gegen nicht-leere Zielumgebungen laufen lassen.
- Vor jedem API-/Backoffice-Deploy sollte `npm run test:api` zusätzlich zu Typecheck/Build grün sein.
- Fuer Moderatoren ist die Audit-Sicht absichtlich serverseitig auf die letzten 8 Eintraege begrenzt; tiefere Incident-Triage bleibt Admin/Owner vorbehalten.
- Der Standard-Deploy-Doctor ist für Repo-Hygiene gedacht; der Strict-Doctor bleibt bis zum finalen Commit/Push bewusst warnend.
- Coolify-Deploy bleibt zweigeteilt: `nuudl-api` und `nuudl-consumer`, kein Monorepo-Einzeldeploy.

## Nächste sinnvolle Blöcke

1. Redis in echter Umgebung abnehmen: Coolify-Redis-Ressource verbinden, `RATE_LIMIT_BACKEND=redis` nur dort testen und `/admin/ops` auf `redis_active` prüfen.
2. Medien-/Upload-Hardening: Produktionsspeicher/CDN, langlebige URLs und Ops-Checks für echten Beta-Betrieb sauber abnehmen.
3. Status-quo-Testdeploy: nach Commit/Push API und Consumer redeployen, danach `preflight:private-beta` gegen Live-URLs ausführen.
4. SEO/GEO/AEO v2: Social-Search-Hooks und Offsite-/Parasite-SEO-Plan finalisieren, ohne die Landingpage sichtbarer zu belasten.
5. Rebranding Wave: erst nach stabilen Produkt-/Ops-Blöcken final visuell durchziehen.
6. Finaler Deploy-Cut: `doctor:deploy:strict`, `test:api`, `build:deploy`, `preflight:private-beta -- --expect-empty`.
