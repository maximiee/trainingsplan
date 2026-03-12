let allTeams   = [];
let allPitches = [];
let allSeasons = [];
const squadState = {}; // teamId -> [{year, gender, count}]

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

async function init() {
  currentUser = await loadCurrentUser();
  updateNavUser(currentUser);
  setupLogout();
  setupHamburger();
  setupTabsScroll();
  setupTabs();

  document.getElementById('page-title').textContent = `Mein Bereich – ${currentUser.name}`;

  [allTeams, allPitches, allSeasons] = await Promise.all([
    api.get('/api/teams'),
    api.get('/api/pitches'),
    api.get('/api/seasons')
  ]);

  setupProfileForm();
  setupPasswordForm();
  renderFdButtons();
  await renderSessions();
  await renderMatches();
  await renderSquad();
}

function renderFdButtons() {
  const container = document.getElementById('fd-buttons');
  if (!container) return;
  const teams = (currentUser.teams || []).filter(t => t.fussball_de_id);
  container.innerHTML = teams.map(t =>
    `<button class="btn btn-secondary" onclick="openFdGamesModal(${t.id}, '${t.fussball_de_id}')">
      Spiele abrufen: ${t.name}
    </button>`
  ).join('');
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

  const myTeamIds = (currentUser.teams || []).map(t => t.id);
  const [allRecs, allSessionsList] = await Promise.all([
    api.get(`/api/sessions/recurrences?season_id=${activeSeason.id}`),
    api.get(`/api/sessions?season_id=${activeSeason.id}`)
  ]);

  const recs    = allRecs.filter(r => r.teams?.some(t => myTeamIds.includes(t.id)));
  const singles = allSessionsList.filter(s => !s.recurrence_id && s.teams?.some(t => myTeamIds.includes(t.id)));

  const tbody = document.getElementById('sessions-tbody');
  tbody.innerHTML = '';

  if (recs.length === 0 && singles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Keine Einheiten – bitte zuerst im Profil eine Mannschaft auswählen.</td></tr>';
    return;
  }

  for (const r of recs) {
    const teams = r.teams?.map(t => `<span class="color-dot" style="background:${t.color};margin-right:2px"></span>${t.name}`).join(', ') || '–';
    const tr    = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge badge-recurring">Periodisch</span></td>
      <td>${DAYS[r.weekday]}<br><small style="color:var(--text-muted)">${isoToDE(r.valid_from)} – ${isoToDE(r.valid_until)}</small></td>
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

  for (const s of singles) {
    const teams = s.teams?.map(t => `<span class="color-dot" style="background:${t.color};margin-right:2px"></span>${t.name}`).join(', ') || '–';
    const tr    = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge badge-single">Einzeltermin</span></td>
      <td>${isoToDE(s.date)}</td>
      <td>${s.pitch_name}</td>
      <td>${s.start_time}–${s.end_time}</td>
      <td>${teams}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-danger" onclick="deleteSingleSession(${s.id})">Löschen</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Session Modal ─────────────────────────────────────────────
let currentSessionMode = 'recurring';

window.setSessionMode = (mode) => {
  currentSessionMode = mode;
  document.getElementById('recurring-fields').classList.toggle('hidden', mode !== 'recurring');
  document.getElementById('single-fields').classList.toggle('hidden', mode !== 'single');
  document.getElementById('mode-btn-recurring').className = mode === 'recurring' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('mode-btn-single').className    = mode === 'single'    ? 'btn btn-primary' : 'btn btn-secondary';
};

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
  form.dataset.singleId = '';
  document.getElementById('session-modal-title').textContent = 'Neue Einheit';
  document.getElementById('session-mode-group').classList.remove('hidden');

  // Modus zurücksetzen
  setSessionMode('recurring');

  // Eigene Teams vorauswählen
  const myTeamIds = (currentUser.teams || []).map(t => t.id);
  form.querySelectorAll('[name=teamId]').forEach(cb => {
    cb.checked = myTeamIds.includes(parseInt(cb.value));
  });

  const activeSeason = allSeasons.find(s => s.is_active) || allSeasons[0];
  if (activeSeason) {
    form.querySelector('[name=valid_from]').value  = activeSeason.start_date;
    form.querySelector('[name=valid_until]').value = activeSeason.end_date;
  }

  // Heutiges Datum als Standard für Einzeltermin
  form.querySelector('[name=single_date]').value = toISO(new Date());

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
  form.dataset.singleId = '';
  document.getElementById('session-modal-title').textContent = 'Einheit bearbeiten';
  document.getElementById('session-mode-group').classList.add('hidden');

  setSessionMode('recurring');
  document.getElementById('recurring-fields').classList.remove('hidden');

  form.querySelector('[name=pitch_id]').value  = rec.pitch_id;
  form.querySelector('[name=weekday]').value    = rec.weekday;
  form.querySelector('[name=valid_from]').value  = rec.valid_from || '';
  form.querySelector('[name=valid_until]').value = rec.valid_until || '';
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

  try {
    if (currentSessionMode === 'recurring') {
      const weekday = parseInt(form.querySelector('[name=weekday]').value);
      const validFrom = form.querySelector('[name=valid_from]').value || activeSeason.start_date;

      await api.post('/api/sessions', {
        season_id:   activeSeason.id,
        pitch_id:    parseInt(form.querySelector('[name=pitch_id]').value),
        date:        validFrom,
        start_time:  form.querySelector('[name=start_time]').value,
        end_time:    form.querySelector('[name=end_time]').value,
        type:        'training',
        teamIds,
        recurring:   true,
        weekday,
        valid_until: form.querySelector('[name=valid_until]').value || activeSeason.end_date
      });
    } else {
      const singleDate = form.querySelector('[name=single_date]').value;
      if (!singleDate) { alert('Bitte ein Datum auswählen.'); return; }

      await api.post('/api/sessions', {
        season_id:  activeSeason.id,
        pitch_id:   parseInt(form.querySelector('[name=pitch_id]').value),
        date:       singleDate,
        start_time: form.querySelector('[name=start_time]').value,
        end_time:   form.querySelector('[name=end_time]').value,
        type:       'training',
        teamIds,
        recurring:  false
      });
    }
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

window.deleteSingleSession = async (id) => {
  if (!confirm('Einzeltermin löschen?')) return;
  await api.delete(`/api/sessions/${id}`);
  await renderSessions();
};

// ── Spiele & Turniere ─────────────────────────────────────────
window.setMatchType = (type) => {
  document.getElementById('match-form').querySelector('[name=type]').value = type;
  document.getElementById('match-type-btn-spiel').className   = type === 'spiel'   ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('match-type-btn-turnier').className = type === 'turnier' ? 'btn btn-primary' : 'btn btn-secondary';
};


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
    const typeBadge = m.type === 'turnier'
      ? '<span class="badge badge-turnier">Turnier</span>'
      : '<span class="badge badge-spiel">Spiel</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${typeBadge}</td>
      <td>${isoToDE(m.date)}</td>
      <td>${m.time || '–'}</td>
      <td><span class="color-dot" style="background:${m.team_color}"></span>${m.team_name}</td>
      <td>${m.opponent || '–'}</td>
      <td>${m.pitch_name ? m.pitch_name + (m.half_pitch ? ' <small style="color:var(--text-muted)">(½)</small>' : '') : '–'}</td>
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
  document.getElementById('match-modal-title').textContent = 'Neuer Termin';
  form.reset();
  setMatchType('spiel');
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
  document.getElementById('match-modal-title').textContent = 'Termin bearbeiten';
  setMatchType(m.type || 'spiel');
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
      season_id:  activeSeason.id,
      team_id:    parseInt(form.querySelector('[name=team_id]').value),
      date:       form.querySelector('[name=date]').value,
      time:       form.querySelector('[name=time]').value || null,
      pitch_id:   parseInt(form.querySelector('[name=pitch_id]').value) || null,
      opponent:   form.querySelector('[name=opponent]').value || null,
      half_pitch: form.querySelector('[name=half_pitch]').checked,
      location:   'heim',
      type:       form.querySelector('[name=type]').value
    });
    document.getElementById('match-modal').classList.add('hidden');
    if (result.cancelledTrainings > 0) {
      alert(`Termin gespeichert. ${result.cancelledTrainings} Training(s) an diesem Tag wurden abgesagt.`);
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
      location:   'heim',
      type:       form.querySelector('[name=type]').value
    });
    document.getElementById('match-modal').classList.add('hidden');
    if (result.cancelledTrainings > 0) {
      alert(`Termin gespeichert. ${result.cancelledTrainings} Training(s) an diesem Tag wurden abgesagt.`);
    }
    await renderMatches();
  } catch (err) { alert(err.message); }
}

