let allTeams   = [];
let allPitches = [];
let allSeasons = [];

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

async function init() {
  currentUser = await loadCurrentUser();
  updateNavUser(currentUser);
  setupLogout();
  setupTabs();

  document.getElementById('page-title').textContent = `Mein Bereich – ${currentUser.name}`;

  [allTeams, allPitches, allSeasons] = await Promise.all([
    api.get('/api/teams'),
    api.get('/api/pitches'),
    api.get('/api/seasons')
  ]);

  setupProfileForm();
  setupPasswordForm();
  await renderSessions();
  await renderMatches();
}

function updateNavUser(user) {
  const el = document.getElementById('nav-user');
  if (el) el.textContent = user.name;
}

function setupTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === target);
      });
      document.querySelectorAll('.tab-content').forEach(c => {
        if (c.dataset.tab === target) {
          c.classList.remove('hidden');
        } else {
          c.classList.add('hidden');
        }
      });
    });
  });
}

// ── Profil ───────────────────────────────────────────────────
function setupProfileForm() {
  const form = document.getElementById('profile-form');
  form.querySelector('[name=name]').value  = currentUser.name;
  form.querySelector('[name=email]').value = currentUser.email || '';

  // Teams nur anzeigen (nicht änderbar)
  const box = document.getElementById('profile-teams');
  box.innerHTML = (currentUser.teams || []).length
    ? currentUser.teams.map(t => `
        <span style="display:flex;align-items:center;gap:5px;font-size:13px;padding:3px 8px;border:1px solid #dde1e7;border-radius:6px;background:#f8f9fa">
          <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block"></span>${t.name}
        </span>`).join('')
    : '<span style="color:var(--text-muted);font-size:13px">Keine Mannschaft zugeordnet</span>';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    try {
      await api.put('/api/users/me', {
        name:  form.querySelector('[name=name]').value,
        email: form.querySelector('[name=email]').value
      });
      msg.style.color = 'var(--success)';
      msg.textContent = '✓ Profil gespeichert';
      document.getElementById('page-title').textContent = `Mein Bereich – ${form.querySelector('[name=name]').value}`;
    } catch (err) {
      msg.style.color = 'var(--danger)';
      msg.textContent = err.message;
    }
  });
}

function setupPasswordForm() {
  const form = document.getElementById('pw-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('pw-msg');
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.querySelector('[name=currentPassword]').value,
        newPassword:     form.querySelector('[name=newPassword]').value
      });
      form.reset();
      msg.style.color = 'var(--success)';
      msg.textContent = '✓ Passwort geändert';
    } catch (err) {
      msg.style.color = 'var(--danger)';
      msg.textContent = err.message;
    }
  });
}

