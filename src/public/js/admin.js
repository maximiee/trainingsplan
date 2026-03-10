// Admin-Bereich: Benutzerverwaltung, Teams, Plätze, Saisons, Trainingseinheiten, Spieltermine
let adminUser = null;
let allTeams = [];
let allPitches = [];
let allSeasons = [];

async function adminInit() {
  adminUser = await loadCurrentUser();
  if (adminUser.role !== 'admin') {
    document.body.innerHTML = '<div class="page"><div class="alert alert-error">Kein Zugriff – nur für Admins</div></div>';
    return;
  }

  updateNavUser(adminUser);
  setupLogout();
  setupTabs();

  [allTeams, allPitches, allSeasons] = await Promise.all([
    api.get('/api/teams/all'),
    api.get('/api/pitches'),
    api.get('/api/seasons')
  ]);

  // Hash-basierte Navigation
  const hash = window.location.hash.replace('#', '') || 'users';
  activateTab(hash.split('-')[0]);

  await Promise.all([
    loadUsers(),
    renderTeams(),
    renderPitches(),
    renderSeasons(),
    renderSessions(),
    renderMatches()
  ]);

  setupSessionForm();
  setupMatchForm();
  setupProfileForm();
  await renderSquadOverview();
}

// --- Tabs ---
function setupTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
}

function activateTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.tab !== tabId));
  window.location.hash = tabId;
}

function updateNavUser(user) {
  const el = document.getElementById('nav-user');
  if (el) el.textContent = `${user.name}`;
}

// --- Benutzer ---
async function loadUsers() {
  const users = await api.get('/api/users');
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const u of users) {
    const teamNames = u.teams.map(t => t.name).join(', ') || '–';
    const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="user-avatar">${initials}</div>
        <div><strong>${u.name}</strong><div style="font-size:11px;color:var(--text-muted)">${u.email}</div></div>
      </div></td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>${teamNames}</td>
      <td><span class="badge badge-${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditUser(${u.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-secondary" onclick="openResetPassword(${u.id}, '${u.name}')">Passwort</button>
        ${u.id !== adminUser.id ? `
          <button class="btn btn-sm ${u.is_active ? 'btn-warning' : 'btn-success'}"
            onclick="${u.is_active ? 'deactivateUser' : 'activateUser'}(${u.id})">
            ${u.is_active ? 'Deaktivieren' : 'Aktivieren'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.name.replace(/'/g, "\\'")}')">Löschen</button>` : ''}
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

window.openNewUser = function() {
  openUserModal(null);
};

window.openEditUser = async function(id) {
  const users = await api.get('/api/users');
  const user = users.find(u => u.id === id);
  if (user) openUserModal(user);
};

function openUserModal(user) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  const title = document.getElementById('user-modal-title');

  title.textContent = user ? 'Benutzer bearbeiten' : 'Neuer Benutzer';
  form.reset();
  form.dataset.userId = user ? user.id : '';

  if (user) {
    form.querySelector('[name=name]').value = user.name;
    form.querySelector('[name=email]').value = user.email;
    form.querySelector('[name=role]').value = user.role;
    form.querySelector('.password-field').style.display = 'none';
    form.querySelector('[name=password]').required = false;
  } else {
    form.querySelector('.password-field').style.display = '';
    form.querySelector('[name=password]').required = true;
  }

  // Teams-Checkboxen
  const teamContainer = form.querySelector('#user-teams-checks');
  teamContainer.innerHTML = '';
  for (const t of allTeams.filter(t => t.is_active)) {
    const checked = user?.teams?.some(ut => ut.id === t.id) ? 'checked' : '';
    teamContainer.innerHTML += `
      <label class="checkbox-item">
        <input type="checkbox" name="teamIds" value="${t.id}" ${checked}>
        <span class="color-dot" style="background:${t.color}"></span>
        ${t.name}
      </label>`;
  }

  modal.classList.remove('hidden');
}

document.getElementById('user-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const userId = form.dataset.userId;
  const teamIds = [...form.querySelectorAll('[name=teamIds]:checked')].map(el => parseInt(el.value));

  const data = {
    name: form.querySelector('[name=name]').value,
    email: form.querySelector('[name=email]').value,
    role: form.querySelector('[name=role]').value,
    teamIds
  };

  try {
    if (userId) {
      await api.put(`/api/users/${userId}`, data);
    } else {
      data.password = form.querySelector('[name=password]').value;
      await api.post('/api/users', data);
    }
    document.getElementById('user-modal').classList.add('hidden');
    await loadUsers();
  } catch (err) {
    showAlert(form, err.message);
  }
});

