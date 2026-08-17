import { store, POSITION_POINTS_MAP } from './state.js';
import { soundFX } from './audio.js';

class ChampionshipView {
  constructor() {
    this.selectedMatchId = null;
    this.selectedRoundId = null;
    this.activeGameIndex = 0; // 0 = Race 1, 1 = Race 2, 2 = Race 3, etc.
    this.localPositions = {}; // Local positions for active race
    this.sortByRank = false;
    this.expandedTeamKey = null; // for viewer drill-down on team click: `${matchId}_${teamId}`
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
    this.activeGameIndex = 0;
    this.localPositions = {};
    this.sortByRank = false;
    this.renderChampionshipView();
  }

  selectRound(roundId) {
    this.selectedRoundId = roundId;
    this.selectedMatchId = null;
    this.activeGameIndex = 0;
    this.localPositions = {};
    this.renderChampionshipView();
  }

  selectGameIndex(gameIndex) {
    this.activeGameIndex = gameIndex;
    this.localPositions = {};
    this.renderChampionshipView();
  }

  setSeriesFormat(format) {
    const { tournamentMatchups = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    currentMatch.seriesFormat = format;
    this.saveCurrentMatchScoring(true);
  }

  toggleTeamRosterExpand(matchId, teamId) {
    const key = `${matchId}_${teamId}`;
    if (this.expandedTeamKey === key) {
      this.expandedTeamKey = null;
    } else {
      this.expandedTeamKey = key;
    }
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

  getMaxGamesForFormat(format = 'bo3') {
    if (format === 'bo5') return 5;
    if (format === 'bo3') return 3;
    return 1;
  }

  saveCurrentMatchScoring(showToast = true) {
    const { tournamentMatchups = [], teams = [], racers = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    const team1 = this.resolveTeam(currentMatch.team1, teams);
    const team2 = this.resolveTeam(currentMatch.team2, teams);
    const crew1Drivers = this.getTeamDrivers(team1, racers);
    const crew2Drivers = this.getTeamDrivers(team2, racers);

    const format = currentMatch.seriesFormat || 'bo3';
    const maxGames = this.getMaxGamesForFormat(format);
    const games = Array.isArray(currentMatch.games) ? [...currentMatch.games] : [];

    // Ensure games array length up to activeGameIndex + 1
    while (games.length <= this.activeGameIndex) {
      games.push({
        gameNumber: games.length + 1,
        driverPositions: {},
        team1Score: 0,
        team2Score: 0,
        winnerTeamId: null,
        isLocked: false
      });
    }

    // Merge local positions into active game
    const currentGame = games[this.activeGameIndex] || {
      gameNumber: this.activeGameIndex + 1,
      driverPositions: {},
      team1Score: 0,
      team2Score: 0,
      winnerTeamId: null,
      isLocked: false
    };

    currentGame.driverPositions = {
      ...(currentGame.driverPositions || {}),
      ...this.localPositions
    };

    // Calculate scores for this active game
    let gameScore1 = 0;
    crew1Drivers.forEach((d) => {
      const key = `${team1.id}_${d.id || d.name}`;
      const pos = currentGame.driverPositions[key] || '';
      gameScore1 += this.getPointsForPosition(pos);
    });

    let gameScore2 = 0;
    crew2Drivers.forEach((d) => {
      const key = `${team2.id}_${d.id || d.name}`;
      const pos = currentGame.driverPositions[key] || '';
      gameScore2 += this.getPointsForPosition(pos);
    });

    currentGame.team1Score = gameScore1;
    currentGame.team2Score = gameScore2;
    if (gameScore1 > gameScore2) {
      currentGame.winnerTeamId = team1.id;
    } else if (gameScore2 > gameScore1) {
      currentGame.winnerTeamId = team2.id;
    } else {
      currentGame.winnerTeamId = null;
    }

    games[this.activeGameIndex] = currentGame;

    // Calculate Series Totals across all games
    let seriesWins1 = 0;
    let seriesWins2 = 0;
    let totalScore1 = 0;
    let totalScore2 = 0;

    games.slice(0, maxGames).forEach((g) => {
      totalScore1 += Number(g.team1Score) || 0;
      totalScore2 += Number(g.team2Score) || 0;
      if (g.winnerTeamId === team1.id || g.team1Score > g.team2Score) seriesWins1 += 1;
      else if (g.winnerTeamId === team2.id || g.team2Score > g.team1Score) seriesWins2 += 1;
    });

    // Overall series winner
    let overallWinnerTeamId = currentMatch.winnerTeamId || null;
    const winsNeeded = format === 'bo5' ? 3 : (format === 'bo3' ? 2 : 1);

    if (seriesWins1 >= winsNeeded) {
      overallWinnerTeamId = team1.id;
    } else if (seriesWins2 >= winsNeeded) {
      overallWinnerTeamId = team2.id;
    } else if (currentMatch.isLocked) {
      if (seriesWins1 > seriesWins2) overallWinnerTeamId = team1.id;
      else if (seriesWins2 > seriesWins1) overallWinnerTeamId = team2.id;
      else if (totalScore1 > totalScore2) overallWinnerTeamId = team1.id;
      else if (totalScore2 > totalScore1) overallWinnerTeamId = team2.id;
    }

    const res = store.updateMatchScoring(currentMatch.id, {
      seriesFormat: format,
      activeGameIndex: this.activeGameIndex,
      games,
      driverPositions: currentGame.driverPositions,
      team1Score: gameScore1,
      team2Score: gameScore2,
      totalScore1,
      totalScore2,
      seriesWins1,
      seriesWins2,
      winnerTeamId: overallWinnerTeamId
    });

    if (res.success) {
      if (showToast && window.app) {
        soundFX.play('bid');
        window.app.showToast('Series scores updated & synced live!', 'success');
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
      window.app.showToast(nextLockState ? `🔒 Match #${currentMatch.matchNumber || 1} locked & finalized!` : `🔓 Match #${currentMatch.matchNumber || 1} unlocked`, nextLockState ? 'sold' : 'info');
      this.renderChampionshipView();
    }
  }

  resetCurrentRacePositions() {
    const { tournamentMatchups = [] } = store.getState();
    const currentMatch = this.getActiveMatch(tournamentMatchups);
    if (!currentMatch) return;

    if (confirm(`Reset finishing positions for Race #${this.activeGameIndex + 1}?`)) {
      this.localPositions = {};
      const games = Array.isArray(currentMatch.games) ? [...currentMatch.games] : [];
      if (games[this.activeGameIndex]) {
        games[this.activeGameIndex].driverPositions = {};
        games[this.activeGameIndex].team1Score = 0;
        games[this.activeGameIndex].team2Score = 0;
        games[this.activeGameIndex].winnerTeamId = null;
      }
      this.saveCurrentMatchScoring(false);
      if (window.app) window.app.showToast(`Race #${this.activeGameIndex + 1} positions cleared`, 'info');
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
      drivers = allRacers.filter(r => r && r.soldToTeamId === team.id);
    }

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

      let team1 = null;
      let team2 = null;
      let crew1Drivers = [];
      let crew2Drivers = [];
      let activeGameScore1 = 0;
      let activeGameScore2 = 0;
      let seriesWins1 = 0;
      let seriesWins2 = 0;
      let totalScore1 = 0;
      let totalScore2 = 0;
      let format = 'bo3';
      let maxGames = 3;
      let games = [];
      let currentGame = null;

      if (activeMatch) {
        team1 = this.resolveTeam(activeMatch.team1, teams);
        team2 = this.resolveTeam(activeMatch.team2, teams);
        crew1Drivers = this.getTeamDrivers(team1, racers);
        crew2Drivers = this.getTeamDrivers(team2, racers);
        format = activeMatch.seriesFormat || 'bo3';
        maxGames = this.getMaxGamesForFormat(format);
        games = Array.isArray(activeMatch.games) ? activeMatch.games : [];

        // Active game lookup
        currentGame = games[this.activeGameIndex] || {
          gameNumber: this.activeGameIndex + 1,
          driverPositions: activeMatch.driverPositions || {},
          team1Score: activeMatch.team1Score || 0,
          team2Score: activeMatch.team2Score || 0
        };

        const mergedPositions = { ...(currentGame.driverPositions || {}), ...this.localPositions };

        // Compute scores for current race
        crew1Drivers.forEach((d) => {
          const key = `${team1.id}_${d.id || d.name}`;
          const pos = mergedPositions[key] || '';
          activeGameScore1 += this.getPointsForPosition(pos);
        });

        crew2Drivers.forEach((d) => {
          const key = `${team2.id}_${d.id || d.name}`;
          const pos = mergedPositions[key] || '';
          activeGameScore2 += this.getPointsForPosition(pos);
        });

        // Compute series cumulative stats
        seriesWins1 = Number(activeMatch.seriesWins1) || 0;
        seriesWins2 = Number(activeMatch.seriesWins2) || 0;
        totalScore1 = Number(activeMatch.totalScore1) || activeGameScore1;
        totalScore2 = Number(activeMatch.totalScore2) || activeGameScore2;

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

      // Compute global tournament standings
      const standingsMap = {};
      teams.forEach(t => {
        standingsMap[t.id] = {
          team: t,
          totalPoints: 0,
          seriesPlayed: 0,
          seriesWon: 0,
          raceWins: 0
        };
      });

      tournamentMatchups.forEach(m => {
        const t1 = this.resolveTeam(m.team1, teams);
        const t2 = this.resolveTeam(m.team2, teams);
        const s1 = Number(m.totalScore1) || Number(m.team1Score) || 0;
        const s2 = Number(m.totalScore2) || Number(m.team2Score) || 0;
        const w1 = Number(m.seriesWins1) || (s1 > s2 ? 1 : 0);
        const w2 = Number(m.seriesWins2) || (s2 > s1 ? 1 : 0);

        if (standingsMap[t1.id]) {
          standingsMap[t1.id].totalPoints += s1;
          standingsMap[t1.id].raceWins += w1;
          if (m.isLocked || s1 > 0 || s2 > 0) standingsMap[t1.id].seriesPlayed += 1;
          if (m.winnerTeamId === t1.id || (m.isLocked && (w1 > w2 || s1 > s2))) standingsMap[t1.id].seriesWon += 1;
        }
        if (standingsMap[t2.id]) {
          standingsMap[t2.id].totalPoints += s2;
          standingsMap[t2.id].raceWins += w2;
          if (m.isLocked || s1 > 0 || s2 > 0) standingsMap[t2.id].seriesPlayed += 1;
          if (m.winnerTeamId === t2.id || (m.isLocked && (w2 > w1 || s2 > s1))) standingsMap[t2.id].seriesWon += 1;
        }
      });

      const sortedStandings = Object.values(standingsMap).sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return b.seriesWon - a.seriesWon;
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

      // 1. ADMIN SCORING HUB
      let adminHubHtml = '';
      if (isAdmin) {
        const activeMergedPositions = currentGame ? { ...(currentGame.driverPositions || {}), ...this.localPositions } : {};

        adminHubHtml = `
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

              <!-- Match Selector & Lock Button -->
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                ${tournamentMatchups.length > 0 ? `
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <label style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE MATCH:</label>
                    <select class="form-select" style="min-width:240px; font-size:0.85rem; padding:0.4rem 0.75rem;" onchange="window.championshipView.selectMatch(this.value)">
                      ${tournamentMatchups.map((m, idx) => {
                        const t1 = this.resolveTeam(m.team1, teams);
                        const t2 = this.resolveTeam(m.team2, teams);
                        const sFmt = (m.seriesFormat || 'bo3').toUpperCase();
                        return `
                          <option value="${m.id}" ${activeMatch && activeMatch.id === m.id ? 'selected' : ''}>
                            Match ${m.matchNumber || (idx + 1)}: ${t1.name} vs ${t2.name} [${sFmt}] ${m.isLocked ? '🔒' : ''}
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
              <!-- SERIES FORMAT (BO3 / BO5) & RACE SELECTOR BAR -->
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; background:rgba(18,23,36,0.6); padding:0.75rem 1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                
                <!-- Format Switcher -->
                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  <span style="font-size:0.75rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:1px;">FORMAT:</span>
                  <div class="filter-pills" style="margin:0;">
                    <button class="filter-pill-btn ${format === 'single' ? 'active' : ''}" style="font-size:0.75rem; padding:0.25rem 0.75rem;" onclick="window.championshipView.setSeriesFormat('single')">Single Race</button>
                    <button class="filter-pill-btn ${format === 'bo3' ? 'active' : ''}" style="font-size:0.75rem; padding:0.25rem 0.75rem;" onclick="window.championshipView.setSeriesFormat('bo3')">Best of 3 (BO3)</button>
                    <button class="filter-pill-btn ${format === 'bo5' ? 'active' : ''}" style="font-size:0.75rem; padding:0.25rem 0.75rem;" onclick="window.championshipView.setSeriesFormat('bo5')">Best of 5 (BO5)</button>
                  </div>
                </div>

                <!-- Race Step Tabs -->
                <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                  <span style="font-size:0.75rem; color:var(--text-muted); font-weight:800; text-transform:uppercase;">RACE:</span>
                  ${Array.from({ length: maxGames }).map((_, gIdx) => {
                    const g = games[gIdx];
                    const hasData = g && (g.team1Score > 0 || g.team2Score > 0);
                    const isActive = this.activeGameIndex === gIdx;
                    return `
                      <button class="btn btn-sm ${isActive ? 'btn-cyan' : (hasData ? 'btn-outline' : 'btn-outline')}" style="font-size:0.75rem; padding:0.25rem 0.65rem; ${isActive ? 'font-weight:900;' : 'opacity:0.8;'}" onclick="window.championshipView.selectGameIndex(${gIdx})">
                        Race #${gIdx + 1} ${hasData ? `(${g.team1Score}-${g.team2Score})` : ''}
                      </button>
                    `;
                  }).join('')}
                </div>

                <!-- Series Score Badge -->
                <div style="font-family:var(--font-mono); font-size:0.95rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:0.5rem;">
                  <span>Series:</span>
                  <span style="color:${team1.color || '#00e5ff'};">${seriesWins1}</span>
                  <span style="color:var(--text-muted);">-</span>
                  <span style="color:${team2.color || '#ff3b5c'};">${seriesWins2}</span>
                  <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.3rem;">(Total: ${totalScore1} vs ${totalScore2} PTS)</span>
                </div>
              </div>

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
                      <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">RACE #${this.activeGameIndex + 1} PTS</span>
                      <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team1.color || '#00e5ff'};">
                        ${activeGameScore1} PTS
                      </div>
                    </div>
                  </div>

                  <!-- Driver Position Rows -->
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${crew1Drivers.map((driver) => {
                      const driverKey = `${team1.id}_${driver.id || driver.name}`;
                      const currentPos = activeMergedPositions[driverKey] || '';
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
                      <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">RACE #${this.activeGameIndex + 1} PTS</span>
                      <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:900; color:${team2.color || '#ff3b5c'};">
                        ${activeGameScore2} PTS
                      </div>
                    </div>
                  </div>

                  <!-- Driver Position Rows -->
                  <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${crew2Drivers.map((driver) => {
                      const driverKey = `${team2.id}_${driver.id || driver.name}`;
                      const currentPos = activeMergedPositions[driverKey] || '';
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
                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.4rem 0.75rem;" onclick="window.championshipView.resetCurrentRacePositions()" title="Clear positions for this race">
                  Reset Race #${this.activeGameIndex + 1}
                </button>
              </div>
            ` : `
              <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-secondary); background:rgba(10,14,22,0.4); border-radius:var(--radius-md); border:1px dashed var(--border-subtle);">
                <div style="font-size:2.5rem; margin-bottom:0.5rem;">🏁</div>
                <div style="font-size:1.1rem; font-weight:700; color:#fff;">No Active Matchup Found</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.35rem; max-width:480px; margin-left:auto; margin-right:auto;">
                  Draw team face-offs in the <strong>Match-ups</strong> tab to start scoring tournament matches.
                </div>
                <button class="btn btn-cyan" style="margin-top:1rem;" onclick="window.app.switchTab('tournament-view')">
                  Go to Match-ups
                </button>
              </div>
            `}
          </div>
        `;
      }

      // 2. VIEWER MATCH-UPS & SERIES CARDS WITH TAP-TO-EXPAND ROSTER POINTS
      let viewerMatchCardsHtml = '';
      if (tournamentMatchups.length > 0) {
        viewerMatchCardsHtml = `
          <!-- TOURNAMENT MATCHES (TAP TEAM NAME FOR RACER POINTS) -->
          <div class="glass-card" style="border-top: 3px solid var(--accent-cyan); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="section-header" style="margin-bottom:0.25rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="color:var(--accent-cyan);">MATCH-UPS ARENA</span>
                <h3 class="section-title" style="font-size:1.25rem;">
                  Championship Tournament Matches
                </h3>
              </div>
              <span style="font-size:0.78rem; color:var(--text-muted);">${tournamentMatchups.length} Match-ups Scheduled</span>
            </div>

            <p style="font-size:0.82rem; color:var(--text-secondary); margin:0 0 0.5rem;">
              💡 <strong>Tip:</strong> Tap on any team's name to view the detailed driver-by-driver points and finishing positions breakdown.
            </p>

            <div style="display:flex; flex-direction:column; gap:1.25rem;">
              ${tournamentMatchups.map((match, mIdx) => {
                const t1 = this.resolveTeam(match.team1, teams);
                const t2 = this.resolveTeam(match.team2, teams);
                const matchFmt = (match.seriesFormat || 'bo3').toUpperCase();
                const mMaxGames = this.getMaxGamesForFormat(match.seriesFormat || 'bo3');
                const mGames = Array.isArray(match.games) ? match.games : [];
                const mWins1 = Number(match.seriesWins1) || 0;
                const mWins2 = Number(match.seriesWins2) || 0;
                const mTotalPts1 = Number(match.totalScore1) || Number(match.team1Score) || 0;
                const mTotalPts2 = Number(match.totalScore2) || Number(match.team2Score) || 0;
                const isT1Expanded = this.expandedTeamKey === `${match.id}_${t1.id}`;
                const isT2Expanded = this.expandedTeamKey === `${match.id}_${t2.id}`;
                const t1Drivers = this.getTeamDrivers(t1, racers);
                const t2Drivers = this.getTeamDrivers(t2, racers);

                return `
                  <div class="glass-card" style="background:rgba(10,14,22,0.85); border:1px solid ${match.isLocked ? 'var(--border-gold)' : 'var(--border-subtle)'}; padding:1.25rem; border-radius:var(--radius-lg); display:flex; flex-direction:column; gap:1rem;">
                    
                    <!-- Match Header Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:0.6rem;">
                      <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="section-tag" style="font-size:0.72rem; padding:0.15rem 0.5rem; background:rgba(0,242,254,0.1); color:var(--accent-cyan); border-color:var(--border-cyan);">
                          MATCH #${match.matchNumber || (mIdx + 1)}
                        </span>
                        <span class="section-tag" style="font-size:0.72rem; padding:0.15rem 0.5rem;">
                          ${matchFmt === 'BO3' ? 'BEST OF 3' : (matchFmt === 'BO5' ? 'BEST OF 5' : 'SINGLE RACE')}
                        </span>
                      </div>

                      <div>
                        ${match.isLocked ? `
                          <span class="section-tag" style="background:rgba(0,255,136,0.15); color:#00ff88; border-color:#00ff8855; font-size:0.75rem;">
                            🏆 FINALIZED ${match.winnerTeamId === t1.id ? `(${t1.name} Won)` : match.winnerTeamId === t2.id ? `(${t2.name} Won)` : ''}
                          </span>
                        ` : `
                          <div class="live-indicator">
                            <div class="live-dot"></div>
                            <span>IN PROGRESS</span>
                          </div>
                        `}
                      </div>
                    </div>

                    <!-- Head-to-Head Main Score Board -->
                    <div style="display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; gap:1rem; padding:0.5rem 0;">
                      
                      <!-- Team 1 Side (Clickable to Expand) -->
                      <div style="cursor:pointer; background:${isT1Expanded ? 'rgba(0,242,254,0.08)' : 'rgba(18,23,36,0.5)'}; border:1px solid ${isT1Expanded ? t1.color : 'rgba(255,255,255,0.05)'}; padding:0.85rem 1rem; border-radius:var(--radius-md); border-left:4px solid ${t1.color}; transition:all 0.2s ease;" onclick="window.championshipView.toggleTeamRosterExpand('${match.id}', '${t1.id}')" title="Tap to view driver points breakdown">
                        <div style="display:flex; align-items:center; gap:0.65rem;">
                          <div style="width:36px; height:36px; border-radius:var(--radius-sm); border:2px solid ${t1.color}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);">
                            ${t1.logoUrl ? `<img src="${t1.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${t1.logoIcon || '🏎️'}</span>`}
                          </div>
                          <div style="min-width:0; flex:1;">
                            <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${t1.name}
                            </div>
                            <div style="font-size:0.72rem; color:var(--accent-cyan); display:flex; align-items:center; gap:0.3rem;">
                              <span>${isT1Expanded ? '▲ Hide Driver Points' : '▼ Tap for Driver Points'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:0.6rem; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.4rem;">
                          <span style="font-size:0.75rem; color:var(--text-muted);">Series Score</span>
                          <div style="font-family:var(--font-mono); font-size:1.25rem; font-weight:900; color:${t1.color};">
                            ${mTotalPts1} PTS ${matchFmt !== 'SINGLE' ? `<span style="font-size:0.85rem; color:#fff;">(${mWins1}W)</span>` : ''}
                          </div>
                        </div>
                      </div>

                      <!-- VS Center Pill -->
                      <div style="text-align:center;">
                        <div style="font-family:var(--font-display); font-size:1.1rem; font-weight:900; color:var(--text-muted); background:rgba(255,255,255,0.05); width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.1); margin:0 auto;">
                          VS
                        </div>
                        <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;">
                          ${mWins1} - ${mWins2}
                        </div>
                      </div>

                      <!-- Team 2 Side (Clickable to Expand) -->
                      <div style="cursor:pointer; background:${isT2Expanded ? 'rgba(255,59,92,0.08)' : 'rgba(18,23,36,0.5)'}; border:1px solid ${isT2Expanded ? t2.color : 'rgba(255,255,255,0.05)'}; padding:0.85rem 1rem; border-radius:var(--radius-md); border-right:4px solid ${t2.color}; text-align:right; transition:all 0.2s ease;" onclick="window.championshipView.toggleTeamRosterExpand('${match.id}', '${t2.id}')" title="Tap to view driver points breakdown">
                        <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.65rem;">
                          <div style="min-width:0; flex:1;">
                            <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${t2.name}
                            </div>
                            <div style="font-size:0.72rem; color:var(--accent-cyan); display:flex; align-items:center; justify-content:flex-end; gap:0.3rem;">
                              <span>${isT2Expanded ? '▲ Hide Driver Points' : '▼ Tap for Driver Points'}</span>
                            </div>
                          </div>
                          <div style="width:36px; height:36px; border-radius:var(--radius-sm); border:2px solid ${t2.color}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);">
                            ${t2.logoUrl ? `<img src="${t2.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${t2.logoIcon || '⚡'}</span>`}
                          </div>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:0.6rem; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.4rem;">
                          <div style="font-family:var(--font-mono); font-size:1.25rem; font-weight:900; color:${t2.color};">
                            ${matchFmt !== 'SINGLE' ? `<span style="font-size:0.85rem; color:#fff;">(${mWins2}W) </span>` : ''}${mTotalPts2} PTS
                          </div>
                          <span style="font-size:0.75rem; color:var(--text-muted);">Series Score</span>
                        </div>
                      </div>
                    </div>

                    <!-- Accordion Breakdown: Team 1 Drivers -->
                    ${isT1Expanded ? `
                      <div style="background:rgba(0,0,0,0.4); border-radius:var(--radius-md); padding:1rem; border:1px solid ${t1.color}44; display:flex; flex-direction:column; gap:0.5rem; animation: fadeIn 0.2s ease;">
                        <div style="font-size:0.78rem; font-weight:800; color:${t1.color}; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:space-between;">
                          <span>${t1.name} — Driver Finishing Points Breakdown</span>
                          <span>Total: ${mTotalPts1} PTS</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.5rem; margin-top:0.25rem;">
                          ${t1Drivers.map(d => {
                            // Calculate driver points across all games in this match
                            let driverTotal = 0;
                            const racePositions = [];
                            mGames.slice(0, mMaxGames).forEach((g, gIdx) => {
                              const pos = (g.driverPositions || {})[`${t1.id}_${d.id || d.name}`] || '';
                              const pts = this.getPointsForPosition(pos);
                              driverTotal += pts;
                              if (pos) racePositions.push(`R${gIdx + 1}: ${pos} (+${pts})`);
                            });

                            return `
                              <div style="background:rgba(18,23,36,0.7); padding:0.5rem 0.75rem; border-radius:var(--radius-sm); border-left:3px solid ${t1.color}; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                  <div style="font-weight:700; color:#fff; font-size:0.88rem;">${d.name || 'Driver'}</div>
                                  <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                                    ${racePositions.length > 0 ? racePositions.join(' • ') : 'No position assigned'}
                                  </div>
                                </div>
                                <div style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:var(--accent-gold);">
                                  ${driverTotal} PTS
                                </div>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    ` : ''}

                    <!-- Accordion Breakdown: Team 2 Drivers -->
                    ${isT2Expanded ? `
                      <div style="background:rgba(0,0,0,0.4); border-radius:var(--radius-md); padding:1rem; border:1px solid ${t2.color}44; display:flex; flex-direction:column; gap:0.5rem; animation: fadeIn 0.2s ease;">
                        <div style="font-size:0.78rem; font-weight:800; color:${t2.color}; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:space-between;">
                          <span>${t2.name} — Driver Finishing Points Breakdown</span>
                          <span>Total: ${mTotalPts2} PTS</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.5rem; margin-top:0.25rem;">
                          ${t2Drivers.map(d => {
                            let driverTotal = 0;
                            const racePositions = [];
                            mGames.slice(0, mMaxGames).forEach((g, gIdx) => {
                              const pos = (g.driverPositions || {})[`${t2.id}_${d.id || d.name}`] || '';
                              const pts = this.getPointsForPosition(pos);
                              driverTotal += pts;
                              if (pos) racePositions.push(`R${gIdx + 1}: ${pos} (+${pts})`);
                            });

                            return `
                              <div style="background:rgba(18,23,36,0.7); padding:0.5rem 0.75rem; border-radius:var(--radius-sm); border-left:3px solid ${t2.color}; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                  <div style="font-weight:700; color:#fff; font-size:0.88rem;">${d.name || 'Driver'}</div>
                                  <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                                    ${racePositions.length > 0 ? racePositions.join(' • ') : 'No position assigned'}
                                  </div>
                                </div>
                                <div style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:var(--accent-gold);">
                                  ${driverTotal} PTS
                                </div>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    ` : ''}

                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 3. TOURNAMENT STANDINGS TABLE
      const standingsHtml = `
        <!-- TOURNAMENT OVERALL STANDINGS TABLE -->
        <div class="glass-card" style="border-top: 3px solid var(--accent-gold); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
          
          <div class="section-header" style="margin-bottom:0;">
            <div class="section-title-wrap">
              <span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:rgba(255,215,0,0.3);">
                STANDINGS
              </span>
              <h3 class="section-title" style="font-size:1.25rem;">
                Tournament Championship Leaderboard
              </h3>
            </div>
            <span style="font-size:0.78rem; color:var(--text-muted);">${teams.length} Teams Registered</span>
          </div>

          <!-- Table -->
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); text-transform:uppercase; font-size:0.72rem; font-family:var(--font-display);">
                  <th style="padding:0.6rem 0.85rem;">Rank</th>
                  <th style="padding:0.6rem 0.85rem;">Racing Crew</th>
                  <th style="padding:0.6rem 0.85rem; text-align:center;">Series Played</th>
                  <th style="padding:0.6rem 0.85rem; text-align:center;">Series Won</th>
                  <th style="padding:0.6rem 0.85rem; text-align:center;">Races Won</th>
                  <th style="padding:0.6rem 0.85rem; text-align:right;">Championship Points</th>
                </tr>
              </thead>
              <tbody>
                ${sortedStandings.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
                      No racing teams registered.
                    </td>
                  </tr>
                ` : sortedStandings.map((item, idx) => {
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
                        ${item.seriesPlayed}
                      </td>
                      <td style="padding:0.75rem 0.85rem; text-align:center; font-family:var(--font-mono); color:var(--accent-green); font-weight:700;">
                        ${item.seriesWon}
                      </td>
                      <td style="padding:0.75rem 0.85rem; text-align:center; font-family:var(--font-mono); color:var(--accent-cyan); font-weight:700;">
                        ${item.raceWins}
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

      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1.5rem; width:100%;">
          ${adminHubHtml}
          ${viewerMatchCardsHtml}
          ${standingsHtml}
        </div>
      `;
    } catch (err) {
      console.error('Error in renderChampionshipView:', err);
    }
  }
}

export const championshipView = new ChampionshipView();
