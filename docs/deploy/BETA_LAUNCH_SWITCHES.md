# NUUDL Beta- und Launch-Schalter

Diese Datei ist die schnelle Betriebsreferenz für Deploy, Closed Beta und spätere Launch-Vorbereitung. Wenn ein Wert hier nicht klar ist: nicht raten, sondern vor Deploy prüfen.

## Goldene Regeln

- `ALLOW_LOCAL_FALLBACKS=false` auf jedem echten Server.
- `ALLOW_FAKE_PAYMENTS=false` auf jedem echten Server.
- `API_SEED_PROFILE=clean` vor Beta-Invites.
- `BETA_INVITE_REQUIRED=true` für echte Closed-Beta-Invites.
- `BETA_INVITE_REQUIRED` muss in API und Consumer gleich gesetzt sein.
- `BETA_INVITE_CODES` niemals in Git committen.
- `RATE_LIMIT_BACKEND=memory` bleibt aktiv, bis eine echte Redis-Ressource verbunden und `/admin/ops` mit `redis_active` geprüft ist.
- Vor ersten externen Invites: `npm run preflight:beta -- --expect-empty`.
- Wenn Preflight mutable records meldet: bewusst resetten oder bewusst behalten, aber nicht ignorieren.

## Empfohlene Profile

| Kontext | Zweck | Wichtige Werte |
| --- | --- | --- |
| Local Demo | Lokales Entwickeln mit Demo-/Fallback-Daten | `ALLOW_LOCAL_FALLBACKS=true`, `ALLOW_FAKE_PAYMENTS=true`, `API_SEED_PROFILE=demo`, `BETA_INVITE_REQUIRED=false` |
| Private Beta | Echte Tester, keine Demo-Daten | `ALLOW_LOCAL_FALLBACKS=false`, `ALLOW_FAKE_PAYMENTS=false`, `API_SEED_PROFILE=clean`, `BETA_INVITE_REQUIRED=true`, `BETA_INVITE_CODES=<codes>` |
| Soft Launch | Öffentlichere Nutzung ohne Invite-Gate | `ALLOW_LOCAL_FALLBACKS=false`, `ALLOW_FAKE_PAYMENTS=false`, `API_SEED_PROFILE=clean`, `BETA_INVITE_REQUIRED=false` |

## Schalter-Synchronisation

Diese Werte müssen bewusst zusammenpassen. Wenn sie auseinanderlaufen, kann die App zwar starten, aber Nutzer landen in kaputten Flows.

| Thema | API | Consumer | Admin | Regel |
| --- | --- | --- | --- | --- |
| Invite-Gate | `BETA_INVITE_REQUIRED=true/false` | `BETA_INVITE_REQUIRED=true/false` | nicht nötig | API und Consumer müssen gleich sein. Preflight schlägt bei Mismatch fehl. |
| Invite-Codes | `BETA_INVITE_CODES=<secret>` | niemals setzen | niemals setzen | Codes bleiben ausschließlich serverseitig in der API. |
| API-URL | nicht nötig | `NUUDL_API_BASE_URL=https://api...` | `NUUDL_API_BASE_URL=https://api...` | Consumer/Admin sprechen öffentlich per HTTPS mit der API. |
| Backoffice-Session | `BACKOFFICE_SHARED_SECRET=<secret>` | nicht nötig | `NUUDL_BACKOFFICE_ID`, `NUUDL_BACKOFFICE_ROLE`, `NUUDL_BACKOFFICE_SHARED_SECRET=<gleiches secret>` | Nicht-Loopback-Admin-Zugriffe laufen über eine serververifizierte Operator-Session mit httpOnly Browser-Session-ID, nicht über frei gesetzte Browser-Header. |
| Local Fallbacks | optional irrelevant | `ALLOW_LOCAL_FALLBACKS=false` | `ALLOW_LOCAL_FALLBACKS=false` | Auf echten Servern nie aktiv lassen. |
| Fake Payments | `ALLOW_FAKE_PAYMENTS=false` | `ALLOW_FAKE_PAYMENTS=false` | nicht nötig | Für Beta/Launch server- und clientseitig aus. |
| Seed-Profil | `API_SEED_PROFILE=clean` | nicht nötig | nicht nötig | Demo-Daten werden nur serverseitig verhindert. |
| Rate Limits | `RATE_LIMIT_BACKEND=memory` oder bewusst `redis` | nicht nötig | nicht nötig | Für Beta zunächst `memory`. Redis erst mit `REDIS_URL`, Redeploy und Ops-Check `redis_active`. |

