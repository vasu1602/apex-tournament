import { store } from './state.js';
import { soundFX } from './audio.js';
import { viewerView } from './viewer-view.js';

const SAMPLE_WHEEL_TEAMS = [
  { id: 'sample_redline', name: 'Redline Racing', color: '#ff1744' },
  { id: 'sample_phantom', name: 'Phantom GT', color: '#00e5ff' },
  { id: 'sample_apex', name: 'Apex Velocity', color: '#ffd700' },
  { id: 'sample_vortex', name: 'Vortex Motorsports', color: '#00e676' },
  { id: 'sample_neon', name: 'Neon Syndicate', color: '#d500f9' },
  { id: 'sample_cyber', name: 'Cyber Drift', color: '#ff6d00' }
];

class TournamentWheelView {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.currentAngle = 0;
    this.isSpinning = false;
    this.animationFrameId = null;
    this.activeWheelTeams = [];
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.autoRemoveDrawn = true;
    this.lastLandedTeam = null;
    this.lastTickSegment = -1;

    this.sliceColors = [
      { bg: '#ff1744', text: '#ffffff' }, // Crimson
      { bg: '#00e5ff', text: '#060a12' }, // Cyan
      { bg: '#ffd700', text: '#060a12' }, // Gold
      { bg: '#00e676', text: '#060a12' }, // Green
      { bg: '#d500f9', text: '#ffffff' }, // Purple
      { bg: '#ff6d00', text: '#060a12' }, // Orange
      { bg: '#2979ff', text: '#ffffff' }, // Blue
      { bg: '#ff4081', text: '#ffffff' }, // Pink
      { bg: '#00b0ff', text: '#060a12' }, // Sky
      { bg: '#76ff03', text: '#060a12' }  // Lime
    ];
  }

  init() {
    window.tournamentWheel = this;
    this.syncTeamsFromStore(true);
    store.subscribe((state, meta) => {
      if (!this.isSpinning) {
        this.syncTeamsFromStore(false);
      }
      this.renderTournamentView();
    });
  }

  getAllAvailableTeams() {
    const { teams } = store.getState();
    if (teams && teams.length >= 2) {
      return teams;
    } else if (teams && teams.length === 1) {
      return [teams[0], ...SAMPLE_WHEEL_TEAMS.slice(1, 6)];
    }
    return SAMPLE_WHEEL_TEAMS;
  }

  syncTeamsFromStore(forceReset = false) {
    const { tournamentMatchups = [] } = store.getState();
    const allTeams = this.getAllAvailableTeams();

    // Collect all team IDs that are already finalized in a matchup
    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1 && m.team1.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2 && m.team2.id) confirmedTeamIds.add(m.team2.id);
    });

    // Filter out all teams that are already in confirmed matchups
    const unMatchedTeams = allTeams.filter((t) => !confirmedTeamIds.has(t.id));

    if (forceReset || this.activeWheelTeams.length === 0) {
      this.activeWheelTeams = unMatchedTeams.map((t, idx) => ({
        id: t.id,
        name: t.name,
        color: t.color || this.sliceColors[idx % this.sliceColors.length].bg,
        logoUrl: t.logoUrl || null,
        avatar: t.avatar || null
      }));
    } else {
      // Keep existing un-matched wheel teams
      const validIds = new Set(unMatchedTeams.map((t) => t.id));
      this.activeWheelTeams = this.activeWheelTeams.filter((t) => validIds.has(t.id));
      unMatchedTeams.forEach((t, idx) => {
        if (!this.activeWheelTeams.some((wt) => wt.id === t.id) && !this.isTeamCurrentlyInSlots(t.id)) {
          this.activeWheelTeams.push({
            id: t.id,
            name: t.name,
            color: t.color || this.sliceColors[idx % this.sliceColors.length].bg,
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

  toggleTeamInWheel(teamId) {
    if (this.isSpinning) return;
    const { tournamentMatchups = [] } = store.getState();
    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    if (confirmedTeamIds.has(teamId)) {
      if (window.app) window.app.showToast('This crew is already locked into an official matchup.', 'info');
      return;
    }

    const allTeams = this.getAllAvailableTeams();
    const targetTeam = allTeams.find((t) => t.id === teamId);
    if (!targetTeam) return;

    const exists = this.activeWheelTeams.some((wt) => wt.id === teamId);
    if (exists) {
      this.activeWheelTeams = this.activeWheelTeams.filter((wt) => wt.id !== teamId);
      if (window.app) window.app.showToast(`Removed ${targetTeam.name} from wheel`, 'info');
    } else {
      this.activeWheelTeams.push({
        id: targetTeam.id,
        name: targetTeam.name,
        color: targetTeam.color || this.sliceColors[this.activeWheelTeams.length % this.sliceColors.length].bg,
        logoUrl: targetTeam.logoUrl || null,
        avatar: targetTeam.avatar || null
      });
      if (window.app) window.app.showToast(`Added ${targetTeam.name} to wheel`, 'success');
    }

    this.renderTournamentView();
    setTimeout(() => {
      this.setupCanvas();
      this.drawWheel();
    }, 20);
  }

  selectAllTeamsForWheel() {
    if (this.isSpinning) return;
    const { tournamentMatchups = [] } = store.getState();
    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    const allTeams = this.getAllAvailableTeams();
    this.activeWheelTeams = allTeams.filter((t) => !confirmedTeamIds.has(t.id)).map((t, idx) => ({
      id: t.id,
      name: t.name,
      color: t.color || this.sliceColors[idx % this.sliceColors.length].bg,
      logoUrl: t.logoUrl || null,
      avatar: t.avatar || null
    }));

    if (window.app) window.app.showToast('All available teams selected for wheel!', 'info');
    this.renderTournamentView();
    setTimeout(() => {
      this.setupCanvas();
      this.drawWheel();
    }, 20);
  }

  deselectAllTeamsForWheel() {
    if (this.isSpinning) return;
    this.activeWheelTeams = [];
    if (window.app) window.app.showToast('Wheel pool cleared', 'info');
    this.renderTournamentView();
    setTimeout(() => {
      this.setupCanvas();
      this.drawWheel();
    }, 20);
  }

  resetWheelPool() {
    if (this.isSpinning) return;
    this.syncTeamsFromStore(true);
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.lastLandedTeam = null;
    this.renderTournamentView();
    if (window.app) window.app.showToast('Wheel pool reset to all un-matched teams!', 'info');
  }

  shuffleWheel() {
    if (this.isSpinning || this.activeWheelTeams.length < 2) return;
    for (let i = this.activeWheelTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.activeWheelTeams[i], this.activeWheelTeams[j]] = [this.activeWheelTeams[j], this.activeWheelTeams[i]];
    }
    this.drawWheel();
    if (window.app) window.app.showToast('Wheel teams shuffled!', 'info');
  }

  renderTournamentView(containerId = 'tournament-view') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { currentUser, tournamentMatchups = [] } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    const allTeams = this.getAllAvailableTeams();

    const confirmedTeamIds = new Set();
    tournamentMatchups.forEach((m) => {
      if (m.team1 && m.team1.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2 && m.team2.id) confirmedTeamIds.add(m.team2.id);
    });

    container.innerHTML = `
      <!-- Tournament Header -->
      <div class="section-header" style="margin-bottom: 1.25rem;">
        <div class="section-title-wrap">
          <span class="section-tag" style="color:var(--accent-cyan);">GRAND PRIX FACE-OFF</span>
          <h2 class="section-title">Tournament Matchup Wheel</h2>
        </div>
        <p style="color:var(--text-secondary); font-size:0.85rem;">
          ${isAdmin ? 'Choose which teams go onto the wheel, then spin to draw and lock in official championship match fixtures.' : 'Live championship matchup board and tournament draw arena.'}
        </p>
      </div>

      <!-- Main Tournament Grid: Left Wheel, Right Matchups -->
      <div class="tournament-layout-grid">
        
        <!-- LEFT COLUMN: The Spinning Wheel Stage -->
        <div class="glass-card wheel-stage-card">
          <div class="wheel-stage-header">
            <div>
              <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">RACE DRAW ARENA</span>
              <h3 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; text-transform:uppercase;">
                Team Decider Wheel
              </h3>
            </div>
            <div class="wheel-counter-pill">
              ${this.activeWheelTeams.length} of ${allTeams.length} Teams on Wheel
            </div>
          </div>

          <!-- Canvas Wheel Container -->
          <div class="wheel-canvas-container">
            <!-- Top Pointer Needle -->
            <div class="wheel-pointer-wrap">
              <div class="wheel-pointer-arrow"></div>
            </div>

            <canvas id="tournament-wheel-canvas" width="460" height="460"></canvas>
          </div>

          <!-- Wheel Controls -->
          <div class="wheel-actions-panel">
            ${isAdmin ? `
              <button id="btn-spin-wheel" class="btn btn-gold btn-lg spin-wheel-cta ${this.isSpinning ? 'spinning' : ''}" onclick="window.tournamentWheel.spinWheel()" ${this.activeWheelTeams.length < 1 || this.isSpinning ? 'disabled' : ''}>
                ${this.isSpinning ? '🌀 SPINNING...' : (this.activeWheelTeams.length === 0 ? '🏁 ALL TEAMS PAIRED' : '🎯 SPIN THE WHEEL')}
              </button>
            ` : `
              <div style="background:rgba(10,14,24,0.8); border:1px solid var(--border-cyan); padding:0.85rem; border-radius:var(--radius-md); text-align:center;">
                <span style="font-family:var(--font-display); font-size:0.95rem; font-weight:800; color:var(--accent-cyan); text-transform:uppercase; letter-spacing:1px;">
                  📡 Live Spectator Broadcast Active
                </span>
              </div>
            `}

            <div class="wheel-options-row">
              <label class="wheel-toggle-label" title="When enabled, selected teams are automatically removed from the wheel once their matchup is finalized">
                <input type="checkbox" id="wheel-auto-remove" ${this.autoRemoveDrawn ? 'checked' : ''} onchange="window.tournamentWheel.toggleAutoRemove(this.checked)">
                <span>Remove Teams Once Paired</span>
              </label>

              ${isAdmin ? `
                <div style="display:flex; gap:0.5rem;">
                  <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.shuffleWheel()" title="Shuffle team slice order on the wheel" ${this.isSpinning || this.activeWheelTeams.length < 2 ? 'disabled' : ''}>
                    🔀 Shuffle
                  </button>
                  <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.resetWheelPool()" title="Restore un-matched teams to the wheel" ${this.isSpinning ? 'disabled' : ''}>
                    🔄 Reload
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- ADMIN ONLY: Team Selection & Filter Card for Wheel -->
          ${isAdmin ? `
            <div class="wheel-team-selector-card">
              <div class="team-selector-header">
                <div>
                  <span class="section-tag" style="font-size:0.68rem; color:var(--accent-cyan);">WHEEL ROSTER SELECTION</span>
                  <div style="font-family:var(--font-display); font-size:0.95rem; font-weight:800; color:#fff;">
                    Choose Teams on Wheel (${this.activeWheelTeams.length}/${allTeams.length})
                  </div>
                </div>
                <div style="display:flex; gap:0.4rem;">
                  <button class="btn btn-outline btn-sm" style="font-size:0.7rem; padding:0.25rem 0.55rem;" onclick="window.tournamentWheel.selectAllTeamsForWheel()">Select All</button>
                  <button class="btn btn-outline btn-sm" style="font-size:0.7rem; padding:0.25rem 0.55rem;" onclick="window.tournamentWheel.deselectAllTeamsForWheel()">Clear</button>
                  <button class="btn btn-cyan btn-sm" style="font-size:0.7rem; padding:0.25rem 0.55rem;" onclick="window.app.quickAddTeam()">+ Add Team</button>
                </div>
              </div>

              <div class="team-selector-grid">
                ${allTeams.map((t) => {
                  const isSelected = this.activeWheelTeams.some((wt) => wt.id === t.id);
                  const isPaired = confirmedTeamIds.has(t.id);
                  return `
                    <div class="team-select-item ${isSelected ? 'selected' : ''} ${isPaired ? 'paired' : ''}" onclick="window.tournamentWheel.toggleTeamInWheel('${t.id}')" title="${isPaired ? 'Already confirmed in a matchup' : 'Click to include/exclude from wheel'}">
                      <input type="checkbox" ${isSelected ? 'checked' : ''} ${isPaired ? 'disabled' : ''} onclick="event.stopPropagation(); window.tournamentWheel.toggleTeamInWheel('${t.id}')">
                      <div class="team-select-color-dot" style="background:${t.color || '#00e5ff'};"></div>
                      <span class="team-select-item-name" style="color:${t.color || '#fff'};">${t.name}</span>
                      ${isPaired ? '<span style="font-size:0.65rem; color:var(--accent-gold); font-weight:800;">PAIRED</span>' : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

        </div>

        <!-- RIGHT COLUMN: Matchup / Face-Off Creator & Bracket -->
        <div class="tournament-bracket-column">
          
          <!-- CURRENT DRAW / FACE-OFF SLOTS CARD -->
          <div class="glass-card current-matchup-card">
            <div class="section-title-wrap" style="margin-bottom:0.75rem;">
              <span class="section-tag" style="font-size:0.7rem; color:var(--accent-cyan);">ACTIVE DRAW</span>
              <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                Current Matchup Selection
              </h3>
            </div>

            <!-- Face-Off Visual Slots -->
            <div class="face-off-versus-slots">
              <!-- Slot 1: Team 1 -->
              <div class="face-off-slot ${this.pendingTeam1 ? 'filled' : 'empty'}" style="${this.pendingTeam1 ? `border-color:${this.pendingTeam1.color};` : ''}">
                <span class="slot-badge-label">CREW 1</span>
                ${this.pendingTeam1 ? `
                  <div class="slot-team-content">
                    <div class="slot-team-avatar" style="border-color:${this.pendingTeam1.color};">
                      ${this.pendingTeam1.logoUrl ? `<img src="${this.pendingTeam1.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : (this.pendingTeam1.avatar ? `<img src="${this.pendingTeam1.avatar}" style="width:100%; height:100%; object-fit:cover;">` : '🏎️')}
                    </div>
                    <div class="slot-team-name" style="color:${this.pendingTeam1.color};">${this.pendingTeam1.name}</div>
                  </div>
                ` : `
                  <div class="slot-placeholder">
                    <span class="slot-placeholder-icon">🎯</span>
                    <span>${isAdmin ? 'Spin to Draw Crew 1' : 'Awaiting Crew 1 Draw'}</span>
                  </div>
                `}
              </div>

              <!-- VS Badge -->
              <div class="face-off-vs-pill">VS</div>

              <!-- Slot 2: Team 2 -->
              <div class="face-off-slot ${this.pendingTeam2 ? 'filled' : 'empty'}" style="${this.pendingTeam2 ? `border-color:${this.pendingTeam2.color};` : ''}">
                <span class="slot-badge-label">CREW 2</span>
                ${this.pendingTeam2 ? `
                  <div class="slot-team-content">
                    <div class="slot-team-avatar" style="border-color:${this.pendingTeam2.color};">
                      ${this.pendingTeam2.logoUrl ? `<img src="${this.pendingTeam2.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : (this.pendingTeam2.avatar ? `<img src="${this.pendingTeam2.avatar}" style="width:100%; height:100%; object-fit:cover;">` : '⚡')}
                    </div>
                    <div class="slot-team-name" style="color:${this.pendingTeam2.color};">${this.pendingTeam2.name}</div>
                  </div>
                ` : `
                  <div class="slot-placeholder">
                    <span class="slot-placeholder-icon">🎯</span>
                    <span>${isAdmin ? 'Spin to Draw Crew 2' : 'Awaiting Crew 2 Draw'}</span>
                  </div>
                `}
              </div>
            </div>

            <!-- Matchup Action Buttons -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:0.5rem; flex-wrap:wrap;">
              <div style="font-size:0.78rem; color:var(--text-muted);">
                ${this.pendingTeam1 && !this.pendingTeam2 ? '👉 Spin wheel again to draw opposing team' : (this.pendingTeam1 && this.pendingTeam2 ? '✅ Matchup finalized & broadcasted to all viewers!' : (isAdmin ? 'Click Spin to draw teams' : 'Race Control is drawing matchups'))}
              </div>
              <div style="display:flex; gap:0.5rem;">
                ${(this.pendingTeam1 || this.pendingTeam2) && isAdmin ? `
                  <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.clearPendingMatchup()">
                    Clear Selection
                  </button>
                ` : ''}
                ${this.pendingTeam1 && this.pendingTeam2 && isAdmin ? `
                  <button class="btn btn-cyan btn-sm" onclick="window.tournamentWheel.confirmPendingMatchup()">
                    ⚡ Lock Matchup
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- SAVED TOURNAMENT MATCHUPS LIST / FIXTURES (LIVE BROADCAST FOR VIEWERS) -->
          <div class="glass-card matchups-board-card">
            <div class="section-header" style="margin-bottom:0.75rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">OFFICIAL FIXTURES</span>
                <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                  Championship Matchups (${tournamentMatchups.length})
                </h3>
              </div>
              ${tournamentMatchups.length > 0 && isAdmin ? `
                <button class="btn btn-danger btn-sm" style="font-size:0.7rem; padding:0.3rem 0.6rem;" onclick="window.tournamentWheel.clearAllMatchups()">
                  🗑️ Clear All
                </button>
              ` : ''}
            </div>

            ${tournamentMatchups.length === 0 ? `
              <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                <div style="font-size:1.8rem; margin-bottom:0.3rem;">🏁</div>
                No face-off matchups confirmed yet.<br>
                ${isAdmin ? 'Spin the wheel on the left to draw teams and create match fixtures.' : 'Official matchups will appear here in real time as Race Control draws the teams.'}
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
                      <div class="fixture-team-pill ${m.winnerId === m.team1.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team1.id ? 'is-eliminated' : '')}" style="border-left: 3px solid ${m.team1.color}; cursor:${isAdmin ? 'pointer' : 'default'};" ${isAdmin ? `onclick="window.tournamentWheel.toggleWinner('${m.id}', '${m.team1.id}')" title="Click to mark as winner"` : ''}>
                        <span class="fixture-team-name">${m.team1.name}</span>
                        ${m.winnerId === m.team1.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>

                      <span class="fixture-vs-text">VS</span>

                      <!-- Team 2 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team2.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team2.id ? 'is-eliminated' : '')}" style="border-left: 3px solid ${m.team2.color}; cursor:${isAdmin ? 'pointer' : 'default'};" ${isAdmin ? `onclick="window.tournamentWheel.toggleWinner('${m.id}', '${m.team2.id}')" title="Click to mark as winner"` : ''}>
                        <span class="fixture-team-name">${m.team2.name}</span>
                        ${m.winnerId === m.team2.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>
                    </div>

                    ${isAdmin ? `
                      <button class="btn-icon fixture-delete-btn" onclick="window.tournamentWheel.deleteMatchup('${m.id}')" title="Remove Matchup">
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

    // Render wheel immediately
    setTimeout(() => {
      this.setupCanvas();
      this.drawWheel();
    }, 20);
  }

  setupCanvas() {
    this.canvas = document.getElementById('tournament-wheel-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const baseSize = 460;

    this.canvas.width = baseSize * dpr;
    this.canvas.height = baseSize * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  drawWheel() {
    this.canvas = document.getElementById('tournament-wheel-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = 460;
    const center = size / 2;
    const radius = center - 16;

    ctx.clearRect(0, 0, size, size);

    const teams = this.activeWheelTeams;
    const numSlices = Math.max(teams.length, 1);
    const sliceAngle = (Math.PI * 2) / numSlices;

    // 1. Outer Metallic & Neon Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius + 10, 0, Math.PI * 2);
    ctx.fillStyle = '#080c14';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#182236';
    ctx.stroke();

    // Glowing Neon Cyan Border
    ctx.beginPath();
    ctx.arc(center, center, radius + 6, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Perimeter LED bulbs
    const numBulbs = Math.max(numSlices * 3, 24);
    for (let i = 0; i < numBulbs; i++) {
      const bulbAngle = (i / numBulbs) * Math.PI * 2 + (this.isSpinning ? this.currentAngle * 2 : 0);
      const bx = center + (radius + 8) * Math.cos(bulbAngle);
      const by = center + (radius + 8) * Math.sin(bulbAngle);
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#00e5ff' : '#ff1744';
      ctx.shadowColor = i % 2 === 0 ? '#00e5ff' : '#ff1744';
      ctx.shadowBlur = 5;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // 2. Draw Wheel Slices
    if (teams.length === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0f1726';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 15px "Rajdhani", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO TEAMS SELECTED', center, center - 6);
      ctx.fillStyle = '#00e5ff';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.fillText('Select teams from roster below', center, center + 15);
      ctx.restore();
      return;
    }

    for (let i = 0; i < numSlices; i++) {
      const team = teams[i];
      const startAngle = this.currentAngle + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();

      // Slice base color
      const baseColor = team.color || this.sliceColors[i % this.sliceColors.length].bg;
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Radial 3D depth shadow
      const grad = ctx.createRadialGradient(center, center, radius * 0.2, center, center, radius);
      grad.addColorStop(0, 'rgba(0,0,0,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Slice separator line
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();

      // Outer metallic tick
      const midAngle = startAngle + sliceAngle / 2;
      const pinX = center + (radius - 3) * Math.cos(midAngle);
      const pinY = center + (radius - 3) * Math.sin(midAngle);
      ctx.beginPath();
      ctx.arc(pinX, pinY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Text: Team Name along slice radius
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(midAngle);

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 13.5px "Rajdhani", sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;

      let displayName = team.name.toUpperCase();
      if (displayName.length > 16) displayName = displayName.substring(0, 14) + '..';

      ctx.fillText(displayName, radius - 20, 0);

      ctx.restore();
      ctx.restore();
    }

    // 3. Center Metallic Hub with Apex Emblem
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#060a12';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center Inner Ring
    ctx.beginPath();
    ctx.arc(center, center, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#121929';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.85)';
    ctx.stroke();

    // Center Spark
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(center, center, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  spinWheel() {
    if (this.isSpinning || this.activeWheelTeams.length < 1) return;

    this.isSpinning = true;
    const spinBtn = document.getElementById('btn-spin-wheel');
    if (spinBtn) {
      spinBtn.disabled = true;
      spinBtn.classList.add('spinning');
      spinBtn.innerHTML = '🌀 SPINNING...';
    }

    const fullSpins = 5 + Math.floor(Math.random() * 4);
    const randomOffset = Math.random() * Math.PI * 2;
    const targetTotalAngle = fullSpins * Math.PI * 2 + randomOffset;

    const startAngle = this.currentAngle;
    const startTime = performance.now();
    const duration = 3800 + Math.random() * 800;

    const numSlices = this.activeWheelTeams.length;
    const sliceAngle = (Math.PI * 2) / numSlices;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3.5);
      this.currentAngle = startAngle + targetTotalAngle * easeOut;

      const normalizedAngle = (this.currentAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const currentSegment = Math.floor(normalizedAngle / sliceAngle);
      if (currentSegment !== this.lastTickSegment) {
        this.lastTickSegment = currentSegment;
        soundFX.play('bid');
      }

      this.drawWheel();

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.isSpinning = false;
        this.onSpinFinished();
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  onSpinFinished() {
    const teams = this.activeWheelTeams;
    if (teams.length === 0) return;

    const numSlices = teams.length;
    const sliceAngle = (Math.PI * 2) / numSlices;
    const pointerAngle = (3 * Math.PI) / 2; // 270 degrees / Top

    const normalizedAngle = (this.currentAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    let winningIndex = Math.floor(((pointerAngle - normalizedAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / sliceAngle);
    winningIndex = ((winningIndex % numSlices) + numSlices) % numSlices;

    const winningTeam = teams[winningIndex];
    this.lastLandedTeam = winningTeam;

    soundFX.play('hammer');
    viewerView.triggerConfetti();

    if (!this.pendingTeam1) {
      this.pendingTeam1 = winningTeam;
      if (window.app) window.app.showToast(`🎯 CREW 1 DRAWN: ${winningTeam.name}!`, 'success');
      if (this.autoRemoveDrawn) {
        this.activeWheelTeams = this.activeWheelTeams.filter((t) => t.id !== winningTeam.id);
      }
    } else if (!this.pendingTeam2 && winningTeam.id !== this.pendingTeam1.id) {
      this.pendingTeam2 = winningTeam;
      if (window.app) window.app.showToast(`🎯 CREW 2 DRAWN: ${winningTeam.name}! Face-off ready!`, 'sold');
      
      setTimeout(() => {
        this.confirmPendingMatchup();
      }, 900);
    } else {
      this.pendingTeam1 = winningTeam;
      this.pendingTeam2 = null;
      if (window.app) window.app.showToast(`🎯 DRAWN: ${winningTeam.name}!`, 'success');
    }

    this.renderTournamentView();
  }

  confirmPendingMatchup() {
    if (!this.pendingTeam1 || !this.pendingTeam2) return;

    const team1Id = this.pendingTeam1.id;
    const team2Id = this.pendingTeam2.id;

    const res = store.addTournamentMatchup(team1Id, team2Id);
    if (res.success) {
      if (window.app) window.app.showToast(`⚡ Match #${res.matchup.matchNumber}: ${this.pendingTeam1.name} VS ${this.pendingTeam2.name} locked & broadcasted!`, 'success');
      
      this.pendingTeam1 = null;
      this.pendingTeam2 = null;

      // Both teams are permanently removed from active wheel pool
      this.activeWheelTeams = this.activeWheelTeams.filter((t) => t.id !== team1Id && t.id !== team2Id);

      this.renderTournamentView();
      setTimeout(() => {
        this.setupCanvas();
        this.drawWheel();
      }, 30);
    }
  }

  clearPendingMatchup() {
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.syncTeamsFromStore(false);
    this.renderTournamentView();
  }

  toggleAutoRemove(checked) {
    this.autoRemoveDrawn = Boolean(checked);
  }

  deleteMatchup(matchupId) {
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
    if (confirm('Clear all tournament face-off fixtures?')) {
      store.clearTournamentMatchups();
      if (window.app) window.app.showToast('All matchups cleared', 'info');
      this.syncTeamsFromStore(true);
      this.renderTournamentView();
    }
  }
}

export const tournamentWheel = new TournamentWheelView();
