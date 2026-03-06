require('dotenv').config();
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// Logging-Setup
const logDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, '../data');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logStream = fs.createWriteStream(path.join(logDir, 'app.log'), { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

// Session-Store mit SQLite
const SQLiteStore = require('connect-sqlite3')(session);
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/trainingsplan.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.dirname(dbPath) }),
  secret: process.env.SESSION_SECRET || 'dev-secret-bitte-aendern',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 Stunden
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Rate Limiting für Login
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Login-Versuche. Bitte 1 Minute warten.' }
});

// Statische Dateien
app.use(express.static(path.join(__dirname, 'public')));

// API-Routen
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/pitches', require('./routes/pitches'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/export', require('./routes/export'));
app.use('/api/import', require('./routes/import'));

// Logging-Middleware für Änderungen
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const original = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        log(`${req.session?.userName || 'anonym'} [${req.session?.role || '-'}] ${req.method} ${req.path}`);
      }
      return original(body);
    };
  }
  next();
});

// SPA-Fallback: HTML-Seiten direkt ausliefern
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpunkt nicht gefunden' });
  }
  res.status(404).send('Seite nicht gefunden');
});

// 500
app.use((err, req, res, next) => {
  log(`ERROR: ${err.message}\n${err.stack}`);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
  res.status(500).send('Interner Serverfehler');
});

app.listen(PORT, () => {
  log(`Trainingsplan-App gestartet auf Port ${PORT}`);
});
