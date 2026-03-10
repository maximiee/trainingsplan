const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

const TEAMS = [
  { name: '1. Mannschaft', color: '#1a5276', age_group: 'Herren' },
  { name: '2. Herren',     color: '#2e86c1', age_group: 'Herren' },
  { name: 'Damen',         color: '#8e44ad', age_group: 'Damen'  },
  { name: 'D-Jugend',      color: '#e67e22', age_group: 'D'      },
  { name: 'C-Jugend',      color: '#27ae60', age_group: 'C'      },
  { name: 'E1',            color: '#2980b9', age_group: 'E'      },
  { name: 'E2',            color: '#16a085', age_group: 'E'      },
  { name: 'G-Jugend',      color: '#f39c12', age_group: 'G'      },
  { name: 'Ü40',           color: '#c0392b', age_group: 'Ü40'    },
  { name: 'Ü50',           color: '#7f8c8d', age_group: 'Ü50'    },
];

// weekday: 0=Mo … 6=So
const RECURRENCES = [
  { weekday: 0, start_time: '17:00', end_time: '18:30', pitch: 'A-Platz', teams: ['D-Jugend'] },
  { weekday: 0, start_time: '18:30', end_time: '20:00', pitch: 'A-Platz', teams: ['Damen'] },
  { weekday: 1, start_time: '16:00', end_time: '17:30', pitch: 'B-Platz', teams: ['G-Jugend'] },
  { weekday: 1, start_time: '16:30', end_time: '18:00', pitch: 'A-Platz', teams: ['E1', 'E2'] },
  { weekday: 1, start_time: '17:00', end_time: '18:30', pitch: 'A-Platz', teams: ['C-Jugend'] },
  { weekday: 1, start_time: '18:30', end_time: '20:30', pitch: 'A-Platz', teams: ['1. Mannschaft'] },
  { weekday: 1, start_time: '18:30', end_time: '20:30', pitch: 'B-Platz', teams: ['2. Herren'] },
  { weekday: 2, start_time: '17:00', end_time: '18:30', pitch: 'A-Platz', teams: ['D-Jugend'] },
  { weekday: 2, start_time: '18:00', end_time: '20:00', pitch: 'A-Platz', teams: ['Ü40'] },
  { weekday: 2, start_time: '18:00', end_time: '20:00', pitch: 'B-Platz', teams: ['Ü50'] },
  { weekday: 3, start_time: '16:00', end_time: '17:30', pitch: 'B-Platz', teams: ['G-Jugend'] },
  { weekday: 3, start_time: '17:00', end_time: '18:30', pitch: 'A-Platz', teams: ['D-Jugend', 'C-Jugend'] },
  { weekday: 3, start_time: '18:30', end_time: '20:30', pitch: 'B-Platz', teams: ['2. Herren'] },
  { weekday: 4, start_time: '16:00', end_time: '17:30', pitch: 'A-Platz', teams: ['E1', 'E2'] },
  { weekday: 4, start_time: '18:30', end_time: '20:30', pitch: 'A-Platz', teams: ['1. Mannschaft'] },
  { weekday: 6, start_time: '10:00', end_time: '12:00', pitch: 'A-Platz', teams: ['Ü40', 'Ü50'] },
  { weekday: 6, start_time: '12:00', end_time: '14:30', pitch: 'A-Platz', teams: ['2. Herren'] },
  { weekday: 6, start_time: '15:30', end_time: '18:00', pitch: 'A-Platz', teams: ['1. Mannschaft'] },
];

function getWeekdayDates(weekday, from, until) {
  const dates = [];
  const d = new Date(from);
  const jsDay = (weekday + 1) % 7; // Mo=0 → JS 1, So=6 → JS 0
  while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
  while (d.toISOString().slice(0, 10) <= until) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

// POST /api/import
const SUPERUSER_EMAIL = 'marco.paetz@gmx.net';

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.email !== SUPERUSER_EMAIL) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  if (!season) return res.status(400).json({ error: 'Keine aktive Saison vorhanden. Bitte zuerst eine Saison anlegen.' });

  const doImport = db.transaction(() => {
    // Teams anlegen (nur wenn noch nicht vorhanden)
    const insertTeam = db.prepare(
      'INSERT OR IGNORE INTO teams (name, color, age_group) VALUES (?, ?, ?)'
    );
    for (const t of TEAMS) insertTeam.run(t.name, t.color, t.age_group);

    // Aktuelle Plätze und Teams als Map laden
    const pitchMap = {};
    db.prepare('SELECT id, name FROM pitches').all().forEach(p => pitchMap[p.name] = p.id);
    const teamMap = {};
    db.prepare('SELECT id, name FROM teams').all().forEach(t => teamMap[t.name] = t.id);

    const insertRec = db.prepare(
      'INSERT INTO recurrences (weekday, start_time, end_time, pitch_id, season_id, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertSession = db.prepare(
      'INSERT INTO training_sessions (season_id, pitch_id, date, start_time, end_time, type, recurrence_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertTeamLink = db.prepare(
      'INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)'
    );

    let recCount = 0;
    let sessionCount = 0;

    for (const rec of RECURRENCES) {
      const pitchId = pitchMap[rec.pitch];
      if (!pitchId) continue;

      const teamIds = rec.teams.map(n => teamMap[n]).filter(Boolean);
      if (!teamIds.length) continue;

      const recRow = insertRec.run(rec.weekday, rec.start_time, rec.end_time, pitchId, season.id, season.start_date, season.end_date);
      recCount++;

      const dates = getWeekdayDates(rec.weekday, season.start_date, season.end_date);
      for (const date of dates) {
        const s = insertSession.run(season.id, pitchId, date, rec.start_time, rec.end_time, 'training', recRow.lastInsertRowid);
        for (const tid of teamIds) insertTeamLink.run(s.lastInsertRowid, tid);
        sessionCount++;
      }
    }

    return { recCount, sessionCount };
  });

  const result = doImport();
  res.json({ ok: true, ...result });
});

module.exports = router;
