const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/seasons
router.get('/', requireAuth, (req, res) => {
  const seasons = db.prepare('SELECT * FROM seasons ORDER BY is_active DESC, start_date DESC').all();
  res.json(seasons);
});

// POST /api/seasons
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, type, start_date, end_date } = req.body;
  if (!name || !type || !start_date || !end_date) {
    return res.status(400).json({ error: 'Alle Felder erforderlich' });
  }
  if (start_date >= end_date) {
    return res.status(400).json({ error: 'Startdatum muss vor Enddatum liegen' });
  }
  const info = db.prepare(
    'INSERT INTO seasons (name, type, start_date, end_date, is_active) VALUES (?, ?, ?, ?, 0)'
  ).run(name, type, start_date, end_date);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/seasons/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, type, start_date, end_date } = req.body;
  if (!name || !type || !start_date || !end_date) {
    return res.status(400).json({ error: 'Alle Felder erforderlich' });
  }
  db.prepare('UPDATE seasons SET name = ?, type = ?, start_date = ?, end_date = ? WHERE id = ?')
    .run(name, type, start_date, end_date, parseInt(req.params.id));
  res.json({ ok: true });
});

// POST /api/seasons/:id/activate
router.post('/:id/activate', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE seasons SET is_active = 0').run();
  db.prepare('UPDATE seasons SET is_active = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// POST /api/seasons/:id/copy-recurrences – Wiederkehrende Einheiten aus alter Saison übernehmen
router.post('/:id/copy-recurrences', requireAuth, requireAdmin, (req, res) => {
  const targetSeasonId = parseInt(req.params.id);
  const { sourceSeasonId } = req.body;
  if (!sourceSeasonId) {
    return res.status(400).json({ error: 'Quell-Saison erforderlich' });
  }

  const targetSeason = db.prepare('SELECT * FROM seasons WHERE id = ?').get(targetSeasonId);
  if (!targetSeason) return res.status(404).json({ error: 'Ziel-Saison nicht gefunden' });

  const recurrences = db.prepare('SELECT * FROM recurrences WHERE season_id = ?').all(sourceSeasonId);

  const insertRec = db.prepare(
    'INSERT INTO recurrences (weekday, start_time, end_time, pitch_id, season_id, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertSession = db.prepare(
    'INSERT INTO training_sessions (season_id, pitch_id, date, start_time, end_time, type, recurrence_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertSessionTeam = db.prepare(
    'INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)'
  );
  const getSessionTeams = db.prepare(
    'SELECT DISTINCT st.team_id FROM session_teams st JOIN training_sessions ts ON ts.id = st.session_id WHERE ts.recurrence_id = ?'
  );

  const copyAll = db.transaction(() => {
    let count = 0;
    for (const rec of recurrences) {
      const teamIds = getSessionTeams.all(rec.id).map(r => r.team_id);

      const newRec = insertRec.run(
        rec.weekday, rec.start_time, rec.end_time,
        rec.pitch_id, targetSeasonId,
        targetSeason.start_date, targetSeason.end_date
      );
      const newRecId = newRec.lastInsertRowid;

      // Einzeltermine generieren
      const dates = getWeekdayDates(rec.weekday, targetSeason.start_date, targetSeason.end_date);
      for (const date of dates) {
        const sess = insertSession.run(
          targetSeasonId, rec.pitch_id, date,
          rec.start_time, rec.end_time, 'training', newRecId, null
        );
        for (const tid of teamIds) {
          insertSessionTeam.run(sess.lastInsertRowid, tid);
        }
        count++;
      }
    }
    return count;
  });

  const count = copyAll();
  res.json({ ok: true, sessionsCreated: count });
});

function getWeekdayDates(weekday, startDate, endDate) {
  // weekday: 0=Montag…6=Sonntag
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Zum ersten passenden Wochentag vorspulen
  // JS: 0=So, 1=Mo … 6=Sa → unsere Konvention: 0=Mo, 6=So
  const jsDay = (weekday + 1) % 7;
  const diff = (jsDay - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);

  while (start <= end) {
    dates.push(start.toISOString().slice(0, 10));
    start.setDate(start.getDate() + 7);
  }
  return dates;
}

module.exports = router;
