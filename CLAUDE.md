# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Lokal entwickeln
npm install
cp .env.example .env   # DB_PATH auf lokalen Pfad anpassen
npm run dev            # node --watch (auto-restart bei Änderungen)
npm start              # ohne auto-restart

# Docker
docker-compose up -d
docker-compose up -d --build   # nach Code-Änderungen neu bauen
```

Kein Test-Framework vorhanden. Keine Lint-Tools konfiguriert.

## Architektur

**Stack:** Node.js + Express, better-sqlite3 (synchron!), Vanilla JS Frontend (kein Build-Step).

### Backend

`src/server.js` ist der Einstiegspunkt. Er registriert alle API-Routen unter `/api/*` und liefert statische Dateien aus `src/public/`.

**Authentifizierung:** Session-basiert via `express-session` + `connect-sqlite3`. Das Session-Objekt trägt `userId`, `userName`, `role` (`admin`|`trainer`) und `teams` (Array der zugeordneten Teams). Middleware-Kette: `requireAuth` → `requireActive` → `requireAdmin` (nur wo nötig).

**Trainer-Autorisierung:** Trainer dürfen nur Ressourcen ihrer eigenen Teams bearbeiten. Prüfung erfolgt direkt in den Route-Handlern via `user_teams`-Tabelle oder `req.session.teams`.

**Datenbank-Migrationen:** Das Schema wird bei jedem Start via `db.exec(schema)` ausgeführt (`CREATE TABLE IF NOT EXISTS` – idempotent). Für `ALTER TABLE`-Migrationen gibt es manuelle Checks in `src/db/database.js` nach dem Schema-Import (Beispiel: `pitch_id`-Spalte in `match_appointments`). Neue Spalten immer dort als Migration eintragen, neue Tabellen direkt in `schema.sql`.

### Datenmodell (Kernbeziehungen)

- `users` ↔ `teams` via `user_teams` (Trainer↔Mannschaft)
- `training_sessions` ↔ `teams` via `session_teams`
- `locations` → `pitches` (1:N, Standort hat mehrere Plätze)
- `recurrences` → `training_sessions` (1:N, wöchentliche Wiederholung)
- Beim Bearbeiten einer Wiederholung gibt es drei Ebenen: einzelne Einheit (`PUT /api/sessions/:id`), alle zukünftigen (`PUT /api/sessions/:id/future`), die ganze Serie (`PUT /api/sessions/recurrences/:id`)
- `match_appointments` setzt automatisch betroffene `training_sessions` auf `is_cancelled = 1` (Logik in `src/routes/matches.js`)
- `team_squad` speichert Kaderzahlen pro Team, Jahrgang, Geschlecht und Verein (`TSV`|`MTV`|`TSG`); UNIQUE auf `(team_id, year, gender, verein)`

### Frontend

Vier HTML-Seiten: `index.html` (Wochenkalender), `trainer.html` (Trainer-Bereich), `admin.html` (Admin-Panel), `login.html`. Jede Seite lädt `js/api.js` + ihre eigene JS-Datei. Zusätzlich gibt es `js/fussball-de.js` für den fussball.de-Scraper-Tab im Admin-Bereich.

**`src/public/js/api.js`:** Globaler Fetch-Wrapper (`api.get/post/put/delete`), globaler `currentUser`-State, Datums-Hilfsfunktionen (`isoToDE`, `getMondayOfWeek`, `toISO`).

**Tab-System:** Tabs über CSS-Klasse `active` auf `.admin-tab`-Buttons; Tab-Inhalte über `hidden`-Klasse auf `.tab-content[data-tab="..."]`. Gleiche Logik in `trainer.js` und `admin.js`.

**Kader-Feature (`trainer.js`):** `squadState` ist ein globales Objekt (`teamId → [{year, gender, count}]`), das In-Memory-Änderungen hält. Inline-Event-Handler in gerenderten Tabellenzeilen referenzieren es direkt (`squadState[teamId][i].count = ...`).

### API-Endpunkte Übersicht

| Route | Datei |
|---|---|
| `/api/auth/*` | `routes/auth.js` |
| `/api/users/*` | `routes/users.js` |
| `/api/teams/*` | `routes/teams.js` |
| `/api/locations/*` | `routes/locations.js` |
| `/api/pitches/*` | `routes/pitches.js` |
| `/api/seasons/*` | `routes/seasons.js` |
| `/api/sessions/*` | `routes/sessions.js` |
| `/api/matches/*` | `routes/matches.js` |
| `/api/export/*` | `routes/export.js` |
| `/api/import/*` | `routes/import.js` |
| `/api/fussball-de/*` | `routes/fussballDe.js` |

### Umgebungsvariablen (`.env`)

| Variable | Bedeutung |
|---|---|
| `SESSION_SECRET` | Pflicht in Produktion |
| `DB_PATH` | Pfad zur SQLite-DB (Standard: `./data/trainingsplan.db`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Nur beim ersten Start relevant (Seed) |
| `CLUB_NAME` | Vereinsname für PDF/Excel-Exports |

### Workflow-Präferenz

Nach jeder abgeschlossenen Änderung committen und pushen.