## Umschalten nach Phase

| Wechsel | Ändern | Nicht ändern |
| --- | --- | --- |
| Local Demo zu Private Beta | `API_SEED_PROFILE=clean`, `ALLOW_LOCAL_FALLBACKS=false`, `ALLOW_FAKE_PAYMENTS=false`, `BETA_INVITE_REQUIRED=true`, `BETA_INVITE_CODES` setzen | Ports, Start Commands, Base Directory |
| Private Beta zu Soft Launch | `BETA_INVITE_REQUIRED=false` in API und Consumer, `BETA_INVITE_CODES` entfernen oder leer lassen | `ALLOW_LOCAL_FALLBACKS=false`, `ALLOW_FAKE_PAYMENTS=false`, `API_SEED_PROFILE=clean` |
| Soft Launch zu Public Launch | Domain/SEO/Monitoring finalisieren, Payments/KYC nur nach Phase C aktivieren | Demo-/Fallback-Schalter bleiben aus |

## Pflichtvariablen pro App

### API

| Variable | Private Beta | Warum |
| --- | --- | --- |
| `API_HOST` | `0.0.0.0` | Container muss von Coolify/Traefik erreichbar sein. |
| `API_PORT` | `4000` | Muss zum Coolify-Port passen. |
| `API_LOG_LEVEL` | `info` | Strukturierte Logs ohne Debug-Rauschen. |
| `API_PUBLIC_BASE_URL` | `https://api.deine-domain.tld` | Erzwingt stabile absolute Medien-URLs hinter Proxy/CDN; vermeidet falsches `http://` aus eingehenden Headern. |
| `API_UPLOADS_DIR` | optional, z. B. `/app/apps/api/.data/uploads` | Erlaubt einen expliziten Upload-Pfad statt still auf den Default `.data/uploads` zu vertrauen. |
| `API_STORAGE_DRIVER` | `snapshot_file` oder `postgres` | `snapshot_file` reicht für frühen VPS-Test; `postgres` nach DB-Ressource. |
| `API_SEED_PROFILE` | `clean` | Verhindert Demo-Posts, Demo-Chats, Fake-Wallets beim frischen Bootstrap. |
| `BETA_INVITE_REQUIRED` | `true` | Schaltet Closed-Beta-Codeprüfung für neue Installs ein. |
| `BETA_INVITE_CODES` | comma-separated, geheim | Gültige Invite-Codes, z. B. `NUUDL-MUC-001,NUUDL-MUC-002`. |
| `ALLOW_FAKE_PAYMENTS` | `false` | Fake-Zahlungen dürfen serverseitig nicht aktiv sein. |
| `MEDIA_UPLOAD_MAX_BYTES` | `10485760` | Maximal erlaubte Bildgröße in Bytes; begrenzt Disk-/Abuse-Risiko im Beta-Betrieb. |
| `RATE_LIMIT_BACKEND` | `memory` | Aktuell stabiler Beta-Modus. `redis` nur nach Redis-Ressource, `REDIS_URL` und Ops-Check `redis_active`. |
| `RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS` | `750` | Kurzer Redis-Verbindungsversuch, damit ein kaputter Redis die API nicht am Start hindert. |
| `JWT_SECRET` | langer Secret-Wert | Nicht `change-me`; nicht committen. |
| `DATABASE_URL` | nur bei `API_STORAGE_DRIVER=postgres` | Interne Postgres-URL aus Coolify. |
| `DATABASE_SSL` | abhängig vom Provider | Bei externem Provider oft `true`/`require`, bei internem Coolify meist `false`. |

### Consumer

| Variable | Private Beta | Warum |
| --- | --- | --- |
| `NUUDL_API_BASE_URL` | `https://api.deine-domain.tld` | Der Browser spricht diese API an. Muss HTTPS sein. |
| `NUUDL_CONSUMER_BASE_URL` | `https://app.deine-domain.tld` | Für Preflight und spätere Canonicals. |
| `ALLOW_LOCAL_FALLBACKS` | `false` | Verhindert lokale Demo-Fallbacks auf echtem Server. |
| `ALLOW_FAKE_PAYMENTS` | `false` | Verhindert Demo-Payment-UI/Flows auf echtem Server. |
| `BETA_INVITE_REQUIRED` | gleich wie API | Zeigt im Adult-Gate das Beta-Code-Feld. Codes selbst bleiben nur in der API. |

