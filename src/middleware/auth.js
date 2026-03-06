const db = require('../db/database');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }
  res.redirect('/login.html');
}

function requireActive(req, res, next) {
  const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.is_active) return next();
  res.status(403).json({ error: 'Dein Account ist deaktiviert' });
}

module.exports = { requireAuth, requireActive };