window.openResetPassword = function(id, name) {
  const pwd = prompt(`Neues Passwort für ${name} (mind. 8 Zeichen):`);
  if (!pwd) return;
  api.post(`/api/users/${id}/reset-password`, { newPassword: pwd })
    .then(() => alert('Passwort wurde geändert.'))
    .catch(e => alert(e.message));
};

window.deactivateUser = async function(id) {
  if (!confirm('Benutzer deaktivieren?')) return;
  await api.post(`/api/users/${id}/deactivate`);
  await loadUsers();
};

window.activateUser = async function(id) {
  await api.post(`/api/users/${id}/activate`);
  await loadUsers();
};

window.deleteUser = async function(id, name) {
  if (!confirm(`Benutzer „${name}" wirklich dauerhaft löschen?`)) return;
  await api.delete(`/api/users/${id}`);
  await loadUsers();
};

// --- Teams ---
async function renderTeams() {
  allTeams = await api.get('/api/teams/all');
  const tbody = document.getElementById('teams-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const t of allTeams) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="color-swatch" style="background:${t.color}"></span></td>
      <td><strong>${t.name}</strong></td>
      <td>${t.age_group || '–'}</td>
      <td>${t.fussball_de_id || '–'}</td>
      <td><span class="badge badge-${t.is_active ? 'active' : 'inactive'}">${t.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditTeam(${t.id})">Bearbeiten</button>
        <button class="btn btn-sm ${t.is_active ? 'btn-warning' : 'btn-success'}"
          onclick="${t.is_active ? 'deactivateTeam' : 'activateTeam'}(${t.id})">
          ${t.is_active ? 'Deaktivieren' : 'Aktivieren'}
        </button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

window.openNewTeam = () => openTeamModal(null);
window.openEditTeam = (id) => openTeamModal(allTeams.find(t => t.id === id));

function openTeamModal(team) {
  const modal = document.getElementById('team-modal');
  const form = document.getElementById('team-form');
  document.getElementById('team-modal-title').textContent = team ? 'Team bearbeiten' : 'Neues Team';
  form.reset();
  form.dataset.teamId = team ? team.id : '';
  if (team) {
    form.querySelector('[name=name]').value = team.name;
    form.querySelector('[name=age_group]').value = team.age_group || '';
    form.querySelector('[name=color]').value = team.color;
    form.querySelector('[name=fussball_de_id]').value = team.fussball_de_id || '';
  }
  modal.classList.remove('hidden');
}

document.getElementById('team-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.teamId;
  const data = {
    name: form.querySelector('[name=name]').value,
    age_group: form.querySelector('[name=age_group]').value,
    color: form.querySelector('[name=color]').value,
    fussball_de_id: form.querySelector('[name=fussball_de_id]').value
  };
  try {
    if (id) await api.put(`/api/teams/${id}`, data);
    else await api.post('/api/teams', data);
    document.getElementById('team-modal').classList.add('hidden');
    await renderTeams();
  } catch (err) {
    showAlert(form, err.message);
  }
});

window.deactivateTeam = async (id) => { await api.post(`/api/teams/${id}/deactivate`); await renderTeams(); };
window.activateTeam = async (id) => { await api.post(`/api/teams/${id}/activate`); await renderTeams(); };

// --- Plätze ---
async function renderPitches() {
  allPitches = await api.get('/api/pitches');
  const tbody = document.getElementById('pitches-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const p of allPitches) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td><span class="pitch-surface-badge ${p.surface === 'Kunstrasen' ? 'kunstrasen' : ''}">${p.surface}</span></td>
      <td><button class="btn btn-sm btn-secondary" onclick="openEditPitch(${p.id})">Bearbeiten</button></td>
    `;
    tbody.appendChild(tr);
  }
}

window.openNewPitch = () => openPitchModal(null);
window.openEditPitch = (id) => openPitchModal(allPitches.find(p => p.id === id));

function openPitchModal(pitch) {
  const modal = document.getElementById('pitch-modal');
  const form = document.getElementById('pitch-form');
  document.getElementById('pitch-modal-title').textContent = pitch ? 'Platz bearbeiten' : 'Neuer Platz';
  form.reset();
  form.dataset.pitchId = pitch ? pitch.id : '';
  if (pitch) {
    form.querySelector('[name=name]').value = pitch.name;
    form.querySelector('[name=surface]').value = pitch.surface;
  }
  modal.classList.remove('hidden');
}

document.getElementById('pitch-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.pitchId;
  const data = { name: form.querySelector('[name=name]').value, surface: form.querySelector('[name=surface]').value };
  try {
    if (id) await api.put(`/api/pitches/${id}`, data);
    else await api.post('/api/pitches', data);
    document.getElementById('pitch-modal').classList.add('hidden');
    await renderPitches();
  } catch (err) {
    showAlert(form, err.message);
  }
});

// --- Saisons ---
async function renderSeasons() {
  allSeasons = await api.get('/api/seasons');
  const container = document.getElementById('seasons-list');
  if (!container) return;
  container.innerHTML = '';

  for (const s of allSeasons) {
    const item = document.createElement('div');
    item.className = 'season-item';
    const isActive = s.is_active === 1;
    item.innerHTML = `
      <div style="flex:1">
        <div class="season-name">${s.name} ${isActive ? '<span class="badge badge-active">Aktiv</span>' : ''}</div>
        <div class="season-dates">${isoToDE(s.start_date)} – ${isoToDE(s.end_date)} · ${s.type}</div>
      </div>
      <div class="actions">
        ${!isActive ? `<button class="btn btn-sm btn-success" onclick="activateSeason(${s.id})">Aktivieren</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="openEditSeason(${s.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-secondary" onclick="openCopyRecurrences(${s.id})">Vorlage importieren</button>
      </div>
    `;
    container.appendChild(item);
  }
}

window.openNewSeason = () => openSeasonModal(null);
window.openEditSeason = (id) => openSeasonModal(allSeasons.find(s => s.id === id));

function openSeasonModal(season) {
  const modal = document.getElementById('season-modal');
  const form = document.getElementById('season-form');
  document.getElementById('season-modal-title').textContent = season ? 'Saison bearbeiten' : 'Neue Saison';
  form.reset();
  form.dataset.seasonId = season ? season.id : '';
  if (season) {
    form.querySelector('[name=name]').value = season.name;
    form.querySelector('[name=type]').value = season.type;
    form.querySelector('[name=start_date]').value = season.start_date;
    form.querySelector('[name=end_date]').value = season.end_date;
  }
  modal.classList.remove('hidden');
}

document.getElementById('season-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.seasonId;
  const data = {
    name: form.querySelector('[name=name]').value,
    type: form.querySelector('[name=type]').value,
    start_date: form.querySelector('[name=start_date]').value,
    end_date: form.querySelector('[name=end_date]').value
  };
  try {
    if (id) await api.put(`/api/seasons/${id}`, data);
    else await api.post('/api/seasons', data);
    document.getElementById('season-modal').classList.add('hidden');
    await renderSeasons();
  } catch (err) {
    showAlert(form, err.message);
  }
});

window.activateSeason = async (id) => {
  if (!confirm('Diese Saison aktivieren? Die aktuell aktive Saison wird archiviert.')) return;
  await api.post(`/api/seasons/${id}/activate`);
  allSeasons = await api.get('/api/seasons');
  await renderSeasons();
};

window.openCopyRecurrences = (id) => {
  const modal = document.getElementById('copy-modal');
  modal.dataset.targetId = id;
  const sel = document.getElementById('copy-source-select');
  sel.innerHTML = '';
  for (const s of allSeasons.filter(s => s.id !== id)) {
    sel.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  }
  modal.classList.remove('hidden');
};

document.getElementById('copy-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const modal = document.getElementById('copy-modal');
  const targetId = modal.dataset.targetId;
  const sourceId = document.getElementById('copy-source-select').value;
  try {
    const res = await api.post(`/api/seasons/${targetId}/copy-recurrences`, { sourceSeasonId: parseInt(sourceId) });
    alert(`${res.sessionsCreated} Einheiten wurden übernommen.`);
    modal.classList.add('hidden');
  } catch (err) {
    alert(err.message);
  }
});

// --- Trainingseinheiten (Recurrences-Ansicht) ---
async function renderSessions() {
  const activeSeason = allSeasons.find(s => s.is_active);
  const container = document.getElementById('sessions-container');
  if (!container || !activeSeason) return;

  const recurrences = await api.get(`/api/sessions/recurrences?season_id=${activeSeason.id}`);
  const tbody = document.getElementById('sessions-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  for (const r of recurrences) {
    const teams = r.teams?.map(t => `<span class="color-dot" style="background:${t.color};margin-right:2px"></span>${t.name}`).join(', ') || '–';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${DAYS[r.weekday]}</td>
      <td>${r.pitch_name}</td>
      <td>${r.start_time}–${r.end_time}</td>
      <td>${teams}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditRecurrence(${r.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRecurrence(${r.id})">Löschen</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

function setSessionModalMode(mode) {
  // mode: 'new' | 'recurrence'
  const isRecurrence = mode === 'recurrence';
  document.getElementById('session-season-row').style.display = isRecurrence ? 'none' : '';
  document.getElementById('session-date-group').style.display = isRecurrence ? 'none' : '';
  document.getElementById('session-weekday-group').style.display = isRecurrence ? '' : 'none';
  document.getElementById('session-note-group').style.display = isRecurrence ? 'none' : '';
  document.getElementById('session-recurring-group').style.display = isRecurrence ? 'none' : '';
  document.getElementById('session-recurring-fields').style.display = isRecurrence ? 'none' : '';
}

function setupSessionForm() {
  const form = document.getElementById('session-form');
  if (!form) return;

  // Teams-Checkboxen aufbauen
  const teamContainer = form.querySelector('#session-teams-checks');
  teamContainer.innerHTML = '';
  for (const t of allTeams.filter(t => t.is_active)) {
    teamContainer.innerHTML += `
      <label class="checkbox-item">
        <input type="checkbox" name="teamIds" value="${t.id}">
        <span class="color-dot" style="background:${t.color}"></span>
        ${t.name}
      </label>`;
  }

  // Platz-Dropdown
  const pitchSel = form.querySelector('[name=pitch_id]');
  pitchSel.innerHTML = '';
  for (const p of allPitches) {
    pitchSel.innerHTML += `<option value="${p.id}">${p.name} (${p.surface})</option>`;
  }

  // Saison-Dropdown
  const seasonSel = form.querySelector('[name=season_id]');
  seasonSel.innerHTML = '';
  for (const s of allSeasons) {
    seasonSel.innerHTML += `<option value="${s.id}" ${s.is_active ? 'selected' : ''}>${s.name}</option>`;
  }

  // Zeitslots
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
    if (field === 'end_time') sel.value = '18:30';
  });

  // Wiederkehrend-Toggle (für neue Einheit)
  const recurringCheck = form.querySelector('[name=recurring]');
  const recurringFields = document.getElementById('session-recurring-fields');
  recurringCheck?.addEventListener('change', () => {
    recurringFields.style.display = recurringCheck.checked ? '' : 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recurrenceId = form.dataset.recurrenceId;
    const teamIds = [...form.querySelectorAll('[name=teamIds]:checked')].map(el => parseInt(el.value));

    try {
      if (recurrenceId) {
        // Recurrence bearbeiten
        await api.put(`/api/sessions/recurrences/${recurrenceId}`, {
          pitch_id: parseInt(form.querySelector('[name=pitch_id]').value),
          start_time: form.querySelector('[name=start_time]').value,
          end_time: form.querySelector('[name=end_time]').value,
          teamIds
        });
      } else {
        // Neue Einheit anlegen
        const recurring = form.querySelector('[name=recurring]')?.checked;
        const data = {
          season_id: parseInt(form.querySelector('[name=season_id]').value),
          pitch_id: parseInt(form.querySelector('[name=pitch_id]').value),
          date: form.querySelector('[name=date]').value,
          start_time: form.querySelector('[name=start_time]').value,
          end_time: form.querySelector('[name=end_time]').value,
          type: form.querySelector('[name=type]').value,
          note: form.querySelector('[name=note]').value,
          teamIds,
          recurring,
          weekday: recurring ? parseInt(form.querySelector('[name=weekday_new]')?.value) : undefined,
          valid_until: recurring ? form.querySelector('[name=valid_until]')?.value : undefined
        };
        const res = await api.post('/api/sessions', data);
        if (res.collision) {
          const warn = form.querySelector('.collision-warning');
          warn.textContent = `Hinweis: Platz ist zur gleichen Zeit bereits belegt (${res.collision.teams}). Einheit wurde trotzdem gespeichert.`;
          warn.classList.add('show');
        }
      }
      form.reset();
      form.dataset.recurrenceId = '';
      document.getElementById('session-modal').classList.add('hidden');
      await renderSessions();
    } catch (err) {
      showAlert(form, err.message);
    }
  });
}

window.openNewSession = () => {
  const modal = document.getElementById('session-modal');
  const form = document.getElementById('session-form');
  form.reset();
  form.dataset.recurrenceId = '';
  document.getElementById('session-modal-title').textContent = 'Neue Einheit';
  setSessionModalMode('new');
  form.querySelector('[name=date]').value = toISO(new Date());
  modal.classList.remove('hidden');
};

window.openEditRecurrence = async (id) => {
  const allRecs = await api.get('/api/sessions/recurrences');
  const rec = allRecs.find(r => r.id === id);
  if (!rec) return;

  const form = document.getElementById('session-form');
  form.dataset.recurrenceId = id;
  document.getElementById('session-modal-title').textContent = 'Wiederkehrende Einheit bearbeiten';
  setSessionModalMode('recurrence');

  form.querySelector('[name=pitch_id]').value = rec.pitch_id;
  form.querySelector('[name=weekday]').value = rec.weekday;
  form.querySelector('[name=start_time]').value = rec.start_time;
  form.querySelector('[name=end_time]').value = rec.end_time;

  form.querySelectorAll('[name=teamIds]').forEach(cb => {
    cb.checked = rec.teams?.some(t => t.id === parseInt(cb.value));
  });

  document.getElementById('session-modal').classList.remove('hidden');
};

window.deleteRecurrence = async (id) => {
  if (!confirm('Alle Einheiten dieser Serie löschen?')) return;
  await api.delete(`/api/sessions/recurrences/${id}`);
  await renderSessions();
};

// --- Spieltermine ---
async function renderMatches() {
  const activeSeason = allSeasons.find(s => s.is_active);
  if (!activeSeason) return;

  const matches = await api.get(`/api/matches?season_id=${activeSeason.id}`);
  const tbody = document.getElementById('matches-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const m of matches) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${isoToDE(m.date)}</td>
      <td>${m.time || '–'}</td>
      <td><span class="color-dot" style="background:${m.team_color}"></span> ${m.team_name}</td>
      <td>${m.opponent || '–'}</td>
      <td>${m.pitch_name ? m.pitch_name + (m.half_pitch ? ' <small style="color:var(--text-muted)">(½)</small>' : '') : '–'}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditMatch(${m.id})">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" onclick="deleteMatch(${m.id})">Löschen</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
}

function setupMatchForm() {
  const form = document.getElementById('match-form');
  if (!form) return;

  const teamSel = form.querySelector('[name=team_id]');
  teamSel.innerHTML = '';
  for (const t of allTeams.filter(t => t.is_active)) {
    teamSel.innerHTML += `<option value="${t.id}">${t.name}</option>`;
  }

  const pitchSel = document.getElementById('match-pitch-select');
  if (pitchSel) pitchSel.innerHTML = allPitches.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = form.dataset.matchId;
    const data = {
      team_id:   parseInt(form.querySelector('[name=team_id]').value),
      date:      form.querySelector('[name=date]').value,
      time:      form.querySelector('[name=time]').value || null,
      opponent:  form.querySelector('[name=opponent]').value || null,
      pitch_id:  parseInt(form.querySelector('[name=pitch_id]').value) || null,
      half_pitch: form.querySelector('[name=half_pitch]').checked,
      location:  'heim'
    };
    try {
      if (id) await api.put(`/api/matches/${id}`, data);
      else {
        const result = await api.post('/api/matches', data);
        if (result.cancelledTrainings > 0) {
          alert(`Gespeichert. ${result.cancelledTrainings} Training(s) an diesem Tag wurden abgesagt.`);
        }
      }
      form.reset();
      form.dataset.matchId = '';
      document.getElementById('match-modal').classList.add('hidden');
      await renderMatches();
    } catch (err) {
      showAlert(form, err.message);
    }
  });
}

window.openNewMatch = () => {
  const modal = document.getElementById('match-modal');
  const form = document.getElementById('match-form');
  form.reset();
  form.dataset.matchId = '';
  document.getElementById('match-modal-title').textContent = 'Neuer Spieltermin';
  form.querySelector('[name=date]').value = toISO(new Date());
  modal.classList.remove('hidden');
};

window.openEditMatch = async (id) => {
  const matches = await api.get(`/api/matches?season_id=${allSeasons.find(s=>s.is_active)?.id}`);
  const m = matches.find(x => x.id === id);
  if (!m) return;

  const form = document.getElementById('match-form');
  form.dataset.matchId = id;
  document.getElementById('match-modal-title').textContent = 'Spieltermin bearbeiten';
  form.querySelector('[name=team_id]').value      = m.team_id;
  form.querySelector('[name=date]').value          = m.date;
  form.querySelector('[name=time]').value          = m.time || '';
  form.querySelector('[name=opponent]').value      = m.opponent || '';
  form.querySelector('[name=pitch_id]').value      = m.pitch_id || '';
  form.querySelector('[name=half_pitch]').checked  = !!m.half_pitch;
  document.getElementById('match-modal').classList.remove('hidden');
};

window.deleteMatch = async (id) => {
  if (!confirm('Spieltermin löschen?')) return;
  await api.delete(`/api/matches/${id}`);
  await renderMatches();
};

// --- Profil ---
function setupProfileForm() {
  const form = document.getElementById('profile-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const curr = form.querySelector('[name=currentPassword]').value;
    const newPwd = form.querySelector('[name=newPassword]').value;
    const confirm = form.querySelector('[name=confirmPassword]').value;

    if (newPwd !== confirm) {
      showAlert(form, 'Passwörter stimmen nicht überein');
      return;
    }
    try {
      await api.post('/api/auth/change-password', { currentPassword: curr, newPassword: newPwd });
      showAlert(form, 'Passwort erfolgreich geändert', 'success');
      form.reset();
    } catch (err) {
      showAlert(form, err.message);
    }
  });
}

// Modal-Schließen via Overlay-Klick
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

function toISO(date) {
  return date.toISOString().slice(0, 10);
}
function isoToDE(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}
function showAlert(container, msg, type = 'error') {
  const old = container.querySelector('.alert');
  if (old) old.remove();
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  container.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

// --- Import ---
document.getElementById('btn-run-import')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-run-import');
  const result = document.getElementById('import-result');
  if (!confirm('Grunddaten wirklich importieren? Bitte nur einmalig ausführen.')) return;
  btn.disabled = true;
  btn.textContent = 'Importiere…';
  result.textContent = '';
  try {
    const res = await api.post('/api/import', {});
    result.style.color = 'var(--success)';
    result.textContent = `✓ Fertig: ${res.recCount} Einheiten-Muster und ${res.sessionCount} Termine importiert.`;
    await renderSessions();
  } catch (err) {
    result.style.color = 'var(--danger)';
    result.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Mannschaften & Einheiten importieren';
  }
});

