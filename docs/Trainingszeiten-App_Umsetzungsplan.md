# Trainingszeiten-App – Detaillierter Umsetzungsplan

> **Projekt:** Trainingszeitenverwaltung Fussballsparte  
> **Ziel:** Webbasierte App im Docker-Container (Port 4000) zur Verwaltung von Trainingszeiten, Spielterminen und Platzbelegung  
> **Stand:** März 2026

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Technologie-Stack](#2-technologie-stack)
3. [Datenbankschema](#3-datenbankschema)
4. [Phase 1 – Projektgrundgerüst & Docker](#phase-1--projektgrundgerüst--docker)
5. [Phase 2 – User Management & Login](#phase-2--user-management--login)
6. [Phase 3 – Stammdatenverwaltung](#phase-3--stammdatenverwaltung)
7. [Phase 4 – Trainingseinheiten](#phase-4--trainingseinheiten)
8. [Phase 5 – Spieltermine](#phase-5--spieltermine)
9. [Phase 6 – Wochenübersicht](#phase-6--wochenübersicht)
10. [Phase 7 – Exportfunktion](#phase-7--exportfunktion)
11. [Phase 8 – Feinschliff & Deployment](#phase-8--feinschliff--deployment)
12. [Phase 9 – Optionale Erweiterung: fussball.de](#phase-9--optionale-erweiterung-fussballde)
13. [Projektstruktur](#projektstruktur)
14. [Zeitschätzung](#zeitschätzung)

---

## 1. Projektübersicht

### Ausgangslage
Die Trainingszeitenverwaltung erfolgt aktuell über Excel-Tabellen. Diese sind fehleranfällig, oft nicht aktuell und schlecht teilbar.

### Ziel
Eine zentrale Webanwendung, die:
- auf einem eigenen Server im Docker-Container läuft
- von Admin und Trainern im Browser aufgerufen werden kann
- Trainingszeiten, Platzbelegung und Spieltermine verwaltet
- eine grafische Wochenübersicht bietet
- Sommer- und Winterbelegungen als Saisons trennt
- Exporte als PDF und Excel ermöglicht

### Kernfunktionen auf einen Blick
| Funktion | Beschreibung |
|---|---|
| Wochenübersicht | Grafische Darstellung aller Einheiten je Platz und Woche |
| Platzverwaltung | A-Platz (Rasen), B-Platz (Kunstrasen), Teilung möglich |
| Saisons | Sommer- und Winterbelegung getrennt, archivierbar |
| Wiederkehrende Einheiten | Wöchentliche Wiederholung mit Ausnahmemöglichkeit |
| Spieltermine | Manuelle Eingabe, visuell integriert in Wochenansicht |
| User Management | Admin und Trainer-Rollen, Mannschaftszuordnung |
| Export | PDF (Druckansicht) und Excel (Tabellenansicht) |

---

## 2. Technologie-Stack

### Backend
| Komponente | Technologie | Begründung |
|---|---|---|
| Laufzeitumgebung | Node.js (LTS) | Weit verbreitet, gute Docker-Unterstützung |
| Web-Framework | Express.js | Schlank, gut dokumentiert |
| Datenbank | SQLite (via better-sqlite3) | Keine separate DB nötig, Backup = 1 Datei |
| Session-Management | express-session + connect-sqlite3 | Sessions in derselben DB-Datei |
| Passwort-Hashing | bcrypt | Sicher, etablierter Standard |
| PDF-Export | pdfkit | Node-native, keine externen Dienste |
| Excel-Export | exceljs | Vollständige XLSX-Unterstützung |

### Frontend
| Komponente | Technologie | Begründung |
|---|---|---|
| Markup | HTML5 | Kein Build-Prozess, direkt im Browser |
| Styling | CSS3 + CSS Grid/Flexbox | Für die Wochenübersicht ideal |
| Logik | Vanilla JavaScript (ES6+) | Keine Framework-Abhängigkeit, wartbar |
| HTTP-Anfragen | Fetch API | Modern, kein jQuery nötig |

### Infrastruktur
| Komponente | Technologie |
|---|---|
| Containerisierung | Docker + docker-compose |
| Port | 4000 |
| Datenpersistenz | Docker Volume (bind mount auf Host) |

---

## 3. Datenbankschema

### Tabelle: `users`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| name | TEXT NOT NULL | Anzeigename |
| email | TEXT UNIQUE NOT NULL | Login-Name |
| password_hash | TEXT NOT NULL | bcrypt-Hash |
| role | TEXT NOT NULL | `admin` oder `trainer` |
| created_at | DATETIME | Erstellungszeitpunkt |

### Tabelle: `user_teams` *(Zuordnung Trainer ↔ Mannschaft)*
| Feld | Typ | Beschreibung |
|---|---|---|
| user_id | INTEGER | Fremdschlüssel → users |
| team_id | INTEGER | Fremdschlüssel → teams |

### Tabelle: `teams`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| name | TEXT NOT NULL | z.B. „U17 Männlich" |
| age_group | TEXT | z.B. „U17" |
| color | TEXT NOT NULL | Hex-Farbcode für Kalenderdarstellung |
| fussball_de_id | TEXT | Für späteren API-Import (optional) |

### Tabelle: `pitches`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| name | TEXT NOT NULL | z.B. „A-Platz" |
| surface | TEXT | `Rasen` oder `Kunstrasen` |

### Tabelle: `seasons`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| name | TEXT NOT NULL | z.B. „Sommer 2025" |
| type | TEXT NOT NULL | `sommer` oder `winter` |
| start_date | DATE NOT NULL | Beginn der Saison |
| end_date | DATE NOT NULL | Ende der Saison |
| is_active | INTEGER | `1` = aktiv, `0` = archiviert |

### Tabelle: `training_sessions`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| season_id | INTEGER | Fremdschlüssel → seasons |
| pitch_id | INTEGER | Fremdschlüssel → pitches |
| date | DATE NOT NULL | Datum der Einheit |
| start_time | TEXT NOT NULL | Format: `HH:MM` |
| end_time | TEXT NOT NULL | Format: `HH:MM` |
| type | TEXT NOT NULL | `training`, `spiel`, `turnier` |
| recurrence_id | INTEGER | Fremdschlüssel → recurrences (optional) |
| is_exception | INTEGER | `1` = manuell geänderte Wiederholung |
| note | TEXT | Optionale Anmerkung |

### Tabelle: `session_teams` *(Zuordnung Einheit ↔ Team, ermöglicht geteilten Platz)*
| Feld | Typ | Beschreibung |
|---|---|---|
| session_id | INTEGER | Fremdschlüssel → training_sessions |
| team_id | INTEGER | Fremdschlüssel → teams |

### Tabelle: `recurrences`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| weekday | INTEGER | `0` = Montag … `6` = Sonntag |
| start_time | TEXT | Format: `HH:MM` |
| end_time | TEXT | Format: `HH:MM` |
| pitch_id | INTEGER | Fremdschlüssel → pitches |
| season_id | INTEGER | Fremdschlüssel → seasons |
| valid_from | DATE | Beginn der Wiederholung |
| valid_until | DATE | Ende (Standard: Saisonende) |

### Tabelle: `match_appointments`
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER PRIMARY KEY | Auto-Increment |
| team_id | INTEGER | Fremdschlüssel → teams |
| season_id | INTEGER | Fremdschlüssel → seasons |
| date | DATE NOT NULL | Spieltag |
| time | TEXT | Anstoßzeit |
| opponent | TEXT | Gegner |
| location | TEXT | `heim` oder `auswaerts` |
| venue | TEXT | Spielort (bei Auswärts) |
| fussball_de_match_id | TEXT | Für späteren Import |

---

## Phase 1 – Projektgrundgerüst & Docker

### Ziel
Lauffähige Grundstruktur, Docker-Container startet auf Port 4000, Datenbank wird initialisiert.

### Aufgaben

#### 1.1 Verzeichnisstruktur anlegen
```
trainingsplan/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── src/
│   ├── server.js              ← Express-Einstiegspunkt
│   ├── db/
│   │   ├── database.js        ← DB-Verbindung
│   │   └── schema.sql         ← Tabellendefinitionen
│   ├── routes/                ← API-Routen (je Modul eine Datei)
│   ├── middleware/            ← Auth-Middleware
│   └── public/               ← Statische Frontend-Dateien
│       ├── index.html
│       ├── css/
│       └── js/
└── data/                     ← Wird als Volume gemountet
    └── .gitkeep
```

#### 1.2 Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 4000
CMD ["node", "src/server.js"]
```

#### 1.3 docker-compose.yml
```yaml
version: '3.8'
services:
  trainingsplan:
    build: .
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
      - DB_PATH=/app/data/trainingsplan.db
    restart: unless-stopped
```

#### 1.4 Datenbankinitialisierung
- `schema.sql` enthält alle `CREATE TABLE IF NOT EXISTS`-Statements
- Beim Start prüft `database.js`, ob die DB existiert
- Falls nicht: Schema wird automatisch eingespielt
- Grunddaten werden angelegt: zwei Plätze (A-Platz, B-Platz)

#### 1.5 Express-Server
- Statische Dateien aus `/public` servieren
- JSON-Body-Parser aktivieren
- Session-Middleware einbinden
- Grundlegende Fehlerbehandlung (404, 500)

### Ergebnis Phase 1
`docker-compose up` startet den Container, `http://localhost:4000` zeigt eine Platzhalter-Seite, Datenbank wird erstellt.

---

## Phase 2 – User Management & Login

### Ziel
Sichere Authentifizierung, Rollenverwaltung, Mannschaftszuordnung für Trainer.

### Aufgaben

#### 2.1 Login-Seite (`/login`)
- Einfaches Formular: E-Mail + Passwort
- Bei Fehler: Fehlermeldung ohne Hinweis ob E-Mail oder Passwort falsch ist (Sicherheit)
- Weiterleitung nach erfolgreichem Login auf Wochenübersicht

#### 2.2 Auth-Middleware
- Jede geschützte Route prüft: Ist eine gültige Session vorhanden?
- Falls nicht: Weiterleitung auf `/login`
- Rolle wird in der Session gespeichert und für Berechtigungsprüfungen genutzt

#### 2.3 Admin-Bereich: Benutzerverwaltung (`/admin/users`)
Nur für Admins zugänglich:
- Liste aller User mit Name, E-Mail, Rolle, zugeordneten Teams
- Neuen User anlegen (Name, E-Mail, Passwort, Rolle, Teams)
- User bearbeiten (alle Felder außer Passwort-Hash direkt sichtbar)
- Passwort zurücksetzen (neues Passwort setzen)
- User deaktivieren (kein Löschen, nur inaktiv setzen)

#### 2.4 Erster Admin-Account
- Beim ersten Start: Prüfung ob User-Tabelle leer
- Falls leer: Standard-Admin wird angelegt (`admin@verein.de` / Passwort aus `.env`)
- Konsolen-Hinweis: „Bitte Admin-Passwort nach erstem Login ändern"

#### 2.5 Passwort ändern
- Jeder User kann sein eigenes Passwort unter `/profil` ändern
- Aktuelles Passwort muss zur Bestätigung eingegeben werden

### Ergebnis Phase 2
Login funktioniert, Admin kann User anlegen und Rollen vergeben, Trainer können sich einloggen.

---

## Phase 3 – Stammdatenverwaltung

### Ziel
Admin kann Teams, Plätze und Saisons verwalten.

### Aufgaben

#### 3.1 Teamverwaltung (`/admin/teams`)
- Liste aller Teams
- Neues Team anlegen: Name, Altersklasse, Farbe (Colorpicker), optionale fussball.de-ID
- Team bearbeiten, deaktivieren
- Farbvorschau direkt in der Liste

#### 3.2 Platzverwaltung (`/admin/pitches`)
- Liste der Plätze (initial: A-Platz, B-Platz bereits vorhanden)
- Neuen Platz anlegen (für spätere Erweiterungen)
- Name und Belagstyp editierbar

#### 3.3 Saisonverwaltung (`/admin/seasons`)
- Liste aller Saisons (aktive oben, archivierte darunter)
- Neue Saison anlegen: Name, Typ (Sommer/Winter), Start-/Enddatum
- Saison als aktiv markieren (nur eine Saison gleichzeitig aktiv)
- Beim Aktivieren: Bestätigungsdialog „Aktuelle Saison wird archiviert"
- Archivierte Saisons bleiben vollständig einsehbar
- **Vorlage-Funktion:** Wiederkehrende Einheiten aus einer archivierten Saison in neue Saison übernehmen

#### 3.4 Saison-Wechsel Workflow
```
1. Neue Saison anlegen (z.B. „Winter 2025/26", 01.10.2025 – 31.03.2026)
2. Optional: Trainingszeiten aus Vorsaison als Vorlage importieren
3. Importierte Zeiten prüfen und anpassen
4. Saison auf „aktiv" schalten → Sommer wird archiviert
```

### Ergebnis Phase 3
Admin kann alle Stammdaten pflegen. Saisons lassen sich anlegen und wechseln.

---

## Phase 4 – Trainingseinheiten

### Aufgaben

#### 4.1 Einheit anlegen (`/admin/sessions/new`)
Formularfelder:
- Typ: Training / Spiel / Turnier
- Platz: Dropdown (A-Platz / B-Platz)
- Datum: Datepicker
- Startzeit: Dropdown in 30-Minuten-Schritten (06:00–23:30)
- Endzeit: Dropdown in 30-Minuten-Schritten (automatisch +1,5h vorausgewählt)
- Teams: Mehrfachauswahl (Checkboxen) → ermöglicht geteilten Platz
- Notiz: Optionales Textfeld
- Modus: Einmalig oder Wiederkehrend

#### 4.2 Wiederkehrende Einheiten
Bei Auswahl „Wiederkehrend" erscheinen zusätzliche Felder:
- Wochentag (wird automatisch aus Datum übernommen, editierbar)
- Wiederholen bis: Datum oder „Saisonende"

**Technische Umsetzung:**
- Eintrag in `recurrences`-Tabelle
- Automatische Generierung aller Einzeltermine bis zum Enddatum
- Alle generierten Termine tragen dieselbe `recurrence_id`

#### 4.3 Einzeltermin einer Serie ändern
- Klick auf einen Termin öffnet Detailansicht
- Option: „Nur diesen Termin ändern" → setzt `is_exception = 1`, entkoppelt von Serie
- Option: „Alle zukünftigen Termine ändern" → neue Serie ab diesem Datum
- Option: „Diesen Termin absagen" → Eintrag bleibt, wird als „abgesagt" markiert (sichtbar im Plan)

#### 4.4 Platz-Kollisionsprüfung
- Beim Speichern: Prüfung ob Platz zur selben Zeit bereits vollständig belegt
- Warnung (kein hartes Sperren): „A-Platz ist zu dieser Zeit bereits belegt durch [Team]. Trotzdem speichern?"
- Geteilter Platz ist also explizit erlaubt, aber der Admin wird informiert

### Ergebnis Phase 4
Trainingseinheiten können einmalig und wiederkehrend angelegt werden. Einzelne Termine einer Serie können unabhängig bearbeitet werden.

---

## Phase 5 – Spieltermine

### Aufgaben

#### 5.1 Spieltermin anlegen (`/admin/matches/new`)
Formularfelder:
- Team: Dropdown
- Datum + Uhrzeit
- Heimspiel / Auswärtsspiel
- Gegner: Freitextfeld
- Spielort (bei Auswärts): Freitextfeld
- Saison: automatisch aktive Saison
- fussball.de Match-ID: optionales Feld (für späteren Import)

#### 5.2 Spieltermine verwalten
- Tabellarische Liste aller Spieltermine der aktiven Saison
- Filterbar nach Team
- Bearbeiten und Löschen möglich

#### 5.3 Darstellung in der Wochenübersicht
- Spieltermine erscheinen in einem separaten Bereich unterhalb der Platzübersicht
- Farblich mit Team-Farbe, Icon unterscheidet Heim- von Auswärtsspiel
- Klick öffnet Detailansicht (Gegner, Ort, Uhrzeit)

### Ergebnis Phase 5
Spieltermine sind erfasst und in der Wochenübersicht sichtbar.

---

## Phase 6 – Wochenübersicht

### Aufgaben

#### 6.1 Layout-Grundstruktur
```
┌─────────────────────────────────────────────────────┐
│  [< Vorwoche]   KW 12 · 17.–23. März 2025  [Nächste >]  │
│  Saison: [Sommer 2025 ▼]                            │
├──────────┬──────────────────────┬───────────────────┤
│  Zeit    │     A-Platz (Rasen)  │  B-Platz (Kunst)  │
├──────────┼──────────────────────┼───────────────────┤
│  08:00   │                      │                   │
│  08:30   │  ┌──────────────┐    │                   │
│  09:00   │  │  U17 (blau)  │    │                   │
│  09:30   │  └──────────────┘    │                   │
│  ...     │                      │                   │
└──────────┴──────────────────────┴───────────────────┘
│ SPIELE DIESE WOCHE:                                  │
│  Mo. U17 – FC Beispiel (Heim, 15:00 Uhr)            │
└─────────────────────────────────────────────────────┘
```

#### 6.2 Technische Umsetzung der Kalenderdarstellung
- CSS Grid für die Zeitachse (Zeilen = 30-Min-Slots, Spalten = Plätze)
- Trainingsblöcke werden per JavaScript dynamisch als `<div>` in das Grid eingefügt
- Höhe und Position eines Blocks ergibt sich aus Start-/Endzeit
- Geteilter Platz: Block wird in der Breite aufgeteilt (zwei Teams = je 50%)
- Farbe kommt aus dem Team-Datensatz

#### 6.3 Wochennavigation
- „Vorwoche" / „Nächste Woche" Buttons
- Klick auf „Heute" springt zur aktuellen Woche
- URL-Parameter `?week=2025-W12` ermöglicht Direktverlinkung auf bestimmte Woche
- Saison-Dropdown: Wechsel zeigt automatisch die erste Woche der gewählten Saison

#### 6.4 Hervorhebung eigene Mannschaft
- Beim Login wird die zugeordnete Mannschaft des Trainers in der Session gespeichert
- Blöcke dieser Mannschaft erhalten einen stärkeren Rahmen und sind etwas gesättigter
- Blöcke anderer Teams werden leicht transparent dargestellt

#### 6.5 Interaktion
- Klick auf einen Block: Popup mit Details (Team, Zeit, Platz, Notiz)
- Admin sieht im Popup zusätzlich: „Bearbeiten"- und „Löschen"-Button
- Trainer sieht nur Leseansicht

#### 6.6 Legende
- Unterhalb des Plans: Farbige Kästchen mit Teamnamen
- Aktive Mannschaft des eingeloggten Trainers fett hervorgehoben

### Ergebnis Phase 6
Die Wochenübersicht ist vollständig nutzbar, navigierbar und für Admin und Trainer unterschiedlich interaktiv.

---

## Phase 7 – Exportfunktion

### Aufgaben

#### 7.1 PDF-Export
- Button „PDF exportieren" in der Wochenübersicht
- Generiert eine druckoptimierte A4-Darstellung der aktuellen Woche
- Enthält: Woche/KW, Saison, beide Plätze, Zeitachse, Teamblöcke mit Namen
- Fußzeile: Erstellungsdatum, Vereinsname
- Download startet automatisch als `Trainingsplan_KW12_2025.pdf`

#### 7.2 Excel-Export
Zwei Export-Optionen:

**Option A – Wochenexport:**
- Aktuelle Woche als strukturierte Tabelle
- Spalten: Datum, Wochentag, Platz, Startzeit, Endzeit, Teams, Typ, Notiz

**Option B – Saisonexport:**
- Alle Einheiten der aktiven Saison
- Gleiches Format, mehr Zeilen
- Zusätzliches Tabellenblatt: Spieltermine

- Download als `Trainingsplan_Sommer2025.xlsx`

#### 7.3 Export-Berechtigungen
- Beide Exportformate sind für Admin und Trainer verfügbar
- Kein separater Login für Export nötig

### Ergebnis Phase 7
Wochenpläne können als PDF gedruckt und als Excel weiterverarbeitet werden.

---

## Phase 8 – Feinschliff & Deployment

### Aufgaben

#### 8.1 Mobile Ansicht
- Responsive Design: Auf kleinen Screens wird die Wochenübersicht scrollbar
- Navigation und Buttons bleiben auf Mobile nutzbar
- Formular-Eingaben funktionieren auf Touch-Geräten

#### 8.2 Validierungen & Fehlerbehandlung
- Alle Formulare: Client-seitige und Server-seitige Validierung
- Startzeit muss vor Endzeit liegen
- Mindestdauer: 30 Minuten
- Team muss ausgewählt sein
- Benutzerfreundliche Fehlermeldungen (kein roher HTTP-Fehler im Browser)

#### 8.3 Logging
- Server-seitiges Logging aller Änderungen (wer hat wann was geändert)
- Log wird in Datei geschrieben, ebenfalls im Volume gespeichert

#### 8.4 Sicherheit
- Session-Secret aus Umgebungsvariable (nie hardcoded)
- HTTPS-Empfehlung: Reverse Proxy (nginx/Traefik) vor dem Container
- Rate Limiting auf Login-Route (max. 5 Versuche / Minute)
- SQL-Injection-Schutz durch Prepared Statements (already given by better-sqlite3)

#### 8.5 Backup-Strategie
```bash
# Backup der Datenbankdatei (z.B. täglich per Cron)
cp /pfad/zum/volume/trainingsplan.db /backup/trainingsplan_$(date +%Y%m%d).db
```
- Datenbank ist eine einzelne Datei → einfaches Backup
- Restore: Datei zurückkopieren, Container neu starten

#### 8.6 Produktionsdeployment
```bash
# Einmalig
git clone <repo>
cd trainingsplan
cp .env.example .env
# SESSION_SECRET in .env setzen
docker-compose up -d

# Update
git pull
docker-compose up -d --build
```

### Ergebnis Phase 8
Die Anwendung ist produktionsreif, sicher und wartbar.

---

## Phase 9 – Optionale Erweiterung: fussball.de

> Diese Phase ist nicht Teil der initialen Entwicklung, aber die Architektur ist darauf vorbereitet.

### Vorbedingung
fussball.de hat keine offizielle öffentliche API. Die Umsetzung erfolgt über Web Scraping der öffentlichen Spielplanseiten.

### Aufgaben

#### 9.1 Scraper-Modul
- Für jedes Team kann eine fussball.de-Mannschafts-URL hinterlegt werden
- Ein Cron-Job (z.B. täglich 06:00 Uhr) ruft die Spielplanseiten ab
- Gefundene Spieltermine werden mit `fussball_de_match_id` in `match_appointments` importiert
- Bereits vorhandene Termine (selbe ID) werden aktualisiert, nicht doppelt angelegt

#### 9.2 Admin-Kontrolle
- Import-Log: Welche Termine wurden wann importiert/aktualisiert?
- Manuell importierte Termine bleiben unberührt (kein automatisches Überschreiben)
- „Sync jetzt starten"-Button im Admin-Bereich

#### 9.3 Risiken
- fussball.de kann die Seitenstruktur jederzeit ändern → Scraper bricht
- Kein rechtlicher Anspruch auf maschinenlesbare Daten
- Empfehlung: Als optionales Feature mit Fallback auf manuelle Eingabe

---

## Projektstruktur

```
trainingsplan/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── README.md
│
├── src/
│   ├── server.js                  ← Express-App, Port 4000
│   │
│   ├── db/
│   │   ├── database.js            ← SQLite-Verbindung, Init
│   │   └── schema.sql             ← CREATE TABLE Statements
│   │
│   ├── middleware/
│   │   ├── auth.js                ← Session-Prüfung
│   │   └── roleCheck.js           ← Admin-only Routen
│   │
│   ├── routes/
│   │   ├── auth.js                ← POST /login, GET /logout
│   │   ├── users.js               ← CRUD User
│   │   ├── teams.js               ← CRUD Teams
│   │   ├── pitches.js             ← CRUD Plätze
│   │   ├── seasons.js             ← CRUD Saisons
│   │   ├── sessions.js            ← CRUD Trainingseinheiten
│   │   ├── matches.js             ← CRUD Spieltermine
│   │   └── export.js              ← PDF + Excel Export
│   │
│   └── public/
│       ├── index.html             ← Wochenübersicht
│       ├── login.html
│       ├── admin.html             ← Admin-Dashboard
│       │
│       ├── css/
│       │   ├── style.css          ← Hauptstyles
│       │   ├── calendar.css       ← Wochenübersicht
│       │   └── admin.css          ← Admin-Bereich
│       │
│       └── js/
│           ├── calendar.js        ← Wochenübersicht Logik
│           ├── admin.js           ← Admin-Formulare
│           └── api.js             ← Fetch-Wrapper für API-Calls
│
└── data/
    ├── trainingsplan.db           ← SQLite (wird per Volume gemountet)
    └── app.log                    ← Server-Log
```

---

## Zeitschätzung

| Phase | Beschreibung | Geschätzter Aufwand |
|---|---|---|
| Phase 1 | Grundgerüst & Docker | 2–3 Stunden |
| Phase 2 | User Management & Login | 3–4 Stunden |
| Phase 3 | Stammdatenverwaltung | 3–4 Stunden |
| Phase 4 | Trainingseinheiten | 4–6 Stunden |
| Phase 5 | Spieltermine | 2–3 Stunden |
| Phase 6 | Wochenübersicht | 6–8 Stunden |
| Phase 7 | Exportfunktion | 3–4 Stunden |
| Phase 8 | Feinschliff & Deployment | 3–4 Stunden |
| **Gesamt** | | **26–36 Stunden** |
| Phase 9 (optional) | fussball.de Scraper | +4–6 Stunden |

---

*Dokument erstellt: März 2026 | Version 1.0*
