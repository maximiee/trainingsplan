const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/trainingsplan.db');

// Sicherstellen, dass das Verzeichnis existiert
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance-Einstellungen
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema einlesen und ausführen
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrationen
const columns = db.prepare("PRAGMA table_info(match_appointments)").all().map(c => c.name);
if (!columns.includes('pitch_id')) {
  db.exec('ALTER TABLE match_appointments ADD COLUMN pitch_id INTEGER REFERENCES pitches(id)');
}
if (!columns.includes('half_pitch')) {
  db.exec('ALTER TABLE match_appointments ADD COLUMN half_pitch INTEGER NOT NULL DEFAULT 0');
}
if (!columns.includes('type')) {
  db.exec("ALTER TABLE match_appointments ADD COLUMN type TEXT NOT NULL DEFAULT 'spiel'");
}

// Prüfen ob team_squad das UNIQUE-Constraint (team_id, year, gender, verein) hat.
// Falls nicht (alter Stand ohne verein oder mit ALTER-TABLE-Migration), Tabelle neu aufbauen.
const squadIndexes = db.prepare("PRAGMA index_list(team_squad)").all();
const squadUniqueHasVerein = squadIndexes.some(idx => {
  if (!idx.unique) return false;
  const cols = db.prepare(`PRAGMA index_info("${idx.name}")`).all().map(c => c.name);
  return cols.includes('verein');
});
if (!squadUniqueHasVerein) {
  db.exec(`
    CREATE TABLE team_squad_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('m', 'w')),
      count INTEGER NOT NULL DEFAULT 0,
      verein TEXT NOT NULL DEFAULT 'TSV' CHECK(verein IN ('TSV', 'MTV', 'TSG')),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, year, gender, verein)
    );
    INSERT INTO team_squad_new (id, team_id, year, gender, count, verein, updated_at)
      SELECT id, team_id, year, gender, count,
        CASE WHEN verein IN ('TSV','MTV','TSG') THEN verein ELSE 'TSV' END,
        updated_at FROM team_squad;
    DROP TABLE team_squad;
    ALTER TABLE team_squad_new RENAME TO team_squad;
  `);
}

// Grunddaten anlegen, falls Tabellen leer
function seed() {
  // Plätze
  const pitchCount = db.prepare('SELECT COUNT(*) as c FROM pitches').get().c;
  if (pitchCount === 0) {
    db.prepare("INSERT INTO pitches (name, surface) VALUES (?, ?)").run('A-Platz', 'Rasen');
    db.prepare("INSERT INTO pitches (name, surface) VALUES (?, ?)").run('B-Platz', 'Kunstrasen');
    console.log('Plätze angelegt: A-Platz (Rasen), B-Platz (Kunstrasen)');
  }

  // Erster Admin-Account
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@verein.de';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const hash = bcrypt.hashSync(password, 12);
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run('Administrator', email, hash);
    console.log(`\n⚠️  Standard-Admin angelegt: ${email}`);
    console.log('⚠️  Bitte Passwort nach dem ersten Login ändern!\n');
  }
}

seed();

module.exports = db;