// ── Altersklassen-Projektion ──────────────────────────────────
// Altersklassen-Mapping: Basis-Jahrgänge für Spielzeit 2024/25
const PROJECTION_BASE_YEAR = 2024;
const PROJECTION_SEASONS = Array.from({ length: 11 }, (_, i) => PROJECTION_BASE_YEAR + i);
const AGE_CLASSES = [
  { name: 'G-Junioren', baseYears: [2018, 2019] },
  { name: 'F-Junioren', baseYears: [2016, 2017] },
  { name: 'E-Junioren', baseYears: [2014, 2015] },
  { name: 'D-Junioren', baseYears: [2012, 2013] },
  { name: 'C-Junioren', baseYears: [2010, 2011] },
  { name: 'B-Junioren', baseYears: [2008, 2009] },
  { name: 'A-Junioren', baseYears: [2006, 2007] },
];

let squadAggregate = []; // [{year, gender, count}]

function seasonLabel(startYear) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function initProjectionSeasonSelect() {
  const sel = document.getElementById('projection-season-select');
  if (!sel) return;
  sel.innerHTML = PROJECTION_SEASONS.map(y =>
    `<option value="${y}">${seasonLabel(y)}</option>`
  ).join('');
  // Standard: aktuelle Spielzeit anhand Jahr
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed; Saison wechselt ~Juli
  const currentSeason = currentMonth >= 6 ? currentYear : currentYear - 1;
  const defaultYear = Math.max(PROJECTION_BASE_YEAR, Math.min(currentSeason, PROJECTION_BASE_YEAR + 10));
  sel.value = defaultYear;
}

