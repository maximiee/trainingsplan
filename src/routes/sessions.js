const express = require('express');
const db = require('../db/database');
const { requireAuth, requireActive } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/sessions?start=YYYY-MM-DD&end=YYYY-MM-DD&season_id=X
router.get('/', requireAuth, (req, res) => {
  const { start, end, season_id } = req.query;
  let query = `
    SELECT ts.*, p.name as pitch_name, p.surface as pitch_surface
    FROM training_sessions ts
    JOIN pitches p ON p.id = ts.pitch_id
    WHERE 1=1
  `;
  const params = [];

  if (season_id) { query += ' AND ts.season_id = ?'; params.push(season_id); }
  if (start) { query += ' AND ts.date >= ?'; params.push(start); }
  if (end) { query += ' AND ts.date <= ?'; params.push(end); }
  query += ' ORDER BY ts.date, ts.start_time';

  const sessions = db.prepare(query).all(...params);

  const result = sessions.map(s => {
    const teams = db.prepare(`
      SELECT t.id, t.name, t.color FROM session_teams st
      JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?
    `).all(s.id);
    return { ...s, teams };
  });

  res.json(result);
});

// GET /api/sessions/recurrences?season_id=X
router.get('/recurrences', requireAuth, (req, res) => {
  const { season_id } = req.query;
  let query = 'SELECT r.*, p.name as pitch_name FROM recurrences r JOIN pitches p ON p.id = r.pitch_id WHERE 1=1';
  const params = [];
  if (season_id) { query += ' AND r.season_id = ?'; params.push(season_id); }
  query += ' ORDER BY r.weekday, r.start_time';

  const recs = db.prepare(query).all(...params);
  const result = recs.map(r => {
    const firstSession = db.prepare(
      'SELECT id FROM training_sessions WHERE recurrence_id = ? AND is_exception = 0 LIMIT 1'
    ).get(r.id);
    const teams = firstSession ? db.prepare(
      'SELECT t.id, t.name, t.color FROM session_teams st JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?'
    ).all(firstSession.id) : [];
    return { ...r, teams };
  });
  res.json(result);
});

// PUT /api/sessions/recurrences/:id
router.put('/recurrences/:id', requireAuth, requireActive, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { pitch_id, start_time, end_time, teamIds } = req.body;

  db.prepare(`
    UPDATE recurrences SET
      pitch_id = COALESCE(?, pitch_id),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time)
    WHERE id = ?
  `).run(pitch_id || null, start_time || null, end_time || null, id);

  db.prepare(`
    UPDATE training_sessions SET
      pitch_id = COALESCE(?, pitch_id),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time)
    WHERE recurrence_id = ? AND is_exception = 0
  `).run(pitch_id || null, start_time || null, end_time || null, id);

  if (Array.isArray(teamIds)) {
    const sessions = db.prepare('SELECT id FROM training_sessions WHERE recurrence_id = ? AND is_exception = 0').all(id);
    const del = db.prepare('DELETE FROM session_teams WHERE session_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)');
    const updateTeams = db.transaction(() => {
      for (const s of sessions) {
        del.run(s.id);
        for (const tid of teamIds) ins.run(s.id, tid);
      }
    });
    updateTeams();
  }

  res.json({ ok: true });
});

// DELETE /api/sessions/recurrences/:id
router.delete('/recurrences/:id', requireAuth, requireActive, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const deleteAll = db.transaction(() => {
    const sessions = db.prepare('SELECT id FROM training_sessions WHERE recurrence_id = ?').all(id);
    const delTeams = db.prepare('DELETE FROM session_teams WHERE session_id = ?');
    const delS = db.prepare('DELETE FROM training_sessions WHERE id = ?');
    for (const s of sessions) { delTeams.run(s.id); delS.run(s.id); }
    db.prepare('DELETE FROM recurrences WHERE id = ?').run(id);
  });
  deleteAll();
  res.json({ ok: true });
});

// GET /api/sessions/:id
router.get('/:id', requireAuth, (req, res) => {
  const session = db.prepare(`
    SELECT ts.*, p.name as pitch_name FROM training_sessions ts
    JOIN pitches p ON p.id = ts.pitch_id WHERE ts.id = ?
  `).get(parseInt(req.params.id));

  if (!session) return res.status(404).json({ error: 'Nicht gefunden' });

  const teams = db.prepare(`
    SELECT t.id, t.name, t.color FROM session_teams st
    JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?
  `).all(session.id);

  res.json({ ...session, teams });
});

