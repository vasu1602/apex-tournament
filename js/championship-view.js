import { store, POSITION_POINTS_MAP } from './state.js';
import { soundFX } from './audio.js';

class ChampionshipView {
  constructor() {
    this.selectedMatchId = null;
    this.selectedRoundId = null;
    this.localPositions = {}; // { [driverKey]: '1st' | '2nd' | ... | 'DNF' }
    this.sortByRank = false;
  }

  init() {
    // Initializer if needed
  }

  getPointsForPosition(pos) {
    if (!pos) return 0;
    return POSITION_POINTS_MAP[pos] !== undefined ? POSITION_POINTS_MAP[pos] : 0;
  }

  selectMatch(matchId) {
    this.selectedMatchId = matchId;
    this.localPositions = {};
    this.sortByRank = false;
    this.renderChampionshipView();
  }

  selectRound(roundId) {
    this.selectedRoundId = roundId;
    this.selectedMatchId = null;
    this.localPositions = {};
    this.renderChampionshipView();
  }

  handlePositionChange(driverKey, newPos) {
    this.localPositions[driverKey] = newPos;
    // Auto-update match scoring in real time
    this.saveCurrentMatchScoring(false);
  }

  toggleAutoSort() {
    this.sortByRank = !this.sortByRank;
    this.renderChampionshipView();
  }