### Admin

| Variable | Private Beta | Warum |
| --- | --- | --- |
| `NUUDL_API_BASE_URL` | `https://api.deine-domain.tld` | Admin-Proxy spricht die API an. |
| `NUUDL_ADMIN_BASE_URL` | `https://admin.deine-domain.tld` | Optional für Preflight. |
| `NUUDL_BACKOFFICE_ID` | z. B. `owner-root` | Serverseitig injizierte Operator-ID für echte Deploys. |
| `NUUDL_BACKOFFICE_ROLE` | `moderator`, `admin` oder `owner` | Serverseitig injizierte Backoffice-Rolle fuer echte Deploys. |
| `NUUDL_BACKOFFICE_SHARED_SECRET` | identisch zu API `BACKOFFICE_SHARED_SECRET` | Admin-Proxy vertraut der API nur noch ueber dieses gemeinsame Secret. |
| `ALLOW_LOCAL_FALLBACKS` | `false` | Admin darf nicht auf Demo-Verhalten fallen. |

## Scripts

| Script | Schreibt Daten? | Verwendung |
| --- | --- | --- |
| `npm run doctor:deploy` | Nein | Lokaler Repo-Hygiene-Check: keine getrackten Backups, Logs, Build-Artefakte oder Runtime-Daten; Pflicht-Scripts und Deploy-Dokus vorhanden. Laufende Arbeitsstände erscheinen als `notes`. |
| `npm run doctor:deploy:strict` | Nein | Finaler Push-/Deploy-Check. Ein nicht sauberer Working Tree wird zur Warnung. |
| `npm run build:deploy` | Nein | Vor Push/Deploy lokal prüfen: Shared, API, Consumer und Admin. |
| `npm run preflight:beta` | Nein | Standard-Live-Check mit Profil `private-beta`. Meldet falsche Env, API/Consumer-Probleme und Beta-Readiness. Nutzt bei gesetztem Shared Secret denselben Backoffice-Seam wie der echte Deploy. |
| `npm run preflight:private-beta` | Nein | Expliziter Closed-Beta-Check. Verlangt Invite-Gate in API und Consumer plus mindestens einen API-Invite-Code, blockiert Nicht-Loopback-Deploys ohne `storage.uploadsDirectory.publicBaseUrl` und prüft bei gesetzter `NUUDL_ADMIN_BASE_URL` die serverseitige Admin-Session (`trusted_proxy` oder `trusted_proxy_session`). |
| `npm run preflight:private-beta -- --expect-empty` | Nein | Vor ersten externen Invites. Schlägt fehl, wenn alte Posts/Chats/Reports/Ledger/Uploads existieren. |
| `npm run preflight:soft-launch` | Nein | Späterer Soft-Launch-Check. Verlangt, dass Invite-Gate in API und Consumer aus ist. |
| `npm run smoke:beta` | Ja | Write-Smoke: legt Test-Post, Reply, Report und Upload an und ruft die ausgelieferte Medien-URL direkt wieder ab. Nutzt bei gesetztem Shared Secret denselben Backoffice-Seam wie der echte Deploy. Nur bewusst nach Preflight verwenden. |
| `npm run backup:beta` | Ja, Backup-Dateien | Kopiert lokale API-Snapshots/Uploads nach `backups/beta/`. |
| `npm run backoffice:break-glass -- --owner-id <id> --confirm-break-glass` | Ja, Backoffice-Store | Notfall-Recovery fuer ausgesperrte Owner. Nur mit API-Stopp oder direktem API-Restart/Redeploy verwenden; Details in `BACKOFFICE_BREAK_GLASS.md`. |
| `npm run reset:beta-data -- --confirm-clean-beta` | Ja, löscht lokale API-Daten nach Backup | Vor echter Beta nur bewusst ausführen, wenn alte lokale Snapshot-/Upload-Daten weg sollen. |

## Invite-Gate

