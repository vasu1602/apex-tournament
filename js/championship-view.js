import { store, POSITION_POINTS_MAP } from './state.js';
import { soundFX } from './audio.js';

class ChampionshipView {
  constructor() {
    this.selectedMatchId = null;
    this.selectedRoundId = null;
    this.activeGameIndex = 0; // 0 = Race 1, 1 = Race 2, 2 = Race 3, etc.
    this.localPositions = {}; // Local positions for active race in admin
    this.sortByRank = false;
    this.viewerExpandedMatches = new Set(); // Set of matchIds currently expanded
    this.viewerSelectedRaces = {}; // { [matchId]: raceIndex }
    this.tournamentSubMode = 'crew'; // 'crew' | 'solo'
  }

  setTournamentSubMode(mode) {
    this.tournamentSubMode = mode;
    if (window.soundFX) soundFX.play('click');
    this.renderChampionshipView();
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

  toggleViewerMatchExpand(matchId) {
    if (this.viewerExpandedMatches.has(matchId)) {
      this.viewerExpandedMatches.delete(matchId);
    } else {
      this.viewerExpandedMatches.add(matchId);
      if (this.viewerSelectedRaces[matchId] === undefined) {
        this.viewerSelectedRaces[matchId] = 0;
      }
    }
    this.renderChampionshipView();
  }

  setViewerSelectedRace(matchId, raceIdx) {
    this.viewerSelectedRaces[matchId] = raceIdx;
    this.renderChampionshipView();
  }

  toggleStandingsVisibility() {
    const res = store.toggleChampionshipStandingsVisibility();
    if (res.success && window.app) {
      soundFX.play(res.isVisible ? 'sold' : 'click');
      window.app.showToast(
        res.isVisible 
          ? '👁️ Championship Leaderboard is now PUBLISHED and visible to viewers!' 
          : '🙈 Championship Leaderboard is now HIDDEN from viewers.',
        res.isVisible ? 'success' : 'info'
      );
    }
    this.renderChampionshipView();
  }

  handlePositionChange(driverKey, newPos) {
    this.localPositions[driverKey] = newPos;
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

    let overallWinnerTeamId = null;
    if (totalScore1 > totalScore2) {
      overallWinnerTeamId = team1.id;
    } else if (totalScore2 > totalScore1) {
      overallWinnerTeamId = team2.id;
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

  getActiveMatch(allMatchups, roundId = null) {
    if (!allMatchups || allMatchups.length === 0) return null;
    let pool = allMatchups;
    if (roundId) {
      const filtered = allMatchups.filter(m => (m.roundId || 'round_qualifiers') === roundId);
      if (filtered.length > 0) pool = filtered;
    }
    if (this.selectedMatchId) {
      const match = pool.find(m => m.id === this.selectedMatchId);
      if (match) return match;
    }
    return pool[0] || null;
  }

  renderChampionshipView(containerId = 'championship-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const state = store.getState() || {};
      const {
        tournamentRounds = [{ id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }],
        activeTournamentRoundId = 'round_qualifiers',
        tournamentMatchups = [],
        teams = [],
        racers = [],
        currentUser = { isAuthenticated: false, role: 'viewer', adminName: 'Spectator' },
        showChampionshipStandingsToViewers = false
      } = state;

      const isAdmin = Boolean(currentUser.isAuthenticated);
      
      const activeRoundId = this.selectedRoundId || activeTournamentRoundId || (tournamentRounds[0] && tournamentRounds[0].id) || 'round_qualifiers';
      const activeRound = tournamentRounds.find(r => r.id === activeRoundId) || tournamentRounds[0] || { id: 'round_qualifiers', name: 'Qualifiers' };
      const activeRoundName = activeRound ? activeRound.name : 'Qualifiers';

      const roundMatchups = tournamentMatchups.filter(m => (m.roundId || (tournamentRounds[0] && tournamentRounds[0].id) || 'round_qualifiers') === activeRound.id);
      const activeMatch = this.getActiveMatch(tournamentMatchups, activeRound.id);

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

        currentGame = games[this.activeGameIndex] || {
          gameNumber: this.activeGameIndex + 1,
          driverPositions: activeMatch.driverPositions || {},
          team1Score: activeMatch.team1Score || 0,
          team2Score: activeMatch.team2Score || 0
        };

        const mergedPositions = { ...(currentGame.driverPositions || {}), ...this.localPositions };

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

        seriesWins1 = Number(activeMatch.seriesWins1) || 0;
        seriesWins2 = Number(activeMatch.seriesWins2) || 0;
        totalScore1 = Number(activeMatch.totalScore1) || activeGameScore1;
        totalScore2 = Number(activeMatch.totalScore2) || activeGameScore2;

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
          if (s1 > s2 && (m.isLocked || m.winnerTeamId === t1.id)) standingsMap[t1.id].seriesWon += 1;
        }
        if (standingsMap[t2.id]) {
          standingsMap[t2.id].totalPoints += s2;
          standingsMap[t2.id].raceWins += w2;
          if (m.isLocked || s1 > 0 || s2 > 0) standingsMap[t2.id].seriesPlayed += 1;
          if (s2 > s1 && (m.isLocked || m.winnerTeamId === t2.id)) standingsMap[t2.id].seriesWon += 1;
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
                ${tournamentRounds.length > 1 ? `
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <label style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ROUND:</label>
                    <select class="form-select" style="font-size:0.85rem; padding:0.4rem 0.65rem;" onchange="window.championshipView.selectRound(this.value)">
                      ${tournamentRounds.map(r => `
                        <option value="${r.id}" ${activeRound.id === r.id ? 'selected' : ''}>${r.name}</option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}

                ${roundMatchups.length > 0 ? `
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    <label style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE MATCH:</label>
                    <select class="form-select" style="min-width:240px; font-size:0.85rem; padding:0.4rem 0.75rem;" onchange="window.championshipView.selectMatch(this.value)">
                      ${roundMatchups.map((m, idx) => {
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
                  <span style="font-size:0.8rem; color:var(--text-muted);">No matchups drawn for ${activeRoundName}.</span>
                `}

                ${activeMatch ? `
                  <button class="btn ${activeMatch.isLocked ? 'btn-gold' : 'btn-outline'} btn-sm" style="font-size:0.8rem; padding:0.45rem 0.85rem; font-weight:800;" onclick="window.championshipView.toggleLockActiveMatch()">
                    ${activeMatch.isLocked ? '🔓 UNLOCK MATCH' : '🔒 LOCK MATCH'}
                  </button>
                ` : ''}

                <button class="btn ${showChampionshipStandingsToViewers ? 'btn-green' : 'btn-outline'} btn-sm" style="font-size:0.8rem; padding:0.45rem 0.85rem; font-weight:800; display:flex; align-items:center; gap:0.35rem;" onclick="window.championshipView.toggleStandingsVisibility()" title="Toggle Leaderboard visibility for Spectators">
                  ${showChampionshipStandingsToViewers ? '👁️ LEADERBOARD: PUBLISHED' : '🙈 LEADERBOARD: HIDDEN'}
                </button>
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
                          <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                            <span style="font-size:1rem;">🏎️</span>
                            <span style="font-family:var(--font-display); font-weight:700; font-size:0.9rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${driver.name || 'Driver'}
                            </span>
                          </div>

                          <div style="display:flex; align-items:center; gap:0.6rem;">
                            <select class="form-select" style="padding:0.25rem 0.5rem; font-size:0.8rem; font-weight:700; width:130px; background:rgba(10,14,22,0.9);" onchange="window.championshipView.handlePositionChange('${driverKey}', this.value)" ${activeMatch.isLocked ? 'disabled' : ''}>
                              ${positionOptions.map(opt => `
                                <option value="${opt.value}" ${currentPos === opt.value ? 'selected' : ''}>
                                  ${opt.label}
                                </option>
                              `).join('')}
                            </select>

                            <div style="font-family:var(--font-mono); font-weight:900; font-size:0.95rem; min-width:70px; text-align:right; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6);">
                              ${currentPos ? (currentPos === 'DNF' ? '0 PTS' : `${pts} PTS`) : '0 PTS'}
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

                      return `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(18,23,36,0.6); padding:0.55rem 0.75rem; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); gap:0.5rem;">
                          <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                            <span style="font-size:1rem;">🏎️</span>
                            <span style="font-family:var(--font-display); font-weight:700; font-size:0.9rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                              ${driver.name || 'Driver'}
                            </span>
                          </div>

                          <div style="display:flex; align-items:center; gap:0.6rem;">
                            <select class="form-select" style="padding:0.25rem 0.5rem; font-size:0.8rem; font-weight:700; width:130px; background:rgba(10,14,22,0.9);" onchange="window.championshipView.handlePositionChange('${driverKey}', this.value)" ${activeMatch.isLocked ? 'disabled' : ''}>
                              ${positionOptions.map(opt => `
                                <option value="${opt.value}" ${currentPos === opt.value ? 'selected' : ''}>
                                  ${opt.label}
                                </option>
                              `).join('')}
                            </select>

                            <div style="font-family:var(--font-mono); font-weight:900; font-size:0.95rem; min-width:70px; text-align:right; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6);">
                              ${currentPos ? (currentPos === 'DNF' ? '0 PTS' : `${pts} PTS`) : '0 PTS'}
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

      // 2. VIEWER MATCH-UPS & SERIES CARDS ACCORDING TO ROUNDS
      let viewerMatchCardsHtml = '';
      if (tournamentMatchups.length > 0 || tournamentRounds.length > 0) {
        // Filter: Viewers only see finalized (locked) matchups + only the single NEXT active matchup in the active round
        let visibleViewerMatches = roundMatchups;
        if (!isAdmin) {
          visibleViewerMatches = [];
          let foundNextUnlocked = false;
          for (const m of roundMatchups) {
            if (m.isLocked) {
              visibleViewerMatches.push(m);
            } else if (!foundNextUnlocked) {
              visibleViewerMatches.push(m);
              foundNextUnlocked = true;
            }
          }
        }

        const hiddenMatchesCount = roundMatchups.length - visibleViewerMatches.length;

        viewerMatchCardsHtml = `
          <!-- TOURNAMENT MATCHES ACCORDING TO ROUNDS -->
          <div class="glass-card" style="border-top: 3px solid var(--accent-cyan); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            
            <!-- Section Header (Dynamic Round Name) -->
            <div class="section-header" style="margin-bottom:0.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="color:var(--accent-cyan); font-weight:800; letter-spacing:1px;">
                  ROUND: ${activeRoundName.toUpperCase()}
                </span>
                <h3 class="section-title" style="font-size:1.25rem;">
                  ${activeRoundName} — Championship Matches
                </h3>
              </div>
              <span style="font-size:0.78rem; color:var(--text-muted);">${visibleViewerMatches.length} of ${roundMatchups.length} Match-ups Live</span>
            </div>

            <!-- Round Switcher Tabs (For Viewers & Admins) -->
            ${tournamentRounds.length > 1 ? `
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-right:0.25rem;">ROUNDS:</span>
                ${tournamentRounds.map(r => {
                  const isSel = (r.id === activeRound.id);
                  const rCount = tournamentMatchups.filter(m => (m.roundId || tournamentRounds[0]?.id) === r.id).length;
                  return `
                    <button class="filter-pill-btn ${isSel ? 'active' : ''}" style="font-size:0.8rem; padding:0.35rem 0.95rem; border-radius:50px; font-weight:800;" onclick="window.championshipView.selectRound('${r.id}')">
                      ${r.name} ${rCount > 0 ? `(${rCount})` : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <p style="font-size:0.82rem; color:var(--text-secondary); margin:0 0 0.5rem;">
              💡 <strong>Tip:</strong> Tap on any match-up card or team name to view the races and inspect individual racer finishing points.
            </p>

            ${roundMatchups.length === 0 ? `
              <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted); font-size:0.9rem; border:1px dashed var(--border-subtle); border-radius:var(--radius-md); background:rgba(7, 10, 16, 0.4);">
                <div style="font-size:2.2rem; margin-bottom:0.5rem;">🏁</div>
                No match-ups created yet for <strong>${activeRoundName}</strong>.<br>
                <span style="font-size:0.82rem; color:var(--text-muted); margin-top:0.35rem; display:inline-block;">Waiting for Race Control to draw face-offs for this round.</span>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:1.25rem;">
                ${visibleViewerMatches.map((match, mIdx) => {
                const t1 = this.resolveTeam(match.team1, teams);
                const t2 = this.resolveTeam(match.team2, teams);
                const matchFmt = (match.seriesFormat || 'bo3').toUpperCase();
                const mMaxGames = this.getMaxGamesForFormat(match.seriesFormat || 'bo3');
                const mGames = Array.isArray(match.games) ? match.games : [];
                const mTotalPts1 = Number(match.totalScore1) || Number(match.team1Score) || 0;
                const mTotalPts2 = Number(match.totalScore2) || Number(match.team2Score) || 0;
                const isExpanded = this.viewerExpandedMatches.has(match.id);
                const currentViewerRaceIdx = this.viewerSelectedRaces[match.id] || 0;

                const scoredRacesCount = Math.max(1, Math.min(mMaxGames, mGames.length > 0 ? mGames.length : 1));
                const activeRaceGame = mGames[currentViewerRaceIdx] || { driverPositions: {}, team1Score: 0, team2Score: 0 };
                const activeRacePositions = activeRaceGame.driverPositions || {};

                const getRankOrder = (pos) => {
                  if (!pos) return 999;
                  if (pos === 'DNF') return 900;
                  const num = parseInt(pos.replace(/\D/g, ''), 10);
                  return isNaN(num) ? 999 : num;
                };

                const t1Drivers = this.getTeamDrivers(t1, racers);
                const t2Drivers = this.getTeamDrivers(t2, racers);

                const t1DriversSorted = [...t1Drivers].sort((a, b) => {
                  const posA = activeRacePositions[`${t1.id}_${a.id || a.name}`] || '';
                  const posB = activeRacePositions[`${t1.id}_${b.id || b.name}`] || '';
                  return getRankOrder(posA) - getRankOrder(posB);
                });

                const t2DriversSorted = [...t2Drivers].sort((a, b) => {
                  const posA = activeRacePositions[`${t2.id}_${a.id || a.name}`] || '';
                  const posB = activeRacePositions[`${t2.id}_${b.id || b.name}`] || '';
                  return getRankOrder(posA) - getRankOrder(posB);
                });

                const raceScore1 = Number(activeRaceGame.team1Score) || 0;
                const raceScore2 = Number(activeRaceGame.team2Score) || 0;

                return `
                  <div class="glass-card" style="background:rgba(10,14,22,0.85); border:1px solid ${match.isLocked ? 'var(--border-gold)' : (isExpanded ? 'var(--border-cyan)' : 'var(--border-subtle)')}; padding:1.25rem; border-radius:var(--radius-lg); display:flex; flex-direction:column; gap:1rem; transition:all 0.2s ease;">
                    
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

                      <div style="display:flex; align-items:center; gap:0.5rem;">
                        ${match.isLocked ? `
                          <span class="section-tag" style="background:rgba(0,255,136,0.15); color:#00ff88; border-color:#00ff8855; font-size:0.75rem;">
                            🏆 FINALIZED ${mTotalPts1 > mTotalPts2 ? `(${t1.name} Won)` : (mTotalPts2 > mTotalPts1 ? `(${t2.name} Won)` : (match.winnerTeamId === t1.id ? `(${t1.name} Won)` : match.winnerTeamId === t2.id ? `(${t2.name} Won)` : ''))}
                          </span>
                        ` : `
                          <div class="live-indicator">
                            <div class="live-dot"></div>
                            <span>IN PROGRESS</span>
                          </div>
                        `}
                      </div>
                    </div>

                    <!-- Head-to-Head Main Score Board (Clickable to Toggle Race View) -->
                    <div style="display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; gap:1rem; padding:0.5rem 0;">
                      
                      <!-- Team 1 Side -->
                      <div style="cursor:pointer; background:${isExpanded ? 'rgba(0,242,254,0.08)' : 'rgba(18,23,36,0.5)'}; border:1px solid ${isExpanded ? t1.color : 'rgba(255,255,255,0.05)'}; padding:0.85rem 1.15rem; border-radius:var(--radius-md); border-left:4px solid ${t1.color}; transition:all 0.2s ease;" onclick="window.championshipView.toggleViewerMatchExpand('${match.id}')" title="Tap to view races and driver points">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                          <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
                            <div style="width:38px; height:38px; border-radius:var(--radius-sm); border:2px solid ${t1.color}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); flex-shrink:0;">
                              ${t1.logoUrl ? `<img src="${t1.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${t1.logoIcon || '🏎️'}</span>`}
                            </div>
                            <div style="min-width:0;">
                              <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                                ${t1.name}
                              </div>
                              <div style="font-size:0.72rem; color:var(--accent-cyan); display:flex; align-items:center; gap:0.3rem; margin-top:2px;">
                                <span>${isExpanded ? '▲ Hide Races' : '▼ Tap to View Races'}</span>
                              </div>
                            </div>
                          </div>

                          <div style="font-family:var(--font-mono); font-size:1.45rem; font-weight:900; color:#ffffff; text-shadow:0 0 10px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.6), 0 0 35px rgba(255,255,255,0.4); flex-shrink:0; text-align:right; letter-spacing:0.5px;">
                            ${mTotalPts1} PTS
                          </div>
                        </div>
                      </div>

                      <!-- VS Center Pill -->
                      <div style="text-align:center; cursor:pointer;" onclick="window.championshipView.toggleViewerMatchExpand('${match.id}')">
                        <div style="font-family:var(--font-display); font-size:1.1rem; font-weight:900; color:var(--text-muted); background:rgba(255,255,255,0.05); width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.1); margin:0 auto;">
                          VS
                        </div>
                      </div>

                      <!-- Team 2 Side -->
                      <div style="cursor:pointer; background:${isExpanded ? 'rgba(255,59,92,0.08)' : 'rgba(18,23,36,0.5)'}; border:1px solid ${isExpanded ? t2.color : 'rgba(255,255,255,0.05)'}; padding:0.85rem 1.15rem; border-radius:var(--radius-md); border-right:4px solid ${t2.color}; transition:all 0.2s ease;" onclick="window.championshipView.toggleViewerMatchExpand('${match.id}')" title="Tap to view races and driver points">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                          <div style="font-family:var(--font-mono); font-size:1.45rem; font-weight:900; color:#ffffff; text-shadow:0 0 10px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.6), 0 0 35px rgba(255,255,255,0.4); flex-shrink:0; text-align:left; letter-spacing:0.5px;">
                            ${mTotalPts2} PTS
                          </div>

                          <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.75rem; min-width:0; text-align:right;">
                            <div style="min-width:0;">
                              <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                                ${t2.name}
                              </div>
                              <div style="font-size:0.72rem; color:var(--accent-cyan); display:flex; align-items:center; justify-content:flex-end; gap:0.3rem; margin-top:2px;">
                                <span>${isExpanded ? '▲ Hide Races' : '▼ Tap to View Races'}</span>
                              </div>
                            </div>
                            <div style="width:38px; height:38px; border-radius:var(--radius-sm); border:2px solid ${t2.color}; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); flex-shrink:0;">
                              ${t2.logoUrl ? `<img src="${t2.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${t2.logoIcon || '⚡'}</span>`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- EXPANDED RACE BREAKDOWN: RACES TABS + EXACT CAPSULE RACER ROWS (CREW 1 VS CREW 2) -->
                    ${isExpanded ? `
                      <div style="background:rgba(10,14,22,0.65); border-radius:var(--radius-md); padding:1.25rem; border:1px solid var(--border-subtle); backdrop-filter:blur(12px); display:flex; flex-direction:column; gap:1.25rem; animation: fadeIn 0.25s ease;">
                        
                        <!-- Race Selector Tabs -->
                        <div style="display:flex; align-items:center; justify-content:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:0.85rem;">
                          <span style="font-size:0.78rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-right:0.3rem;">SELECT RACE:</span>
                          ${Array.from({ length: scoredRacesCount }).map((_, rIdx) => {
                            const isSelected = currentViewerRaceIdx === rIdx;
                            const rGame = mGames[rIdx];
                            const hasPts = rGame && (rGame.team1Score > 0 || rGame.team2Score > 0);
                            return `
                              <button class="btn btn-sm ${isSelected ? 'btn-cyan' : 'btn-outline'}" style="font-size:0.82rem; padding:0.4rem 1rem; border-radius:50px; font-weight:800; ${isSelected ? 'box-shadow:0 0 15px rgba(0,242,254,0.4);' : ''}" onclick="window.championshipView.setViewerSelectedRace('${match.id}', ${rIdx})">
                                Race #${rIdx + 1} ${hasPts ? `(${rGame.team1Score} - ${rGame.team2Score} PTS)` : ''}
                              </button>
                            `;
                          }).join('')}
                        </div>

                        <!-- Crew 1 VS Crew 2 Header Pills (Website Cyberpunk Dark Glass Theme) -->
                        <div style="display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; gap:1rem;">
                          <!-- Crew 1 Header -->
                          <div style="background:rgba(18,23,36,0.85); color:#fff; border-radius:50px; padding:0.6rem 1.25rem; text-align:center; display:flex; align-items:center; justify-content:center; gap:0.5rem; box-shadow:0 0 15px ${t1.color}33; border:2px solid ${t1.color}; backdrop-filter:blur(8px);">
                            <span style="font-family:var(--font-display); font-weight:800; font-size:1.05rem; color:#fff;">${t1.name}</span>
                            <span style="font-family:var(--font-mono); font-weight:900; font-size:0.95rem; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6);">(${raceScore1} PTS)</span>
                          </div>

                          <!-- VS Pill -->
                          <div style="font-family:var(--font-display); font-weight:900; font-size:1.1rem; color:var(--text-muted); padding:0 0.25rem;">
                            VS
                          </div>

                          <!-- Crew 2 Header -->
                          <div style="background:rgba(18,23,36,0.85); color:#fff; border-radius:50px; padding:0.6rem 1.25rem; text-align:center; display:flex; align-items:center; justify-content:center; gap:0.5rem; box-shadow:0 0 15px ${t2.color}33; border:2px solid ${t2.color}; backdrop-filter:blur(8px);">
                            <span style="font-family:var(--font-display); font-weight:800; font-size:1.05rem; color:#fff;">${t2.name}</span>
                            <span style="font-family:var(--font-mono); font-weight:900; font-size:0.95rem; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6);">(${raceScore2} PTS)</span>
                          </div>
                        </div>

                        <!-- Capsule Driver Rows: Side-by-Side (Crew 1 on Left, Crew 2 on Right) -->
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem;">
                          
                          <!-- Crew 1 Drivers Column -->
                          <div style="display:flex; flex-direction:column; gap:0.55rem;">
                            ${t1DriversSorted.map((driver) => {
                              const pos = activeRacePositions[`${t1.id}_${driver.id || driver.name}`] || '';
                              const pts = this.getPointsForPosition(pos);
                              const rankColor = pos === '1st' ? 'var(--accent-gold)' : (pos === '2nd' || pos === '3rd' ? 'var(--accent-cyan)' : (pos === 'DNF' ? 'var(--accent-red)' : (pos ? '#ffffff' : 'var(--text-muted)')));
                              return `
                                <div style="background:rgba(18,23,36,0.75); color:#fff; border-radius:50px; padding:0.45rem 0.95rem; display:flex; align-items:center; gap:0.65rem; border:1px solid rgba(255,255,255,0.08); border-left:3px solid ${t1.color}; backdrop-filter:blur(6px);">
                                  <!-- Rank -->
                                  <div style="font-family:var(--font-mono); font-weight:800; font-size:0.82rem; color:${rankColor}; min-width:34px; text-align:center; padding-right:0.5rem; border-right:1.5px solid rgba(255,255,255,0.12);">
                                    ${pos || '—'}
                                  </div>
                                  <!-- Racer Name -->
                                  <div style="flex:1; font-family:var(--font-display); font-weight:700; font-size:0.92rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                                    ${driver.name}
                                  </div>
                                  <!-- Points (White + Glowing, No + Sign) -->
                                  <div style="font-family:var(--font-mono); font-weight:900; font-size:0.9rem; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6), 0 0 24px rgba(255,255,255,0.35); background:rgba(0,0,0,0.45); padding:0.2rem 0.65rem; border-radius:14px; border:1px solid rgba(255,255,255,0.18); letter-spacing:0.5px;">
                                    ${pos ? (pos === 'DNF' ? '0 PTS' : `${pts} PTS`) : '0 PTS'}
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>

                          <!-- Crew 2 Drivers Column -->
                          <div style="display:flex; flex-direction:column; gap:0.55rem;">
                            ${t2DriversSorted.map((driver) => {
                              const pos = activeRacePositions[`${t2.id}_${driver.id || driver.name}`] || '';
                              const pts = this.getPointsForPosition(pos);
                              const rankColor = pos === '1st' ? 'var(--accent-gold)' : (pos === '2nd' || pos === '3rd' ? 'var(--accent-cyan)' : (pos === 'DNF' ? 'var(--accent-red)' : (pos ? '#ffffff' : 'var(--text-muted)')));
                              return `
                                <div style="background:rgba(18,23,36,0.75); color:#fff; border-radius:50px; padding:0.45rem 0.95rem; display:flex; align-items:center; gap:0.65rem; border:1px solid rgba(255,255,255,0.08); border-right:3px solid ${t2.color}; backdrop-filter:blur(6px);">
                                  <!-- Rank -->
                                  <div style="font-family:var(--font-mono); font-weight:800; font-size:0.82rem; color:${rankColor}; min-width:34px; text-align:center; padding-right:0.5rem; border-right:1.5px solid rgba(255,255,255,0.12);">
                                    ${pos || '—'}
                                  </div>
                                  <!-- Racer Name -->
                                  <div style="flex:1; font-family:var(--font-display); font-weight:700; font-size:0.92rem; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
                                    ${driver.name}
                                  </div>
                                  <!-- Points (White + Glowing, No + Sign) -->
                                  <div style="font-family:var(--font-mono); font-weight:900; font-size:0.9rem; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.6), 0 0 24px rgba(255,255,255,0.35); background:rgba(0,0,0,0.45); padding:0.2rem 0.65rem; border-radius:14px; border:1px solid rgba(255,255,255,0.18); letter-spacing:0.5px;">
                                    ${pos ? (pos === 'DNF' ? '0 PTS' : `${pts} PTS`) : '0 PTS'}
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>

                        </div>
                      </div>
                    ` : ''}

                  </div>
                `;
              }).join('')}

              ${!isAdmin && hiddenMatchesCount > 0 ? `
                <div style="text-align:center; padding:1rem 1.25rem; color:var(--text-muted); font-size:0.82rem; background:rgba(18,23,36,0.4); border-radius:var(--radius-md); border:1px dashed rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; gap:0.6rem; font-family:var(--font-display); letter-spacing:0.5px;">
                  <span style="font-size:1.1rem;">🔒</span>
                  <span><strong>${hiddenMatchesCount} Upcoming Match${hiddenMatchesCount > 1 ? 'es' : ''} Scheduled</strong> — Will automatically unlock live as current matches are finalized by Race Control.</span>
                </div>
              ` : ''}
            </div>
            `}
          </div>
        `;
      }

      // 3. TOURNAMENT STANDINGS TABLE (Visible to Admin always, and to Viewers only when published by Admin)
      let standingsHtml = '';
      if (isAdmin || showChampionshipStandingsToViewers) {
        standingsHtml = `
          <!-- TOURNAMENT OVERALL STANDINGS TABLE -->
          <div class="glass-card" style="border-top: 3px solid var(--accent-gold); width: 100%; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            
            <div class="section-header" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:rgba(255,215,0,0.3);">
                  STANDINGS
                </span>
                <h3 class="section-title" style="font-size:1.25rem;">
                  Tournament Championship Leaderboard
                </h3>
              </div>

              <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                ${isAdmin ? `
                  <button class="btn btn-sm ${showChampionshipStandingsToViewers ? 'btn-green' : 'btn-outline'}" style="font-size:0.78rem; padding:0.4rem 0.85rem; font-weight:800; display:flex; align-items:center; gap:0.4rem;" onclick="window.championshipView.toggleStandingsVisibility()">
                    ${showChampionshipStandingsToViewers ? '👁️ PUBLISHED TO VIEWERS (Tap to Hide)' : '🙈 HIDDEN FROM VIEWERS (Tap to Publish)'}
                  </button>
                ` : `
                  <span style="font-size:0.78rem; color:var(--text-muted);">${teams.length} Teams Registered</span>
                `}
              </div>
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
                          <span style="font-family:var(--font-mono); font-weight:900; font-size:1.15rem; color:#ffffff; text-shadow:0 0 10px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.6), 0 0 35px rgba(255,255,255,0.4); letter-spacing:0.5px;">
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
      }

      const subNavBarHtml = `
        <!-- TOURNAMENT SUB-NAVIGATION (CREW / SOLO) -->
        <div style="display:flex; justify-content:center; align-items:center; margin: 0 0 0.5rem;">
          <div style="display:inline-flex; background:rgba(14,18,28,0.85); padding:0.35rem; border-radius:50px; border:1px solid rgba(0,242,254,0.25); box-shadow:0 4px 20px rgba(0,0,0,0.4); backdrop-filter:blur(10px); gap:0.35rem;">
            <button 
              class="btn btn-sm ${this.tournamentSubMode === 'crew' ? 'btn-cyan' : 'btn-ghost'}" 
              style="border-radius:50px; padding:0.45rem 1.6rem; font-family:var(--font-display); font-size:0.88rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; transition:all 0.25s ease;"
              onclick="window.championshipView.setTournamentSubMode('crew')">
              🏁 Crew
            </button>
            <button 
              class="btn btn-sm ${this.tournamentSubMode === 'solo' ? 'btn-cyan' : 'btn-ghost'}" 
              style="border-radius:50px; padding:0.45rem 1.6rem; font-family:var(--font-display); font-size:0.88rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; transition:all 0.25s ease;"
              onclick="window.championshipView.setTournamentSubMode('solo')">
              🏎️ Solo
            </button>
          </div>
        </div>
      `;

      const soloViewHtml = `
        <!-- SOLO RACING MODE CONTAINER -->
        <div class="glass-card" style="border-top:3px solid var(--accent-cyan); width:100%; padding:3.5rem 1.5rem; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1.25rem;">
          <div style="width:72px; height:72px; border-radius:50%; background:rgba(0,242,254,0.12); border:2px solid var(--accent-cyan); display:flex; align-items:center; justify-content:center; font-size:2.3rem; box-shadow:0 0 25px rgba(0,242,254,0.35);">
            🏎️
          </div>
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            <span class="section-tag" style="color:var(--accent-cyan); align-self:center; font-size:0.75rem; letter-spacing:1px;">
              SOLO TOURNAMENT ARENA
            </span>
            <h3 style="font-family:var(--font-display); font-size:1.65rem; color:#fff; text-transform:uppercase; letter-spacing:1px; margin:0.25rem 0 0;">
              Solo Championship Racing
            </h3>
            <p style="color:var(--text-secondary); max-width:500px; font-size:0.9rem; margin:0.5rem auto 0; line-height:1.5;">
              Individual driver leaderboard and solo tournament matches will appear here.
            </p>
          </div>
        </div>
      `;

      if (this.tournamentSubMode === 'solo') {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:1.5rem; width:100%;">
            ${subNavBarHtml}
            ${soloViewHtml}
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:1.5rem; width:100%;">
            ${subNavBarHtml}
            ${adminHubHtml}
            ${viewerMatchCardsHtml}
            ${standingsHtml}
          </div>
        `;
      }
    } catch (err) {
      console.error('Error in renderChampionshipView:', err);
    }
  }
}

export const championshipView = new ChampionshipView();
