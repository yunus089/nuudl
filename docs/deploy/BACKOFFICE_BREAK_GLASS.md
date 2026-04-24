# Backoffice Break-Glass Recovery

Dieser Runbook-Pfad ist nur fuer den Notfall gedacht: Alle Owner sind deaktiviert, heruntergestuft oder durch widerrufene Backoffice-Sessions ausgesperrt.

## Wann verwenden?

- Kein aktiver Owner kann mehr die Rollenverwaltung oeffnen.
- `NUUDL_BACKOFFICE_ID` zeigt auf einen Operator, der im Store nicht mehr `owner` ist.
- Ein Owner wurde deaktiviert und die normale Owner-UI ist nicht mehr erreichbar.
- Ein alter Admin-/Owner-Browser haengt an einer widerrufenen `trusted_proxy_session`.

Nicht verwenden fuer normale Rollenpflege. Dafuer bleibt die Owner-UI unter Rollenverwaltung die Quelle der Wahrheit.

## Sicherheitsprinzip

- Es gibt absichtlich keine oeffentliche HTTP-Route fuer Break-Glass.
- Recovery laeuft offline ueber Server-/Coolify-Terminal.
- Der Befehl schreibt nur mit explizitem `--confirm-break-glass`.
- Jede Recovery schreibt Audit- und Backoffice-Action-Eintraege in den Store.
- Der API-Prozess muss danach neu gestartet oder redeployt werden, weil der Runtime-Store im Prozess gehalten wird.

## Standard-Recovery

API stoppen oder sicherstellen, dass direkt danach ein Redeploy/Restart erfolgt.

```bash
npm run backoffice:break-glass -- --owner-id owner-root --confirm-break-glass
```

Wenn der Owner aus der Admin-App-Env kommen soll:

```bash
NUUDL_BACKOFFICE_ID=owner-root npm run backoffice:break-glass -- --confirm-break-glass
```

Mit sprechendem Namen und Grund:

```bash
npm run backoffice:break-glass -- --owner-id owner-root --display-name "Owner Root" --reason "Recover owner after mistaken disable" --confirm-break-glass
```

Dry Run ohne Schreiben:

```bash
npm run backoffice:break-glass -- --owner-id owner-root --dry-run
```

## Was der Befehl macht

- legt den Operator an, falls er fehlt
- setzt `role=owner`
- entfernt `disabledAt`
- schreibt `lastSeenAt`
- entfernt standardmaessig bestehende Backoffice-Sessions dieses Operators, damit der Admin-Proxy beim naechsten Aufruf eine frische Session erzeugen kann
- schreibt `backoffice_owner.break_glass_recover` in Audit und Backoffice-Actions
- nutzt dieselbe Persistenz wie die API:
  - `API_STORAGE_DRIVER=snapshot_file` schreibt `apps/api/.data/api-store.json`
  - `API_STORAGE_DRIVER=postgres` oder `postgres_snapshot` schreibt den `api_store_snapshots`-Payload in Postgres

Wenn bestehende Sessions bewusst erhalten bleiben sollen:

```bash
npm run backoffice:break-glass -- --owner-id owner-root --keep-sessions --confirm-break-glass
```

Das ist selten sinnvoll. Bei alten widerrufenen Browser-Sessions lieber Sessions resetten und danach neu laden.

## Danach immer pruefen

1. API neu starten oder redeployen.
2. Admin-App mit derselben `NUUDL_BACKOFFICE_ID` oeffnen.
3. Falls der Browser weiter blockiert: Admin-Site-Cookie loeschen oder frischen Browser verwenden.
4. `/admin/backoffice/session` muss fuer echte Domains `authMode=trusted_proxy_session` und `user.role=owner` liefern.
5. Danach Rollenverwaltung oeffnen und pruefen, ob mindestens ein weiterer Owner existieren sollte.
6. Vor Beta-Invites erneut laufen lassen:

```bash
npm run preflight:private-beta
```

## Coolify-Hinweis

Wenn Recovery direkt auf dem Server passiert:

- API-App stoppen oder danach sofort redeployen.
- Dieselben Env-Werte setzen wie im API-Deploy, besonders `API_STORAGE_DRIVER`, `DATABASE_URL` und `DATABASE_SSL`.
- Bei Snapshot-File muss der Befehl auf denselben persistenten Volume-Pfad schreiben, den die API nutzt.
- Bei Postgres muss `DATABASE_URL` auf dieselbe Datenbank zeigen wie der API-Container.

## Was nicht passieren darf

- Keine Owner-Rollen ueber Browser-Header erzwingen.
- Keine manuelle JSON-Operation ohne Backup.
- Keine Recovery gegen eine alte lokale Kopie ausfuehren und erwarten, dass Coolify dadurch live repariert wird.
- Keine externen Beta-Tester einladen, bevor der Admin-Owner wieder verifiziert ist.
