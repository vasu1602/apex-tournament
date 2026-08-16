import { store } from './state.js';
import { soundFX } from './audio.js';
import { viewerView } from './viewer-view.js';

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

    // Rich color palette for teams if team has default color
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
    this.syncTeamsFromStore();
    window.tournamentWheel = this;
    store.subscribe((state, meta) => {
      // Re-sync if teams changed and we are not spinning
      if (!this.isSpinning) {
        this.syncTeamsFromStore(false);
      }
      this.renderTournamentView();
    });
  }

  syncTeamsFromStore(forceReset = false) {
    const { teams } = store.getState();
    if (forceReset || this.activeWheelTeams.length === 0) {
      this.activeWheelTeams = teams.map((t, idx) => ({
        id: t.id,
        name: t.name,
        color: t.color || this.sliceColors[idx % this.sliceColors.length].bg,
        logoUrl: t.logoUrl,
        avatar: t.avatar,
        rosterCount: t.roster ? t.roster.length : 0
      }));
    } else {
      // Keep already active teams that still exist in store
      const teamIds = new Set(teams.map((t) => t.id));
      this.activeWheelTeams = this.activeWheelTeams.filter((t) => teamIds.has(t.id));
      // Add any newly created teams from store that weren't in wheel
      teams.forEach((t, idx) => {
        if (!this.activeWheelTeams.some((wt) => wt.id === t.id) && !this.isTeamAlreadyPaired(t.id)) {
          this.activeWheelTeams.push({
            id: t.id,
            name: t.name,
            color: t.color || this.sliceColors[idx % this.sliceColors.length].bg,
            logoUrl: t.logoUrl,
            avatar: t.avatar,
            rosterCount: t.roster ? t.roster.length : 0
          });
        }
      });
    }
  }

  isTeamAlreadyPaired(teamId) {
    if (this.pendingTeam1 && this.pendingTeam1.id === teamId) return true;
    if (this.pendingTeam2 && this.pendingTeam2.id === teamId) return true;
    return false;
  }

  resetWheelPool() {
    if (this.isSpinning) return;
    this.syncTeamsFromStore(true);
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.lastLandedTeam = null;
    this.renderTournamentView();
    if (window.app) window.app.showToast('Wheel team pool reset to all teams!', 'info');
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

    const { teams, tournamentMatchups = [] } = store.getState();
    const hasEnoughTeams = teams.length >= 2;

    container.innerHTML = `
      <!-- Tournament Header -->
      <div class="section-header" style="margin-bottom: 1.25rem;">
        <div class="section-title-wrap">
          <span class="section-tag" style="color:var(--accent-cyan);">GRAND PRIX FACE-OFF</span>
          <h2 class="section-title">Tournament Matchup Wheel</h2>
        </div>
        <p style="color:var(--text-secondary); font-size:0.85rem;">
          Spin the wheel to draw teams and randomly decide which crew will face off in each championship match.
        </p>
      </div>

      ${!hasEnoughTeams ? `
        <div class="card glass-card" style="padding: 3rem 1.5rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:1rem; border: 1px dashed rgba(0, 242, 254, 0.3);">
          <div style="font-size:3rem;">🏎️</div>
          <h3 style="font-family:var(--font-display); font-size:1.3rem; color:#fff;">At least 2 Teams Required to Spin</h3>
          <p style="color:var(--text-secondary); max-width:480px; font-size:0.88rem;">
            You currently have ${teams.length} team registered. Please add more teams in Race Control or load preset teams to spin the face-off wheel.
          </p>
          <div style="display:flex; gap:0.75rem; margin-top:0.5rem; flex-wrap:wrap; justify-content:center;">
            <button class="btn btn-cyan" onclick="window.app.quickAddTeam()">+ Add Team</button>
            <button class="btn btn-outline" onclick="window.app.loadDemoData()">⚡ Load Championship Teams</button>
          </div>
        </div>
      ` : `
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
                ${this.activeWheelTeams.length} Teams on Wheel
              </div>
            </div>

            <!-- Canvas Wheel Container -->
            <div class="wheel-canvas-container">
              <!-- Top Pointer Needle -->
              <div class="wheel-pointer-wrap">
                <div class="wheel-pointer-arrow"></div>
              </div>

              <canvas id="tournament-wheel-canvas" width="480" height="480"></canvas>
            </div>

            <!-- Wheel Controls -->
            <div class="wheel-actions-panel">
              <button id="btn-spin-wheel" class="btn btn-gold btn-lg spin-wheel-cta ${this.isSpinning ? 'spinning' : ''}" onclick="window.tournamentWheel.spinWheel()" ${this.activeWheelTeams.length < 1 || this.isSpinning ? 'disabled' : ''}>
                ${this.isSpinning ? '🌀 SPINNING...' : '🎯 SPIN THE WHEEL'}
              </button>

              <div class="wheel-options-row">
                <label class="wheel-toggle-label" title="When enabled, drawn teams are removed from the wheel for subsequent spins">
                  <input type="checkbox" id="wheel-auto-remove" ${this.autoRemoveDrawn ? 'checked' : ''} onchange="window.tournamentWheel.toggleAutoRemove(this.checked)">
                  <span>Remove Team Once Drawn</span>
                </label>

                <div style="display:flex; gap:0.5rem;">
                  <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.shuffleWheel()" title="Shuffle team slice order on the wheel" ${this.isSpinning ? 'disabled' : ''}>
                    🔀 Shuffle
                  </button>
                  <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.resetWheelPool()" title="Restore all teams back to the wheel" ${this.isSpinning ? 'disabled' : ''}>
                    🔄 Reset Pool
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: Matchup / Face-Off Creator & Bracket -->
          <div class="tournament-bracket-column">
            
            <!-- CURRENT DRAW / FACE-OFF SLOTS CARD -->
            <div class="glass-card current-matchup-card">
              <div class="section-title-wrap" style="margin-bottom:0.75rem;">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-cyan);">ACTIVE SELECTION</span>
                <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                  Current Matchup Slots
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
                      <span>Spin to Draw Crew 1</span>
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
                      <span>Spin to Draw Crew 2</span>
                    </div>
                  `}
                </div>
              </div>

              <!-- Matchup Action Buttons -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:0.5rem; flex-wrap:wrap;">
                <div style="font-size:0.78rem; color:var(--text-muted);">
                  ${this.pendingTeam1 && !this.pendingTeam2 ? '👉 Spin again to draw opposing team' : (this.pendingTeam1 && this.pendingTeam2 ? '✅ Matchup ready to lock!' : 'Click Spin to start')}
                </div>
                <div style="display:flex; gap:0.5rem;">
                  ${this.pendingTeam1 || this.pendingTeam2 ? `
                    <button class="btn btn-outline btn-sm" onclick="window.tournamentWheel.clearPendingMatchup()">
                      Clear Slots
                    </button>
                  ` : ''}
                  ${this.pendingTeam1 && this.pendingTeam2 ? `
                    <button class="btn btn-cyan btn-sm" onclick="window.tournamentWheel.confirmPendingMatchup()">
                      ⚡ Save Matchup
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- SAVED TOURNAMENT MATCHUPS LIST / FIXTURES -->
            <div class="glass-card matchups-board-card">
              <div class="section-header" style="margin-bottom:0.75rem;">
                <div class="section-title-wrap">
                  <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">CHAMPIONSHIP SCHEDULE</span>
                  <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                    Official Matchup Fixtures (${tournamentMatchups.length})
                  </h3>
                </div>
                ${tournamentMatchups.length > 0 ? `
                  <button class="btn btn-danger btn-sm" style="font-size:0.7rem; padding:0.3rem 0.6rem;" onclick="window.tournamentWheel.clearAllMatchups()">
                    🗑️ Clear All
                  </button>
                ` : ''}
              </div>

              ${tournamentMatchups.length === 0 ? `
                <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                  <div style="font-size:1.8rem; margin-bottom:0.3rem;">🏁</div>
                  No face-off matchups created yet.<br>
                  Spin the wheel on the left to draw teams and pair them into official tournament matches.
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
                        <div class="fixture-team-pill ${m.winnerId === m.team1.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team1.id ? 'is-eliminated' : '')}" style="border-left: 3px solid ${m.team1.color};" onclick="window.tournamentWheel.toggleWinner('${m.id}', '${m.team1.id}')" title="Click to mark as winner">
                          <span class="fixture-team-name">${m.team1.name}</span>
                          ${m.winnerId === m.team1.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                        </div>

                        <span class="fixture-vs-text">VS</span>

                        <!-- Team 2 -->
                        <div class="fixture-team-pill ${m.winnerId === m.team2.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team2.id ? 'is-eliminated' : '')}" style="border-left: 3px solid ${m.team2.color};" onclick="window.tournamentWheel.toggleWinner('${m.id}', '${m.team2.id}')" title="Click to mark as winner">
                          <span class="fixture-team-name">${m.team2.name}</span>
                          ${m.winnerId === m.team2.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                        </div>
                      </div>

                      <button class="btn-icon fixture-delete-btn" onclick="window.tournamentWheel.deleteMatchup('${m.id}')" title="Remove Matchup">
                        ✕
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

          </div>
        </div>
      `}
    `;

    // Attach canvas and render initial wheel if teams exist
    if (hasEnoughTeams) {
      setTimeout(() => {
        this.setupCanvas();
        this.drawWheel();
      }, 50);
    }
  }

  setupCanvas() {
    this.canvas = document.getElementById('tournament-wheel-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    // High-DPI crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const displaySize = Math.min(rect.width || 440, 440);

    this.canvas.width = displaySize * dpr;
    this.canvas.height = displaySize * dpr;
    this.ctx.scale(dpr, dpr);
  }

  drawWheel() {
    if (!this.canvas) {
      this.canvas = document.getElementById('tournament-wheel-canvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
    }

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = this.canvas.width / dpr;
    const center = size / 2;
    const radius = center - 18;

    ctx.clearRect(0, 0, size, size);

    const teams = this.activeWheelTeams;
    const numSlices = Math.max(teams.length, 1);
    const sliceAngle = (Math.PI * 2) / numSlices;

    // 1. Outer Chrome / Neon Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0e17';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1b2538';
    ctx.stroke();

    // Glowing Neon Border
    ctx.beginPath();
    ctx.arc(center, center, radius + 8, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.stroke();

    // Perimeter LED bulbs
    const numBulbs = Math.max(numSlices * 3, 24);
    for (let i = 0; i < numBulbs; i++) {
      const bulbAngle = (i / numBulbs) * Math.PI * 2 + (this.isSpinning ? this.currentAngle * 2 : 0);
      const bx = center + (radius + 9) * Math.cos(bulbAngle);
      const by = center + (radius + 9) * Math.sin(bulbAngle);
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#00e5ff' : '#ff1744';
      ctx.shadowColor = i % 2 === 0 ? '#00e5ff' : '#ff1744';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // 2. Draw Wheel Slices
    if (teams.length === 0) {
      // Empty wheel message
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#101726';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 14px "Rajdhani", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ALL TEAMS DRAWN', center, center - 6);
      ctx.fillStyle = 'var(--accent-cyan)';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.fillText('Click Reset Pool to Reload', center, center + 14);
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

      // Slice background color
      const baseColor = team.color || this.sliceColors[i % this.sliceColors.length].bg;
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Inner gradient shadow for 3D depth
      const grad = ctx.createRadialGradient(center, center, radius * 0.2, center, center, radius);
      grad.addColorStop(0, 'rgba(0,0,0,0.1)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Slice separator line
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();

      // Perimeter outer metallic tick
      const midAngle = startAngle + sliceAngle / 2;
      const pinX = center + (radius - 4) * Math.cos(midAngle);
      const pinY = center + (radius - 4) * Math.sin(midAngle);
      ctx.beginPath();
      ctx.arc(pinX, pinY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Text: Team Name (Rotated along slice radius)
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(midAngle);

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 13px "Rajdhani", sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 5;

      // Truncate name if too long for slice
      let teamName = team.name.toUpperCase();
      if (teamName.length > 16) teamName = teamName.substring(0, 14) + '..';

      ctx.fillText(teamName, radius - 20, 0);

      ctx.restore();
      ctx.restore();
    }

    // 3. Center Metallic Hub with Apex Emblem
    ctx.save();
    // Hub base
    ctx.beginPath();
    ctx.arc(center, center, 32, 0, Math.PI * 2);
    ctx.fillStyle = '#060a12';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.5)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // Center Inner Ring
    ctx.beginPath();
    ctx.arc(center, center, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#121929';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.8)';
    ctx.stroke();

    // Center Apex Spark
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

    // Physics calculation:
    // 5 to 9 full rotations + randomized target offset
    const fullSpins = 5 + Math.floor(Math.random() * 4);
    const randomOffset = Math.random() * Math.PI * 2;
    const targetTotalAngle = fullSpins * Math.PI * 2 + randomOffset;

    const startAngle = this.currentAngle;
    const startTime = performance.now();
    const duration = 3800 + Math.random() * 800; // 3.8s to 4.6s

    const numSlices = this.activeWheelTeams.length;
    const sliceAngle = (Math.PI * 2) / numSlices;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3.5);
      this.currentAngle = startAngle + targetTotalAngle * easeOut;

      // Audio tick when crossing slices
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
        // Spin complete
        this.isSpinning = false;
        this.onSpinFinished();
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  onSpinFinished() {
    const teams = this.activeWheelTeams;
    if (teams.length === 0) return;

    // Pointer is at TOP (12 o'clock / -Math.PI / 2 or 3*Math.PI/2)
    const numSlices = teams.length;
    const sliceAngle = (Math.PI * 2) / numSlices;
    const pointerAngle = (3 * Math.PI) / 2; // 270 degrees / Top

    // Normalize wheel angle
    const normalizedAngle = (this.currentAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    let winningIndex = Math.floor(((pointerAngle - normalizedAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / sliceAngle);
    winningIndex = ((winningIndex % numSlices) + numSlices) % numSlices;

    const winningTeam = teams[winningIndex];
    this.lastLandedTeam = winningTeam;

    // Play celebration audio & confetti
    soundFX.play('hammer');
    viewerView.triggerConfetti();

    // Assign to pending matchup slots
    if (!this.pendingTeam1) {
      this.pendingTeam1 = winningTeam;
      if (window.app) window.app.showToast(`🎯 CREW 1 DRAWN: ${winningTeam.name}!`, 'success');
    } else if (!this.pendingTeam2 && winningTeam.id !== this.pendingTeam1.id) {
      this.pendingTeam2 = winningTeam;
      if (window.app) window.app.showToast(`🎯 CREW 2 DRAWN: ${winningTeam.name}! Face-off ready!`, 'sold');
      
      // Auto confirm matchup if both slots filled
      setTimeout(() => {
        this.confirmPendingMatchup();
      }, 900);
    } else {
      this.pendingTeam1 = winningTeam;
      this.pendingTeam2 = null;
      if (window.app) window.app.showToast(`🎯 DRAWN: ${winningTeam.name}!`, 'success');
    }

    // Auto-remove team from wheel if toggle is on
    if (this.autoRemoveDrawn) {
      this.activeWheelTeams = this.activeWheelTeams.filter((t) => t.id !== winningTeam.id);
    }

    this.renderTournamentView();
  }

  confirmPendingMatchup() {
    if (!this.pendingTeam1 || !this.pendingTeam2) return;

    const res = store.addTournamentMatchup(this.pendingTeam1.id, this.pendingTeam2.id);
    if (res.success) {
      if (window.app) window.app.showToast(`⚡ Match #${res.matchup.matchNumber}: ${this.pendingTeam1.name} VS ${this.pendingTeam2.name} saved!`, 'success');
      this.pendingTeam1 = null;
      this.pendingTeam2 = null;
      this.renderTournamentView();
    }
  }

  clearPendingMatchup() {
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    this.renderTournamentView();
  }

  toggleAutoRemove(checked) {
    this.autoRemoveDrawn = Boolean(checked);
  }

  deleteMatchup(matchupId) {
    store.removeTournamentMatchup(matchupId);
    if (window.app) window.app.showToast('Matchup removed', 'info');
    this.renderTournamentView();
  }

  toggleWinner(matchupId, teamId) {
    store.setTournamentMatchupWinner(matchupId, teamId);
    this.renderTournamentView();
  }

  clearAllMatchups() {
    if (confirm('Clear all tournament face-off fixtures?')) {
      store.clearTournamentMatchups();
      if (window.app) window.app.showToast('All matchups cleared', 'info');
      this.renderTournamentView();
    }
  }
}

export const tournamentWheel = new TournamentWheelView();
