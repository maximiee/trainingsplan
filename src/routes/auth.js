const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, teamIds } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'E-Mail bereits vergeben' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'trainer')"
  ).run(name, email, hash);

  const userId = info.lastInsertRowid;
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    for (const tid of teamIds) insert.run(userId, tid);
  }

  const teams = db.prepare(`
    SELECT t.id, t.name, t.color FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
  `).all(userId);

  req.session.userId   = userId;
  req.session.userName = name;
  req.session.role     = 'trainer';
  req.session.teams    = teams;

  res.status(201).json({ ok: true });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user) {
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  }

  // Teams des Trainers laden
  const teams = db.prepare(`
    SELECT t.id, t.name, t.color FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id
    WHERE ut.user_id = ?
  `).all(user.id);

  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.role = user.role;
  req.session.teams = teams;

  res.json({ ok: true, role: user.role, name: user.name });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
  res.json({
    id:    req.session.userId,
    name:  req.session.userName,
    email: user?.email || '',
    role:  req.session.role,
    teams: req.session.teams || []
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