  saveCurrentMatchScoring(showToast = true) {
    const { tournamentMatchups = [], teams = [], racers = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    const team1 = this.resolveTeam(currentMatch.team1, teams);
    const team2 = this.resolveTeam(currentMatch.team2, teams);
    const crew1Drivers = this.getTeamDrivers(team1, racers);
    const crew2Drivers = this.getTeamDrivers(team2, racers);

    const mergedPositions = { ...(currentMatch.driverPositions || {}), ...this.localPositions };

    // Calculate totals
    let score1 = 0;
    crew1Drivers.forEach((d) => {
      const key = `${team1.id}_${d.id || d.name}`;
      const pos = mergedPositions[key] || '';
      score1 += this.getPointsForPosition(pos);
    });

    let score2 = 0;
    crew2Drivers.forEach((d) => {
      const key = `${team2.id}_${d.id || d.name}`;
      const pos = mergedPositions[key] || '';
      score2 += this.getPointsForPosition(pos);
    });

    let winnerTeamId = currentMatch.winnerTeamId || null;
    if (currentMatch.isLocked) {
      if (score1 > score2) winnerTeamId = team1.id;
      else if (score2 > score1) winnerTeamId = team2.id;
      else winnerTeamId = null;
    }

    const res = store.updateMatchScoring(currentMatch.id, {
      driverPositions: mergedPositions,
      team1Score: score1,
      team2Score: score2,
      winnerTeamId
    });

    if (res.success) {
      if (showToast && window.app) {
        soundFX.play('bid');
        window.app.showToast('Match scores updated & synced to live viewers!', 'success');
      }
      this.renderChampionshipView();
    }
  }

  toggleLockActiveMatch() {
    const { tournamentMatchups = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    const nextLockState = !currentMatch.isLocked;
    const res = store.lockMatchup(currentMatch.id, nextLockState);
    if (res.success && window.app) {
      soundFX.play(nextLockState ? 'gavel' : 'click');
      window.app.showToast(nextLockState ? `🔒 Match #${currentMatch.matchNumber || 1} locked & winner finalized!` : `🔓 Match #${currentMatch.matchNumber || 1} unlocked`, nextLockState ? 'sold' : 'info');
      this.renderChampionshipView();
    }
  }

  resetCurrentMatchPositions() {
    const { tournamentMatchups = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    if (confirm('Reset all driver finishing positions for this match?')) {
      this.localPositions = {};
      store.updateMatchScoring(currentMatch.id, {
        driverPositions: {},
        team1Score: 0,
        team2Score: 0,
        winnerTeamId: null,
        isLocked: false
      });
      if (window.app) window.app.showToast('Finishing positions cleared', 'info');
      this.renderChampionshipView();
    }
  }

  resolveTeam(teamInput, allTeams) {
    if (!teamInput) return { id: 'team_unknown', name: 'Unknown Crew', color: '#00e5ff', roster: [] };
    if (typeof teamInput === 'object') {
      const matched = allTeams.find(t => t.id === teamInput.id || t.name === teamInput.name);
      return matched || teamInput;
    }
    return allTeams.find(t => t.id === teamInput) || { id: teamInput, name: 'Team ' + teamInput, color: '#00e5ff', roster: [] };
  }

  getTeamDrivers(team, allRacers) {
    if (!team) return [];
    let drivers = [];
    if (Array.isArray(team.roster) && team.roster.length > 0) {
      drivers = [...team.roster];
    } else {
      // Find racers marked sold to this team
      drivers = allRacers.filter(r => r && r.soldToTeamId === team.id);
    }

    // If team has fewer than 5 drivers, fill placeholder slots so 5 driver positions can be scored
    const targetSlots = Math.max(5, drivers.length);
    const result = [];
    for (let i = 0; i < targetSlots; i++) {
      if (drivers[i]) {
        result.push(drivers[i]);
      } else {
        result.push({
          id: `driver_${team.id}_slot_${i + 1}`,
          name: `${team.name || 'Driver'} #${i + 1}`,
          isPlaceholder: true
        });
      }
    }
    return result;
  }

  getActiveMatch(allMatchups) {
    if (!allMatchups || allMatchups.length === 0) return null;
    if (this.selectedMatchId) {
      const match = allMatchups.find(m => m.id === this.selectedMatchId);
      if (match) return match;
    }
    return allMatchups[0];
  }

  renderChampionshipView(containerId = 'championship-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const state = store.getState() || {};
      const {
        tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }],
        tournamentMatchups = [],
        teams = [],
        racers = [],
        currentUser = { isAuthenticated: false, role: 'viewer', adminName: 'Spectator' }
      } = state;

      const isAdmin = Boolean(currentUser.isAuthenticated);
      const activeMatch = this.getActiveMatch(tournamentMatchups);

      // Resolve teams for active match
      let team1 = null;
      let team2 = null;
      let crew1Drivers = [];
      let crew2Drivers = [];
      let score1 = 0;
      let score2 = 0;
      const mergedPositions = activeMatch ? { ...(activeMatch.driverPositions || {}), ...this.localPositions } : {};

      if (activeMatch) {
        team1 = this.resolveTeam(activeMatch.team1, teams);
        team2 = this.resolveTeam(activeMatch.team2, teams);
        crew1Drivers = this.getTeamDrivers(team1, racers);
        crew2Drivers = this.getTeamDrivers(team2, racers);

        // Compute scores
        crew1Drivers.forEach((d) => {
          const key = `${team1.id}_${d.id || d.name}`;
          const pos = mergedPositions[key] || '';
          score1 += this.getPointsForPosition(pos);
        });

        crew2Drivers.forEach((d) => {
          const key = `${team2.id}_${d.id || d.name}`;
          const pos = mergedPositions[key] || '';
          score2 += this.getPointsForPosition(pos);
        });

        // Apply auto-sort if active
        if (this.sortByRank) {
          const getRankOrder = (pos) => {
            if (!pos) return 999;
            if (pos === 'DNF') return 900;
            const num = parseInt(pos.replace(/\D/g, ''), 10);
            return isNaN(num) ? 999 : num;
          };

          crew1Drivers.sort((a, b) => {
            const posA = mergedPositions[`${team1.id}_${a.id || a.name}`] || '';
            const posB = mergedPositions[`${team1.id}_${b.id || b.name}`] || '';
            return getRankOrder(posA) - getRankOrder(posB);
          });

          crew2Drivers.sort((a, b) => {
            const posA = mergedPositions[`${team2.id}_${a.id || a.name}`] || '';
            const posB = mergedPositions[`${team2.id}_${b.id || b.name}`] || '';
            return getRankOrder(posA) - getRankOrder(posB);
          });
        }
      }

      // Calculate global tournament leaderboard
      const leaderboardMap = {};
      teams.forEach(t => {
        leaderboardMap[t.id] = {
          team: t,
          totalPoints: 0,
          matchesPlayed: 0,
          matchesWon: 0
        };
      });

      tournamentMatchups.forEach(m => {
        const t1 = this.resolveTeam(m.team1, teams);
        const t2 = this.resolveTeam(m.team2, teams);
        const s1 = Number(m.team1Score) || 0;
        const s2 = Number(m.team2Score) || 0;

        if (leaderboardMap[t1.id]) {
          leaderboardMap[t1.id].totalPoints += s1;
          if (m.isLocked || s1 > 0 || s2 > 0) leaderboardMap[t1.id].matchesPlayed += 1;
          if (m.winnerTeamId === t1.id || (m.isLocked && s1 > s2)) leaderboardMap[t1.id].matchesWon += 1;
        }
        if (leaderboardMap[t2.id]) {
          leaderboardMap[t2.id].totalPoints += s2;
          if (m.isLocked || s1 > 0 || s2 > 0) leaderboardMap[t2.id].matchesPlayed += 1;
          if (m.winnerTeamId === t2.id || (m.isLocked && s2 > s1)) leaderboardMap[t2.id].matchesWon += 1;
        }
      });

      const sortedLeaderboard = Object.values(leaderboardMap).sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return b.matchesWon - a.matchesWon;
      });

