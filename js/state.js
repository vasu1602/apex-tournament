import { PRESET_AVATARS, DEFAULT_RACER_AVATAR, DEFAULT_TEAM_LOGO } from './presets.js';

const STORAGE_KEY = 'apex_racing_auction_state_v1';

export const TIERS = [
  'All Tiers',
  'Tier S',
  'Tier A',
  'Tier B',
  'Tier C',
  'Tier D'
];

export const CATEGORIES = TIERS;

export const DEFAULT_TEAMS = [];

export const DEFAULT_RACERS = [];

export const DEFAULT_ACCESS_CODES = [
  {
    id: 'code_root',
    code: 'SOULCITYS3FULL',
    label: 'Soul City Super Admin (Full Access)',
    role: 'super_admin',
    teamId: null,
    createdAt: '2026-08-15'
  },
  {
    id: 'code_auctioneer',
    code: 'SOULCITYS3',
    label: 'Bid & Team Leader Access',
    role: 'auctioneer',
    teamId: null,
    createdAt: '2026-08-15'
  }
];

export const INITIAL_STATE = {
  tournamentName: 'Apex Grand Prix 2026: Championship Auction',
  teams: DEFAULT_TEAMS,
  racers: DEFAULT_RACERS,
  accessCodes: DEFAULT_ACCESS_CODES,
  activeAuction: {
    racerId: null,
    currentBid: 0,
    leadingTeamId: null,
    bidHistory: [],
    timerSeconds: 30,
    isTimerRunning: false,
    status: 'idle'
  },
  auctionHistory: [],
  tournamentRounds: [
    { id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }
  ],
  activeTournamentRoundId: 'round_qualifiers',
  tournamentMatchups: [],
  showChampionshipStandingsToViewers: false,
  currentUser: {
    isAuthenticated: false,
    role: 'viewer',
    adminName: 'Spectator',
    teamId: null,
    codeId: null
  }
};

class StateStore {
  constructor() {
    this.state = this.loadState();
    this.listeners = new Set();
  }

