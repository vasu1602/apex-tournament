import { store } from './state.js';
import { soundFX } from './audio.js';
import { viewerView } from './viewer-view.js';
import { sync } from './sync.js';

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
    this.isCooldown = false;
    this.cooldownSeconds = 0;
    this.cooldownTimer = null;
    this.localSelectedRoundId = null;
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
    const { currentUser, tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }], activeTournamentRoundId = 'round_qualifiers', tournamentMatchups = [] } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);

    if (this.localSelectedRoundId && !tournamentRounds.some((r) => r.id === this.localSelectedRoundId)) {
      this.localSelectedRoundId = null;
    }

    const activeRoundId = isAdmin 
      ? (activeTournamentRoundId || tournamentRounds[0]?.id)
      : (this.localSelectedRoundId || activeTournamentRoundId || tournamentRounds[0]?.id);

    const activeRound = tournamentRounds.find((r) => r.id === activeRoundId) || tournamentRounds[0];
    const allTeams = this.getAllAvailableTeams();

    const currentRoundMatchups = tournamentMatchups.filter((m) => (m.roundId || tournamentRounds[0]?.id) === activeRound.id);

    const confirmedTeamIds = new Set();
    currentRoundMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    const unMatchedTeams = allTeams.filter((t) => !confirmedTeamIds.has(t.id));

    // Automatically clear pending slots if they are already confirmed in matchups of this round
    if (this.pendingTeam1 && confirmedTeamIds.has(this.pendingTeam1.id)) {
      this.pendingTeam1 = null;
    }
    if (this.pendingTeam2 && confirmedTeamIds.has(this.pendingTeam2.id)) {
      this.pendingTeam2 = null;
    }

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

  startCooldown(seconds = 2) {
    this.isCooldown = true;
    this.cooldownSeconds = seconds;
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.renderTournamentView();

    this.cooldownTimer = setInterval(() => {
      this.cooldownSeconds -= 1;
      if (this.cooldownSeconds <= 0) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        this.isCooldown = false;
      }
      this.renderTournamentView();
    }, 1000);
  }

  // --- MYSTERY BOX SHAKE & DRAW ACTION (ADMIN ONLY) ---
  triggerBoxDraw() {
    const { currentUser, tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }], activeTournamentRoundId = 'round_qualifiers' } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    const activeRound = tournamentRounds.find((r) => r.id === activeTournamentRoundId) || tournamentRounds[0];

    if (!isAdmin) {
      if (window.app) window.app.showToast('Box opening is controlled by the Race Control Admin.', 'info');
      return;
    }

    if (activeRound.isLocked) {
      if (window.app) window.app.showToast(`Round "${activeRound.name}" is locked. Unlock it or select another round.`, 'warning');
      return;
    }

    // Guard against rapid clicking / double click
    if (this.isDrawing || this.isCooldown) return;

    if (this.activeBoxTeams.length === 0) {
      if (window.app) window.app.showToast(`All teams have been drawn for ${activeRound.name}! Click Refill Box or create a new round.`, 'info');
      return;
    }

    this.isDrawing = true;
    this.boxState = 'shaking';
    this.emergingTeam = null;
    this.renderTournamentView();

    // 1. Broadcast shake start event to all viewers immediately!
    sync.broadcastBoxEvent({ action: 'START_SHAKE' });

    // Sound: rumble / tension
    soundFX.play('bid');
    const shakeInterval = setInterval(() => {
      soundFX.play('bid');
    }, 280);

    // Shake duration: 1.4s (realistic suspense)
    setTimeout(() => {
      clearInterval(shakeInterval);

      // Pick random team from box
      const randomIndex = Math.floor(Math.random() * this.activeBoxTeams.length);
      const drawnTeam = this.activeBoxTeams[randomIndex];
      this.emergingTeam = drawnTeam;
      this.boxState = 'open';

      const targetSlot = !this.pendingTeam1 ? 1 : 2;

      // 2. Broadcast team reveal event to all viewers!
      sync.broadcastBoxEvent({
        action: 'REVEAL_TEAM',
        drawnTeam,
        slot: targetSlot
      });

      // Fanfare & Confetti only if user is actively on tournament tab
      if (window.app?.activeTab === 'tournament-view') {
        soundFX.play('hammer');
        viewerView.triggerConfetti();
      }
      this.renderTournamentView();

      // Slot into Crew 1 or Crew 2 after reveal animation
      setTimeout(() => {
        if (!this.pendingTeam1) {
          // Slot into Place 1
          this.pendingTeam1 = drawnTeam;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
          if (window.app && window.app.activeTab === 'tournament-view') {
            window.app.showToast(`Crew 1 Drawn: ${drawnTeam.name}`, 'success');
          }
          // Cooldown for 2 seconds to prevent accidental double-clicks
          this.startCooldown(2);
        } else if (!this.pendingTeam2 && drawnTeam.id !== this.pendingTeam1.id) {
          // Slot into Place 2 & Lock Matchup
          this.pendingTeam2 = drawnTeam;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
          if (window.app && window.app.activeTab === 'tournament-view') {
            window.app.showToast(`Crew 2 Drawn: ${drawnTeam.name}`, 'sold');
          }

          // Auto-save & broadcast matchup
          setTimeout(() => {
            this.confirmMatchup();
          }, 800);

          // Cooldown during match celebration
          this.startCooldown(3);
        } else {
          this.pendingTeam1 = drawnTeam;
          this.pendingTeam2 = null;
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
          this.startCooldown(2);
        }

        // 3. Broadcast final slot in event to viewers!
        sync.broadcastBoxEvent({
          action: 'SLOT_IN',
          drawnTeam,
          slot: targetSlot
        });

        this.boxState = 'idle';
        this.emergingTeam = null;
        this.isDrawing = false;
        this.renderTournamentView();
      }, 1200);

    }, 1400);
  }

  // --- HANDLE LIVE BOX EVENTS ON VIEWERS' SCREENS ---
  handleRemoteBoxEvent(payload) {
    if (!payload || !payload.action) return;

    const { currentUser } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    // If this client is currently the active drawing admin, ignore echoing own event
    if (isAdmin && this.isDrawing) return;

    const isCurrentTab = (window.app?.activeTab === 'tournament-view');

    if (payload.action === 'START_SHAKE') {
      this.isDrawing = true;
      this.boxState = 'shaking';
      this.emergingTeam = null;
      if (isCurrentTab) {
        soundFX.play('bid');
      }
      this.renderTournamentView();
    } else if (payload.action === 'REVEAL_TEAM') {
      this.boxState = 'open';
      this.emergingTeam = payload.drawnTeam;
      if (payload.slot === 1) {
        this.pendingTeam1 = payload.drawnTeam;
        if (payload.drawnTeam) {
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== payload.drawnTeam.id);
        }
      } else if (payload.slot === 2) {
        this.pendingTeam2 = payload.drawnTeam;
        if (payload.drawnTeam) {
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== payload.drawnTeam.id);
        }
      }
      if (isCurrentTab) {
        soundFX.play('hammer');
        viewerView.triggerConfetti();
      }
      this.renderTournamentView();
    } else if (payload.action === 'SLOT_IN') {
      const { drawnTeam, slot } = payload;
      if (slot === 1) {
        this.pendingTeam1 = drawnTeam;
        if (drawnTeam) {
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
        }
      } else if (slot === 2) {
        this.pendingTeam2 = drawnTeam;
        if (drawnTeam) {
          this.activeBoxTeams = this.activeBoxTeams.filter((t) => t.id !== drawnTeam.id);
        }
        // Auto-clear slots on viewer after 1.2s celebration so it's fresh for next matchup!
        setTimeout(() => {
          this.pendingTeam1 = null;
          this.pendingTeam2 = null;
          this.renderTournamentView();
        }, 1200);
      }
      this.boxState = 'idle';
      this.emergingTeam = null;
      this.isDrawing = false;
      this.renderTournamentView();
    } else if (payload.action === 'CLEAR_SLOTS') {
      this.pendingTeam1 = null;
      this.pendingTeam2 = null;
      this.syncTeamsFromStore(false);
      this.renderTournamentView();
    }
  }

  confirmMatchup() {
    const { currentUser, tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }], activeTournamentRoundId = 'round_qualifiers' } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (!this.pendingTeam1 || !this.pendingTeam2) return;

    const activeRound = tournamentRounds.find((r) => r.id === activeTournamentRoundId) || tournamentRounds[0];
    const team1 = this.pendingTeam1;
    const team2 = this.pendingTeam2;

    const res = store.addTournamentMatchup(team1, team2, activeRound.id);
    if (res.success) {
      if (window.app) window.app.showToast(`⚡ Match #${res.matchup.matchNumber} (${activeRound.name}): ${team1.name} VS ${team2.name} locked!`, 'success');
      
      // Auto-clear slots on all viewers and admin after brief celebration
      setTimeout(() => {
        this.pendingTeam1 = null;
        this.pendingTeam2 = null;
        sync.broadcastBoxEvent({ action: 'CLEAR_SLOTS' });
        this.renderTournamentView();
      }, 1200);
    } else if (window.app) {
      window.app.showToast(res.message, 'warning');
    }
  }

  clearSlots() {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    this.pendingTeam1 = null;
    this.pendingTeam2 = null;
    sync.broadcastBoxEvent({ action: 'CLEAR_SLOTS' });
    this.syncTeamsFromStore(false);
    this.renderTournamentView();
  }

  // --- ROUND MANAGEMENT ACTIONS ---
  selectRound(roundId) {
    const { currentUser } = store.getState();
    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    if (isAdmin) {
      store.setActiveTournamentRound(roundId);
    } else {
      this.localSelectedRoundId = roundId;
    }
    this.syncTeamsFromStore(false);
    this.renderTournamentView();
  }

  promptAddRound() {
    const { currentUser, tournamentRounds = [] } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    const defaultName = tournamentRounds.length === 1 ? 'Eliminator Round' : (tournamentRounds.length === 2 ? 'Semi-Finals' : (tournamentRounds.length === 3 ? 'Grand Finals' : `Round ${tournamentRounds.length + 1}`));
    const name = prompt('Enter name for the new tournament round (e.g. "Eliminator Round", "Semi-Finals", "Grand Finals"):', defaultName);
    if (name && name.trim()) {
      const res = store.addTournamentRound(name.trim());
      if (res.success) {
        this.syncTeamsFromStore(true);
        this.renderTournamentView();
        if (window.app) window.app.showToast(`New round created: ${res.round.name}`, 'success');
      }
    }
  }

  renameRound(roundId, newName) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (!newName || !newName.trim()) return;
    store.updateTournamentRound(roundId, { name: newName.trim() });
    this.renderTournamentView();
  }

  toggleRoundLock(roundId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    const res = store.toggleLockTournamentRound(roundId);
    if (res.success && window.app) {
      window.app.showToast(res.isLocked ? `🔒 "${res.round.name}" locked` : `🔓 "${res.round.name}" unlocked`, res.isLocked ? 'sold' : 'info');
    }
    this.renderTournamentView();
  }

  deleteRound(roundId) {
    const { currentUser, tournamentRounds = [] } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    const targetRound = tournamentRounds.find((r) => r.id === roundId);
    const roundName = targetRound ? targetRound.name : 'this round';
    if (confirm(`Are you sure you want to delete round "${roundName}" and all its matchups?`)) {
      const res = store.deleteTournamentRound(roundId);
      if (res.success) {
        this.syncTeamsFromStore(true);
        this.renderTournamentView();
        if (window.app) window.app.showToast(`Round "${roundName}" deleted successfully`, 'info');
      } else if (window.app) {
        window.app.showToast(res.message || 'Could not delete round', 'warning');
      }
    }
  }

  promptDeleteRound() {
    const { currentUser, tournamentRounds = [], activeTournamentRoundId } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (tournamentRounds.length <= 1) {
      if (window.app) window.app.showToast('At least one round must remain in the tournament', 'warning');
      return;
    }
    const activeRound = tournamentRounds.find((r) => r.id === activeTournamentRoundId) || tournamentRounds[0];
    this.deleteRound(activeRound.id);
  }

  clearCurrentRoundMatchups(roundId) {
    const { currentUser } = store.getState();
    if (!currentUser?.isAuthenticated) return;
    if (confirm('Clear all matchups for this round?')) {
      store.clearTournamentMatchups(roundId);
      this.syncTeamsFromStore(true);
      this.renderTournamentView();
      if (window.app) window.app.showToast('Round matchups cleared', 'info');
    }
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

    const {
      currentUser,
      tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }],
      activeTournamentRoundId = 'round_qualifiers',
      tournamentMatchups = []
    } = store.getState();

    const isAdmin = Boolean(currentUser && currentUser.isAuthenticated);
    const allTeams = this.getAllAvailableTeams();

    if (this.localSelectedRoundId && !tournamentRounds.some((r) => r.id === this.localSelectedRoundId)) {
      this.localSelectedRoundId = null;
    }

    const activeRoundId = isAdmin 
      ? (activeTournamentRoundId || tournamentRounds[0]?.id)
      : (this.localSelectedRoundId || activeTournamentRoundId || tournamentRounds[0]?.id);

    const activeRound = tournamentRounds.find((r) => r.id === activeRoundId) || tournamentRounds[0];
    const currentRoundMatchups = tournamentMatchups.filter((m) => (m.roundId || tournamentRounds[0]?.id) === activeRound.id);

    const confirmedTeamIds = new Set();
    currentRoundMatchups.forEach((m) => {
      if (m.team1?.id) confirmedTeamIds.add(m.team1.id);
      if (m.team2?.id) confirmedTeamIds.add(m.team2.id);
    });

    // --- SPECTATOR / VIEWER DEDICATED VIEW (WITH REAL-TIME HEAD-TO-HEAD SLOTS) ---
    if (!isAdmin) {
      container.innerHTML = `
        <div style="max-width: 980px; margin: 0 auto; display:flex; flex-direction:column; gap:1.25rem;">
          
          <!-- LIVE HEAD-TO-HEAD ACTIVE DRAW SLOTS (REAL-TIME SYNC FROM ADMIN) -->
          <div class="glass-card current-matchup-card" style="padding: 1.25rem 1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.85rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-cyan);">ACTIVE DRAW</span>
                <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase; margin:0;">
                  Head-to-Head Draw Slots
                </h3>
              </div>
              <div class="box-team-counter-badge" style="background:rgba(0, 229, 255, 0.08); border:1px solid var(--border-cyan); padding:0.35rem 0.85rem; border-radius:var(--radius-pill); font-family:var(--font-display); font-size:0.8rem; color:#fff; display:flex; align-items:center; gap:0.4rem;">
                <span>📦</span> Teams in Box: <strong style="color:var(--accent-cyan);">${this.activeBoxTeams.length}</strong> / ${allTeams.length}
              </div>
            </div>

            <!-- Face-Off Visual Slots (Live Synchronized from Admin) -->
            <div class="face-off-versus-slots">
              <!-- Slot 1: Team 1 -->
              <div class="face-off-slot ${this.pendingTeam1 ? 'filled' : 'empty'}" style="${this.pendingTeam1 ? `border-color:${this.pendingTeam1.color};` : ''}">
                ${this.pendingTeam1 ? `
                  <span class="slot-badge-label">CREW 1</span>
                  <div class="slot-team-content" style="cursor:pointer;" onclick="window.app.inspectTeamRoster('${this.pendingTeam1.id}')" title="Click to view ${this.pendingTeam1.name} player roster">
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

              <!-- Slot 2: Team 2 -->
              <div class="face-off-slot ${this.pendingTeam2 ? 'filled' : 'empty'}" style="${this.pendingTeam2 ? `border-color:${this.pendingTeam2.color};` : ''}">
                ${this.pendingTeam2 ? `
                  <span class="slot-badge-label">CREW 2</span>
                  <div class="slot-team-content" style="cursor:pointer;" onclick="window.app.inspectTeamRoster('${this.pendingTeam2.id}')" title="Click to view ${this.pendingTeam2.name} player roster">
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

            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.75rem;">
              ${!this.pendingTeam1 ? 'Waiting for Race Control Admin to draw Crew 1 from vault...' : (!this.pendingTeam2 ? 'Crew 1 drawn! Waiting for opposing Crew 2 draw...' : 'Matchup formed! Locking fixture into official board...')}
            </div>
          </div>

          <!-- SAVED OFFICIAL TOURNAMENT FIXTURES BOARD -->
          <div class="glass-card matchups-board-card" style="padding: 1.5rem;">
            
            <!-- Tournament Rounds Navigation / Switcher Pills Bar -->
            <div class="tournament-rounds-pills-bar" style="margin-bottom: 1.25rem;">
              ${tournamentRounds.map((r) => {
                const count = tournamentMatchups.filter((m) => (m.roundId || tournamentRounds[0]?.id) === r.id).length;
                const isSelected = r.id === activeRound.id;
                return `
                  <button class="round-pill-tab ${isSelected ? 'active' : ''} ${r.isLocked ? 'locked-round' : ''}" 
                          onclick="window.tournamentBox.selectRound('${r.id}')"
                          title="${r.name} (${count} matches)">
                    ${r.isLocked ? '🔒 ' : ''}${r.name} (${count})
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Active Round Section Header -->
            <div class="section-header" style="margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div class="section-title-wrap" style="align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">OFFICIAL FIXTURES</span>
                <h3 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; text-transform:uppercase; margin:0;">
                  ${activeRound.name} <span style="color:var(--text-muted); font-size:0.95rem;">(${currentRoundMatchups.length})</span>
                </h3>
                ${activeRound.isLocked ? `
                  <span class="round-locked-banner">🔒 LOCKED</span>
                ` : ''}
              </div>

              <div style="font-size:0.75rem; color:var(--text-muted);">
                Tap team name to inspect driver roster
              </div>
            </div>

            <!-- Fixtures List for Active Round -->
            ${currentRoundMatchups.length === 0 ? `
              <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted); font-size:0.9rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md); background:rgba(7, 10, 16, 0.4);">
                <div style="font-size:2.2rem; margin-bottom:0.5rem;">🏁</div>
                No face-off matchups created yet for <strong>${activeRound.name}</strong>.<br>
                <span style="font-size:0.82rem; color:var(--text-muted); margin-top:0.35rem; display:inline-block;">Waiting for Race Control Admin to draw match fixtures.</span>
              </div>
            ` : `
              <div class="matchups-fixtures-list">
                ${currentRoundMatchups.map((m) => `
                  <div class="matchup-fixture-row ${m.winnerId ? 'has-winner' : ''}">
                    <div class="fixture-number-badge">
                      MATCH #${m.matchNumber}
                    </div>

                    <div class="fixture-teams-versus">
                      <!-- Team 1 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team1.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team1.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team1.color}; cursor:pointer;" 
                           onclick="window.app.inspectTeamRoster('${m.team1.id}')" 
                           title="Click to view ${m.team1.name} player roster">
                        <span class="fixture-team-name">
                          ${m.team1.name}
                        </span>
                        ${m.winnerId === m.team1.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>

                      <span class="fixture-vs-text">VS</span>

                      <!-- Team 2 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team2.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team2.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team2.color}; cursor:pointer;" 
                           onclick="window.app.inspectTeamRoster('${m.team2.id}')" 
                           title="Click to view ${m.team2.name} player roster">
                        <span class="fixture-team-name">
                          ${m.team2.name}
                        </span>
                        ${m.winnerId === m.team2.id ? '<span class="winner-crown">👑 WINNER</span>' : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
      return;
    }

    // Main Mystery Box Button and Status progression text (Simple, Clean, Professional)
    let ctaButtonText = '';
    if (activeRound.isLocked) {
      ctaButtonText = 'ROUND LOCKED';
    } else if (this.isDrawing) {
      ctaButtonText = this.boxState === 'shaking' ? 'SHAKING...' : 'OPENING...';
    } else if (this.isCooldown) {
      ctaButtonText = `WAITING ${this.cooldownSeconds}s`;
    } else if (this.activeBoxTeams.length === 0) {
      ctaButtonText = 'BOX EMPTY';
    } else if (!this.pendingTeam1) {
      ctaButtonText = 'OPEN FOR CREW 1';
    } else {
      ctaButtonText = 'OPEN FOR CREW 2';
    }

    let vaultCenterText = '';
    if (activeRound.isLocked) {
      vaultCenterText = 'ROUND LOCKED';
    } else if (this.isDrawing) {
      vaultCenterText = this.boxState === 'shaking' ? 'SHAKING...' : 'OPENING...';
    } else if (this.isCooldown) {
      vaultCenterText = `WAITING ${this.cooldownSeconds}s`;
    } else if (!this.pendingTeam1) {
      vaultCenterText = 'OPEN FOR CREW 1';
    } else {
      vaultCenterText = 'OPEN FOR CREW 2';
    }

    let helperSubtitleText = '';
    if (activeRound.isLocked) {
      helperSubtitleText = 'Round is locked';
    } else if (this.isDrawing) {
      helperSubtitleText = this.boxState === 'shaking' ? 'Shaking...' : 'Opening...';
    } else if (this.isCooldown) {
      helperSubtitleText = `Waiting ${this.cooldownSeconds}s before next draw`;
    } else if (!this.pendingTeam1) {
      helperSubtitleText = 'Open for Crew 1';
    } else if (!this.pendingTeam2) {
      helperSubtitleText = 'Open for Crew 2';
    } else {
      helperSubtitleText = 'Matchup formed';
    }

    // --- ADMIN VIEW (FULL STUDIO WITH MYSTERY BOX & DRAW SLOTS) ---
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
                Mystery Team Box
              </h3>
            </div>
            <div class="box-team-counter-badge">
              <span>📦</span> ${this.activeBoxTeams.length} Teams In Box
            </div>
          </div>

          <!-- The 3D Interactive Mystery Vault Box -->
          <div class="vault-stage-wrapper">
            <div class="mystery-vault-box ${this.boxState === 'shaking' ? 'is-shaking' : ''} ${this.boxState === 'open' ? 'is-open' : ''} ${this.isDrawing ? 'is-busy' : ''} ${this.isCooldown ? 'is-cooldown' : ''}" 
                 style="${!isAdmin || activeRound.isLocked || this.isDrawing || this.isCooldown ? 'cursor:not-allowed;' : ''}"
                 onclick="${activeRound.isLocked || this.isDrawing || this.isCooldown ? '' : 'window.tournamentBox.triggerBoxDraw()'}" 
                 title="${activeRound.isLocked ? 'This round is locked' : (this.isCooldown ? `Please wait ${this.cooldownSeconds}s before next draw` : 'Click to Open the Box!')}">
              
              <!-- Lid -->
              <div class="vault-lid"></div>

              <!-- Base Chamber -->
              <div class="vault-base">
                <div class="vault-core-emblem">${activeRound.isLocked ? '🔒' : (this.isCooldown ? '⏳' : '🏎️')}</div>
                <div class="vault-core-label">${vaultCenterText}</div>
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
            <button class="btn btn-cyan btn-lg open-box-cta-btn" onclick="window.tournamentBox.triggerBoxDraw()" ${this.activeBoxTeams.length < 1 || this.isDrawing || this.isCooldown || activeRound.isLocked ? 'disabled' : ''} style="${activeRound.isLocked ? 'background:rgba(255,184,0,0.15); border-color:var(--accent-gold); color:var(--accent-gold); cursor:not-allowed;' : (this.isCooldown ? 'opacity:0.75; cursor:not-allowed;' : '')}">
              ${ctaButtonText}
            </button>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <span style="font-size:0.78rem; color:var(--text-muted);">
                ${helperSubtitleText}
              </span>
              <button class="btn btn-outline btn-sm" onclick="window.tournamentBox.resetBoxPool()" title="Refill box with all un-matched teams for this round" ${this.isDrawing || this.isCooldown || activeRound.isLocked ? 'disabled' : ''}>
                Refill Box
              </button>
            </div>
          </div>

          <!-- ADMIN ONLY: BOX TEAMS LIST -->
          ${isAdmin ? `
            <div class="box-teams-manager-card">
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:0.5rem;">
                <span style="font-family:var(--font-display); font-size:0.95rem; font-weight:800; color:#fff; text-transform:uppercase; letter-spacing:0.5px;">
                  📦 Teams in Box (${this.activeBoxTeams.length}/${allTeams.length})
                </span>
              </div>

              <!-- Roster List of Teams with Checkbox & Delete -->
              <div style="display:flex; flex-direction:column; gap:0.45rem; max-height:240px; overflow-y:auto; padding-right:0.3rem; margin-top:0.3rem;">
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

                      <button class="btn-icon" style="color:var(--text-muted); width:26px; height:26px; font-size:0.78rem;" onclick="window.tournamentBox.deleteTeamPermanently('${t.id}')" title="Delete ${t.name}">
                        🗑️
                      </button>

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
                  <div class="slot-team-content" style="cursor:pointer;" onclick="window.app.inspectTeamRoster('${this.pendingTeam1.id}')" title="Click to view ${this.pendingTeam1.name} player roster">
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
                  <div class="slot-team-content" style="cursor:pointer;" onclick="window.app.inspectTeamRoster('${this.pendingTeam2.id}')" title="Click to view ${this.pendingTeam2.name} player roster">
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
                  ${activeRound.isLocked ? '🔒 Round is locked' : (!this.pendingTeam1 ? 'Click box on left to draw first crew' : (!this.pendingTeam2 ? 'Click box again to draw opposing crew' : '✅ Matchup locked & broadcasted!'))}
                </div>
                <div style="display:flex; gap:0.5rem;">
                  ${this.pendingTeam1 || this.pendingTeam2 ? `
                    <button class="btn btn-outline btn-sm" onclick="window.tournamentBox.clearSlots()">
                      Clear Selection
                    </button>
                  ` : ''}
                  ${this.pendingTeam1 && this.pendingTeam2 && !activeRound.isLocked ? `
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
            
            <!-- Tournament Rounds Navigation / Switcher Pills Bar -->
            <div class="tournament-rounds-pills-bar">
              ${tournamentRounds.map((r) => {
                const count = tournamentMatchups.filter((m) => (m.roundId || tournamentRounds[0].id) === r.id).length;
                const isSelected = r.id === activeRound.id;
                return `
                  <button class="round-pill-tab ${isSelected ? 'active' : ''} ${r.isLocked ? 'locked-round' : ''}" 
                          onclick="window.tournamentBox.selectRound('${r.id}')"
                          title="${r.name} (${count} matches)">
                    <span>${r.isLocked ? '🔒 ' : ''}${r.name} (${count})</span>
                    ${isAdmin && tournamentRounds.length > 1 ? `
                      <span class="round-pill-inline-close" onclick="event.stopPropagation(); window.tournamentBox.deleteRound('${r.id}')" title="Delete ${r.name}">✕</span>
                    ` : ''}
                  </button>
                `;
              }).join('')}

              ${isAdmin ? `
                <button class="round-pill-tab-add" onclick="window.tournamentBox.promptAddRound()" title="Add a new tournament round">
                  + Add Round
                </button>
                ${tournamentRounds.length > 1 ? `
                  <button class="round-pill-tab-delete" onclick="window.tournamentBox.promptDeleteRound()" title="Delete active round (${activeRound.name})">
                    🗑️ - Delete Round
                  </button>
                ` : ''}
              ` : ''}
            </div>

            <!-- Active Round Section Header -->
            <div class="section-header" style="margin-bottom:0.85rem; flex-wrap:wrap; gap:0.5rem;">
              <div class="section-title-wrap" style="align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <span class="section-tag" style="font-size:0.7rem; color:var(--accent-gold);">OFFICIAL FIXTURES</span>
                
                ${isAdmin ? `
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <input type="text" class="round-name-inline-input" value="${activeRound.name}" 
                           onchange="window.tournamentBox.renameRound('${activeRound.id}', this.value)" 
                           title="Click to rename round">
                    <span style="font-family:var(--font-display); font-size:1.1rem; color:var(--text-muted); font-weight:800;">
                      (${currentRoundMatchups.length})
                    </span>
                  </div>
                ` : `
                  <h3 style="font-family:var(--font-display); font-size:1.1rem; color:#fff; text-transform:uppercase;">
                    ${activeRound.name} (${currentRoundMatchups.length})
                  </h3>
                `}

                ${activeRound.isLocked ? `
                  <span class="round-locked-banner">🔒 LOCKED</span>
                ` : ''}
              </div>

              <!-- Admin Controls for Round -->
              ${isAdmin ? `
                <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
                  <button class="btn btn-sm ${activeRound.isLocked ? 'btn-gold' : 'btn-outline'}" 
                          style="font-size:0.75rem; padding:0.3rem 0.65rem;"
                          onclick="window.tournamentBox.toggleRoundLock('${activeRound.id}')"
                          title="${activeRound.isLocked ? 'Click to Unlock Round' : 'Click to Lock Round'}">
                    ${activeRound.isLocked ? '🔒 Locked' : '🔓 Lock Round'}
                  </button>
                  
                  ${currentRoundMatchups.length > 0 ? `
                    <button class="btn btn-danger btn-sm" style="font-size:0.72rem; padding:0.3rem 0.6rem;" 
                            onclick="window.tournamentBox.clearCurrentRoundMatchups('${activeRound.id}')" 
                            title="Clear all match fixtures for this round">
                      🗑️ Clear Matches
                    </button>
                  ` : ''}

                  ${tournamentRounds.length > 1 ? `
                    <button class="btn btn-danger btn-sm" style="font-size:0.72rem; padding:0.3rem 0.65rem; background:rgba(255,23,68,0.15); border-color:var(--accent-red); color:var(--accent-red);" 
                            onclick="window.tournamentBox.deleteRound('${activeRound.id}')" 
                            title="Delete this round (${activeRound.name})">
                      🗑️ Delete Round
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            <!-- Fixtures List for Active Round -->
            ${currentRoundMatchups.length === 0 ? `
              <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                <div style="font-size:1.8rem; margin-bottom:0.3rem;">🏁</div>
                No face-off matchups created yet for <strong>${activeRound.name}</strong>.<br>
                ${isAdmin ? (activeRound.isLocked ? 'This round is locked. Unlock it to draw matchups.' : 'Open the box on the left to draw teams and create 2-team race fixtures.') : 'Waiting for Race Control Admin to draw match fixtures.'}
              </div>
            ` : `
              <div class="matchups-fixtures-list">
                ${currentRoundMatchups.map((m) => `
                  <div class="matchup-fixture-row ${m.winnerId ? 'has-winner' : ''}">
                    <div class="fixture-number-badge">
                      MATCH #${m.matchNumber}
                    </div>

                    <div class="fixture-teams-versus">
                      <!-- Team 1 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team1.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team1.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team1.color}; cursor:pointer;" 
                           onclick="${!isAdmin ? `window.app.inspectTeamRoster('${m.team1.id}')` : ''}" 
                           title="${!isAdmin ? `Click to view ${m.team1.name} player roster` : ''}">
                        <span class="fixture-team-name" onclick="${isAdmin ? `event.stopPropagation(); window.app.inspectTeamRoster('${m.team1.id}')` : ''}" title="Click to view player roster">
                          ${m.team1.name}
                        </span>
                        ${isAdmin ? `
                          <button class="winner-toggle-badge ${m.winnerId === m.team1.id ? 'is-active' : ''}" 
                                  onclick="event.stopPropagation(); window.tournamentBox.toggleWinner('${m.id}', '${m.team1.id}')" 
                                  title="${m.winnerId === m.team1.id ? 'Winner (Click to unset)' : 'Click to declare winner'}">
                            ${m.winnerId === m.team1.id ? '👑 WINNER' : '🏆'}
                          </button>
                        ` : (m.winnerId === m.team1.id ? '<span class="winner-crown">👑 WINNER</span>' : '')}
                      </div>

                      <span class="fixture-vs-text">VS</span>

                      <!-- Team 2 -->
                      <div class="fixture-team-pill ${m.winnerId === m.team2.id ? 'is-winner' : (m.winnerId && m.winnerId !== m.team2.id ? 'is-eliminated' : '')}" 
                           style="border-left: 3px solid ${m.team2.color}; cursor:pointer;" 
                           onclick="${!isAdmin ? `window.app.inspectTeamRoster('${m.team2.id}')` : ''}" 
                           title="${!isAdmin ? `Click to view ${m.team2.name} player roster` : ''}">
                        <span class="fixture-team-name" onclick="${isAdmin ? `event.stopPropagation(); window.app.inspectTeamRoster('${m.team2.id}')` : ''}" title="Click to view player roster">
                          ${m.team2.name}
                        </span>
                        ${isAdmin ? `
                          <button class="winner-toggle-badge ${m.winnerId === m.team2.id ? 'is-active' : ''}" 
                                  onclick="event.stopPropagation(); window.tournamentBox.toggleWinner('${m.id}', '${m.team2.id}')" 
                                  title="${m.winnerId === m.team2.id ? 'Winner (Click to unset)' : 'Click to declare winner'}">
                            ${m.winnerId === m.team2.id ? '👑 WINNER' : '🏆'}
                          </button>
                        ` : (m.winnerId === m.team2.id ? '<span class="winner-crown">👑 WINNER</span>' : '')}
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