      const positionOptions = [
        { value: '', label: '-- Pos --', pts: 0 },
        { value: '1st', label: '1st (+25 PTS)', pts: 25 },
        { value: '2nd', label: '2nd (+18 PTS)', pts: 18 },
        { value: '3rd', label: '3rd (+15 PTS)', pts: 15 },
        { value: '4th', label: '4th (+12 PTS)', pts: 12 },
        { value: '5th', label: '5th (+10 PTS)', pts: 10 },
        { value: '6th', label: '6th (+8 PTS)', pts: 8 },
        { value: '7th', label: '7th (+6 PTS)', pts: 6 },
        { value: '8th', label: '8th (+4 PTS)', pts: 4 },
        { value: '9th', label: '9th (+2 PTS)', pts: 2 },
        { value: '10th', label: '10th (+1 PTS)', pts: 1 },
        { value: 'DNF', label: 'DNF (0 PTS)', pts: 0 }
      ];

      // Build HTML
      let scoringHubHtml = '';

      if (isAdmin) {
        scoringHubHtml = `
          <!-- [ LIVE OP ] MATCH RESULTS & SCORING HUB -->
          <div class="glass-card" style="border-top: 3px solid var(--accent-red); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            
            <!-- Top Controls Row -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem;">
              <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <span class="section-tag" style="background:rgba(255,59,92,0.15); color:var(--accent-red); border-color:rgba(255,59,92,0.3); font-weight:800; font-size:0.75rem;">
                  LIVE OP
                </span>
                <h3 style="font-family:var(--font-display); font-size:1.25rem; color:#fff; text-transform:uppercase; margin:0; letter-spacing:1px;">
                  Match Results & Scoring Hub
                </h3>
              </div>

              <!-- Match & Round Selectors -->
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                ${tournamentMatchups.length > 0 ? `
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <label style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE MATCH:</label>
                    <select class="form-select" style="min-width:260px; font-size:0.85rem; padding:0.4rem 0.75rem;" onchange="window.championshipView.selectMatch(this.value)">
                      ${tournamentMatchups.map((m, idx) => {
                        const t1 = this.resolveTeam(m.team1, teams);
                        const t2 = this.resolveTeam(m.team2, teams);
                        return `
                          <option value="${m.id}" ${activeMatch && activeMatch.id === m.id ? 'selected' : ''}>
                            Match ${m.matchNumber || (idx + 1)}: ${t1.name} vs ${t2.name} ${m.isLocked ? '🔒 [Locked]' : ''}
                          </option>
                        `;
                      }).join('')}
                    </select>
                  </div>
                ` : `
                  <span style="font-size:0.8rem; color:var(--text-muted);">No matchups drawn yet.</span>
                `}

                ${activeMatch ? `
                  <button class="btn ${activeMatch.isLocked ? 'btn-gold' : 'btn-outline'} btn-sm" style="font-size:0.8rem; padding:0.45rem 0.85rem; font-weight:800;" onclick="window.championshipView.toggleLockActiveMatch()">
                    ${activeMatch.isLocked ? '🔓 UNLOCK MATCH' : '🔒 LOCK MATCH'}
                  </button>
                ` : ''}
              </div>
            </div>

            ${activeMatch && team1 && team2 ? `
              <!-- CREW 1 & CREW 2 HEAD-TO-HEAD SCORING ARENA -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.25rem;">
                
                <!-- CREW 1 (Green / Team 1 Corner) -->
                <div style="background: rgba(10, 14, 22, 0.85); border: 2px solid ${team1.color || '#00e5ff'}; border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 0 20px ${team1.color || '#00e5ff'}22;">
                  
                  <!-- Crew Header -->
                  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.65rem;">
                      <div style="width:34px; height:34px; border-radius:var(--radius-sm); border:2px solid ${team1.color || '#00e5ff'}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);">
                        ${team1.logoUrl ? `<img src="${team1.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${team1.logoIcon || '🏎️'}</span>`}
                      </div>
                      <div>
                        <span style="font-size:0.68rem; color:${team1.color || '#00e5ff'}; font-weight:800; text-transform:uppercase; letter-spacing:1px;">CREW 1 (Corner 1)</span>
                        <h4 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; margin:0;">${team1.name}</h4>
                      </div>
                    </div>

                    <div style="text-align:right;">
                      <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">CREW TOTAL</span>
                      <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team1.color || '#00e5ff'};">
                        ${score1} PTS
                      </div>
                    </div>
                  </div>