  loadState() {
    const toArray = (val, fallback = []) => {
      if (!val) return fallback;
      if (Array.isArray(val)) return val;
      if (typeof val === 'object') return Object.values(val);
      return fallback;
    };

    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const serialized = localStorage.getItem(STORAGE_KEY);
        if (serialized) {
          const parsed = JSON.parse(serialized);
          if (parsed && typeof parsed === 'object') {
            const savedSession = parsed.currentUser?.isAuthenticated ? parsed.currentUser : {
              isAuthenticated: false,
              role: 'viewer',
              adminName: 'Spectator',
              teamId: null,
              codeId: null
            };

            let accessCodes = toArray(parsed.accessCodes, DEFAULT_ACCESS_CODES);
            if (accessCodes.length === 0) accessCodes = DEFAULT_ACCESS_CODES;

            // Ensure SOULCITYS3FULL and SOULCITYS3 are present and active
            const hasFull = accessCodes.some((c) => c.code === 'SOULCITYS3FULL');
            const hasLeader = accessCodes.some((c) => c.code === 'SOULCITYS3');
            if (!hasFull || !hasLeader) {
              accessCodes = DEFAULT_ACCESS_CODES;
            }

            const parsedTeams = parsed.teams !== undefined ? toArray(parsed.teams, []) : DEFAULT_TEAMS;
            const parsedRacers = parsed.racers !== undefined ? toArray(parsed.racers, []) : DEFAULT_RACERS;
            const parsedRounds = toArray(parsed.tournamentRounds, INITIAL_STATE.tournamentRounds);
            const parsedMatchups = toArray(parsed.tournamentMatchups, []);
            const parsedHistory = toArray(parsed.auctionHistory, []);

            return {
              ...INITIAL_STATE,
              tournamentName: parsed.tournamentName || INITIAL_STATE.tournamentName,
              teams: parsedTeams,
              racers: parsedRacers,
              tournamentRounds: parsedRounds.length > 0 ? parsedRounds : INITIAL_STATE.tournamentRounds,
              activeTournamentRoundId: parsed.activeTournamentRoundId || 'round_qualifiers',
              tournamentMatchups: parsedMatchups,
              showChampionshipStandingsToViewers: Boolean(parsed.showChampionshipStandingsToViewers),
              activeAuction: parsed.activeAuction || INITIAL_STATE.activeAuction,
              auctionHistory: parsedHistory,
              accessCodes,
              currentUser: savedSession,
              updatedAt: Number(parsed.updatedAt) || 0
            };
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load local state, using initial state:', e);
    }
    return {
      ...JSON.parse(JSON.stringify(INITIAL_STATE)),
      updatedAt: 0
    };
  }

  saveState(broadcast = true, isExplicitClear = false) {
    try {
      this.state.updatedAt = Date.now();
      const stateToPersist = {
        tournamentName: this.state.tournamentName,
        teams: this.state.teams,
        racers: this.state.racers,
        accessCodes: this.state.accessCodes,
        activeAuction: this.state.activeAuction,
        auctionHistory: this.state.auctionHistory,
        tournamentRounds: this.state.tournamentRounds || INITIAL_STATE.tournamentRounds,
        activeTournamentRoundId: this.state.activeTournamentRoundId || 'round_qualifiers',
        tournamentMatchups: this.state.tournamentMatchups || [],
        showChampionshipStandingsToViewers: Boolean(this.state.showChampionshipStandingsToViewers),
        currentUser: this.state.currentUser,
        updatedAt: this.state.updatedAt,
        isExplicitClear
      };
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
      }
      if (broadcast && typeof window !== 'undefined' && window.syncBridge) {
        window.syncBridge.broadcastState(this.state, isExplicitClear);
      }
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
    this.notify();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(eventMeta = null) {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, eventMeta);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    });
  }

  // Receive state from other tabs & cloud sync
  applyExternalState(newState) {
    if (!newState || typeof newState !== 'object') return;
    const incomingTime = Number(newState.updatedAt) || Date.now();
    const localTime = Number(this.state.updatedAt) || 0;

    // Strict monotonic clock: Discard if incoming packet is older or same age as current local state
    if (localTime > 0 && incomingTime > 0 && incomingTime <= localTime && !newState.isExplicitClear) {
      return;
    }

    const currentSession = this.state.currentUser;

    const toArray = (val, fallback = []) => {
      if (!val) return fallback;
      if (Array.isArray(val)) return val;
      if (typeof val === 'object') return Object.values(val);
      return fallback;
    };

    const incomingRounds = toArray(newState.tournamentRounds, this.state.tournamentRounds || INITIAL_STATE.tournamentRounds);
    const finalRounds = incomingRounds.length > 0 ? incomingRounds : (this.state.tournamentRounds || INITIAL_STATE.tournamentRounds);

    const incomingMatchups = typeof newState.tournamentMatchups !== 'undefined' ? toArray(newState.tournamentMatchups, []) : null;
    let finalMatchups = incomingMatchups !== null ? incomingMatchups : (this.state.tournamentMatchups || []);

    const incomingRacers = typeof newState.racers !== 'undefined' ? toArray(newState.racers, []) : null;
    let finalRacers = incomingRacers !== null ? incomingRacers : (this.state.racers || []);

    const incomingTeams = typeof newState.teams !== 'undefined' ? toArray(newState.teams, []) : null;
    let finalTeams = incomingTeams !== null ? incomingTeams : (this.state.teams || []);

    // Filter matchups so no orphan matchups from deleted rounds remain
    const validRoundIds = new Set(finalRounds.map(r => r.id));
    finalMatchups = finalMatchups.filter(m => validRoundIds.has(m.roundId || finalRounds[0]?.id));

    const finalActiveRoundId = validRoundIds.has(newState.activeTournamentRoundId)
      ? newState.activeTournamentRoundId
      : (validRoundIds.has(this.state.activeTournamentRoundId) ? this.state.activeTournamentRoundId : finalRounds[0]?.id);

    this.state = {
      ...this.state,
      tournamentName: newState.tournamentName || this.state.tournamentName,
      teams: finalTeams,
      racers: finalRacers,
      accessCodes: toArray(newState.accessCodes, this.state.accessCodes || DEFAULT_ACCESS_CODES),
      activeAuction: newState.activeAuction || this.state.activeAuction,
      auctionHistory: toArray(newState.auctionHistory, this.state.auctionHistory || []),
      tournamentRounds: finalRounds,
      activeTournamentRoundId: finalActiveRoundId,
      tournamentMatchups: finalMatchups,
      showChampionshipStandingsToViewers: typeof newState.showChampionshipStandingsToViewers !== 'undefined' ? Boolean(newState.showChampionshipStandingsToViewers) : Boolean(this.state.showChampionshipStandingsToViewers),
      currentUser: currentSession,
      updatedAt: incomingTime
    };

    // Persist to local storage so future page reloads retain this latest state
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('Could not persist sync state to localStorage:', e);
    }

    this.recalculateTeamBudgets();
    this.notify({ source: 'sync' });
  }

  // --- ACCESS CODE AUTHENTICATION ENGINE ---
  verifyAccessCode(enteredCode) {
    if (!enteredCode || !enteredCode.trim()) {
      return { success: false, message: 'Please enter a valid tournament access code.' };
    }

    const cleanCode = enteredCode.trim().toUpperCase();
    const codes = this.state.accessCodes || DEFAULT_ACCESS_CODES;
    const match = codes.find((c) => c.code.trim().toUpperCase() === cleanCode);

    if (!match) {
      return {
        success: false,
        message: `Invalid access code "${enteredCode}". Please verify your code with the Tournament Director.`
      };
    }

    // Role assignment & authentication
    this.state.currentUser = {
      isAuthenticated: true,
      role: match.role || 'super_admin',
      adminName: match.label || 'Tournament Official',
      teamId: match.teamId || null,
      codeId: match.id
    };

    this.saveState();
    return { success: true, user: this.state.currentUser };
  }

  signOut() {
    this.state.currentUser = {
      isAuthenticated: false,
      role: 'viewer',
      adminName: 'Spectator',
      teamId: null,
      codeId: null
    };
    this.saveState();
    return { success: true };
  }

  // --- ACCESS CODE CREATION & DELEGATION ---
  createAccessCode({ label, role = 'super_admin', teamId = null, customCode = null }) {
    if (!label || !label.trim()) {
      return { success: false, message: 'Please provide a name or label for this access permission.' };
    }

    let finalCode = (customCode || '').trim().toUpperCase();
    if (!finalCode) {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const prefix = role === 'super_admin' ? 'ADMIN' : role === 'auctioneer' ? 'GAVEL' : 'TEAM';
      finalCode = `${prefix}-${randNum}`;
    }

    if (!Array.isArray(this.state.accessCodes)) {
      this.state.accessCodes = [...DEFAULT_ACCESS_CODES];
    }

    // Check duplicate code
    const duplicate = this.state.accessCodes.some((c) => c.code.toUpperCase() === finalCode);
    if (duplicate) {
      return { success: false, message: `Access code "${finalCode}" already exists. Please choose a different code.` };
    }

    const newCodeObj = {
      id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      code: finalCode,
      label: label.trim(),
      role,
      teamId: role === 'team_admin' ? teamId : null,
      createdAt: new Date().toLocaleDateString()
    };

    this.state.accessCodes.push(newCodeObj);
    this.saveState();
    return { success: true, accessCode: newCodeObj };
  }

  revokeAccessCode(codeId) {
    if (codeId === 'code_root') {
      return { success: false, message: 'Cannot revoke root Master Admin code (SOULCITYS3FULL).' };
    }

    this.state.accessCodes = (this.state.accessCodes || []).filter((c) => c.id !== codeId);

    // If active user logged in with this revoked code, sign them out
    if (this.state.currentUser && this.state.currentUser.codeId === codeId) {
      this.signOut();
    } else {
      this.saveState();
    }

    return { success: true };
  }

  revokeAdmin(adminId) {
    // Prevent removing the primary master admin
    if (this.state.authorizedAdmins.length <= 1) {
      return { success: false, message: 'Cannot remove the last remaining admin.' };
    }

    const target = this.state.authorizedAdmins.find((a) => a.id === adminId);
    if (!target) return { success: false, message: 'Admin not found.' };

    this.state.authorizedAdmins = this.state.authorizedAdmins.filter((a) => a.id !== adminId);

    // If currently logged in user was revoked, log out
    if (this.state.currentUser.email === target.email) {
      this.signOut();
    } else {
      this.saveState();
    }

    return { success: true };
  }

  // Helper: Calculate remaining available points for a team
  getTeamAvailablePoints(teamId, excludeRacerId = null) {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team) return 0;
    const currentSpent = this.state.racers
      .filter((r) => r.soldToTeamId === teamId && r.status === 'sold' && r.id !== excludeRacerId)
      .reduce((sum, r) => sum + (Number(r.soldPoints) || 0), 0);
    return Math.max(0, team.startingPoints - currentSpent);
  }

  // RACER CRUD (Simplified: Name, Tier S/A/B/C/D, Starting Bid, Photo/Avatar)
  addRacer(racerData) {
    const tierVal = racerData.tier || racerData.category || 'Tier S';
    const status = racerData.status || 'upcoming';
    const soldToTeamId = racerData.soldToTeamId || null;
    const basePoints = Number(racerData.basePoints) || 1000;
    const soldPoints = status === 'sold' ? (racerData.soldPoints !== undefined && racerData.soldPoints !== null ? Number(racerData.soldPoints) : basePoints) : null;

    // Strict Budget Limit Check
    if (status === 'sold' && soldToTeamId) {
      const team = this.state.teams.find((t) => t.id === soldToTeamId);
      if (!team) return { success: false, message: 'Selected team not found.' };

      const available = this.getTeamAvailablePoints(soldToTeamId);
      if (soldPoints > available) {
        return {
          success: false,
          message: `Cannot assign to ${team.name} for ${soldPoints.toLocaleString()} PTS! Exceeds available budget of ${available.toLocaleString()} PTS (${team.startingPoints.toLocaleString()} PTS total budget limit).`
        };
      }

      const currentCount = this.state.racers.filter((r) => r.soldToTeamId === soldToTeamId && r.status === 'sold').length;
      if (currentCount >= team.maxRoster) {
        return {
          success: false,
          message: `${team.name} roster is already full (${team.maxRoster}/${team.maxRoster} slots)!`
        };
      }
    }

    const id = 'racer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const newRacer = {
      id,
      name: racerData.name.trim(),
      tier: tierVal,
      category: tierVal,
      basePoints,
      soldPoints,
      soldToTeamId,
      status,
      avatar: racerData.avatar || DEFAULT_RACER_AVATAR,
      photoUrl: racerData.photoUrl || null
    };

    this.state.racers.push(newRacer);
    this.recalculateTeamBudgets();
    this.saveState();
    return { success: true, racer: newRacer };
  }

  updateRacer(racerId, updates) {
    const idx = this.state.racers.findIndex((r) => r.id === racerId);
    if (idx === -1) return { success: false, message: 'Racer not found.' };

    const currentRacer = this.state.racers[idx];
    const targetStatus = updates.status !== undefined ? updates.status : currentRacer.status;
    const targetTeamId = updates.soldToTeamId !== undefined ? updates.soldToTeamId : currentRacer.soldToTeamId;
    const targetPrice = updates.soldPoints !== undefined 
      ? (updates.soldPoints === null ? null : Number(updates.soldPoints)) 
      : (currentRacer.soldPoints !== null ? Number(currentRacer.soldPoints) : Number(currentRacer.basePoints));

    // Strict Budget Limit Check on Edit
    if (targetStatus === 'sold' && targetTeamId) {
      const team = this.state.teams.find((t) => t.id === targetTeamId);
      if (!team) return { success: false, message: 'Selected team not found.' };

      const available = this.getTeamAvailablePoints(targetTeamId, racerId);
      const priceToCheck = targetPrice !== null ? targetPrice : (Number(updates.basePoints) || currentRacer.basePoints);

      if (priceToCheck > available) {
        return {
          success: false,
          message: `Cannot assign to ${team.name} for ${priceToCheck.toLocaleString()} PTS! Exceeds available budget of ${available.toLocaleString()} PTS (${team.startingPoints.toLocaleString()} PTS total budget limit).`
        };
      }

      const currentCount = this.state.racers.filter((r) => r.soldToTeamId === targetTeamId && r.status === 'sold' && r.id !== racerId).length;
      if (currentCount >= team.maxRoster) {
        return {
          success: false,
          message: `${team.name} roster is already full (${team.maxRoster}/${team.maxRoster} slots)!`
        };
      }
    }

    const tierVal = updates.tier || updates.category || currentRacer.tier || 'Tier S';
    this.state.racers[idx] = {
      ...currentRacer,
      name: updates.name ? updates.name.trim() : currentRacer.name,
      tier: tierVal,
      category: tierVal,
      basePoints: updates.basePoints !== undefined ? Number(updates.basePoints) : currentRacer.basePoints,
      status: targetStatus,
      soldPoints: targetStatus === 'sold' ? targetPrice : null,
      soldToTeamId: targetStatus === 'sold' ? targetTeamId : null,
      avatar: updates.avatar || currentRacer.avatar,
      photoUrl: updates.photoUrl !== undefined ? updates.photoUrl : currentRacer.photoUrl
    };

    this.recalculateTeamBudgets();
    this.saveState();
    return { success: true, racer: this.state.racers[idx] };
  }

  recalculateTeamBudgets() {
    this.state.teams.forEach((team) => {
      const teamRacers = this.state.racers.filter((r) => r.soldToTeamId === team.id && r.status === 'sold');
      team.roster = teamRacers.map((r) => ({
        id: r.id,
        name: r.name,
        tier: r.tier || r.category || 'Tier S',
        category: r.tier || r.category || 'Tier S',
        avatar: r.avatar,
        photoUrl: r.photoUrl,
        soldPoints: Number(r.soldPoints) || 0
      }));
      const totalSpent = teamRacers.reduce((sum, r) => sum + (Number(r.soldPoints) || 0), 0);
      team.remainingPoints = Math.max(0, team.startingPoints - totalSpent);
    });
  }

  setRacerSaleOutcome(racerId, { status, soldToTeamId, soldPoints }) {
    const racer = this.state.racers.find((r) => r.id === racerId);
    if (!racer) return { success: false, message: 'Racer not found' };

    if (status === 'sold') {
      if (!soldToTeamId) {
        return { success: false, message: 'Please choose a winning team when marking as SOLD.' };
      }
      const team = this.state.teams.find((t) => t.id === soldToTeamId);
      if (!team) {
        return { success: false, message: 'Selected team not found.' };
      }

      const finalPrice = Number(soldPoints) || racer.basePoints;
      const available = this.getTeamAvailablePoints(soldToTeamId, racerId);

      // Strict Budget Limit Check
      if (finalPrice > available) {
        return {
          success: false,
          message: `Cannot sell to ${team.name} for ${finalPrice.toLocaleString()} PTS! Exceeds available budget of ${available.toLocaleString()} PTS (${team.startingPoints.toLocaleString()} PTS total budget limit).`
        };
      }

      const currentCount = this.state.racers.filter((r) => r.soldToTeamId === soldToTeamId && r.status === 'sold' && r.id !== racerId).length;
      if (currentCount >= team.maxRoster) {
        return {
          success: false,
          message: `${team.name} roster is already full (${team.maxRoster}/${team.maxRoster} slots)!`
        };
      }

      racer.status = 'sold';
      racer.soldToTeamId = soldToTeamId;
      racer.soldPoints = finalPrice;
      
      // If this was the active auction racer, update active auction
      if (this.state.activeAuction.racerId === racerId) {
        this.state.activeAuction.status = 'sold';
        this.state.activeAuction.leadingTeamId = soldToTeamId;
        this.state.activeAuction.currentBid = racer.soldPoints;
      }
    } else {
      racer.status = status;
      racer.soldToTeamId = null;
      racer.soldPoints = null;
      if (this.state.activeAuction.racerId === racerId) {
        this.state.activeAuction.status = status;
        this.state.activeAuction.leadingTeamId = null;
      }
    }

    this.recalculateTeamBudgets();
    this.saveState();
    return { success: true, racer };
  }

  deleteRacer(racerId) {
    // If active auction is this racer, stop it
    if (this.state.activeAuction.racerId === racerId) {
      this.cancelAuction();
    }
    this.state.racers = this.state.racers.filter((r) => r.id !== racerId);
    this.recalculateTeamBudgets();
    this.saveState();
  }

  // TEAM CRUD (Simplified: Name, Starting Budget, Max Slots, Color, Logo Photo/Emblem)
  addTeam(teamData) {
    const id = 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const pts = Number(teamData.startingPoints) || 10000;
    const newTeam = {
      id,
      name: teamData.name.trim(),
      shortCode: (teamData.shortCode || teamData.name.slice(0, 3)).toUpperCase(),
      color: teamData.color || '#00f2fe',
      accent: teamData.accent || '#4facfe',
      startingPoints: pts,
      remainingPoints: pts,
      maxRoster: Number(teamData.maxRoster) || 4,
      captain: teamData.captain ? teamData.captain.trim() : '',
      logoIcon: teamData.logoIcon || '🏎️',
      logoUrl: teamData.logoUrl || null,
      roster: []
    };
    this.state.teams.push(newTeam);
    this.saveState();
    return newTeam;
  }

  updateTeam(teamId, updates) {
    const idx = this.state.teams.findIndex((t) => t.id === teamId);
    if (idx !== -1) {
      this.state.teams[idx] = {
        ...this.state.teams[idx],
        ...updates,
        logoUrl: updates.logoUrl !== undefined ? updates.logoUrl : this.state.teams[idx].logoUrl
      };
      this.saveState();
    }
  }

  deleteTeam(teamId) {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (team) {
      // Revert sold racers in this team to upcoming
      this.state.racers.forEach((r) => {
        if (r.soldToTeamId === teamId) {
          r.status = 'upcoming';
          r.soldPoints = null;
          r.soldToTeamId = null;
        }
      });
    }

    // Reset active auction if deleted team was leading
    if (this.state.activeAuction.leadingTeamId === teamId) {
      this.state.activeAuction.leadingTeamId = null;
      this.state.activeAuction.currentBid = 0;
      this.state.activeAuction.bidHistory = [];
    }

    this.state.teams = this.state.teams.filter((t) => t.id !== teamId);
    this.saveState();
  }

  clearAllTournamentData() {
    this.state.teams = [];
    this.state.racers = [];
    this.state.auctionHistory = [];
    this.state.activeAuction = {
      racerId: null,
      currentBid: 0,
      leadingTeamId: null,
      bidHistory: [],
      timerSeconds: 30,
      isTimerRunning: false,
      status: 'idle'
    };
    this.saveState();
  }

  // AUCTION ACTIONS
  startAuction(racerId) {
    const racer = this.state.racers.find((r) => r.id === racerId);
    if (!racer) return false;

    // Set any currently live racer back to upcoming if not finished
    this.state.racers.forEach((r) => {
      if (r.status === 'live') r.status = 'upcoming';
    });

    racer.status = 'live';

    this.state.activeAuction = {
      racerId: racer.id,
      currentBid: racer.basePoints,
      leadingTeamId: null,
      bidHistory: [],
      timerSeconds: 30,
      isTimerRunning: true,
      status: 'bidding'
    };

    this.saveState();
    return true;
  }

  placeBid(teamId, amount) {
    const { activeAuction, teams, racers } = this.state;
    if (!activeAuction.racerId || activeAuction.status !== 'bidding') {
      return { success: false, message: 'No live auction in progress' };
    }

    const team = teams.find((t) => t.id === teamId);
    const racer = racers.find((r) => r.id === activeAuction.racerId);

    if (!team || !racer) {
      return { success: false, message: 'Invalid team or racer' };
    }

    if (team.roster.length >= team.maxRoster) {
      return { success: false, message: `${team.name} has already filled their roster (${team.maxRoster}/${team.maxRoster} slots)!` };
    }

    const available = this.getTeamAvailablePoints(teamId);
    if (amount > available) {
      return { 
        success: false, 
        message: `${team.name} cannot bid ${amount.toLocaleString()} PTS! Exceeds available budget (${available.toLocaleString()} PTS remaining of ${team.startingPoints.toLocaleString()} PTS limit).` 
      };
    }

    if (amount <= activeAuction.currentBid && activeAuction.leadingTeamId !== null) {
      return { success: false, message: `Bid must be higher than current bid (${activeAuction.currentBid.toLocaleString()} PTS)` };
    }

    // Update active auction
    activeAuction.currentBid = amount;
    activeAuction.leadingTeamId = teamId;
    activeAuction.timerSeconds = 25; // reset timer pulse on new bid
    activeAuction.isTimerRunning = true;

    activeAuction.bidHistory.unshift({
      id: 'bid_' + Date.now(),
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      amount,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    this.saveState();
    return { success: true, bid: activeAuction.bidHistory[0] };
  }

  soldAuction(customTeamId = null, customPrice = null) {
    const { activeAuction, teams, racers } = this.state;
    if (!activeAuction.racerId) {
      return { success: false, message: 'No active racer on the auction block' };
    }

    const teamIdToUse = customTeamId || activeAuction.leadingTeamId;
    const racer = racers.find((r) => r.id === activeAuction.racerId);

    if (!teamIdToUse) {
      return { success: false, message: 'Please select a winning team before marking SOLD.' };
    }

    const winningTeam = teams.find((t) => t.id === teamIdToUse);
    if (!winningTeam || !racer) {
      return { success: false, message: 'Winning team or racer not found' };
    }

    const finalAmount = customPrice !== null && customPrice !== undefined ? Number(customPrice) : (activeAuction.currentBid || racer.basePoints);

    // Strict Budget Limit Check
    const available = this.getTeamAvailablePoints(winningTeam.id, racer.id);
    if (finalAmount > available) {
      return {
        success: false,
        message: `Cannot sell to ${winningTeam.name} for ${finalAmount.toLocaleString()} PTS! Exceeds available budget of ${available.toLocaleString()} PTS (${winningTeam.startingPoints.toLocaleString()} PTS total budget limit).`
      };
    }

    const currentCount = racers.filter((r) => r.soldToTeamId === winningTeam.id && r.status === 'sold' && r.id !== racer.id).length;
    if (currentCount >= winningTeam.maxRoster) {
      return {
        success: false,
        message: `${winningTeam.name} roster is already full (${winningTeam.maxRoster}/${winningTeam.maxRoster} slots)!`
      };
    }

    racer.status = 'sold';
    racer.soldPoints = finalAmount;
    racer.soldToTeamId = winningTeam.id;

    activeAuction.status = 'sold';
    activeAuction.currentBid = finalAmount;
    activeAuction.leadingTeamId = winningTeam.id;
    activeAuction.isTimerRunning = false;

    // Record to auction history
    const saleRecord = {
      id: 'sale_' + Date.now(),
      racerId: racer.id,
      racerName: racer.name,
      tier: racer.tier || racer.category || 'Tier S',
      category: racer.tier || racer.category || 'Tier S',
      avatar: racer.photoUrl || racer.avatar,
      winningTeamId: winningTeam.id,
      winningTeamName: winningTeam.name,
      teamColor: winningTeam.color,
      finalBid: finalAmount,
      timestamp: new Date().toLocaleTimeString()
    };
    this.state.auctionHistory.unshift(saleRecord);

    this.recalculateTeamBudgets();
    this.saveState();
    return { success: true, record: saleRecord, winningTeam, racer };
  }

  unsoldAuction() {
    const { activeAuction, racers } = this.state;
    if (!activeAuction.racerId) return { success: false, message: 'No racer in auction' };

    const racer = racers.find((r) => r.id === activeAuction.racerId);
    if (racer) {
      racer.status = 'unsold';
      racer.soldPoints = null;
      racer.soldToTeamId = null;

      // Record to auction history
      const unsoldRecord = {
        id: 'unsold_' + Date.now(),
        racerId: racer.id,
        racerName: racer.name,
        tier: racer.tier || racer.category || 'Tier S',
        category: racer.tier || racer.category || 'Tier S',
        avatar: racer.photoUrl || racer.avatar,
        status: 'unsold',
        winningTeamId: null,
        winningTeamName: 'UNSOLD',
        teamColor: '#94a3b8',
        finalBid: 0,
        basePoints: racer.basePoints,
        timestamp: new Date().toLocaleTimeString()
      };
      this.state.auctionHistory.unshift(unsoldRecord);
    }

    activeAuction.status = 'unsold';
    activeAuction.isTimerRunning = false;
    this.recalculateTeamBudgets();
    this.saveState();
    return { success: true, racer };
  }

  cancelAuction() {
    const { activeAuction, racers } = this.state;
    if (activeAuction.racerId) {
      const racer = racers.find((r) => r.id === activeAuction.racerId);
      if (racer && racer.status === 'live') {
        racer.status = 'upcoming';
      }
    }
    this.state.activeAuction = {
      racerId: null,
      currentBid: 0,
      leadingTeamId: null,
      bidHistory: [],
      timerSeconds: 30,
      isTimerRunning: false,
      status: 'idle'
    };
    this.saveState();
  }

  setTimerSeconds(sec) {
    this.state.activeAuction.timerSeconds = sec;
    this.saveState(false); // don't flood broadcast on every second
  }

  toggleTimer(running) {
    this.state.activeAuction.isTimerRunning = running;
    this.saveState();
  }

  loadSampleData() {
    this.state.teams = JSON.parse(JSON.stringify(SAMPLE_GTA_TEAMS));
    this.state.racers = JSON.parse(JSON.stringify(SAMPLE_GTA_RACERS));
    this.state.activeAuction = {
      racerId: null,
      currentBid: 0,
      leadingTeamId: null,
      bidHistory: [],
      timerSeconds: 30,
      isTimerRunning: false,
      status: 'idle'
    };
    this.state.auctionHistory = [];
    this.saveState();
    return { success: true };
  }

  clearAllData() {
    this.state.teams = [];
    this.state.racers = [];
    this.state.activeAuction = {
      racerId: null,
      currentBid: 0,
      leadingTeamId: null,
      bidHistory: [],
      timerSeconds: 30,
      isTimerRunning: false,
      status: 'idle'
    };
    this.state.auctionHistory = [];
    this.saveState();
    return { success: true };
  }

  resetTournament() {
    this.state = JSON.parse(JSON.stringify(INITIAL_STATE));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (window.syncBridge) {
      window.syncBridge.broadcastState(this.state);
    }
    this.notify({ type: 'RESET' });
  }

  exportDataJSON() {
    return JSON.stringify({
      tournamentName: this.state.tournamentName,
      teams: this.state.teams,
      racers: this.state.racers,
      activeAuction: this.state.activeAuction,
      auctionHistory: this.state.auctionHistory,
      tournamentRounds: this.state.tournamentRounds || INITIAL_STATE.tournamentRounds,
      activeTournamentRoundId: this.state.activeTournamentRoundId || 'round_qualifiers',
      tournamentMatchups: this.state.tournamentMatchups || [],
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  importDataJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.teams) && Array.isArray(parsed.racers)) {
        this.state.tournamentName = parsed.tournamentName || this.state.tournamentName;
        this.state.teams = parsed.teams;
        this.state.racers = parsed.racers;
        this.state.activeAuction = parsed.activeAuction || INITIAL_STATE.activeAuction;
        this.state.auctionHistory = parsed.auctionHistory || [];
        this.state.tournamentRounds = Array.isArray(parsed.tournamentRounds) && parsed.tournamentRounds.length > 0 ? parsed.tournamentRounds : (this.state.tournamentRounds || INITIAL_STATE.tournamentRounds);
        this.state.activeTournamentRoundId = parsed.activeTournamentRoundId || this.state.activeTournamentRoundId || 'round_qualifiers';
        this.state.tournamentMatchups = Array.isArray(parsed.tournamentMatchups) ? parsed.tournamentMatchups : [];
        this.saveState();
        return { success: true };
      }
      return { success: false, error: 'Invalid tournament file format' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // --- TOURNAMENT ROUNDS & MATCHUP SYSTEM ---
  addTournamentRound(name) {
    if (!Array.isArray(this.state.tournamentRounds)) {
      this.state.tournamentRounds = [];
    }
    const cleanName = (name && name.trim()) || `Round ${this.state.tournamentRounds.length + 1}`;
    const newRound = {
      id: 'round_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: cleanName,
      isLocked: false,
      createdAt: new Date().toISOString()
    };
    this.state.tournamentRounds.push(newRound);
    this.state.activeTournamentRoundId = newRound.id;
    this.saveState();
    return { success: true, round: newRound };
  }

  updateTournamentRound(roundId, updates = {}) {
    if (!Array.isArray(this.state.tournamentRounds)) return { success: false };
    const round = this.state.tournamentRounds.find((r) => r.id === roundId);
    if (!round) return { success: false, message: 'Round not found' };

    if (typeof updates.name === 'string' && updates.name.trim()) {
      round.name = updates.name.trim();
    }
    if (typeof updates.isLocked === 'boolean') {
      round.isLocked = updates.isLocked;
    }
    this.saveState();
    return { success: true, round };
  }

  toggleLockTournamentRound(roundId) {
    if (!Array.isArray(this.state.tournamentRounds)) return { success: false };
    const round = this.state.tournamentRounds.find((r) => r.id === roundId);
    if (!round) return { success: false, message: 'Round not found' };
    round.isLocked = !round.isLocked;
    this.saveState();
    return { success: true, isLocked: round.isLocked, round };
  }

  deleteTournamentRound(roundId) {
    if (!Array.isArray(this.state.tournamentRounds)) return { success: false };
    if (this.state.tournamentRounds.length <= 1) {
      return { success: false, message: 'At least one round must remain.' };
    }

    this.state.tournamentRounds = this.state.tournamentRounds.filter((r) => r.id !== roundId);
    // Remove matchups for this round
    if (Array.isArray(this.state.tournamentMatchups)) {
      this.state.tournamentMatchups = this.state.tournamentMatchups.filter((m) => m.roundId !== roundId);
    }

    if (this.state.activeTournamentRoundId === roundId) {
      this.state.activeTournamentRoundId = this.state.tournamentRounds[0]?.id || null;
    }
    this.saveState(true, true);
    return { success: true };
  }

  setActiveTournamentRound(roundId) {
    if (!Array.isArray(this.state.tournamentRounds)) return;
    const exists = this.state.tournamentRounds.some((r) => r.id === roundId);
    if (exists) {
      this.state.activeTournamentRoundId = roundId;
      this.saveState();
    }
  }

  addTournamentMatchup(team1Input, team2Input, roundId = null) {
    const resolveTeam = (input) => {
      if (!input) return null;
      if (typeof input === 'object' && input.name) {
        return {
          id: input.id || ('team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
          name: input.name,
          color: input.color || '#00e5ff',
          logoUrl: input.logoUrl || null,
          avatar: input.avatar || null
        };
      }
      const id = String(input);
      const foundInTeams = (this.state.teams || []).find((t) => t.id === id);
      if (foundInTeams) return foundInTeams;

      const defaultPresets = [
        { id: 't_empire', name: 'Empire Imports', color: '#ff1744' },
        { id: 't_autoexotic', name: 'Auto Exotic', color: '#0055ff' },
        { id: 't_soochi', name: 'Soochi', color: '#ba68c8' },
        { id: 't_amore', name: 'Amore', color: '#ad1457' },
        { id: 't_luxary', name: 'Luxary Autos', color: '#9e9d24' },
        { id: 't_beenys', name: 'Beenys', color: '#8e24aa' }
      ];
      const foundInPreset = defaultPresets.find((t) => t.id === id);
      if (foundInPreset) return foundInPreset;
      return { id: id, name: 'Team ' + id, color: '#00e5ff', logoUrl: null, avatar: null };
    };

    const team1 = resolveTeam(team1Input);
    const team2 = resolveTeam(team2Input);
    if (!team1 || !team2) return { success: false, message: 'Invalid team selections' };

    if (!Array.isArray(this.state.tournamentRounds) || this.state.tournamentRounds.length === 0) {
      this.state.tournamentRounds = [
        { id: 'round_qualifiers', name: 'Qualifiers', isLocked: false }
      ];
    }

    const targetRoundId = roundId || this.state.activeTournamentRoundId || this.state.tournamentRounds[0].id;
    const targetRound = this.state.tournamentRounds.find((r) => r.id === targetRoundId) || this.state.tournamentRounds[0];

    if (targetRound.isLocked) {
      return { success: false, message: `The round "${targetRound.name}" is locked. Please unlock it or select another round.` };
    }

    if (!Array.isArray(this.state.tournamentMatchups)) {
      this.state.tournamentMatchups = [];
    }

    const roundMatchups = this.state.tournamentMatchups.filter((m) => (m.roundId || this.state.tournamentRounds[0].id) === targetRound.id);

    const newMatchup = {
      id: 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      roundId: targetRound.id,
      matchNumber: roundMatchups.length + 1,
      team1: { id: team1.id, name: team1.name, color: team1.color, logoUrl: team1.logoUrl || null, avatar: team1.avatar || null },
      team2: { id: team2.id, name: team2.name, color: team2.color, logoUrl: team2.logoUrl || null, avatar: team2.avatar || null },
      winnerId: null,
      createdAt: new Date().toISOString()
    };

    this.state.tournamentMatchups.push(newMatchup);
    this.saveState();
    return { success: true, matchup: newMatchup };
  }

  removeTournamentMatchup(matchupId) {
    if (!Array.isArray(this.state.tournamentMatchups)) return;
    const match = this.state.tournamentMatchups.find((m) => m.id === matchupId);
    const roundId = match ? match.roundId : null;

    this.state.tournamentMatchups = this.state.tournamentMatchups.filter((m) => m.id !== matchupId);
    if (roundId) {
      const roundMatches = this.state.tournamentMatchups.filter((m) => m.roundId === roundId);
      roundMatches.forEach((m, idx) => {
        m.matchNumber = idx + 1;
      });
    }
    this.saveState();
  }

  setTournamentMatchupWinner(matchupId, winnerId) {
    if (!Array.isArray(this.state.tournamentMatchups)) return;
    const match = this.state.tournamentMatchups.find((m) => m.id === matchupId);
    if (match) {
      match.winnerId = match.winnerId === winnerId ? null : winnerId;
      this.saveState();
    }
  }

  updateMatchScoring(matchupId, scoringData) {
    if (!Array.isArray(this.state.tournamentMatchups)) return { success: false, message: 'No matchups available' };
    const match = this.state.tournamentMatchups.find((m) => m.id === matchupId);
    if (!match) return { success: false, message: 'Matchup not found' };

    if (scoringData.seriesFormat) match.seriesFormat = scoringData.seriesFormat;
    if (typeof scoringData.activeGameIndex !== 'undefined') match.activeGameIndex = scoringData.activeGameIndex;
    if (scoringData.games) match.games = scoringData.games;
    if (typeof scoringData.seriesWins1 !== 'undefined') match.seriesWins1 = Number(scoringData.seriesWins1) || 0;
    if (typeof scoringData.seriesWins2 !== 'undefined') match.seriesWins2 = Number(scoringData.seriesWins2) || 0;
    if (typeof scoringData.totalScore1 !== 'undefined') match.totalScore1 = Number(scoringData.totalScore1) || 0;
    if (typeof scoringData.totalScore2 !== 'undefined') match.totalScore2 = Number(scoringData.totalScore2) || 0;

    match.driverPositions = scoringData.driverPositions || match.driverPositions || {};
    match.team1Score = Number(scoringData.team1Score) || 0;
    match.team2Score = Number(scoringData.team2Score) || 0;
    if (typeof scoringData.isLocked !== 'undefined') {
      match.isLocked = Boolean(scoringData.isLocked);
    }
    if (typeof scoringData.winnerTeamId !== 'undefined') {
      match.winnerTeamId = scoringData.winnerTeamId;
      match.winnerId = scoringData.winnerTeamId;
    }

    this.saveState();
    return { success: true, matchup: match };
  }

  lockMatchup(matchupId, isLocked = true) {
    if (!Array.isArray(this.state.tournamentMatchups)) return { success: false };
    const match = this.state.tournamentMatchups.find((m) => m.id === matchupId);
    if (!match) return { success: false };

    match.isLocked = Boolean(isLocked);
    // Automatically set winner strictly based on total points across the match-up
    if (match.isLocked) {
      const score1 = Number(match.totalScore1) || Number(match.team1Score) || 0;
      const score2 = Number(match.totalScore2) || Number(match.team2Score) || 0;

      if (score1 > score2) {
        match.winnerTeamId = match.team1?.id || null;
        match.winnerId = match.team1?.id || null;
      } else if (score2 > score1) {
        match.winnerTeamId = match.team2?.id || null;
        match.winnerId = match.team2?.id || null;
      } else {
        match.winnerTeamId = null;
        match.winnerId = null;
      }
    }

    this.saveState();
    return { success: true, matchup: match };
  }

  setChampionshipStandingsVisibility(visible) {
    this.state.showChampionshipStandingsToViewers = Boolean(visible);
    this.saveState();
    return { success: true, isVisible: this.state.showChampionshipStandingsToViewers };
  }

  toggleChampionshipStandingsVisibility() {
    this.state.showChampionshipStandingsToViewers = !this.state.showChampionshipStandingsToViewers;
    this.saveState();
    return { success: true, isVisible: this.state.showChampionshipStandingsToViewers };
  }

  clearTournamentMatchups(roundId = null) {
    if (roundId) {
      this.state.tournamentMatchups = (this.state.tournamentMatchups || []).filter((m) => (m.roundId || this.state.tournamentRounds[0]?.id) !== roundId);
    } else {
      this.state.tournamentMatchups = [];
    }
    this.saveState(true, true);
  }
}

export const POSITION_POINTS_MAP = {
  '1st': 25,
  '2nd': 18,
  '3rd': 15,
  '4th': 12,
  '5th': 10,
  '6th': 8,
  '7th': 6,
  '8th': 4,
  '9th': 2,
  '10th': 1,
  'DNF': 0
};

export const store = new StateStore();
