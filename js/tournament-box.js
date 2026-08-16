import { store } from './state.js';
import { soundFX } from './audio.js';
import { viewerView } from './viewer-view.js';

const DEFAULT_CHAMPIONSHIP_TEAMS = [
  { id: 't_empire', name: 'Empire Imports', color: '#ff1744' },
  { id: 't_autoexotic', name: 'Auto Exotic', color: '#0055ff' },
  { id: 't_soochi', name: 'Soochi', color: '#ba68c8' },
  { id: 't_amore', name: 'Amore', color: '#ad1457' },
  { id: 't_luxary', name: 'Luxary Autos', color: '#9e9d24' },
  { id: 't_beenys', name: 'Beenys', color: '#8e24aa' }
];

class TournamentBoxView {
  constructor() {
    this.activeBoxTeams = [];
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.isDrawing = false;
    this.boxState = 'idle'; // 'idle' | 'shaking' | 'open'
    this.emergingTeam = null;

    this.neonPalette = [
      '#ff1744', // Crimson
      '#0055ff', // Royal Blue
      '#ba68c8', // Lavender
      '#ad1457', // Deep Rose
      '#9e9d24', // Olive Gold
      '#8e24aa', // Purple
      '#00e5ff', // Neon Cyan
      '#ffd700', // Gold
      '#00e676', // Green
      '#ff6d00'  // Orange
    ];
  }

  init() {
    window.tournamentBox = this;
    this.syncTeamsFromStore(true);
    store.subscribe((state, meta) => {
      if (!this.isDrawing) {
        this.syncTeamsFromStore(false);
      }
      this.renderTournamentView();
    });
  }

  getAllAvailableTeams() {
    const { teams } = store.getState();
    if (teams && teams.length >= 1) {
      return teams;
    }
    return DEFAULT_CHAMPIONSHIP_TEAMS;
  }

  syncTeamsFromStore(forceReset = false) {
    const { tournamentMatchups = [] } = store.getState();
    const allTeams = this.getAllAvailableTeams();

    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    const unMatchedTeams = allTeams.filter((t) => !confirmedTeamIds.has(t.id));

    if (forceReset || this.activeBoxTeams.length === 0) {
      this.activeBoxTeams = unMatchedTeams.map((t, idx) => ({
        id: t.id,
        name: t.name,
        color: t.color || this.neonPalette[idx % this.neonPalette.length],
        logoUrl: t.logoUrl || null,
        avatar: t.avatar || null
      }));
    } else {
      const validIds = new Set(unMatchedTeams.map((t) => t.id));
      this.activeBoxTeams = this.activeBoxTeams.filter((t) => validIds.has(t.id));
      unMatchedTeams.forEach((t, idx) => {
        if (!this.activeBoxTeams.some((bt) => bt.id === t.id) && !this.isTeamCurrentlyInSlots(t.id)) {
          this.activeBoxTeams.push({
            id: t.id,
            name: t.name,
            color: t.color || this.neonPalette[idx % this.neonPalette.length],
            logoUrl: t.logoUrl || null,
            avatar: t.avatar || null
          });
        }
      });
    }
  }

  isTeamCurrentlyInSlots(teamId) {
    if (this.pendingTeam1 && this.pendingTeam1.id === teamId) return true;
    if (this.pendingTeam2 && this.pendingTeam2.id === teamId) return true;
    return false;
  }

  // --- MYSTERY BOX SHAKE & DRAW ACTION (ADMIN ONLY) ---
  triggerBoxDraw() {
    const { currentUser } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);

    if (!isAdmin) {
      if (window.app) window.app.showToast('Box opening is controlled by the Race Control Admin.', 'info');
      return;
    }

    if (this.isDrawing) return;

    if (this.activeBoxTeams.length === 0) {
      if (window.app) window.app.showToast('All teams have been drawn from the box! Click Refill Box below.', 'info');
      return;
    }

    this.isDrawing = true;
    this.boxState = 'shaking';
    this.emergingTeam = null;
    this.renderTournamentView();

    // Sound: rumble / tension
    soundFX.play('bid');
    const shakeInterval = setInterval(() => {
      soundFX.play('bid');
    }, 280);

