const nodemailer = require('nodemailer');
const db = require('../db/database');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTrainersForTeams(teamIds) {
  if (!teamIds.length) return [];
  const placeholders = teamIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT DISTINCT u.email, u.name FROM users u
    JOIN user_teams ut ON ut.user_id = u.id
    WHERE ut.team_id IN (${placeholders}) AND u.is_active = 1
  `).all(...teamIds);
}

async function sendMail(to, subject, html) {
  if (!isConfigured()) return;
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error('[Mailer] Fehler:', err.message);
  }
}

function deDE(dateStr) {
  return dateStr.split('-').reverse().join('.');
}

// Neues Spiel eingetragen → Trainer des Teams informieren
async function notifyMatchCreated(match, cancelledCount) {
  const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(match.team_id);
  if (!team) return;
  const trainers = getTrainersForTeams([match.team_id]);
  if (!trainers.length) return;

  const dateStr = deDE(match.date);
  const location = match.location === 'heim' ? 'Heimspiel' : 'Auswärtsspiel';
  const opponent = match.opponent || '–';

  for (const trainer of trainers) {
    await sendMail(
      trainer.email,
      `Neues Spiel: ${team.name} am ${dateStr}`,
      `<p>Hallo ${trainer.name},</p>
       <p>für <b>${team.name}</b> wurde ein neues Spiel eingetragen:</p>
       <ul>
         <li><b>Datum:</b> ${dateStr}${match.time ? ' um ' + match.time + ' Uhr' : ''}</li>
         <li><b>Gegner:</b> ${opponent}</li>
         <li><b>Art:</b> ${location}</li>
         ${match.venue ? `<li><b>Ort:</b> ${match.venue}</li>` : ''}
       </ul>
       ${cancelledCount > 0 ? `<p><i>${cancelledCount} Trainingseinheit(en) wurden automatisch abgesagt.</i></p>` : ''}
       <p>Viele Grüße<br>Trainingsplan</p>`
    );
  }
}

// Training wieder angesetzt → Trainer der betroffenen Teams informieren
async function notifyTrainingReactivated(sessionId) {
  const session = db.prepare('SELECT * FROM training_sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  const teams = db.prepare(`
    SELECT t.id, t.name FROM session_teams st
    JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?
  `).all(sessionId);
  if (!teams.length) return;

  const trainers = getTrainersForTeams(teams.map(t => t.id));
  if (!trainers.length) return;

  const dateStr = deDE(session.date);
  const teamNames = teams.map(t => t.name).join(', ');

  for (const trainer of trainers) {
    await sendMail(
      trainer.email,
      `Training wieder angesetzt: ${teamNames} am ${dateStr}`,
      `<p>Hallo ${trainer.name},</p>
       <p>das Training von <b>${teamNames}</b> am <b>${dateStr}</b> (${session.start_time}–${session.end_time} Uhr) findet wieder statt.</p>
       ${session.note ? `<p><b>Hinweis:</b> ${session.note}</p>` : ''}
       <p>Viele Grüße<br>Trainingsplan</p>`
    );
  }
}

// Training manuell abgesagt → Trainer der betroffenen Teams informieren
async function notifyTrainingCancelled(sessionId) {
  const session = db.prepare('SELECT * FROM training_sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  const teams = db.prepare(`
    SELECT t.id, t.name FROM session_teams st
    JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?
  `).all(sessionId);
  if (!teams.length) return;

  const trainers = getTrainersForTeams(teams.map(t => t.id));
  if (!trainers.length) return;

  const dateStr = deDE(session.date);
  const teamNames = teams.map(t => t.name).join(', ');

  for (const trainer of trainers) {
    await sendMail(
      trainer.email,
      `Training abgesagt: ${teamNames} am ${dateStr}`,
      `<p>Hallo ${trainer.name},</p>
       <p>das Training von <b>${teamNames}</b> am <b>${dateStr}</b> (${session.start_time}–${session.end_time} Uhr) wurde abgesagt.</p>
       ${session.note ? `<p><b>Hinweis:</b> ${session.note}</p>` : ''}
       <p>Viele Grüße<br>Trainingsplan</p>`
    );
  }
}

module.exports = { notifyMatchCreated, notifyTrainingCancelled, notifyTrainingReactivated };
