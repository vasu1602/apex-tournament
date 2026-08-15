import { store, CATEGORIES } from './state.js';
import { soundFX } from './audio.js';

class ViewerView {
  constructor() {
    this.currentCategoryFilter = 'All Categories';
    this.currentStatusFilter = 'all';
    this.liveArenaHistoryFilter = 'all';
    this.searchQuery = '';
    this.confettiCanvas = null;
    this.confettiCtx = null;
    this.confettiParticles = [];
  }

  setLiveArenaHistoryFilter(filter) {
    this.liveArenaHistoryFilter = filter;
    this.renderLiveStage('live-arena-view');
  }

  init() {
    this.confettiCanvas = document.getElementById('confetti-canvas');
    if (this.confettiCanvas) {
      this.confettiCtx = this.confettiCanvas.getContext('2d');
      window.addEventListener('resize', () => this.resizeConfetti());
      this.resizeConfetti();
    }
  }

  resizeConfetti() {
    if (this.confettiCanvas) {
      this.confettiCanvas.width = window.innerWidth;
      this.confettiCanvas.height = window.innerHeight;
    }
  }

  triggerConfetti() {
    this.confettiParticles = [];
    const colors = ['#00f2fe', '#4facfe', '#ff2a55', '#ffb800', '#00f5a0', '#ffffff'];

    for (let i = 0; i < 150; i++) {
      this.confettiParticles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        w: Math.random() * 10 + 6,
        h: Math.random() * 6 + 4,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 22 - 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 12,
        opacity: 1,
        life: 1
      });
    }

    const render = () => {
      if (!this.confettiCtx) return;
      this.confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let activeCount = 0;
      this.confettiParticles.forEach((p) => {
        if (p.life > 0) {
          activeCount++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.35; // gravity
          p.vx *= 0.98; // air resistance
          p.rotation += p.vr;
          p.life -= 0.012;
          p.opacity = Math.max(0, p.life);

          this.confettiCtx.save();
          this.confettiCtx.translate(p.x, p.y);
          this.confettiCtx.rotate((p.rotation * Math.PI) / 180);
          this.confettiCtx.fillStyle = p.color;
          this.confettiCtx.globalAlpha = p.opacity;
          this.confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          this.confettiCtx.restore();
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(render);
      } else {
        this.confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    render();
  }

  // 1. Render Live Auction Stage & Bidded Racers Reel (Sold / Unsold)
  renderLiveStage(containerId = 'live-arena-view') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = store.getState();
    const { activeAuction, racers, teams, currentUser } = state;
    const currentRacer = racers.find((r) => r.id === activeAuction.racerId);
    const leadingTeam = teams.find((t) => t.id === activeAuction.leadingTeamId);

    // Filter racers who have come to the bidding block
    const allBiddedRacers = racers.filter((r) => r.status === 'sold' || r.status === 'unsold');
    const soldCount = racers.filter((r) => r.status === 'sold').length;
    const unsoldCount = racers.filter((r) => r.status === 'unsold').length;
    const totalTradedPts = racers.filter((r) => r.status === 'sold').reduce((sum, r) => sum + (Number(r.soldPoints) || 0), 0);

    let displayHistoryRacers = allBiddedRacers;
    if (this.liveArenaHistoryFilter === 'sold') {
      displayHistoryRacers = allBiddedRacers.filter((r) => r.status === 'sold');
    } else if (this.liveArenaHistoryFilter === 'unsold') {
      displayHistoryRacers = allBiddedRacers.filter((r) => r.status === 'unsold');
    }

    // Top block: Either active spotlight OR waiting card
    let topStageHtml = '';
    if (!currentRacer) {
      topStageHtml = `
        <div class="glass-card" style="text-align:center; padding: 3rem 1.5rem; border-top: 3px solid var(--accent-cyan); margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">🏁</div>
          <h2 style="font-family: var(--font-display); font-size: 1.6rem; letter-spacing: 2px; margin-bottom: 0.4rem; text-transform: uppercase;">
            ${racers.length === 0 ? 'No Racers Registered Yet' : 'Live Auction Block • Awaiting Next Driver'}
          </h2>
          <p style="color: var(--text-secondary); max-width: 520px; margin: 0 auto 1.5rem; font-size:0.88rem;">
            ${racers.length === 0 
              ? 'Register tournament racers with photo, name, tier (S, A, B, C, D), and starting bid.' 
              : 'The auctioneer has not yet brought a driver to the center block. Below is the live reel of all drivers who entered bidding so far.'}
          </p>
          <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
            ${currentUser.isAuthenticated ? `
              <button class="btn btn-cyan" onclick="window.app.openAddRacerModal()">Add New Racer</button>
              <button class="btn btn-gold" onclick="window.app.openAddTeamModal()">Add Racing Team</button>
              <button class="btn btn-primary" onclick="window.app.switchTab('admin-view')">Open Race Control</button>
            ` : `
              <button class="btn btn-cyan" onclick="window.app.switchTab('teams-view')">View Teams & Points</button>
              <button class="btn btn-outline" onclick="window.app.switchTab('racers-view')">Browse Full Racer Pool</button>
            `}
          </div>
        </div>
      `;
    } else {
      const racerPhotoSrc = currentRacer.photoUrl || currentRacer.avatar;
      const racerTier = currentRacer.tier || currentRacer.category || 'Tier S';
      const tierCode = racerTier.replace('Tier ', '').trim().toLowerCase();

      topStageHtml = `
        <div class="arena-grid" style="margin-bottom: 2rem;">
          <!-- 1. RACER SPOTLIGHT -->
          <div class="glass-card racer-spotlight-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div class="racer-spotlight-header">
                <div class="racer-identity">
                  <span class="racer-category-tag tier-badge-${tierCode}">${racerTier}</span>
                  <h2 class="racer-spotlight-name" style="font-size:1.85rem; margin-top:0.25rem;">${currentRacer.name}</h2>
                </div>
                <span class="racer-status-badge badge-${currentRacer.status}">${currentRacer.status}</span>
              </div>

              <div class="racer-media-wrapper" style="margin-top:1.25rem;">
                <div class="racer-avatar-box" style="width:140px; height:140px; border-radius:var(--radius-lg); border:2px solid var(--accent-cyan); overflow:hidden; box-shadow: 0 0 20px rgba(0,242,254,0.25);">
                  <img src="${racerPhotoSrc}" alt="${currentRacer.name}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div class="racer-bio-box" style="display:flex; flex-direction:column; justify-content:center; gap:0.6rem;">
                  <div>
                    <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Assigned Tier</span>
                    <div style="font-family:var(--font-display); font-size:1.25rem; font-weight:800; color:var(--accent-cyan);">${racerTier}</div>
                  </div>
                  <div>
                    <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Starting Base Bid</span>
                    <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:800; color:var(--accent-gold);">${currentRacer.basePoints.toLocaleString()} PTS</div>
                  </div>
                </div>
              </div>
            </div>

            <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.8rem; color:var(--text-secondary);">Tournament Pilot Dossier</span>
              <button class="btn btn-outline btn-sm" onclick="window.app.inspectRacer('${currentRacer.id}')">
                View Full Card
              </button>
            </div>
          </div>

          <!-- 2. CENTER AUCTION STAGE -->
          <div class="glass-card auction-stage-card">
            ${activeAuction.status === 'sold' ? `
              <div class="sold-overlay-box anim-sold-banner">
                <div class="sold-gavel-icon">🔨</div>
                <div class="sold-title">SOLD!</div>
                <div class="sold-subtitle">
                  Acquired by <strong>${leadingTeam ? leadingTeam.name : 'Winning Team'}</strong> for <strong style="color:var(--accent-gold);">${activeAuction.currentBid.toLocaleString()} PTS</strong>
                </div>
                <button class="btn btn-gold" onclick="window.app.switchTab('teams-view')">View Standings</button>
              </div>
            ` : ''}

            <div class="stage-top-bar">
              <span class="stage-title">Live Auction Floor</span>
              <span class="section-tag" style="font-size:0.72rem; color:var(--accent-cyan);">CHAMPIONSHIP BLOCK</span>
            </div>

            <div class="big-bid-container">
              <span class="big-bid-label">Current Bid / Sale Price</span>
              <div class="big-bid-amount">
                ${activeAuction.currentBid.toLocaleString()}
                <span class="bid-pts-unit">PTS</span>
              </div>
              <span class="bid-base-hint">Starting reserve: ${currentRacer.basePoints.toLocaleString()} PTS</span>
            </div>

            <!-- Leading Team Card -->
            <div class="leading-team-card" style="border-left: 4px solid ${leadingTeam ? leadingTeam.color : 'var(--text-muted)'};">
              <div class="leading-team-info">
                <div class="team-logo-badge" style="border-color: ${leadingTeam ? leadingTeam.color : 'rgba(255,255,255,0.1)'}; color: ${leadingTeam ? leadingTeam.color : '#fff'}; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                  ${leadingTeam ? (leadingTeam.logoUrl ? `<img src="${leadingTeam.logoUrl}" style="width:100%; height:100%; object-fit:cover;">` : leadingTeam.logoIcon || '') : ''}
                </div>
                <div class="leading-team-meta">
                  <span class="leading-label">${leadingTeam ? 'Currently Leading Bid' : 'Awaiting Bids'}</span>
                  <span class="leading-team-name">${leadingTeam ? leadingTeam.name : 'No Team Assigned'}</span>
                </div>
              </div>
              ${leadingTeam ? `
                <div class="leading-team-purse">
                  <div class="purse-remain-val">${leadingTeam.remainingPoints.toLocaleString()}</div>
                  <div class="purse-remain-lbl">Pts Left</div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- 3. LIVE BID STREAM -->
          <div class="glass-card bid-feed-card">
            <div class="feed-header">
              <span class="feed-title">Live Bid Stream</span>
              <span style="font-size: 0.72rem; color: var(--accent-cyan); font-family: var(--font-mono);">${activeAuction.bidHistory.length} BIDS</span>
            </div>

            <div class="feed-list">
              ${activeAuction.bidHistory.length === 0 ? `
                <div class="feed-empty-state">
                  <div style="font-size: 1.8rem; margin-bottom: 0.4rem;">📡</div>
                  <div>Awaiting team bids...</div>
                </div>
              ` : activeAuction.bidHistory.map((bid) => `
                <div class="feed-item" style="border-left-color: ${bid.teamColor || 'var(--accent-cyan)'};">
                  <div class="feed-item-team">
                    <div class="feed-team-dot" style="background: ${bid.teamColor || 'var(--accent-cyan)'};"></div>
                    <div class="feed-team-name">${bid.teamName}</div>
                  </div>
                  <div class="feed-bid-meta">
                    <div class="feed-bid-amount">${bid.amount.toLocaleString()} PTS</div>
                    <div class="feed-bid-time">${bid.timestamp}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Bottom block: Bidded Racers Reel (Sold & Unsold)
    const historySectionHtml = `
      <div class="live-history-section" style="margin-top: 1.5rem;">
        <div class="section-header" style="flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 class="section-title" style="font-size: 1.35rem;">Auction History</h2>
          </div>

          <!-- Quick Stat Badges -->
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
            <div class="stat-box" style="padding:0.4rem 0.85rem; min-width:auto;">
              <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Auctioned</span>
              <span style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:#fff;">${allBiddedRacers.length}</span>
            </div>
            <div class="stat-box" style="padding:0.4rem 0.85rem; min-width:auto;">
              <span style="font-size:0.68rem; color:var(--accent-gold); text-transform:uppercase;">Sold</span>
              <span style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:var(--accent-gold);">${soldCount}</span>
            </div>
            <div class="stat-box" style="padding:0.4rem 0.85rem; min-width:auto;">
              <span style="font-size:0.68rem; color:var(--accent-red); text-transform:uppercase;">Unsold</span>
              <span style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:var(--accent-red);">${unsoldCount}</span>
            </div>
          </div>
        </div>

        <!-- Filter Pills for Bidded Racers Reel -->
        <div class="filter-pills" style="margin-bottom: 1.25rem;">
          <button class="filter-pill-btn ${this.liveArenaHistoryFilter === 'all' ? 'active' : ''}" onclick="window.app.setLiveArenaHistoryFilter('all')">
            All Bidded Drivers (${allBiddedRacers.length})
          </button>
          <button class="filter-pill-btn ${this.liveArenaHistoryFilter === 'sold' ? 'active' : ''}" onclick="window.app.setLiveArenaHistoryFilter('sold')">
            SOLD (${soldCount})
          </button>
          <button class="filter-pill-btn ${this.liveArenaHistoryFilter === 'unsold' ? 'active' : ''}" onclick="window.app.setLiveArenaHistoryFilter('unsold')">
            UNSOLD (${unsoldCount})
          </button>
        </div>

        <!-- Cards Grid -->
        ${displayHistoryRacers.length === 0 ? `
          <div class="glass-card" style="text-align:center; padding: 2.5rem 1rem; color:var(--text-muted); border-style:dashed;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
            <div style="font-weight:700; color:#fff; margin-bottom:0.25rem;">
              ${allBiddedRacers.length === 0 ? 'No Bidded Racers in History Yet' : 'No Racers Matching this Filter'}
            </div>
            <div style="font-size: 0.82rem;">
              ${allBiddedRacers.length === 0 
                ? 'When racers are brought to the auction floor and marked Sold or Unsold, their full auction cards will appear here.'
                : 'Switch filter tabs above to view all bidded racers.'}
            </div>
          </div>
        ` : `
          <div class="racers-grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
            ${displayHistoryRacers.map((racer) => {
              const photoSrc = racer.photoUrl || racer.avatar;
              const soldTeam = racer.soldToTeamId ? teams.find((t) => t.id === racer.soldToTeamId) : null;
              const racerTier = racer.tier || racer.category || 'Tier S';
              const tierCode = racerTier.replace('Tier ', '').trim().toLowerCase();
              const isSold = racer.status === 'sold';

              return `
                <div class="racer-card" style="border-top: 3px solid ${isSold ? (soldTeam ? soldTeam.color : 'var(--accent-gold)') : 'var(--accent-red)'};">
                  <div class="racer-card-image-box" style="height: 180px;">
                    <span class="racer-card-cat-badge tier-badge-${tierCode}">${racerTier}</span>
                    <span class="racer-status-badge badge-${racer.status} racer-card-status-badge">
                      ${isSold ? 'SOLD' : 'UNSOLD'}
                    </span>
                    <img src="${photoSrc}" alt="${racer.name}" class="racer-card-img">
                  </div>

                  <div class="racer-card-body" style="padding: 1rem; gap: 0.75rem;">
                    <div>
                      <div class="racer-card-name" style="font-size: 1.05rem;">${racer.name}</div>
                      <div style="font-size: 0.75rem; color: var(--text-secondary); display:flex; align-items:center; gap:0.4rem; margin-top:2px;">
                        <span>${racerTier}</span>
                        <span>•</span>
                        <span>Base: ${racer.basePoints.toLocaleString()} PTS</span>
                      </div>
                    </div>

                    <!-- Sale Outcome Box -->
                    <div style="background: rgba(10, 14, 22, 0.75); padding: 0.65rem 0.75rem; border-radius: var(--radius-md); border: 1px solid ${isSold ? 'rgba(255,184,0,0.25)' : 'var(--border-subtle)'}; display:flex; flex-direction:column; gap:0.35rem;">
                      ${isSold ? `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <span style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight:700;">Final Sale Price</span>
                          <span style="font-family: var(--font-mono); font-size: 1.05rem; font-weight: 800; color: var(--accent-gold);">
                            ${(racer.soldPoints || racer.basePoints).toLocaleString()} PTS
                          </span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:0.35rem;">
                          <span style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase;">Signed Team:</span>
                          <div style="display:flex; align-items:center; gap:0.35rem; font-weight:700; font-size:0.8rem; color:${soldTeam ? soldTeam.color : '#fff'};">
                            ${soldTeam?.logoUrl ? `<img src="${soldTeam.logoUrl}" style="width:16px; height:16px; border-radius:3px; object-fit:cover;">` : `<span>${soldTeam?.logoIcon || ''}</span>`}
                            <span>${soldTeam ? soldTeam.name : 'Unknown Team'}</span>
                          </div>
                        </div>
                      ` : `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <span style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight:700;">Outcome</span>
                          <span style="font-size: 0.78rem; font-weight: 700; color: var(--accent-red);">
                            Unsold (Reserve)
                          </span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top:2px;">
                          Available for second-chance bidding round.
                        </div>
                      `}
                    </div>

                    <!-- Action buttons -->
                    <div class="racer-card-actions" style="gap:0.4rem;">
                      <button class="btn btn-outline btn-sm" style="flex:1; font-size:0.75rem; padding:0.4rem;" onclick="window.app.inspectRacer('${racer.id}')">
                        Inspect
                      </button>
                      ${currentUser.isAuthenticated ? `
                        <button class="btn btn-outline btn-sm" style="font-size:0.75rem; padding:0.4rem 0.6rem;" onclick="window.app.openEditRacerModal('${racer.id}')" title="Edit Sold/Unsold Outcome & Price">
                          Edit
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    container.innerHTML = topStageHtml + historySectionHtml;
  }

  // 2. Render Teams & Points Board
  renderTeamsGrid(containerId = 'teams-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { teams, currentUser } = store.getState();

    if (teams.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-secondary); background: rgba(10,14,22,0.6); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">🛡️</div>
          <h3 style="font-family: var(--font-display); font-size: 1.35rem; margin-bottom: 0.4rem;">No Racing Teams Created Yet</h3>
          <p style="font-size: 0.85rem; max-width: 460px; margin: 0 auto 1.5rem;">
            Create your racing teams, upload their custom logos, assign purse budgets and driver roster slots.
          </p>
          ${currentUser.isAuthenticated ? `
            <button class="btn btn-gold" onclick="window.app.openAddTeamModal()">
              Add Your First Racing Team
            </button>
          ` : `
            <button class="btn btn-outline" onclick="window.app.openAccessCodeModal()">
              Admin Sign In to Add Teams
            </button>
          `}
        </div>
      `;
      return;
    }

    container.innerHTML = teams.map((team) => {
      const spent = team.startingPoints - team.remainingPoints;
      const spentPct = Math.min(100, Math.round((team.remainingPoints / team.startingPoints) * 100));

      return `
        <div class="team-card" style="border-top: 3px solid ${team.color}; cursor:pointer;" onclick="window.app.openTeamModal('${team.id}')">
          <div>
            <div class="team-card-header">
              <div class="team-brand">
                <div class="team-avatar-icon" style="border-color: ${team.color}; box-shadow: 0 0 12px ${team.color}33; overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">
                  ${team.logoUrl ? `<img src="${team.logoUrl}" alt="${team.name}" style="width:100%; height:100%; object-fit:cover;">` : `<span>${team.logoIcon || ''}</span>`}
                </div>
                <div class="team-name-group">
                  <span class="team-title">${team.name}</span>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <span class="section-tag" style="color: ${team.color}; border-color: ${team.color}55; background: ${team.color}15;">
                  ${team.shortCode || 'TEAM'}
                </span>
                ${currentUser.isAuthenticated ? `
                  <button type="button" class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.25rem 0.45rem;" onclick="event.stopPropagation(); window.app.openEditTeamModal('${team.id}')" title="Edit Team">Edit</button>
                  <button type="button" class="btn btn-danger btn-sm" style="font-size:0.72rem; padding:0.25rem 0.45rem;" onclick="event.stopPropagation(); window.app.handleDeleteTeam('${team.id}')" title="Delete Team">Delete</button>
                ` : ''}
              </div>
            </div>

            <!-- Points Purse Progress -->
            <div class="team-points-box" style="margin-top: 1rem;">
              <div class="points-row-top">
                <div style="display:flex; flex-direction:column;">
                  <span style="font-size:0.68rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Remaining Budget</span>
                  <span class="pts-remaining-num" style="color:#ffffff;">${team.remainingPoints.toLocaleString()} PTS</span>
                </div>
                <span class="pts-total-num">Spent: ${spent.toLocaleString()} / ${team.startingPoints.toLocaleString()}</span>
              </div>
              <div class="points-progress-bar">
                <div class="points-progress-fill" style="width: ${spentPct}%; background: linear-gradient(90deg, ${team.color}, ${team.accent || '#fff'});"></div>
              </div>
            </div>
          </div>

          <!-- Roster Slot Preview -->
          <div class="roster-summary-wrap">
            <div class="roster-header-row">
              <span>Driver Slots</span>
              <span>${team.roster.length} / ${team.maxRoster} Signed</span>
            </div>
            <div class="roster-slots-row">
              ${Array.from({ length: team.maxRoster }).map((_, idx) => {
                const driver = team.roster[idx];
                if (driver) {
                  return `
                    <div class="slot-badge filled" title="${driver.name} - ${driver.soldPoints?.toLocaleString()} PTS">
                      <span class="slot-driver-name">${driver.name}</span>
                    </div>
                  `;
                }
                return `
                  <div class="slot-badge">
                    <span>Slot ${idx + 1}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Render Racers Directory
  renderRacersGrid(containerId = 'racers-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { racers, teams, currentUser } = store.getState();

    // Filter racers
    let filtered = racers.filter((r) => {
      const racerTier = r.tier || r.category || 'Tier S';
      const matchCat = this.currentCategoryFilter === 'All Tiers' || this.currentCategoryFilter === 'All Categories' || racerTier === this.currentCategoryFilter || racerTier.includes(this.currentCategoryFilter) || this.currentCategoryFilter.includes(racerTier);
      const matchStatus = this.currentStatusFilter === 'all' || r.status === this.currentStatusFilter;
      const matchSearch = !this.searchQuery || r.name.toLowerCase().includes(this.searchQuery.toLowerCase()) || racerTier.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCat && matchStatus && matchSearch;
    });

    if (racers.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-secondary); background: rgba(10,14,22,0.6); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">🏎️</div>
          <h3 style="font-family: var(--font-display); font-size: 1.35rem; margin-bottom: 0.4rem;">No Racers in the Pool</h3>
          <p style="font-size: 0.85rem; max-width: 460px; margin: 0 auto 1.5rem;">
            Add racers with their custom photo, name, assigned tier (S, A, B, C, D), and starting bid.
          </p>
          ${currentUser.isAuthenticated ? `
            <button class="btn btn-cyan" onclick="window.app.openAddRacerModal()">
              Add Your First Racer
            </button>
          ` : `
            <button class="btn btn-outline" onclick="window.app.openAccessCodeModal()">
              Admin Sign In to Add Racers
            </button>
          `}
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <h3 style="font-family: var(--font-display); margin-bottom: 0.3rem;">No Racers Found</h3>
          <p style="font-size: 0.85rem;">Try changing your search keywords or tier filter pills.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((racer) => {
      const photoSrc = racer.photoUrl || racer.avatar;
      const soldTeam = racer.soldToTeamId ? teams.find((t) => t.id === racer.soldToTeamId) : null;
      const racerTier = racer.tier || racer.category || 'Tier S';
      const tierCode = racerTier.replace('Tier ', '').trim().toLowerCase();

      return `
        <div class="racer-card">
          <div class="racer-card-image-box">
            <span class="racer-card-cat-badge tier-badge-${tierCode}">${racerTier}</span>
            <span class="racer-status-badge badge-${racer.status} racer-card-status-badge">${racer.status}</span>
            <img src="${photoSrc}" alt="${racer.name}" class="racer-card-img">
          </div>

          <div class="racer-card-body">
            <div>
              <div class="racer-card-name">${racer.name}</div>
              <div class="racer-card-nat">${racerTier}</div>
            </div>

            <div class="racer-card-meta-row">
              <div>
                <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase;">
                  ${racer.status === 'sold' ? 'Sold Price' : 'Starting Bid'}
                </div>
                <div class="racer-base-cost">
                  ${(racer.soldPoints || racer.basePoints).toLocaleString()} PTS
                </div>
              </div>
              ${soldTeam ? `
                <div style="text-align: right;">
                  <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase;">Signed Team</div>
                  <div class="racer-sold-team-tag" style="color:${soldTeam.color};">${soldTeam.name}</div>
                </div>
              ` : ''}
            </div>

            <div class="racer-card-actions">
              ${currentUser.isAuthenticated && racer.status !== 'sold' && racer.status !== 'live' ? `
                <button class="btn btn-cyan btn-sm" style="flex:1; font-size:0.72rem; padding:0.45rem;" onclick="window.app.startAuctionForRacer('${racer.id}')">
                  Put on Block
                </button>
              ` : ''}
              <button class="btn btn-outline btn-sm" style="flex:1; font-size:0.72rem; padding:0.45rem;" onclick="window.app.inspectRacer('${racer.id}')">
                Inspect
              </button>
              ${currentUser.isAuthenticated ? `
                <button class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.45rem 0.65rem;" onclick="window.app.openEditRacerModal('${racer.id}')" title="Edit Racer">
                  Edit
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Render Team Details Modal
  renderTeamModal(teamId) {
    const { teams } = store.getState();
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    const modal = document.getElementById('general-modal');
    const modalCard = modal?.querySelector('.modal-card');
    if (!modalBody || !modalTitle) return;

    if (modalCard) modalCard.classList.remove('modal-card-xl');

    modalTitle.innerHTML = `
      <span style="display:flex; align-items:center; gap:0.65rem; color:${team.color};">
        ${team.logoUrl ? `<img src="${team.logoUrl}" style="width:32px; height:32px; border-radius:var(--radius-sm); object-fit:cover; border:2px solid ${team.color}; box-shadow:0 0 10px ${team.color}44;">` : `<span>${team.logoIcon || '🏎️'}</span>`}
        ${team.name}
      </span>
    `;

    const spent = (team.roster || []).reduce((sum, d) => sum + (Number(d.soldPoints) || 0), 0);
    const remaining = Math.max(0, team.startingPoints - spent);

    modalBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1.25rem;">
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.75rem; text-align:center;">
          <div class="stat-box">
            <div class="stat-header" style="justify-content:center;">Starting Budget</div>
            <div style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700;">${team.startingPoints.toLocaleString()} PTS</div>
          </div>
          <div class="stat-box">
            <div class="stat-header" style="justify-content:center;">Remaining Points</div>
            <div style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700; color:var(--accent-green);">${remaining.toLocaleString()} PTS</div>
          </div>
          <div class="stat-box">
            <div class="stat-header" style="justify-content:center;">Points Spent</div>
            <div style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700; color:var(--accent-red);">${spent.toLocaleString()} PTS</div>
          </div>
        </div>

        <h4 style="font-family:var(--font-display); font-size:0.95rem; text-transform:uppercase; letter-spacing:1px; margin-top:0.5rem;">
          Acquired Driver Roster (${team.roster.length}/${team.maxRoster})
        </h4>

        ${team.roster.length === 0 ? `
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:rgba(10,14,22,0.6); border-radius:var(--radius-md);">
            No racers acquired yet in this tournament.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${team.roster.map((driver) => `
              <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(14,19,30,0.8); padding:0.75rem 1rem; border-radius:var(--radius-md); border-left:3px solid ${team.color};">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <img src="${driver.photoUrl || driver.avatar}" style="width:40px; height:40px; border-radius:var(--radius-sm); object-fit:cover;">
                  <div>
                    <div style="font-weight:700; font-family:var(--font-display); font-size:0.95rem;">${driver.name}</div>
                    <div style="font-size:0.75rem; color:var(--accent-cyan);">${driver.tier || driver.category || 'Tier 1'}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-gold);">${driver.soldPoints?.toLocaleString()} PTS</div>
                  <div style="font-size:0.68rem; color:var(--text-muted);">Winning Bid</div>
                </div>
              </div>
            `).join('')}
          </div>
        `}

        ${store.getState().currentUser.isAuthenticated ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border-subtle);">
            <button type="button" class="btn btn-danger" onclick="window.app.handleDeleteTeam('${team.id}')">
              🗑️ Delete Team
            </button>
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn btn-outline" onclick="window.app.closeModal()">Close</button>
              <button type="button" class="btn btn-cyan" onclick="window.app.openEditTeamModal('${team.id}')">✏️ Edit Team</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('general-modal').classList.add('active');
  }

  // 5. Render Simple Inspect Modal for a Racer
  renderRacerModal(racerId) {
    const { racers, teams } = store.getState();
    const racer = racers.find((r) => r.id === racerId);
    if (!racer) return;

    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    const modal = document.getElementById('general-modal');
    const modalCard = modal?.querySelector('.modal-card');
    if (!modalBody || !modalTitle) return;

    if (modalCard) modalCard.classList.remove('modal-card-xl');

    modalTitle.innerHTML = `🏁 ${racer.name}`;
    const photoSrc = racer.photoUrl || racer.avatar;
    const soldTeam = racer.soldToTeamId ? teams.find((t) => t.id === racer.soldToTeamId) : null;
    const racerTier = racer.tier || racer.category || 'Tier 1';

    modalBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1.25rem;">
        <div style="display:flex; gap:1.25rem; align-items:center; background:rgba(10,14,22,0.8); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <img src="${photoSrc}" style="width:110px; height:110px; border-radius:var(--radius-md); object-fit:cover; border:2px solid var(--accent-cyan);">
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            <div style="font-size:0.8rem; color:var(--accent-cyan); font-weight:700; text-transform:uppercase;">${racerTier}</div>
            <div style="font-family:var(--font-display); font-size:1.35rem; font-weight:800; color:#fff;">${racer.name}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              Starting Bid: <strong style="font-family:var(--font-mono); color:var(--accent-gold);">${racer.basePoints.toLocaleString()} PTS</strong>
            </div>
            <div style="margin-top:0.2rem;">
              Status: <span class="racer-status-badge badge-${racer.status}">${racer.status}</span>
            </div>
            ${soldTeam ? `<div style="margin-top:0.3rem; font-size:0.85rem; color:var(--accent-green);">Signed to: <strong>${soldTeam.name}</strong> for ${racer.soldPoints?.toLocaleString()} PTS</div>` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('general-modal').classList.add('active');
  }
}

export const viewerView = new ViewerView();