    // Shake duration: 1.1s
    setTimeout(() => {
      clearInterval(shakeInterval);

      // Pick random team from box
      const randomIndex = Math.floor(Math.random() * this.activeBoxTeams.length);
      const drawnTeam = this.activeBoxTeams[randomIndex];
      this.emergingTeam = drawnTeam;
      this.boxState = 'open';

      // Fanfare & Confetti
      soundFX.play('hammer');
      viewerView.triggerConfetti();
      this.renderTournamentView();

      // Slot into Crew 1 or Crew 2 after reveal animation
      setTimeout(() => {
        if (!this.pendingTeam1) {
          // Slot into Place 1
          this.pendingTeam1 = drawnTeam;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
          if (window.app) window.app.showToast(`📦 Crew 1 Drawn: ${drawnTeam.name}! Click box again to draw Crew 2!`, 'success');
        } else if (!this.pendingTeam2 && drawnTeam.id !== this.pendingTeam1.id) {
          // Slot into Place 2 & Lock Matchup
          this.pendingTeam2 = drawnTeam;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
          if (window.app) window.app.showToast(`📦 Crew 2 Drawn: ${drawnTeam.name}! Matchup formed!`, 'sold');

          // Auto-save & broadcast matchup
          setTimeout(() => {
            this.confirmMatchup();
          }, 800);
        } else {
          this.pendingTeam1 = drawnTeam;
          this.pendingTeam2 = null;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
        }

        this.boxState = 'idle';
        this.emergingTeam = null;
        this.isDrawing = false;
        this.renderTournamentView();
      }, 1000);

    }, 1100);
  }

  confirmMatchup() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (!this.pendingTeam1 || !this.pendingTeam2) return;

    const team1Id = this.pendingTeam1.id;
    const team2Id = this.pendingTeam2.id;

    const res = store.addTournamentMatchup(team1Id, team2Id);
    if (res.success) {
      if (window.app) window.app.showToast(`⚡ Match #${res.matchup.matchNumber}: ${this.pendingTeam1.name} VS ${this.pendingTeam2.name} locked & broadcasted!`, 'success');
      this.pendingTeam1 = null;
      this.pendingTeam2 = null;
      this.renderTournamentView();
    }
  }

  clearSlots() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.syncTeamsFromStore(false);
    this.renderTournamentView();
  }

  // --- ADMIN BOX TEAM MANAGEMENT ---
  submitAddTeam() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;

    const nameInput = document.getElementById('box-team-input-name');
    const colorInput = document.getElementById('box-team-input-color');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) {
      if (window.app) window.app.showToast('Please type a team name.', 'warning');
      return;
    }

    const color = colorInput ? colorInput.value : this.neonPalette[this.activeBoxTeams.length % this.neonPalette.length];
    this.addTeamToBox(name, color);
    nameInput.value = '';
    nameInput.focus();
  }

  addTeamToBox(name, customColor) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;

    const cleanName = name.trim();
    if (this.activeBoxTeams.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      if (window.app) window.app.showToast(`Team "${cleanName}" is already inside the box!`, 'warning');
      return;
    }

    const newTeamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 3);
    const newTeamObj = {
      id: newTeamId,
      name: cleanName,
      color: customColor || '#00e5ff',
      logoUrl: null,
      avatar: null
    };

    this.activeBoxTeams.push(newTeamObj);

    const state = store.getState();
    if (!state.teams.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      store.addTeam({
        name: cleanName,
        color: customColor || '#00e5ff',
        budget: 200000
      });
    }

    if (window.app) window.app.showToast(`Added "${cleanName}" to Mystery Box & Tournament!`, 'success');
    this.renderTournamentView();
  }

  removeTeamFromBox(teamId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (this.isDrawing) return;

    const target = this.activeBoxTeams.find((t) => t.id === teamId);
    this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== teamId);
    if (target && window.app) window.app.showToast(`Removed "${target.name}" from box`, 'info');
    this.renderTournamentView();
  }

  deleteTeamPermanently(teamId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (this.isDrawing) return;

    const allTeams = this.getAllAvailableTeams();
    const target = allTeams.find((t) => t.id === teamId);
    const targetName = target ? target.name : 'Team';

    if (!confirm(`Permanently delete "${targetName}" from the tournament and box?`)) return;

    this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== teamId);
    store.removeTeam(teamId);
    if (window.app) window.app.showToast(`Deleted "${targetName}"`, 'info');
    this.renderTournamentView();
  }

  toggleTeamInBox(teamId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (this.isDrawing) return;

    const exists = this.activeBoxTeams.some((t) => t.id === teamId);
    if (exists) {
      this.removeTeamFromBox(teamId);
    } else {
      const allTeams = this.getAllAvailableTeams();
      const target = allTeams.find((t) => t.id === teamId);
      if (target) {
        this.activeBoxTeams.push({
          id: target.id,
          name: target.name,
          color: target.color || '#00e5ff',
          logoUrl: target.logoUrl || null,
          avatar: target.avatar || null
        });
        if (window.app) window.app.showToast(`Added "${target.name}" to box`, 'success');
      }
    }
    this.renderTournamentView();
  }

  resetBoxPool() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (this.isDrawing) return;

    this.syncTeamsFromStore(true);
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.renderTournamentView();
    if (window.app) window.app.showToast('Mystery Box refilled with all un-matched teams!', 'info');
  }

  deleteMatchup(matchupId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;

    store.removeTournamentMatchup(matchupId);
    if (window.app) window.app.showToast('Matchup removed', 'info');
    this.syncTeamsFromStore(false);
    this.renderTournamentView();
  }

  toggleWinner(matchupId, teamId) {
    const { currentUser } = store.getState();
    if (!currentUser || !currentUser.isAuthenticated) return;
    store.setTournamentMatchupWinner(matchupId, teamId);
    this.renderTournamentView();
  }

  clearAllMatchups() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;

    if (confirm('Clear all tournament face-off fixtures?')) {
      store.clearTournamentMatchups();
      if (window.app) window.app.showToast('All matchups cleared', 'info');
      this.syncTeamsFromStore(true);
      this.renderTournamentView();
    }
  }

  renderTournamentView(containerId = 'tournament-view') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { currentUser, tournamentMatchups = [] } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    const allTeams = this.getAllAvailableTeams();

    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    container.innerHTML = `
      <!-- Tournament Header -->
      <div class="section-header" style="margin-bottom: 1.25rem;">
        <div class="section-title-wrap">
          <span class="section-tag" style="color:var(--accent-cyan);">FACE-OFF</span>
          <h2 class="section-title">RACE MATCH-UP DRAW</h2>
        </div>
      </div>

      <!-- Main Tournament Grid -->
      <div class="tournament-box-layout">
        
        <!-- LEFT COLUMN: The Mystery Box Stage -->
        <div class="glass-card mystery-box-chamber">
          <div class="box-chamber-header">
            <div>
              <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">RACE VAULT</span>
              <h3 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; text-transform:uppercase;">
                ${isAdmin ? 'Mystery Team Box' : 'Live Race Vault'}
              </h3>
            </div>
            <div class="box-team-counter-badge">
              <span>📦</span> ${this.activeBoxTeams.length} Teams In Vault
            </div>
          </div>

          <!-- The 3D Interactive Mystery Vault Box -->
          <div class="vault-stage-wrapper">
            <div class="mystery-vault-box ${this.boxState === 'shaking' ? 'is-shaking' : ''} ${this.boxState === 'open' ? 'is-open' : ''} ${this.isDrawing ? 'is-busy' : ''}" 
                 style="${!isAdmin ? 'cursor:default;' : ''}"
                 onclick="window.tournamentBox.triggerBoxDraw()" 
                 title="${isAdmin ? 'Click to Open the Box!' : 'Live Race Vault (Controlled by Race Admin)'}">
              
              <!-- Lid -->
              <div class="vault-lid"></div>

              <!-- Base Chamber -->
              <div class="vault-base">
                <div class="vault-core-emblem">🏎️</div>
                <div class="vault-core-label">${isAdmin ? 'CLICK TO OPEN' : 'APEX VAULT'}</div>
              </div>

              <!-- Emerging Holographic Team Card when Opening -->
              ${this.emergingTeam ? `
                <div class="vault-emerging-card is-revealed" style="border-color:${this.emergingTeam.color};">
                  <span style="font-size:0.65rem; color:var(--accent-gold); font-weight:800; text-transform:uppercase;">DRAWN FROM VAULT</span>
                  <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:900; color:${this.emergingTeam.color}; margin-top:0.25rem;">
                    ${this.emergingTeam.name}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Floor Glow Shadow -->
            <div class="vault-shadow"></div>
          </div>

          <!-- Box Action Trigger / Spectator Status Indicator -->
          <div style="width:100%; display:flex; flex-direction:column; gap:0.6rem;">
            ${isAdmin ? `
              <button class="btn btn-cyan btn-lg open-box-cta-btn" onclick="window.tournamentBox.triggerBoxDraw()" ${this.activeBoxTeams.length < 1 || this.isDrawing ? 'disabled' : ''}>
                ${this.isDrawing ? (this.boxState === 'shaking' ? '⚡ SHAKING BOX...' : '✨ OPENING VAULT...') : (this.activeBoxTeams.length === 0 ? '🏁 BOX EMPTY' : '📦 CLICK BOX TO DRAW TEAM')}
              </button>

              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <span style="font-size:0.78rem; color:var(--text-muted);">
                  ${!this.pendingTeam1 ? '👉 Open box to draw Crew 1' : (!this.pendingTeam2 ? '👉 Open box again to draw Crew 2' : '✅ Matchup formed!')}
                </span>
                <button class="btn btn-outline btn-sm" onclick="window.tournamentBox.resetBoxPool()" title="Refill box with all un-matched teams" ${this.isDrawing ? 'disabled' : ''}>
                  🔄 Refill Box
                </button>
              </div>
            ` : `
              <div class="spectator-vault-indicator">
                <span class="spectator-pulse-dot"></span>
                <span>${this.isDrawing ? '⚡ VAULT OPENING IN PROGRESS...' : 'LIVE TOURNAMENT ARENA • RACE CONTROL'}</span>
              </div>
            `}
          </div>

          <!-- ADMIN ONLY: BOX TEAM MANAGER (ADD / DELETE TEAMS FROM THE BOX) -->
          ${isAdmin ? `
            <div class="box-teams-manager-card">
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:0.5rem;">
                <span style="font-family:var(--font-display); font-size:0.95rem; font-weight:800; color:#fff; text-transform:uppercase; letter-spacing:0.5px;">
                  📦 Teams in Box (${this.activeBoxTeams.length}/${allTeams.length})
                </span>
              </div>

              <!-- Add Team Form -->
              <div style="display:flex; flex-direction:column; gap:0.35rem;">
                <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:700;">➕ ADD TEAM TO BOX:</span>
                <div class="box-quick-add-row">
                  <input type="color" id="box-team-input-color" value="#00e5ff" style="width:38px; height:36px; padding:2px; background:transparent; border:1px solid var(--border-subtle); border-radius:var(--radius-sm); cursor:pointer;" title="Choose Team Color">
                  <input type="text" id="box-team-input-name" class="box-quick-input" placeholder="Type team name & hit Enter..." onkeydown="if(event.key==='Enter') window.tournamentBox.submitAddTeam()">
                  <button class="btn btn-cyan btn-sm" style="white-space:nowrap; padding:0.45rem 0.95rem; font-weight:800;" onclick="window.tournamentBox.submitAddTeam()">
                    + Add to Box
                  </button>
                </div>
              </div>

              <!-- Roster List of Teams with Direct Toggle & Delete -->
              <div style="display:flex; flex-direction:column; gap:0.45rem; max-height:220px; overflow-y:auto; padding-right:0.3rem; margin-top:0.3rem;">
                ${allTeams.map((t) => {
                  const isInBox = this.activeBoxTeams.some((bt) => bt.id === t.id);
                  const isPaired = confirmedTeamIds.has(t.id);
                  return `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem; background:rgba(16,22,35,0.9); border:1px solid ${isInBox ? 'rgba(0, 229, 255, 0.4)' : 'var(--border-subtle)'}; border-left:4px solid ${t.color || '#00e5ff'}; border-radius:var(--radius-sm); padding:0.45rem 0.75rem;">
                      
                      <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; flex:1; margin:0; user-select:none;">
                        <input type="checkbox" ${isInBox ? 'checked' : ''} ${isPaired ? 'disabled' : ''} onchange="window.tournamentBox.toggleTeamInBox('${t.id}')" style="width:16px; height:16px; accent-color:var(--accent-cyan); cursor:pointer;">
                        <span style="font-family:var(--font-display); font-size:0.92rem; font-weight:800; color:${isInBox ? '#ffffff' : 'var(--text-muted)'};">
                          ${t.name}
                        </span>
                      </label>

                      <div style="display:flex; align-items:center; gap:0.5rem;">
                        ${isPaired ? `
                          <span style="font-size:0.68rem; color:var(--accent-gold); background:rgba(255,184,0,0.15); padding:0.15rem 0.45rem; border-radius:var(--radius-pill); font-weight:800;">
                            PAIRED
                          </span>
                        ` : (isInBox ? `
                          <span style="font-size:0.68rem; color:var(--accent-cyan); background:rgba(0,229,255,0.12); padding:0.15rem 0.45rem; border-radius:var(--radius-pill); font-weight:800;">
                            IN BOX
                          </span>
                        ` : `
                          <span style="font-size:0.68rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:0.15rem 0.45rem; border-radius:var(--radius-pill); font-weight:700;">
                            EXCLUDED
                          </span>
                        `)}

                        <button class="btn-icon" style="color:var(--text-muted); width:26px; height:26px; font-size:0.78rem;" onclick="window.tournamentBox.deleteTeamPermanently('${t.id}')" title="Delete ${t.name}">
                          🗑️
                        </button>
                      </div>

                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

        </div>

        <!-- RIGHT COLUMN: Matchup Slots & Championship Fixtures -->
        <div class="tournament-bracket-column">
          
          <!-- CURRENT 2-TEAM SLOTS (PLACE 1 VS PLACE 2) -->
          <div class="glass-card current-matchup-card">
            <div class="section-title-wrap" style="margin-bottom:0.75rem;">
              <span class="section-tag" style="font-size:0.7rem; color:var(--accent-cyan);">ACTIVE DRAW</span>
              <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                Head-to-Head Draw Slots
              </h3>
            </div>

            <!-- Face-Off Visual Slots -->
            <div class="face-off-versus-slots">
              <!-- Slot 1: Team 1 (First Box Opening) -->
              <div class="face-off-slot ${this.pendingTeam1 ? 'filled' : 'empty'}" style="${this.pendingTeam1 ? `border-color:${this.pendingTeam1.color};` : ''}">
                ${this.pendingTeam1 ? `
                  <span class="slot-badge-label">CREW 1</span>
                  <div class="slot-team-content">
                    <div class="slot-team-avatar" style="border-color:${this.pendingTeam1.color};">
                      ${this.pendingTeam1.logoUrl ? `<img src="${this.pendingTeam1.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : (this.pendingTeam1.avatar ? `<img src="${this.pendingTeam1.avatar}" style="width:100%; height:100%; object-fit:cover;">` : '🏎️')}
                    </div>
                    <div class="slot-team-name" style="color:${this.pendingTeam1.color};">${this.pendingTeam1.name}</div>
                  </div>
                ` : `
                  <div class="face-off-slot-title">CREW 1</div>
                `}
              </div>

              <!-- VS Badge -->
              <div class="face-off-vs-pill">VS</div>

              <!-- Slot 2: Team 2 (Second Box Opening) -->
              <div class="face-off-slot ${this.pendingTeam2 ? 'filled' : 'empty'}" style="${this.pendingTeam2 ? `border-color:${this.pendingTeam2.color};` : ''}">
                ${this.pendingTeam2 ? `
                  <span class="slot-badge-label">CREW 2</span>
                  <div class="slot-team-content">
                    <div class="slot-team-avatar" style="border-color:${this.pendingTeam2.color};">
                      ${this.pendingTeam2.logoUrl ? `<img src="${this.pendingTeam2.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : (this.pendingTeam2.avatar ? `<img src="${this.pendingTeam2.avatar}" style="width:100%; height:100%; object-fit:cover;">` : '⚡')}
                    </div>
                    <div class="slot-team-name" style="color:${this.pendingTeam2.color};">${this.pendingTeam2.name}</div>
                  </div>
                ` : `
                  <div class="face-off-slot-title">CREW 2</div>
                `}
              </div>
            </div>

            <!-- Action Buttons (Admin Only) -->
            ${isAdmin ? `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:0.5rem; flex-wrap:wrap;">
                <div style="font-size:0.78rem; color:var(--text-muted);">
                  ${!this.pendingTeam1 ? 'Click box on left to draw first crew' : (!this.pendingTeam2 ? 'Click box again to draw opposing crew' : '✅ Matchup locked & broadcasted!')}
                </div>
                <div style="display:flex; gap:0.5rem;">
                  ${this.pendingTeam1 || this.pendingTeam2 ? `
                    <button class="btn btn-outline btn-sm" onclick="window.tournamentBox.clearSlots()">
                      Clear Selection
                    </button>
                  ` : ''}
                  ${this.pendingTeam1 && this.pendingTeam2 ? `
                    <button class="btn btn-cyan btn-sm" onclick="window.tournamentBox.confirmMatchup()">
                      ⚡ Lock Matchup
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- SAVED OFFICIAL TOURNAMENT FIXTURES (LIVE VIEW FOR EVERYONE) -->
          <div class="glass-card matchups-board-card">
            <div class="section-header" style="margin-bottom:0.75rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">OFFICIAL FIXTURES</span>
                <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                  Championship Matchups (${tournamentMatchups.length})
                </h3>
              </div>
              ${isAdmin && tournamentMatchups.length > 0 ? `
                <button class="btn btn-danger btn-sm" style="font-size:0.7rem; padding:0.3rem 0.6rem;" onclick="window.tournamentBox.clearAllMatchups()">
                  🗑️ Clear All
                </button>
              ` : ''}
            </div>

            ${tournamentMatchups.length === 0 ? `
              <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                <div style="font-size:1.8rem; margin-bottom:0.3rem;">🏁</div>
                No face-off matchups created yet.<br>
                ${isAdmin ? 'Open the box on the left to draw teams and create 2-team race fixtures.' : 'Waiting for Race Control Admin to draw match fixtures.'}
              </div>
            ` : `
              <div class="matchups-fixtures-list">
                ${tournamentMatchups.map((m) => `
                  <div class="matchup-fixture-row ${m.winnerId ? 'has-winner' : ''}">
                    <div class="fixture-number-badge">
                      MATCH #${m.matchNumber}
                    </div>

                    <div class="fixture-teams-versus">
                      <!-- Team 1 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team1.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team1.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team1.color}; ${isAdmin ? 'cursor:pointer;' : 'cursor:default;'}" 
                           onclick="${isAdmin ? `window.tournamentBox.toggleWinner('${m.id}', '${m.team1.id}')` : ''}" 
                           title="${isAdmin ? 'Click to mark as winner' : ''}">
                        <span class="fixture-team-name">${m.team1.name}</span>
                        ${m.winnerId === m.team1.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>

                      <span class="fixture-vs-text">VS</span>

                      <!-- Team 2 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team2.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team2.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team2.color}; ${isAdmin ? 'cursor:pointer;' : 'cursor:default;'}" 
                           onclick="${isAdmin ? `window.tournamentBox.toggleWinner('${m.id}', '${m.team2.id}')` : ''}" 
                           title="${isAdmin ? 'Click to mark as winner' : ''}">
                        <span class="fixture-team-name">${m.team2.name}</span>
                        ${m.winnerId === m.team2.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>
                    </div>

                    ${isAdmin ? `
                      <button class="btn-icon fixture-delete-btn" onclick="window.tournamentBox.deleteMatchup('${m.id}')" title="Remove Matchup">
                        ✕
                      </button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>
      </div>
    `;
  }
}

export const tournamentBox = new TournamentBoxView();