- API prüft `BETA_INVITE_REQUIRED` und `BETA_INVITE_CODES`.
- Consumer sieht nur, ob ein Code nötig ist, nicht welche Codes gültig sind.
- Neue Installs ohne gültigen Code werden blockiert.
- Bestehende Sessions müssen beim erneuten Register/Refresh nicht nochmal eingeladen werden.
- Invite-Codes werden nur als Hash im Audit-Kontext referenziert, nicht roh gespeichert.

## Clean-State-Regel

`API_SEED_PROFILE=clean` verhindert Demo-Daten nur bei frischem Bootstrap. Wenn bereits eine Snapshot-Datei, ein Coolify-Volume oder eine Postgres-DB mit alten Daten existiert, bleiben diese Daten erhalten.

Vor ersten Testern:

```bash
npm run preflight:private-beta -- --expect-empty
```

Wenn der Check fehlschlägt:

```bash
npm run backup:beta
npm run reset:beta-data -- --confirm-clean-beta
npm run preflight:private-beta -- --expect-empty
```

## Coolify-Deployment

- Monorepo nie als eine App deployen.
- API und Consumer getrennt deployen.
- Base Directory bleibt `/`.
- Publish Directory leer lassen.
- Port Mappings leer lassen.
- API-Port: `4000`.
- Consumer-Port: `3000`.
- Start API: `npm run start:api`.
- Start Consumer: `npm run start:consumer`.

## Git-Hygiene vor Launch

- `npm run doctor:deploy` muss ohne `failures` laufen.
- Direkt vor finalem Push/Deploy muss `npm run doctor:deploy:strict` ohne `warnings` laufen.
- Lokale Backups aus `backups/` dürfen nicht getrackt sein.
- Build-Outputs aus `.next-build`, `.next-dev`, `.next`, `dist` und `*.tsbuildinfo` dürfen nicht getrackt sein.
- Smoke-/Preflight-Logs bleiben lokal und werden über `*.log` ignoriert.
- API-Runtime-Daten aus `apps/api/.data/` gehören nicht in Git.

## Preflight-Interpretation

- `profile=private-beta`: Invite-Gate muss in API und Consumer aktiv sein, API braucht mindestens einen Code.
- `profile=soft-launch`: Invite-Gate muss in API und Consumer deaktiviert sein.
- `profile=local-demo`: Nur für Loopback-URLs verwenden.
- `ready`: harte Deploy-Schalter passen, keine relevanten Warnungen.
- `warning`: grundsätzlich lauffähig, aber etwas muss bewusst entschieden werden, z. B. existierende Testdaten oder deaktiviertes Invite-Gate.
- `blocked`: nicht einladen/deployen, erst Env oder Storage korrigieren.

## Niemals in echter Beta

- `ALLOW_LOCAL_FALLBACKS=true`
- `ALLOW_FAKE_PAYMENTS=true`
- `API_SEED_PROFILE=demo`
- `BETA_INVITE_REQUIRED=true` ohne `BETA_INVITE_CODES`
- `RATE_LIMIT_BACKEND=redis` ohne gültige `REDIS_URL` und ohne erfolgreichen `/admin/ops`-Status `redis_active`
- fehlendes `API_PUBLIC_BASE_URL` auf Proxy-/HTTPS-Deploys, wenn Upload-URLs stabil absolut sein müssen
- unbegrenzte Upload-Größen oder impliziter Upload-Pfad ohne bewussten Volume-/Storage-Plan
- Admin auf Nicht-Loopback ohne `BACKOFFICE_SHARED_SECRET` in der API und ohne passende `NUUDL_BACKOFFICE_*`-Werte im Admin
- Admin auf Nicht-Loopback mit dauerhaftem `trusted_proxy` ohne Session-ID statt `trusted_proxy_session`
- sich darauf verlassen, dass `NUUDL_BACKOFFICE_ROLE` oder Header einen existierenden Operator nachtraeglich hochstufen; gespeicherte `backofficeUsers.role` ist kanonisch und die Owner-Rollenverwaltung ist die Quelle der Wahrheit
- Break-Glass ohne API-Restart/Redeploy danach; der laufende API-Prozess haelt den Runtime-Store im Speicher
- `NUUDL_API_BASE_URL` ohne HTTPS
- `JWT_SECRET=change-me`