window.renderProjection = function() {
  const sel = document.getElementById('projection-season-select');
  const seasonStart = parseInt(sel.value);
  const offset = seasonStart - PROJECTION_BASE_YEAR;

  // yearMap aufbauen: year → {m, w}
  const yearMap = {};
  for (const row of squadAggregate) {
    if (!yearMap[row.year]) yearMap[row.year] = { m: 0, w: 0 };
    yearMap[row.year][row.gender] += row.count;
  }

  const tbody = document.getElementById('projection-tbody');
  const tfoot = document.getElementById('projection-tfoot');
  tbody.innerHTML = '';
  let grandM = 0, grandW = 0;

  for (const cls of AGE_CLASSES) {
    const years = cls.baseYears.map(y => y + offset);
    const rowspan = years.length + 1; // Jahrgänge + Summenzeile

    years.forEach((year, i) => {
      const sq = yearMap[year] || { m: 0, w: 0 };
      const tr = document.createElement('tr');
      if (i === 0) {
        tr.innerHTML = `
          <td rowspan="${rowspan}" style="vertical-align:top;padding-top:10px;font-weight:600">${cls.name}</td>
          <td style="text-align:center">${year}</td>
          <td style="text-align:center">${sq.m || '–'}</td>
          <td style="text-align:center">${sq.w || '–'}</td>
          <td style="text-align:center">${sq.m + sq.w || '–'}</td>
        `;
      } else {
        tr.innerHTML = `
          <td style="text-align:center">${year}</td>
          <td style="text-align:center">${sq.m || '–'}</td>
          <td style="text-align:center">${sq.w || '–'}</td>
          <td style="text-align:center">${sq.m + sq.w || '–'}</td>
        `;
      }
      tbody.appendChild(tr);
    });

    // Summe pro Altersklasse
    const totalM = years.reduce((s, y) => s + (yearMap[y]?.m || 0), 0);
    const totalW = years.reduce((s, y) => s + (yearMap[y]?.w || 0), 0);
    grandM += totalM;
    grandW += totalW;

    const sumTr = document.createElement('tr');
    sumTr.style.background = 'var(--bg-secondary)';
    sumTr.innerHTML = `
      <td style="font-size:12px;font-weight:600;color:var(--text-muted);text-align:center">Gesamt</td>
      <td style="text-align:center;font-weight:700">${totalM || '–'}</td>
      <td style="text-align:center;font-weight:700">${totalW || '–'}</td>
      <td style="text-align:center;font-weight:700">${totalM + totalW || '–'}</td>
    `;
    tbody.appendChild(sumTr);
  }

  tfoot.innerHTML = `
    <tr style="background:var(--primary-light,#e8f0fe);font-weight:700">
      <td colspan="2" style="text-align:right;padding-right:12px">Alle Altersklassen:</td>
      <td style="text-align:center">${grandM}</td>
      <td style="text-align:center">${grandW}</td>
      <td style="text-align:center">${grandM + grandW}</td>
    </tr>
  `;
};