window.deleteMatch = async (id) => {
  if (!confirm('Spiel löschen?')) return;
  await api.delete(`/api/matches/${id}`);
  await renderMatches();
};

// ── Kader / Meine Teams ───────────────────────────────────────
async function renderSquad() {
  const myTeams = currentUser.teams || [];
  const container = document.getElementById('squad-container');
  container.innerHTML = '';

  if (myTeams.length === 0) {
    container.innerHTML = '<div class="card" style="padding:20px;color:var(--text-muted)">Keine Mannschaft zugeordnet.</div>';
    return;
  }

  for (const team of myTeams) {
    const entries = await api.get(`/api/teams/${team.id}/squad`);
    squadState[team.id] = entries.map(e => ({ ...e }));
    container.appendChild(buildSquadCard(team));
  }
}

function buildSquadCard(team) {
  const isJugend = team.name.toLowerCase().includes('jugend');
  const card = document.createElement('div');
  card.id = `squad-card-${team.id}`;
  card.className = 'card';
  card.style.marginBottom = '20px';

  const fdBtn = team.fussball_de_id
    ? `<button class="btn btn-secondary" onclick="openFdGamesModal(${team.id}, '${team.fussball_de_id}')">Spiele abrufen</button>`
    : '';

  const squadSection = isJugend ? `
    <div style="overflow-x:auto;padding:0 16px">
      <table id="squad-table-${team.id}">
        <thead><tr>
          <th style="width:110px">Anzahl</th>
          <th style="width:150px">Geschlecht</th>
          <th style="width:120px">Jahrgang</th>
          <th style="width:100px">Verein</th>
          <th style="width:60px"></th>
        </tr></thead>
        <tbody id="squad-tbody-${team.id}"></tbody>
      </table>
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <span id="squad-total-${team.id}" style="font-size:13px;color:var(--text-muted);font-weight:500"></span>
      <div style="display:flex;align-items:center;gap:12px">
        <span id="squad-msg-${team.id}" style="font-size:12px"></span>
        <button class="btn btn-primary" onclick="saveSquad(${team.id})">Speichern</button>
      </div>
    </div>` : '';

  card.innerHTML = `
    <div class="card-header">
      <h2 class="card-title">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${team.color};margin-right:8px;vertical-align:middle"></span>
        ${team.name}
      </h2>
      <div style="display:flex;gap:8px">
        ${fdBtn}
        ${isJugend ? `<button class="btn btn-secondary" onclick="addSquadRow(${team.id})">+ Jahrgang</button>` : ''}
        ${isJugend ? `<button class="btn btn-secondary" onclick="openTrainerSquadDetails(${team.id})">Details</button>` : ''}
        <button class="btn btn-secondary" onclick="openTrainerTeamModal(${team.id})">Bearbeiten</button>
      </div>
    </div>
    ${squadSection}
  `;

  if (isJugend) renderSquadRows(team.id);
  return card;
}

