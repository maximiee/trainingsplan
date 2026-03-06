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
node src/server.js
```

## Funktionsumfang

- **Wochenübersicht**: Grafische Darstellung aller Trainingseinheiten je Platz
- **Platzverwaltung**: A-Platz (Rasen), B-Platz (Kunstrasen), geteilte Nutzung möglich
- **Saisons**: Sommer- und Winterbelegung, archivierbare Saisons
- **Wiederkehrende Einheiten**: Wöchentliche Wiederholung mit Ausnahmen
- **Spieltermine**: Heim- und Auswärtsspiele, sichtbar in der Wochenübersicht
- **Benutzer & Rollen**: Admin und Trainer, Mannschaftszuordnung
- **Export**: PDF (Druckansicht) und Excel (Wochen- und Saisonexport)

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
