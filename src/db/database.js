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

const squadColumns = db.prepare("PRAGMA table_info(team_squad)").all().map(c => c.name);
if (!squadColumns.includes('verein')) {
  db.exec("ALTER TABLE team_squad ADD COLUMN verein TEXT NOT NULL DEFAULT 'TSV' CHECK(verein IN ('TSV', 'MTV', 'TSG'))");
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