window.openTrainerTeamModal = (teamId) => {
  const team = (currentUser.teams || []).find(t => t.id === teamId);
  if (!team) return;
  const form = document.getElementById('trainer-team-form');
  form.dataset.teamId = teamId;
  form.querySelector('[name=name]').value = team.name;
  form.querySelector('[name=age_group]').value = team.age_group || '';
  form.querySelector('[name=color]').value = team.color;
  form.querySelector('[name=fussball_de_id]').value = team.fussball_de_id || '';
  document.getElementById('trainer-team-modal').classList.remove('hidden');
};

document.getElementById('trainer-team-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const teamId = parseInt(form.dataset.teamId);
  const data = {
    name: form.querySelector('[name=name]').value,
    age_group: form.querySelector('[name=age_group]').value,
    color: form.querySelector('[name=color]').value,
    fussball_de_id: form.querySelector('[name=fussball_de_id]').value
  };
  try {
    await api.put(`/api/teams/${teamId}`, data);
    document.getElementById('trainer-team-modal').classList.add('hidden');
    // Lokalen Team-State aktualisieren und Karte neu bauen
    const team = (currentUser.teams || []).find(t => t.id === teamId);
    if (team) Object.assign(team, data);
    const card = document.getElementById(`squad-card-${teamId}`);
    if (card) card.replaceWith(buildSquadCard(team));
    renderFdButtons();
  } catch (err) {
    alert(err.message);
  }
});

function renderSquadRows(teamId) {
  const rows = squadState[teamId] || [];
  const tbody = document.getElementById(`squad-tbody-${teamId}`);
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Noch keine Jahrgänge eingetragen.</td></tr>';
  } else {
    tbody.innerHTML = rows.map((r, i) => `
      <tr>
        <td>
          <input type="number" class="form-control" style="width:80px" value="${r.count}" min="0" max="999"
            oninput="squadState[${teamId}][${i}].count = parseInt(this.value)||0; updateSquadTotal(${teamId})">
        </td>
        <td>
          <select class="form-control" onchange="squadState[${teamId}][${i}].gender = this.value">
            <option value="m" ${r.gender === 'm' ? 'selected' : ''}>Jungen</option>
            <option value="w" ${r.gender === 'w' ? 'selected' : ''}>Mädchen</option>
          </select>
        </td>
        <td>
          <input type="number" class="form-control" style="width:90px" value="${r.year}" min="1990" max="2030"
            oninput="squadState[${teamId}][${i}].year = parseInt(this.value)||0">
        </td>
        <td>
          <select class="form-control" onchange="squadState[${teamId}][${i}].verein = this.value">
            <option value="TSV" ${(r.verein || 'TSV') === 'TSV' ? 'selected' : ''}>TSV</option>
            <option value="MTV" ${r.verein === 'MTV' ? 'selected' : ''}>MTV</option>
            <option value="TSG" ${r.verein === 'TSG' ? 'selected' : ''}>TSG</option>
          </select>
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="removeSquadRow(${teamId}, ${i})">✕</button>
        </td>
      </tr>`).join('');
  }
  updateSquadTotal(teamId);
}

