require('dotenv').config();
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data/trainingsplan.db');

// DB-Check
try {
  const db = new Database(dbPath, { readonly: true });
  const users = db.prepare('SELECT id, name, email, role, is_active FROM users ORDER BY name').all();
  console.log('\n=== Benutzer in der Datenbank ===');
  users.forEach(u => console.log(`  [${u.role}] ${u.name} <${u.email}> active=${u.is_active}`));
  db.close();
} catch (e) {
  console.log('DB nicht gefunden:', e.message);
}

// Mail-Test
console.log('\n=== SMTP-Konfiguration ===');
console.log('  SMTP_HOST:', process.env.SMTP_HOST || '(nicht gesetzt)');
console.log('  SMTP_PORT:', process.env.SMTP_PORT || '(nicht gesetzt)');
console.log('  SMTP_USER:', process.env.SMTP_USER || '(nicht gesetzt)');
console.log('  SMTP_PASS:', process.env.SMTP_PASS ? '***' : '(nicht gesetzt)');
console.log('  SMTP_FROM:', process.env.SMTP_FROM || '(nicht gesetzt)');

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.log('\nSMTP nicht vollständig konfiguriert – kein Mail-Test möglich.');
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

console.log('\n=== Sende Test-Mail ===');
transporter.sendMail({
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
  to: process.env.SMTP_USER,
  subject: 'Trainingsplan – Mail-Test',
  text: 'Die E-Mail-Konfiguration funktioniert.'
}).then(info => {
  console.log('Erfolg:', info.messageId);
}).catch(err => {
  console.log('Fehler:', err.message);
});
