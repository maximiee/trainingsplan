// Admin-Bereich: Benutzerverwaltung, Teams, Plätze, Saisons, Trainingseinheiten, Spieltermine
let adminUser = null;
let allTeams = [];
let allPitches = [];
let allLocations = [];
let allSeasons = [];
let adminSquadState = []; // [{year, gender, count}] für das aktuell bearbeitete Team

async function adminInit() {
  adminUser = await loadCurrentUser();
  if (adminUser.role !== 'admin') {
    document.body.innerHTML = '<div class="page"><div class="alert alert-error">Kein Zugriff – nur für Admins</div></div>';
    return;
  }

  updateNavUser(adminUser);
  setupLogout();
  setupHamburger();
  setupTabsScroll();

  // Import-Tab nur für Superuser sichtbar
  if (adminUser.email !== 'marco.paetz@gmx.net') {
    document.querySelector('.admin-tab[data-tab="import"]')?.remove();
    document.querySelector('.tab-content[data-tab="import"]')?.remove();
  }

  setupTabs();

  [allTeams, allPitches, allLocations, allSeasons] = await Promise.all([
    api.get('/api/teams/all'),
    api.get('/api/pitches'),
    api.get('/api/locations'),
    api.get('/api/seasons')
  ]);

  // Hash-basierte Navigation
  const hash = window.location.hash.replace('#', '') || 'users';
  activateTab(hash.split('-')[0]);

  await Promise.all([
    loadUsers(),
    renderTeams(),
    renderLocations(),
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
        ${t.fussball_de_id ? `<button class="btn btn-sm btn-primary" onclick="openFdGamesModal(${t.id}, '${t.fussball_de_id}')">Spiele abrufen</button>` : ''}
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

async function openTeamModal(team) {
  const modal = document.getElementById('team-modal');
  const form = document.getElementById('team-form');
  const squadSection = document.getElementById('squad-section');
  document.getElementById('team-modal-title').textContent = team ? 'Team bearbeiten' : 'Neues Team';
  form.reset();
  form.dataset.teamId = team ? team.id : '';
  adminSquadState = [];
  if (team) {
    form.querySelector('[name=name]').value = team.name;
    form.querySelector('[name=age_group]').value = team.age_group || '';
    form.querySelector('[name=color]').value = team.color;
    form.querySelector('[name=fussball_de_id]').value = team.fussball_de_id || '';
    const isJugend = team.name.toLowerCase().includes('jugend');
    if (isJugend) {
      const entries = await api.get(`/api/teams/${team.id}/squad`);
      adminSquadState = entries.map(e => ({ ...e }));
      squadSection.classList.remove('hidden');
    } else {
      squadSection.classList.add('hidden');
    }
  } else {
    squadSection.classList.add('hidden');
  }
  renderAdminSquadRows();
  modal.classList.remove('hidden');
}

function renderAdminSquadRows() {
  const tbody = document.getElementById('admin-squad-tbody');
  if (!tbody) return;
  if (adminSquadState.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px">Noch keine Jahrgänge eingetragen.</td></tr>';
  } else {
    tbody.innerHTML = adminSquadState.map((r, i) => `
      <tr>
        <td><input type="number" class="form-control" style="width:75px" value="${r.count}" min="0" max="999"
          oninput="adminSquadState[${i}].count=parseInt(this.value)||0;updateAdminSquadTotal()"></td>
        <td><select class="form-control" onchange="adminSquadState[${i}].gender=this.value">
          <option value="m" ${r.gender==='m'?'selected':''}>Jungen</option>
          <option value="w" ${r.gender==='w'?'selected':''}>Mädchen</option>
        </select></td>
        <td><input type="number" class="form-control" style="width:85px" value="${r.year}" min="1990" max="2030"
          oninput="adminSquadState[${i}].year=parseInt(this.value)||0"></td>
        <td><select class="form-control" onchange="adminSquadState[${i}].verein=this.value">
          <option value="TSV" ${(r.verein||'TSV')==='TSV'?'selected':''}>TSV</option>
          <option value="MTV" ${r.verein==='MTV'?'selected':''}>MTV</option>
          <option value="TSG" ${r.verein==='TSG'?'selected':''}>TSG</option>
        </select></td>
        <td><button type="button" class="btn btn-sm btn-danger" onclick="removeAdminSquadRow(${i})">✕</button></td>
      </tr>`).join('');
  }
  updateAdminSquadTotal();
}

function updateAdminSquadTotal() {
  const total = adminSquadState.reduce((s, r) => s + (parseInt(r.count) || 0), 0);
  const el = document.getElementById('admin-squad-total');
  if (el) el.textContent = total > 0 ? `Mannschaftsstärke: ${total} Spieler` : '';
}

window.addAdminSquadRow = () => {
  adminSquadState.push({ year: new Date().getFullYear() - 10, gender: 'm', count: 0, verein: 'TSV' });
  renderAdminSquadRows();
};

window.removeAdminSquadRow = (index) => {
  adminSquadState.splice(index, 1);
  renderAdminSquadRows();
};

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
    if (id) {
      await api.put(`/api/teams/${id}`, data);
      if (!document.getElementById('squad-section').classList.contains('hidden')) {
        await api.put(`/api/teams/${id}/squad`, adminSquadState);
      }
    } else {
      await api.post('/api/teams', data);
    }
    document.getElementById('team-modal').classList.add('hidden');
    await renderTeams();
    await renderSquadOverview();
  } catch (err) {
    showAlert(form, err.message);
  }
});