// POST /api/sessions
router.post('/', requireAuth, requireActive, (req, res) => {
  const {
    season_id, pitch_id, date, start_time, end_time, type,
    note, teamIds, recurring, weekday, valid_until
  } = req.body;

  if (!season_id || !pitch_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ error: 'Startzeit muss vor Endzeit liegen' });
  }
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return res.status(400).json({ error: 'Mindestens ein Team erforderlich' });
  }

  // Kollisionsprüfung
  const collision = checkCollision(pitch_id, date, start_time, end_time);

  const createSessions = db.transaction(() => {
    const insertSession = db.prepare(
      'INSERT INTO training_sessions (season_id, pitch_id, date, start_time, end_time, type, recurrence_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertTeam = db.prepare('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)');

    let recurrenceId = null;
    const sessionIds = [];

    if (recurring) {
      const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(season_id);
      const until = valid_until || season.end_date;
      const wd = weekday !== undefined ? parseInt(weekday) : getWeekday(date);

      const rec = db.prepare(
        'INSERT INTO recurrences (weekday, start_time, end_time, pitch_id, season_id, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(wd, start_time, end_time, pitch_id, season_id, date, until);
      recurrenceId = rec.lastInsertRowid;

      const dates = getWeekdayDates(wd, date, until);
      for (const d of dates) {
        const s = insertSession.run(season_id, pitch_id, d, start_time, end_time, type || 'training', recurrenceId, note || null, req.session.userId);
        for (const tid of teamIds) insertTeam.run(s.lastInsertRowid, tid);
        sessionIds.push(s.lastInsertRowid);
      }
    } else {
      const s = insertSession.run(season_id, pitch_id, date, start_time, end_time, type || 'training', null, note || null, req.session.userId);
      for (const tid of teamIds) insertTeam.run(s.lastInsertRowid, tid);
      sessionIds.push(s.lastInsertRowid);
    }

    return sessionIds;
  });

  const ids = createSessions();
  res.status(201).json({ ok: true, ids, collision: collision || null });
});

// PUT /api/sessions/:id – einzelne Einheit bearbeiten
router.put('/:id', requireAuth, requireActive, (req, res) => {
  const id = parseInt(req.params.id);
  const { pitch_id, date, start_time, end_time, type, note, teamIds, is_cancelled } = req.body;

  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ error: 'Startzeit muss vor Endzeit liegen' });
  }

  db.prepare(`
    UPDATE training_sessions
    SET pitch_id = COALESCE(?, pitch_id),
        date = COALESCE(?, date),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        type = COALESCE(?, type),
        note = ?,
        is_cancelled = COALESCE(?, is_cancelled),
        is_exception = 1
    WHERE id = ?
  `).run(pitch_id || null, date || null, start_time || null, end_time || null, type || null, note ?? null, is_cancelled ?? null, id);

  if (Array.isArray(teamIds)) {
    db.prepare('DELETE FROM session_teams WHERE session_id = ?').run(id);
    const insert = db.prepare('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)');
    for (const tid of teamIds) insert.run(id, tid);
  }

  res.json({ ok: true });
});

// PUT /api/sessions/:id/future – alle zukünftigen Einheiten einer Serie ändern
router.put('/:id/future', requireAuth, requireActive, (req, res) => {
  const id = parseInt(req.params.id);
  const { pitch_id, start_time, end_time, type, note, teamIds } = req.body;

  const session = db.prepare('SELECT * FROM training_sessions WHERE id = ?').get(id);
  if (!session || !session.recurrence_id) {
    return res.status(400).json({ error: 'Keine Serieneinheit' });
  }

  const updateFuture = db.transaction(() => {
    const futures = db.prepare(
      'SELECT id FROM training_sessions WHERE recurrence_id = ? AND date >= ? AND is_exception = 0'
    ).all(session.recurrence_id, session.date);

    for (const s of futures) {
      db.prepare(`
        UPDATE training_sessions
        SET pitch_id = COALESCE(?, pitch_id),
            start_time = COALESCE(?, start_time),
            end_time = COALESCE(?, end_time),
            type = COALESCE(?, type),
            note = ?
        WHERE id = ?
      `).run(pitch_id || null, start_time || null, end_time || null, type || null, note ?? null, s.id);

      if (Array.isArray(teamIds)) {
        db.prepare('DELETE FROM session_teams WHERE session_id = ?').run(s.id);
        const insert = db.prepare('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)');
        for (const tid of teamIds) insert.run(s.id, tid);
      }
    }
    return futures.length;
  });

  const count = updateFuture();
  res.json({ ok: true, updated: count });
});

// DELETE /api/sessions/:id
router.delete('/:id', requireAuth, requireActive, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM session_teams WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM training_sessions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Hilfsfunktionen
function checkCollision(pitch_id, date, start_time, end_time, excludeId = null) {
  let query = `
    SELECT ts.id, GROUP_CONCAT(t.name) as teams
    FROM training_sessions ts
    LEFT JOIN session_teams st ON st.session_id = ts.id
    LEFT JOIN teams t ON t.id = st.team_id
    WHERE ts.pitch_id = ? AND ts.date = ? AND ts.is_cancelled = 0
    AND ts.start_time < ? AND ts.end_time > ?
  `;
  const params = [pitch_id, date, end_time, start_time];
  if (excludeId) { query += ' AND ts.id != ?'; params.push(excludeId); }
  return db.prepare(query).get(...params);
}

function getWeekday(dateStr) {
  const d = new Date(dateStr);
  return (d.getDay() + 6) % 7; // 0=Mo…6=So
}

function getWeekdayDates(weekday, startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
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
