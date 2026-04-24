# NUUDL Deploy-Doku

Dieser Ordner ist die Betriebsquelle für Test-Deploys, Closed Beta und spätere Launch-Schritte. Wenn Coolify, Domains oder Launch-Schalter unklar sind, zuerst hier prüfen.

## Reihenfolge beim Deploy

1. `BETA_LAUNCH_SWITCHES.md` prüfen: Welche Schalter müssen für den aktuellen Modus an/aus sein?
2. `COOLIFY_HOSTINGER.md` prüfen: Welche Coolify-App bekommt welche Commands, Ports und Environment Variables?
3. `npm run doctor:deploy` lokal ausführen.
4. Deploy ausführen.
5. `npm run preflight:private-beta` gegen die Live-URLs laufen lassen.
6. Vor ersten externen Beta-Invites zusätzlich `npm run preflight:private-beta -- --expect-empty` laufen lassen.
7. Sobald Redis an der Zielumgebung hängt: `npm run preflight:private-beta -- --require-redis-rate-limit` laufen lassen und nur bei `storage.persistence.rateLimit.status=redis_active` als abgenommen markieren.

Vor dem finalen Push/Deploy zusätzlich:

```bash
npm run doctor:deploy:strict
```

Der Standard-Doctor meldet laufende Arbeitsstände als `notes`. Der Strict-Doctor macht einen nicht sauberen Working Tree bewusst zur Warnung, damit vor Launch nichts Ungepushtes oder Ungeprüftes durchrutscht.

## Dateien

| Datei | Zweck |
| --- | --- |
| `../STATUS.md` | Aktueller Arbeitsstand mit Phasen-Prozenten und nächsten Blöcken. |
| `BETA_LAUNCH_SWITCHES.md` | Schalter-Matrix für Local Demo, Private Beta und Soft Launch. |
| `BACKOFFICE_BREAK_GLASS.md` | Notfall-Runbook, falls alle Owner ausgesperrt sind oder eine Owner-Session nicht mehr erreichbar ist. |
| `COOLIFY_HOSTINGER.md` | Konkrete Coolify-/Hostinger-Anleitung für API und Consumer. |

## Nicht aus dem Kopf deployen

Die wichtigsten Fallen sind absichtlich doppelt dokumentiert und zusätzlich im Preflight geprüft:

- API und Consumer müssen beim Invite-Gate synchron sein.
- Invite-Codes gehören nur in die API.
- `private-beta` und `soft-launch` haben eigene Preflight-Profile.
- Redis für Rate Limits gilt erst dann als wirklich live, wenn der Preflight mit `--require-redis-rate-limit` grün ist.
- Medien-Deploys sollten `API_PUBLIC_BASE_URL`, `API_UPLOADS_DIR` und ein bewusstes `MEDIA_UPLOAD_MAX_BYTES` gesetzt haben, statt sich auf implizite Defaults zu verlassen. `preflight:private-beta` blockiert Nicht-Loopback-Deploys jetzt, wenn `storage.uploadsDirectory.publicBaseUrl` fehlt.
- Admin auf echter Domain braucht jetzt eine serverseitige Operator-Session: `BACKOFFICE_SHARED_SECRET` in der API plus `NUUDL_BACKOFFICE_ID`, `NUUDL_BACKOFFICE_ROLE` und `NUUDL_BACKOFFICE_SHARED_SECRET` in der Admin-App. Der Proxy vergibt dafuer eine httpOnly-Session-ID pro Browser und die API erwartet im gesunden Deploy-Zustand `authMode=trusted_proxy_session`. Wenn `NUUDL_ADMIN_BASE_URL` gesetzt ist, prüft `preflight:private-beta` diese Session jetzt direkt mit.
- Backoffice-Rollen sind nach dem ersten Trust kanonisch im API-Store. Ein spaeterer Header-/Env-Role-Wert hebt einen existierenden Operator nicht automatisch hoch. Rollen, Disable und Session-Revoke laufen ueber die Owner-UI unter Rollenverwaltung bzw. `/admin/backoffice/users`.
- Falls kein Owner mehr erreichbar ist: nicht per Header improvisieren, sondern `BACKOFFICE_BREAK_GLASS.md` nutzen und danach API redeployen/restarten.
- Consumer und Admin brauchen HTTPS zur API.
- Testdaten werden nicht automatisch entfernt, nur weil `API_SEED_PROFILE=clean` gesetzt ist.
- Port Mappings in Coolify bleiben leer; expose ports sind `4000` für API und `3000` für Consumer.
- Lokale Backups, Logs, `.next*`, `dist` und API-Runtime-Daten dürfen nicht im Git-Index bleiben.
- `build:deploy` baut jetzt auch die Admin-App mit, damit der Release-Check nicht nur API und Consumer abnimmt.
