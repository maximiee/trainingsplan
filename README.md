# Trainingsplan – Trainingszeitenverwaltung Fussballsparte

Webbasierte App zur Verwaltung von Trainingszeiten, Spielterminen und Platzbelegung.

## Schnellstart (Docker)

```bash
cp .env.example .env
# SESSION_SECRET in .env setzen
docker-compose up -d
```

App läuft auf: http://localhost:4000

Standard-Login: `admin@verein.de` / `changeme123`

> **Wichtig:** Passwort nach dem ersten Login unter Admin → Profil ändern!

## Lokale Entwicklung (ohne Docker)

```bash
npm install
cp .env.example .env
# DB_PATH in .env auf lokalen Pfad anpassen, z.B.:
# DB_PATH=./data/trainingsplan.db
npm run dev   # mit auto-restart (node --watch)
# oder:
npm start     # ohne auto-restart
```

## Funktionsumfang

- **Wochenübersicht**: Grafische Darstellung aller Trainingseinheiten je Platz und Standort
- **Standorte & Plätze**: Mehrere Standorte mit je eigenen Plätzen (Rasen, Kunstrasen etc.), geteilte Nutzung möglich
- **Saisons**: Sommer- und Winterbelegung, archivierbare Saisons
- **Wiederkehrende Einheiten**: Wöchentliche Wiederholung mit Ausnahmen (Einzeltermin, ab heute, gesamte Serie)
- **Spieltermine**: Heim- und Auswärtsspiele, sichtbar in der Wochenübersicht; automatische Absage betroffener Trainings
- **Kader**: Kaderzahlen pro Mannschaft, Jahrgang, Geschlecht und Verein (TSV/MTV/TSG)
- **fussball.de-Import**: Spieltermine direkt von fussball.de importieren (scraper-basiert)
- **Benutzer & Rollen**: Admin und Trainer, Mannschaftszuordnung, aktivier-/deaktivierbar
- **Export**: PDF (Druckansicht) und Excel (Wochen- und Saisonexport)
- **Import**: Excel-Import für Spieltermine

## Update

```bash
git pull
docker-compose up -d --build
```

## Backup

```bash
# Datenbank sichern (täglich per Cron empfohlen)
cp ./data/trainingsplan.db /backup/trainingsplan_$(date +%Y%m%d).db
```