window.deactivateTeam = async (id) => { await api.post(`/api/teams/${id}/deactivate`); await renderTeams(); };
window.activateTeam = async (id) => { await api.post(`/api/teams/${id}/activate`); await renderTeams(); };

// --- Standorte ---
async function renderLocations() {
  allLocations = await api.get('/api/locations');
  const tbody = document.getElementById('locations-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const loc of allLocations) {
    const pitchCount = allPitches.filter(p => p.location_id === loc.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${loc.name}</strong></td>
      <td style="color:var(--text-muted)">${pitchCount} Platz${pitchCount !== 1 ? 'ä' : ''}tze</td>
      <td><button class="btn btn-sm btn-secondary" onclick="openEditLocation(${loc.id})">Bearbeiten</button></td>
    `;
    tbody.appendChild(tr);
  }
}

window.openNewLocation = () => openLocationModal(null);
window.openEditLocation = (id) => openLocationModal(allLocations.find(l => l.id === id));

function openLocationModal(location) {
  const modal = document.getElementById('location-modal');
  const form = document.getElementById('location-form');
  document.getElementById('location-modal-title').textContent = location ? 'Standort bearbeiten' : 'Neuer Standort';
  form.reset();
  form.dataset.locationId = location ? location.id : '';
  if (location) form.querySelector('[name=name]').value = location.name;
  modal.classList.remove('hidden');
}

document.getElementById('location-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.locationId;
  const data = { name: form.querySelector('[name=name]').value };
  try {
    if (id) await api.put(`/api/locations/${id}`, data);
    else await api.post('/api/locations', data);
    document.getElementById('location-modal').classList.add('hidden');
    allLocations = await api.get('/api/locations');
    await renderLocations();
  } catch (err) {
    showAlert(form, err.message);
  }
});

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
      <td style="color:var(--text-muted)">${p.location_name || '–'}</td>
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
  // Standort-Dropdown befüllen
  const locSel = document.getElementById('pitch-location-select');
  locSel.innerHTML = '<option value="">– kein Standort –</option>' +
    allLocations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  if (pitch) {
    form.querySelector('[name=name]').value = pitch.name;
    form.querySelector('[name=surface]').value = pitch.surface;
    if (pitch.location_id) locSel.value = pitch.location_id;
  }
  modal.classList.remove('hidden');
}

document.getElementById('pitch-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.pitchId;
  const locVal = document.getElementById('pitch-location-select').value;
  const data = {
    name: form.querySelector('[name=name]').value,
    surface: form.querySelector('[name=surface]').value,
    location_id: locVal ? parseInt(locVal) : null
  };
  try {
    if (id) await api.put(`/api/pitches/${id}`, data);
    else await api.post('/api/pitches', data);
    document.getElementById('pitch-modal').classList.add('hidden');
    allPitches = await api.get('/api/pitches');
    await renderLocations();
    await renderPitches();
  } catch (err) {
    showAlert(form, err.message);
  }
});

// --- Saisons ---
let showArchivedSeasons = false;

async function renderSeasons() {
  allSeasons = await api.get('/api/seasons');
  const container = document.getElementById('seasons-list');
  if (!container) return;
  container.innerHTML = '';

  const hasArchived = allSeasons.some(s => s.is_archived === 1);
  if (hasArchived) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-sm btn-secondary';
    toggleBtn.style.marginBottom = '12px';
    toggleBtn.textContent = showArchivedSeasons ? 'Archiv ausblenden' : 'Archiv anzeigen';
    toggleBtn.onclick = () => { showArchivedSeasons = !showArchivedSeasons; renderSeasons(); };
    container.appendChild(toggleBtn);
  }

  const visibleSeasons = showArchivedSeasons ? allSeasons : allSeasons.filter(s => !s.is_archived);

  for (const s of visibleSeasons) {
    const item = document.createElement('div');
    item.className = 'season-item';
    const isActive = s.is_active === 1;
    const isArchived = s.is_archived === 1;
    item.innerHTML = `
      <div style="flex:1">
        <div class="season-name">${s.name}
          ${isActive ? '<span class="badge badge-active">Aktiv</span>' : ''}
          ${isArchived ? '<span class="badge badge-archived">Archiviert</span>' : ''}
        </div>
        <div class="season-dates">${isoToDE(s.start_date)} – ${isoToDE(s.end_date)} · ${s.type}</div>
      </div>
      <div class="actions">
        ${!isActive && !isArchived ? `<button class="btn btn-sm btn-success" onclick="activateSeason(${s.id})">Aktivieren</button>` : ''}
        ${!isArchived ? `<button class="btn btn-sm btn-secondary" onclick="openEditSeason(${s.id})">Bearbeiten</button>` : ''}
        ${!isArchived ? `<button class="btn btn-sm btn-secondary" onclick="openCopyRecurrences(${s.id})">Vorlage importieren</button>` : ''}
        ${!isActive && !isArchived ? `<button class="btn btn-sm btn-secondary" onclick="archiveSeason(${s.id})">Archivieren</button>` : ''}
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
  if (!confirm('Diese Saison aktivieren?')) return;
  await api.post(`/api/seasons/${id}/activate`);
  allSeasons = await api.get('/api/seasons');
  await renderSeasons();
};

window.archiveSeason = async (id) => {
  const season = allSeasons.find(s => s.id === id);
  if (!confirm(`Saison „${season?.name}" archivieren? Sie kann danach nicht mehr bearbeitet werden.`)) return;
  await api.post(`/api/seasons/${id}/archive`);
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
    pitchSel.innerHTML += `<option value="${p.id}">${p.location_name ? p.location_name + ' – ' : ''}${p.name} (${p.surface})</option>`;
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

// --- Spiele & Turniere ---
window.setAdminMatchType = (type) => {
  document.getElementById('match-form').querySelector('[name=type]').value = type;
  document.getElementById('match-type-btn-spiel').className   = type === 'spiel'   ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('match-type-btn-turnier').className = type === 'turnier' ? 'btn btn-primary' : 'btn btn-secondary';
};

async function renderMatches() {
  const activeSeason = allSeasons.find(s => s.is_active);
  if (!activeSeason) return;

  const matches = await api.get(`/api/matches?season_id=${activeSeason.id}`);
  const tbody = document.getElementById('matches-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const m of matches) {
    const typeBadge = m.type === 'turnier'
      ? '<span class="badge badge-turnier">Turnier</span>'
      : '<span class="badge badge-spiel">Spiel</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${typeBadge}</td>
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
  if (pitchSel) pitchSel.innerHTML = allPitches.map(p => `<option value="${p.id}">${p.location_name ? p.location_name + ' – ' : ''}${p.name}</option>`).join('');

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
      location:  'heim',
      type:      form.querySelector('[name=type]').value
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
  document.getElementById('match-modal-title').textContent = 'Neuer Termin';
  form.querySelector('[name=date]').value = toISO(new Date());
  setAdminMatchType('spiel');
  modal.classList.remove('hidden');
};

window.openEditMatch = async (id) => {
  const matches = await api.get(`/api/matches?season_id=${allSeasons.find(s=>s.is_active)?.id}`);
  const m = matches.find(x => x.id === id);
  if (!m) return;

  const form = document.getElementById('match-form');
  form.dataset.matchId = id;
  document.getElementById('match-modal-title').textContent = 'Termin bearbeiten';
  setAdminMatchType(m.type || 'spiel');
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
        <td style="color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
        <td style="text-align:center;color:var(--text-muted)">–</td>
        <td></td>
      `;
      tbody.appendChild(tr);
      continue;
    }

    // Zeilen: eine pro (year, verein)-Kombination
    const rows = [];
    for (const s of team.squad) {
      const key = `${s.year}__${s.verein}`;
      let row = rows.find(r => r.key === key);
      if (!row) { row = { key, year: s.year, verein: s.verein, m: 0, w: 0 }; rows.push(row); }
      row[s.gender] += s.count;
    }
    rows.sort((a, b) => b.year - a.year || a.verein.localeCompare(b.verein));

    squadDetailsMap.set(team.id, { name: team.name, squad: team.squad });

    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      if (i === 0) {
        const totalRows = rows.length + 1; // +1 für Summenzeile
        tr.innerHTML = `
          <td rowspan="${totalRows}" style="vertical-align:top;padding-top:10px">
            <div style="display:flex;align-items:flex-start;gap:4px">${colorDot}<strong>${team.name}</strong></div>
          </td>
          <td rowspan="${totalRows}" style="vertical-align:top;padding-top:10px">${trainers}</td>
          <td>${row.year}</td>
          <td>${row.verein}</td>
          <td style="text-align:center">${row.m || '–'}</td>
          <td style="text-align:center">${row.w || '–'}</td>
          <td style="text-align:center">${row.m + row.w}</td>
          <td rowspan="${totalRows}" style="vertical-align:top;padding-top:8px">
            <button class="btn btn-sm btn-secondary"
              onclick="openSquadDetails(${team.id})">Details</button>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td>${row.year}</td>
          <td>${row.verein}</td>
          <td style="text-align:center">${row.m || '–'}</td>
          <td style="text-align:center">${row.w || '–'}</td>
          <td style="text-align:center">${row.m + row.w}</td>
        `;
      }
      tbody.appendChild(tr);
    });

    // Summenzeile pro Team
    const sumTr = document.createElement('tr');
    sumTr.style.background = 'var(--bg-secondary)';
    sumTr.innerHTML = `
      <td colspan="2" style="font-weight:600;color:var(--text-muted);font-size:12px">Gesamt</td>
      <td style="text-align:center;font-weight:600">${team.total_m || '–'}</td>
      <td style="text-align:center;font-weight:600">${team.total_w || '–'}</td>
      <td style="text-align:center;font-weight:700">${team.total}</td>
    `;
    tbody.appendChild(sumTr);
  }

  // Gesamtsumme aller Teams
  tfoot.innerHTML = `
    <tr style="background:var(--primary-light,#e8f0fe);font-weight:700">
      <td colspan="4" style="text-align:right;padding-right:12px">Alle Mannschaften:</td>
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

// ── Vereins-Details Modal ─────────────────────────────────────
const VEREIN_COLORS = { TSV: '#1a1a1a', MTV: '#cc0000', TSG: '#f0f0f0' };
const VEREIN_LABEL_COLORS = { TSV: '#fff', MTV: '#fff', TSG: '#333' };
const squadDetailsMap = new Map();

window.openSquadDetails = (teamId) => {
  const { name: teamName, squad } = squadDetailsMap.get(teamId);

  // Summen pro Verein
  const byVerein = {};
  for (const s of squad) {
    if (!byVerein[s.verein]) byVerein[s.verein] = 0;
    byVerein[s.verein] += s.count;
  }
  const total = Object.values(byVerein).reduce((a, b) => a + b, 0);
  const vereine = Object.keys(byVerein).sort();

  document.getElementById('squad-details-title').textContent = `${teamName} – Vereinszugehörigkeit`;

  // Text + Balken
  const textHtml = vereine.map(v => {
    const count = byVerein[v];
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const color = VEREIN_COLORS[v] || '#999';
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:14px">
          <span style="font-weight:600;color:${color}">${v}</span>
          <span>${count} Spieler &nbsp;<strong>${pct}%</strong></span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:10px;overflow:hidden">
          <div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:width .3s;${v==='TSG'?'box-shadow:inset 0 0 0 1px #ccc':''}"></div>
        </div>
      </div>`;
  }).join('');

  const body = document.getElementById('squad-details-body');
  body.innerHTML = `
    <div style="margin-bottom:20px">${textHtml}</div>
    <canvas id="squad-pie-canvas" width="220" height="220" style="display:block;margin:0 auto"></canvas>
  `;

  // Tortendiagramm
  const canvas = document.getElementById('squad-pie-canvas');
  const ctx = canvas.getContext('2d');
  const cx = 110, cy = 110, r = 90;
  let angle = -Math.PI / 2;

  for (const v of vereine) {
    const slice = total > 0 ? byVerein[v] / total * 2 * Math.PI : 0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = VEREIN_COLORS[v] || '#999';
    ctx.fill();
    ctx.strokeStyle = v === 'TSG' ? '#bbb' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Prozent-Label im Segment
    if (slice > 0.25) {
      const mid = angle + slice / 2;
      const lx = cx + Math.cos(mid) * r * 0.65;
      const ly = cy + Math.sin(mid) * r * 0.65;
      ctx.fillStyle = VEREIN_LABEL_COLORS[v] || '#333';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(byVerein[v] / total * 100)}%`, lx, ly);
    }
    angle += slice;
  }

  document.getElementById('squad-details-modal').classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', adminInit);
