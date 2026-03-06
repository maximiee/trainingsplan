let currentUser = null;
let allTeams    = [];
let allPitches  = [];
let allSeasons  = [];

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

  // Teams-Checkboxen
  const box = document.getElementById('profile-teams');
  box.innerHTML = allTeams.map(t => `
    <label class="checkbox-item">
      <input type="checkbox" name="teamId" value="${t.id}" ${currentUser.teams?.some(ut => ut.id === t.id) ? 'checked' : ''}>
      <span class="color-dot" style="background:${t.color}"></span>${t.name}
    </label>`).join('');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    const teamIds = [...form.querySelectorAll('[name=teamId]:checked')].map(el => parseInt(el.value));
    try {
      await api.put('/api/users/me', {
        name:  form.querySelector('[name=name]').value,
        email: form.querySelector('[name=email]').value
      });
      await api.put('/api/users/me/teams', { teamIds });
      currentUser.teams = allTeams.filter(t => teamIds.includes(t.id));
      msg.style.color   = 'var(--success)';
      msg.textContent   = '✓ Profil gespeichert';
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

  const recs  = await api.get(`/api/sessions/recurrences?season_id=${activeSeason.id}`);
  const tbody = document.getElementById('sessions-tbody');
  tbody.innerHTML = '';

  // Alle Einheiten zeigen, eigene Teams hervorheben
  const myTeamIds = (currentUser.teams || []).map(t => t.id);

  for (const r of recs) {
    const teams    = r.teams?.map(t => `<span class="color-dot" style="background:${t.color};margin-right:2px"></span>${t.name}`).join(', ') || '–';
    const isMyTeam = r.teams?.some(t => myTeamIds.includes(t.id));
    const tr       = document.createElement('tr');
    tr.style.opacity = isMyTeam ? '1' : '0.45';
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

document.addEventListener('DOMContentLoaded', init);