                  <!-- Driver Position Rows -->
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${crew1Drivers.map((driver) => {
                      const driverKey = `${team1.id}_${driver.id || driver.name}`;
                      const currentPos = mergedPositions[driverKey] || '';
                      const pts = this.getPointsForPosition(currentPos);
                      const ptsColor = pts > 0 ? 'var(--accent-gold)' : (currentPos === 'DNF' ? 'var(--accent-red)' : 'var(--text-muted)');

                      return `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(18,23,36,0.6); padding:0.55rem 0.75rem; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); gap:0.5rem;">
                          <!-- Driver Identity -->
                          <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                            <span style="font-size:1rem;">🏎️</span>
                            <span style="font-family:var(--font-display); font-weight:700; font-size:0.9rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${driver.name || 'Driver'}
                            </span>
                          </div>

                          <!-- Position Select & Points -->
                          <div style="display:flex; align-items:center; gap:0.6rem;">
                            <select class="form-select" style="padding:0.25rem 0.5rem; font-size:0.8rem; font-weight:700; width:130px; background:rgba(10,14,22,0.9);" onchange="window.championshipView.handlePositionChange('${driverKey}', this.value)" ${activeMatch.isLocked ? 'disabled' : ''}>
                              ${positionOptions.map(opt => `
                                <option value="${opt.value}" ${currentPos === opt.value ? 'selected' : ''}>
                                  ${opt.label}
                                </option>
                              `).join('')}
                            </select>

                            <div style="font-family:var(--font-mono); font-weight:800; font-size:0.92rem; min-width:70px; text-align:right; color:${ptsColor};">
                              ${currentPos ? (currentPos === 'DNF' ? 'DNF (0)' : `+${pts} PTS`) : '0 PTS'}
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

                <!-- CREW 2 (Red / Team 2 Corner) -->
                <div style="background: rgba(10, 14, 22, 0.85); border: 2px solid ${team2.color || '#ff3b5c'}; border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 0 20px ${team2.color || '#ff3b5c'}22;">
                  
                  <!-- Crew Header -->
                  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.65rem;">
                      <div style="width:34px; height:34px; border-radius:var(--radius-sm); border:2px solid ${team2.color || '#ff3b5c'}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);">
                        ${team2.logoUrl ? `<img src="${team2.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${team2.logoIcon || '⚡'}</span>`}
                      </div>
                      <div>
                        <span style="font-size:0.68rem; color:${team2.color || '#ff3b5c'}; font-weight:800; text-transform:uppercase; letter-spacing:1px;">CREW 2 (Corner 2)</span>
                        <h4 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; margin:0;">${team2.name}</h4>
                      </div>
                    </div>

                    <div style="text-align:right;">
                      <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">CREW TOTAL</span>
                      <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team2.color || '#ff3b5c'};">
                        ${score2} PTS
                      </div>
                    </div>
                  </div>

                  <!-- Driver Position Rows -->
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${crew2Drivers.map((driver) => {
                      const driverKey = `${team2.id}_${driver.id || driver.name}`;
                      const currentPos = mergedPositions[driverKey] || '';
                      const pts = this.getPointsForPosition(currentPos);
                      const ptsColor = pts > 0 ? 'var(--accent-gold)' : (currentPos === 'DNF' ? 'var(--accent-red)' : 'var(--text-muted)');

                      return `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(18,23,36,0.6); padding:0.55rem 0.75rem; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); gap:0.5rem;">
                          <!-- Driver Identity -->
                          <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                            <span style="font-size:1rem;">🏎️</span>
                            <span style="font-family:var(--font-display); font-weight:700; font-size:0.9rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${driver.name || 'Driver'}
                            </span>
                          </div>

                          <!-- Position Select & Points -->
                          <div style="display:flex; align-items:center; gap:0.6rem;">
                            <select class="form-select" style="padding:0.25rem 0.5rem; font-size:0.8rem; font-weight:700; width:130px; background:rgba(10,14,22,0.9);" onchange="window.championshipView.handlePositionChange('${driverKey}', this.value)" ${activeMatch.isLocked ? 'disabled' : ''}>
                              ${positionOptions.map(opt => `
                                <option value="${opt.value}" ${currentPos === opt.value ? 'selected' : ''}>
                                  ${opt.label}
                                </option>
                              `).join('')}
                            </select>

                            <div style="font-family:var(--font-mono); font-weight:800; font-size:0.92rem; min-width:70px; text-align:right; color:${ptsColor};">
                              ${currentPos ? (currentPos === 'DNF' ? 'DNF (0)' : `+${pts} PTS`) : '0 PTS'}
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>

              <!-- Action Buttons Bar -->
              <div style="display:flex; justify-content:center; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:0.5rem; padding-top:0.75rem; border-top:1px solid var(--border-subtle);">
                <button class="btn ${this.sortByRank ? 'btn-gold' : 'btn-outline'}" style="font-size:0.85rem; padding:0.6rem 1.25rem;" onclick="window.championshipView.toggleAutoSort()">
                  ${this.sortByRank ? '✓ SORTED BY RANK' : 'AUTO-SORT BY RANK'}
                </button>
                <button class="btn btn-cyan" style="font-size:0.85rem; padding:0.6rem 1.5rem; font-weight:800;" onclick="window.championshipView.saveCurrentMatchScoring(true)">
                  UPDATE LIVE OVERLAY
                </button>
                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.4rem 0.75rem;" onclick="window.championshipView.resetCurrentMatchPositions()" title="Clear match positions">
                  Reset
                </button>
              </div>
            ` : `
              <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-secondary); background:rgba(10,14,22,0.4); border-radius:var(--radius-md); border:1px dashed var(--border-subtle);">
                <div style="font-size:2.5rem; margin-bottom:0.5rem;">🏁</div>
                <div style="font-size:1.1rem; font-weight:700; color:#fff;">No Active Matchup Found</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.35rem; max-width:480px; margin-left:auto; margin-right:auto;">
                  Draw team face-offs in the <strong>Match-ups</strong> tab or create tournament rounds to score matches.
                </div>
                <button class="btn btn-cyan" style="margin-top:1rem;" onclick="window.app.switchTab('tournament-view')">
                  Go to Match-ups
                </button>
              </div>
            `}
          </div>
        `;
      }

      // 2. LIVE LEADERBOARD PREVIEW (VISIBLE TO ADMIN & VIEWERS)
      const leaderboardHtml = `
        <!-- LIVE LEADERBOARD PREVIEW & TOURNAMENT STANDINGS -->
        <div class="glass-card" style="border-top: 3px solid var(--accent-gold); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
          
          <div class="section-header" style="margin-bottom:0;">
            <div class="section-title-wrap">
              <span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:rgba(255,215,0,0.3);">
                LIVE STANDINGS
              </span>
              <h3 class="section-title" style="font-size:1.25rem;">
                Tournament Championship Leaderboard
              </h3>
            </div>
            <span style="font-size:0.78rem; color:var(--text-muted);">${teams.length} Teams Competing</span>
          </div>

          ${activeMatch && team1 && team2 ? `
            <!-- Live Match Outcome Banner -->
            <div style="background:rgba(10,14,22,0.85); border:1px solid var(--border-gold); border-radius:var(--radius-md); padding:1rem 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="font-size:1.5rem;">🏁</span>
                <div>
                  <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">CURRENT MATCH PREVIEW</div>
                  <div style="font-family:var(--font-display); font-size:1.15rem; color:#fff;">
                    ${team1.name} <span style="font-family:var(--font-mono); color:${team1.color || '#00e5ff'}; font-weight:900;">(${score1} PTS)</span>
                    <span style="color:var(--text-muted); margin:0 0.4rem;">vs</span>
                    ${team2.name} <span style="font-family:var(--font-mono); color:${team2.color || '#ff3b5c'}; font-weight:900;">(${score2} PTS)</span>
                  </div>
                </div>
              </div>

              <div>
                ${score1 > score2 ? `
                  <span class="section-tag" style="background:rgba(0,255,136,0.15); color:#00ff88; border-color:#00ff8855; font-size:0.85rem; padding:0.4rem 0.85rem;">
                    🏆 #1 ${team1.name} (WINNER: ${score1} PTS)
                  </span>
                ` : score2 > score1 ? `
                  <span class="section-tag" style="background:rgba(0,255,136,0.15); color:#00ff88; border-color:#00ff8855; font-size:0.85rem; padding:0.4rem 0.85rem;">
                    🏆 #1 ${team2.name} (WINNER: ${score2} PTS)
                  </span>
                ` : `
                  <span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:var(--border-gold); font-size:0.85rem; padding:0.4rem 0.85rem;">
                    ⚔️ TIED MATCH (${score1} - ${score2})
                  </span>
                `}
              </div>
            </div>
          ` : ''}

          <!-- Overall Teams Standings Table -->
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); text-transform:uppercase; font-size:0.72rem; font-family:var(--font-display);">
                  <th style="padding:0.6rem 0.85rem;">Rank</th>
                  <th style="padding:0.6rem 0.85rem;">Racing Crew</th>
                  <th style="padding:0.6rem 0.85rem; text-align:center;">Matches</th>
                  <th style="padding:0.6rem 0.85rem; text-align:center;">Wins</th>
                  <th style="padding:0.6rem 0.85rem; text-align:right;">Championship Points</th>
                </tr>
              </thead>
              <tbody>
                ${sortedLeaderboard.length === 0 ? `
                  <tr>
                    <td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">
                      No racing teams created yet.
                    </td>
                  </tr>
                ` : sortedLeaderboard.map((item, idx) => {
                  const t = item.team;
                  const isFirst = idx === 0 && item.totalPoints > 0;
                  const rankColor = idx === 0 ? 'var(--accent-gold)' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : 'var(--text-muted)'));

                  return `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:${isFirst ? 'rgba(255,215,0,0.04)' : 'transparent'};">
                      <td style="padding:0.75rem 0.85rem; font-family:var(--font-mono); font-weight:800; font-size:1.1rem; color:${rankColor};">
                        #${idx + 1}
                      </td>
                      <td style="padding:0.75rem 0.85rem;">
                        <div style="display:flex; align-items:center; gap:0.65rem;">
                          <div style="width:28px; height:28px; border-radius:4px; border:1px solid ${t.color || '#00e5ff'}; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                            ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${t.logoIcon || '🏎️'}</span>`}
                          </div>
                          <span style="font-weight:700; color:#fff; font-size:0.95rem;">${t.name}</span>
                          ${isFirst ? `<span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:var(--border-gold); font-size:0.65rem; padding:0.1rem 0.4rem;">LEADER</span>` : ''}
                        </div>
                      </td>
                      <td style="padding:0.75rem 0.85rem; text-align:center; font-family:var(--font-mono); color:var(--text-secondary);">
                        ${item.matchesPlayed}
                      </td>
                      <td style="padding:0.75rem 0.85rem; text-align:center; font-family:var(--font-mono); color:var(--accent-green); font-weight:700;">
                        ${item.matchesWon}
                      </td>
                      <td style="padding:0.75rem 0.85rem; text-align:right;">
                        <span style="font-family:var(--font-mono); font-weight:900; font-size:1.15rem; color:${t.color || 'var(--accent-gold)'};">
                          ${item.totalPoints.toLocaleString()} PTS
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Viewer View if not admin
      let viewerFaceOffHtml = '';
      if (!isAdmin && activeMatch && team1 && team2) {
        viewerFaceOffHtml = `
          <!-- SPECTATOR LIVE MATCH SCOREBOARD -->
          <div class="glass-card" style="border-top:3px solid var(--accent-cyan); width:100%; padding:1.5rem; display:flex; flex-direction:column; gap:1.25rem;">
            <div class="section-header" style="margin-bottom:0;">
              <div class="section-title-wrap">
                <span class="section-tag" style="color:var(--accent-cyan);">LIVE MATCH ARENA</span>
                <h3 class="section-title" style="font-size:1.25rem;">
                  Match #${activeMatch.matchNumber || 1}: ${team1.name} vs ${team2.name}
                </h3>
              </div>
              ${activeMatch.isLocked ? `
                <span class="section-tag" style="background:rgba(0,255,136,0.15); color:#00ff88; border-color:#00ff8855;">
                  FINALIZED
                </span>
              ` : `
                <div class="live-indicator">
                  <div class="live-dot"></div>
                  <span>LIVE RACING</span>
                </div>
              `}
            </div>

            <!-- Corners -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
              <!-- Corner 1 -->
              <div style="background: rgba(10, 14, 22, 0.85); border: 2px solid ${team1.color || '#00e5ff'}; border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h4 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; margin:0;">${team1.name}</h4>
                  <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team1.color || '#00e5ff'};">
                    ${score1} PTS
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.4rem;">
                  ${crew1Drivers.map(d => {
                    const pos = mergedPositions[`${team1.id}_${d.id || d.name}`] || '';
                    const pts = this.getPointsForPosition(pos);
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(18,23,36,0.6); padding:0.45rem 0.65rem; border-radius:var(--radius-sm);">
                        <span style="font-size:0.85rem; color:#fff;">${d.name || 'Driver'}</span>
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                          ${pos ? `<span class="section-tag" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${pos}</span>` : ''}
                          <span style="font-family:var(--font-mono); font-weight:700; font-size:0.85rem; color:var(--accent-gold);">${pos ? `+${pts} PTS` : '-'}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Corner 2 -->
              <div style="background: rgba(10, 14, 22, 0.85); border: 2px solid ${team2.color || '#ff3b5c'}; border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h4 style="font-family:var(--font-display); font-size:1.15rem; color:#fff; margin:0;">${team2.name}</h4>
                  <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team2.color || '#ff3b5c'};">
                    ${score2} PTS
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.4rem;">
                  ${crew2Drivers.map(d => {
                    const pos = mergedPositions[`${team2.id}_${d.id || d.name}`] || '';
                    const pts = this.getPointsForPosition(pos);
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(18,23,36,0.6); padding:0.45rem 0.65rem; border-radius:var(--radius-sm);">
                        <span style="font-size:0.85rem; color:#fff;">${d.name || 'Driver'}</span>
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                          ${pos ? `<span class="section-tag" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${pos}</span>` : ''}
                          <span style="font-family:var(--font-mono); font-weight:700; font-size:0.85rem; color:var(--accent-gold);">${pos ? `+${pts} PTS` : '-'}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1.5rem; width:100%;">
          ${scoringHubHtml}
          ${viewerFaceOffHtml}
          ${leaderboardHtml}
        </div>
      `;
    } catch (err) {
      console.error('Error in renderChampionshipView:', err);
    }
  }
}

export const championshipView = new ChampionshipView();