function updateSquadTotal(teamId) {
  const rows = squadState[teamId] || [];
  const total = rows.reduce((s, r) => s + (parseInt(r.count) || 0), 0);
  const el = document.getElementById(`squad-total-${teamId}`);
  if (el) el.textContent = total > 0 ? `Mannschaftsstärke: ${total} Spieler` : '';
}

window.addSquadRow = (teamId) => {
  if (!squadState[teamId]) squadState[teamId] = [];
  squadState[teamId].push({ year: new Date().getFullYear() - 10, gender: 'm', count: 0, verein: 'TSV' });
  renderSquadRows(teamId);
};

window.removeSquadRow = (teamId, index) => {
  squadState[teamId].splice(index, 1);
  renderSquadRows(teamId);
};

window.saveSquad = async (teamId) => {
  const msg = document.getElementById(`squad-msg-${teamId}`);
  try {
    await api.put(`/api/teams/${teamId}/squad`, squadState[teamId] || []);
    msg.style.color = 'var(--success)';
    msg.textContent = '✓ Gespeichert';
    setTimeout(() => { msg.textContent = ''; }, 3000);
  } catch (err) {
    msg.style.color = 'var(--danger)';
    msg.textContent = err.message;
  }
};

// ── Vereins-Details ───────────────────────────────────────────
const VEREIN_COLORS = { TSV: '#1a1a1a', MTV: '#cc0000', TSG: '#f0f0f0' };
const VEREIN_LABEL_COLORS = { TSV: '#fff', MTV: '#fff', TSG: '#333' };

window.openTrainerSquadDetails = (teamId) => {
  const squad = squadState[teamId] || [];
  const team = (currentUser.teams || []).find(t => t.id === teamId);
  const teamName = team ? team.name : '';

  const byVerein = {};
  for (const s of squad) {
    if (!byVerein[s.verein]) byVerein[s.verein] = 0;
    byVerein[s.verein] += s.count;
  }
  const total = Object.values(byVerein).reduce((a, b) => a + b, 0);
  const vereine = Object.keys(byVerein).sort();

  document.getElementById('trainer-squad-details-title').textContent = `${teamName} – Vereinszugehörigkeit`;

  const textHtml = vereine.map(v => {
    const count = byVerein[v];
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const color = VEREIN_COLORS[v] || '#999';
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:14px">
          <span style="font-weight:600;color:${color === '#f0f0f0' ? '#555' : color}">${v}</span>
          <span>${count} Spieler &nbsp;<strong>${pct}%</strong></span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:10px;overflow:hidden">
          <div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:width .3s;${v==='TSG'?'box-shadow:inset 0 0 0 1px #ccc':''}"></div>
        </div>
      </div>`;
  }).join('');

  const body = document.getElementById('trainer-squad-details-body');
  body.innerHTML = total === 0
    ? '<p style="color:var(--text-muted);text-align:center">Noch keine Kaderdaten vorhanden.</p>'
    : `<div style="margin-bottom:20px">${textHtml}</div>
       <canvas id="trainer-pie-canvas" width="220" height="220" style="display:block;margin:0 auto"></canvas>`;

  if (total > 0) {
    const ctx = document.getElementById('trainer-pie-canvas').getContext('2d');
    const cx = 110, cy = 110, r = 90;
    let angle = -Math.PI / 2;
    for (const v of vereine) {
      const slice = byVerein[v] / total * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = VEREIN_COLORS[v] || '#999';
      ctx.fill();
      ctx.strokeStyle = v === 'TSG' ? '#bbb' : '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (slice > 0.25) {
        const mid = angle + slice / 2;
        ctx.fillStyle = VEREIN_LABEL_COLORS[v] || '#333';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(byVerein[v] / total * 100)}%`,
          cx + Math.cos(mid) * r * 0.65, cy + Math.sin(mid) * r * 0.65);
      }
      angle += slice;
    }
  }

  document.getElementById('trainer-squad-details-modal').classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', init);