window.printProjection = () => {
  const sel = document.getElementById('projection-season-select');
  const label = seasonLabel(parseInt(sel.value));
  const content = document.getElementById('projection-wrap').outerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="de"><head>
    <meta charset="UTF-8">
    <title>Altersklassen-Projektion ${label}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; }
      th { background: #f0f0f0; font-weight: 600; }
      tfoot tr td { background: #dde6fb; font-weight: 700; }
    </style>
  </head><body>
    <h2 style="margin-bottom:4px">Altersklassen-Projektion</h2>
    <p style="color:#666;font-size:12px;margin-bottom:12px">Spielzeit ${label}</p>
    ${content}
  </body></html>`);
  win.document.close();
  win.print();
};

// ── Kader-Übersicht ───────────────────────────────────────────
async function renderSquadOverview() {
  const tbody = document.getElementById('squad-overview-tbody');
  const tfoot = document.getElementById('squad-overview-tfoot');
  if (!tbody) return;

  // Projektionsdaten laden und initialisieren
  [squadAggregate] = await Promise.all([
    api.get('/api/teams/squad-aggregate')
  ]);
  initProjectionSeasonSelect();
  renderProjection();

  const teams = await api.get('/api/teams/overview');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  let grandTotal_m = 0;
  let grandTotal_w = 0;

  for (const team of teams) {
    const trainers = team.trainers.length ? team.trainers.join(', ') : '–';
    const colorDot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${team.color};margin-right:7px;vertical-align:middle;flex-shrink:0"></span>`;

    grandTotal_m += team.total_m;
    grandTotal_w += team.total_w;

    if (team.squad.length === 0) {
      // Team ohne Kaderdaten: eine leere Zeile
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div style="display:flex;align-items:center">${colorDot}<strong>${team.name}</strong></div></td>
        <td>${trainers}</td>
        <td style="color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
      `;
      tbody.appendChild(tr);
      continue;
    }

    // Jahrgänge zusammenfassen: pro year einen Eintrag mit m+w
    const byYear = {};
    for (const s of team.squad) {
      if (!byYear[s.year]) byYear[s.year] = { m: 0, w: 0 };
      byYear[s.year][s.gender] += s.count;
    }
    const years = Object.keys(byYear).sort((a, b) => b - a);

    years.forEach((year, i) => {
      const { m, w } = byYear[year];
      const tr = document.createElement('tr');
      if (i === 0) {
        // Erste Zeile: Team-Name und Trainer mit rowspan
        const totalRows = years.length + 1; // +1 für die Summenzeile
        tr.innerHTML = `
          <td rowspan="${totalRows}" style="vertical-align:top;padding-top:10px">
            <div style="display:flex;align-items:flex-start;gap:4px">${colorDot}<strong>${team.name}</strong></div>
          </td>
          <td rowspan="${totalRows}" style="vertical-align:top;padding-top:10px">${trainers}</td>
          <td>${year}</td>
          <td style="text-align:center">${m || '–'}</td>
          <td style="text-align:center">${w || '–'}</td>
          <td style="text-align:center">${m + w}</td>
        `;
      } else {
        tr.innerHTML = `
          <td>${year}</td>
          <td style="text-align:center">${m || '–'}</td>
          <td style="text-align:center">${w || '–'}</td>
          <td style="text-align:center">${m + w}</td>
        `;
      }
      tbody.appendChild(tr);
    });

    // Summenzeile pro Team
    const sumTr = document.createElement('tr');
    sumTr.style.background = 'var(--bg-secondary)';
    sumTr.innerHTML = `
      <td style="font-weight:600;color:var(--text-muted);font-size:12px">Gesamt</td>
      <td style="text-align:center;font-weight:600">${team.total_m || '–'}</td>
      <td style="text-align:center;font-weight:600">${team.total_w || '–'}</td>
      <td style="text-align:center;font-weight:700">${team.total}</td>
    `;
    tbody.appendChild(sumTr);
  }

  // Gesamtsumme aller Teams
  tfoot.innerHTML = `
    <tr style="background:var(--primary-light,#e8f0fe);font-weight:700">
      <td colspan="3" style="text-align:right;padding-right:12px">Alle Mannschaften:</td>
      <td style="text-align:center">${grandTotal_m}</td>
      <td style="text-align:center">${grandTotal_w}</td>
      <td style="text-align:center">${grandTotal_m + grandTotal_w}</td>
    </tr>
  `;
}

window.printSquadOverview = () => {
  const content = document.getElementById('squad-overview-wrap').outerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="de"><head>
    <meta charset="UTF-8">
    <title>Kader-Übersicht</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; }
      th { background: #f0f0f0; font-weight: 600; }
      tfoot tr td { background: #dde6fb; font-weight: 700; }
      tr[style*="background"] td { background: #f8f8f8; }
    </style>
  </head><body>
    <h2 style="margin-bottom:12px">Kader-Übersicht</h2>
    ${content}
  </body></html>`);
  win.document.close();
  win.print();
};

document.addEventListener('DOMContentLoaded', adminInit);