// ── Einheiten ─────────────────────────────────────────────────
async function renderSessions() {
  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  if (!activeSeason) return;

  const allRecs  = await api.get(`/api/sessions/recurrences?season_id=${activeSeason.id}`);
  const tbody = document.getElementById('sessions-tbody');
  tbody.innerHTML = '';

  const myTeamIds = (currentUser.teams || []).map(t => t.id);
  const recs = allRecs.filter(r => r.teams?.some(t => myTeamIds.includes(t.id)));

  if (recs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Keine Einheiten – bitte zuerst im Profil eine Mannschaft auswählen.</td></tr>';
    return;
  }

  for (const r of recs) {
    const teams = r.teams?.map(t => `<span class="color-dot" style="background:${t.color};margin-right:2px"></span>${t.name}`).join(', ') || '–';
    const tr    = document.createElement('tr');
    tr.innerHTML = `
      <td>${DAYS[r.weekday]}</td>
      <td>${r.pitch_name}</td>
      <td>${r.start_time}–${r.end_time}</td>
      <td>${teams}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditSessionModal(${r.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSession(${r.id})">Löschen</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Session Modal ─────────────────────────────────────────────
function buildSessionForm() {
  const form = document.getElementById('session-form');

  const pitchSel = form.querySelector('[name=pitch_id]');
  pitchSel.innerHTML = allPitches.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  ['start_time', 'end_time'].forEach(field => {
    const sel = form.querySelector(`[name=${field}]`);
    sel.innerHTML = '';
    for (let h = 6; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        sel.innerHTML += `<option value="${val}">${val}</option>`;
      }
    }
    if (field === 'start_time') sel.value = '17:00';
    if (field === 'end_time')   sel.value = '18:30';
  });

  document.getElementById('session-teams').innerHTML = allTeams.map(t => `
    <label class="checkbox-item">
      <input type="checkbox" name="teamId" value="${t.id}">
      <span class="color-dot" style="background:${t.color}"></span>${t.name}
    </label>`).join('');
}

window.openNewSessionModal = () => {
  buildSessionForm();
  const form = document.getElementById('session-form');
  form.dataset.recurrenceId = '';
  document.getElementById('session-modal-title').textContent = 'Neue Einheit';

  // Eigene Teams vorauswählen
  const myTeamIds = (currentUser.teams || []).map(t => t.id);
  form.querySelectorAll('[name=teamId]').forEach(cb => {
    cb.checked = myTeamIds.includes(parseInt(cb.value));
  });

  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  if (activeSeason) form.querySelector('[name=valid_until]').value = activeSeason.end_date;

  form.onsubmit = submitNewSession;
  document.getElementById('session-modal').classList.remove('hidden');
};

window.openEditSessionModal = async (id) => {
  buildSessionForm();
  const allRecs = await api.get('/api/sessions/recurrences');
  const rec = allRecs.find(r => r.id === id);
  if (!rec) return;

  const form = document.getElementById('session-form');
  form.dataset.recurrenceId = id;
  document.getElementById('session-modal-title').textContent = 'Einheit bearbeiten';

  form.querySelector('[name=pitch_id]').value  = rec.pitch_id;
  form.querySelector('[name=weekday]').value    = rec.weekday;
  form.querySelector('[name=start_time]').value = rec.start_time;
  form.querySelector('[name=end_time]').value   = rec.end_time;
  form.querySelectorAll('[name=teamId]').forEach(cb => {
    cb.checked = rec.teams?.some(t => t.id === parseInt(cb.value));
  });

  form.onsubmit = submitEditSession;
  document.getElementById('session-modal').classList.remove('hidden');
};

async function submitNewSession(e) {
  e.preventDefault();
  const form    = document.getElementById('session-form');
  const teamIds = [...form.querySelectorAll('[name=teamId]:checked')].map(el => parseInt(el.value));
  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  const weekday = parseInt(form.querySelector('[name=weekday]').value);

  // Startdatum: nächster passender Wochentag ab Saisonbeginn
  const jsDay = (weekday + 1) % 7;
  const d = new Date(activeSeason.start_date);
  while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
  const startDate = toISO(d);

  try {
    await api.post('/api/sessions', {
      season_id:   activeSeason.id,
      pitch_id:    parseInt(form.querySelector('[name=pitch_id]').value),
      date:        startDate,
      start_time:  form.querySelector('[name=start_time]').value,
      end_time:    form.querySelector('[name=end_time]').value,
      type:        'training',
      teamIds,
      recurring:   true,
      weekday,
      valid_until: form.querySelector('[name=valid_until]').value || activeSeason.end_date
    });
    document.getElementById('session-modal').classList.add('hidden');
    await renderSessions();
  } catch (err) { alert(err.message); }
}

async function submitEditSession(e) {
  e.preventDefault();
  const form          = document.getElementById('session-form');
  const recurrenceId  = form.dataset.recurrenceId;
  const teamIds       = [...form.querySelectorAll('[name=teamId]:checked')].map(el => parseInt(el.value));
  try {
    await api.put(`/api/sessions/recurrences/${recurrenceId}`, {
      pitch_id:   parseInt(form.querySelector('[name=pitch_id]').value),
      start_time: form.querySelector('[name=start_time]').value,
      end_time:   form.querySelector('[name=end_time]').value,
      teamIds
    });
    document.getElementById('session-modal').classList.add('hidden');
    await renderSessions();
  } catch (err) { alert(err.message); }
}

window.deleteSession = async (id) => {
  if (!confirm('Alle Einheiten dieser Serie löschen?')) return;
  await api.delete(`/api/sessions/recurrences/${id}`);
  await renderSessions();
};

// ── Spiele ────────────────────────────────────────────────────
async function renderMatches() {
  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  if (!activeSeason) return;

  const myTeamIds = (currentUser.teams || []).map(t => t.id);
  const tbody = document.getElementById('matches-tbody');
  tbody.innerHTML = '';

  const allMatches = await api.get(`/api/matches?season_id=${activeSeason.id}`);
  const matches = allMatches.filter(m => myTeamIds.includes(m.team_id));

  if (matches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">Keine Spiele eingetragen.</td></tr>';
    return;
  }

  for (const m of matches) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.date}</td>
      <td>${m.time || '–'}</td>
      <td><span class="color-dot" style="background:${m.team_color}"></span>${m.team_name}</td>
      <td>${m.opponent || '–'}</td>
      <td>${m.pitch_name || '–'}</td>
      <td>${m.half_pitch ? '✓' : '–'}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditMatchModal(${m.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" onclick="deleteMatch(${m.id})">Löschen</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

function buildMatchForm() {
  const teamSel = document.getElementById('match-team-select');
  const myTeams = currentUser.teams || [];
  teamSel.innerHTML = myTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  const pitchSel = document.getElementById('match-pitch-select');
  pitchSel.innerHTML = allPitches.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

window.openNewMatchModal = () => {
  buildMatchForm();
  const form = document.getElementById('match-form');
  form.dataset.matchId = '';
  document.getElementById('match-modal-title').textContent = 'Neues Spiel';
  form.reset();
  form.onsubmit = submitNewMatch;
  document.getElementById('match-modal').classList.remove('hidden');
};

window.openEditMatchModal = async (id) => {
  buildMatchForm();
  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  const allMatches = await api.get(`/api/matches?season_id=${activeSeason.id}`);
  const m = allMatches.find(x => x.id === id);
  if (!m) return;

  const form = document.getElementById('match-form');
  form.dataset.matchId = id;
  document.getElementById('match-modal-title').textContent = 'Spiel bearbeiten';
  form.querySelector('[name=team_id]').value      = m.team_id;
  form.querySelector('[name=date]').value          = m.date;
  form.querySelector('[name=time]').value          = m.time || '';
  form.querySelector('[name=pitch_id]').value      = m.pitch_id || '';
  form.querySelector('[name=opponent]').value      = m.opponent || '';
  form.querySelector('[name=half_pitch]').checked  = !!m.half_pitch;
  form.onsubmit = submitEditMatch;
  document.getElementById('match-modal').classList.remove('hidden');
};

async function submitNewMatch(e) {
  e.preventDefault();
  const form = document.getElementById('match-form');
  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  try {
    const result = await api.post('/api/matches', {
      season_id: activeSeason.id,
      team_id:   parseInt(form.querySelector('[name=team_id]').value),
      date:      form.querySelector('[name=date]').value,
      time:      form.querySelector('[name=time]').value || null,
      pitch_id:   parseInt(form.querySelector('[name=pitch_id]').value) || null,
      opponent:   form.querySelector('[name=opponent]').value || null,
      half_pitch: form.querySelector('[name=half_pitch]').checked,
      location:   'heim'
    });
    document.getElementById('match-modal').classList.add('hidden');
    if (result.cancelledTrainings > 0) {
      alert(`Spiel gespeichert. ${result.cancelledTrainings} Training(s) an diesem Tag wurden abgesagt.`);
    }
    await renderMatches();
  } catch (err) { alert(err.message); }
}

async function submitEditMatch(e) {
  e.preventDefault();
  const form = document.getElementById('match-form');
  const id = form.dataset.matchId;
  try {
    const result = await api.put(`/api/matches/${id}`, {
      team_id:    parseInt(form.querySelector('[name=team_id]').value),
      date:       form.querySelector('[name=date]').value,
      time:       form.querySelector('[name=time]').value || null,
      pitch_id:   parseInt(form.querySelector('[name=pitch_id]').value) || null,
      opponent:   form.querySelector('[name=opponent]').value || null,
      half_pitch: form.querySelector('[name=half_pitch]').checked,
      location:   'heim'
    });
    document.getElementById('match-modal').classList.add('hidden');
    if (result.cancelledTrainings > 0) {
      alert(`Spiel gespeichert. ${result.cancelledTrainings} Training(s) an diesem Tag wurden abgesagt.`);
    }
    await renderMatches();
  } catch (err) { alert(err.message); }
}

window.deleteMatch = async (id) => {
  if (!confirm('Spiel löschen?')) return;
  await api.delete(`/api/matches/${id}`);
  await renderMatches();
};

document.addEventListener('DOMContentLoaded', init);
