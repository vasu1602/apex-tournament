import { store, CATEGORIES } from './state.js';
import { PRESET_AVATARS, PRESET_TEAM_LOGOS } from './presets.js';
import { soundFX } from './audio.js';
import { viewerView } from './viewer-view.js';

class AdminView {
  constructor() {
    this.timerInterval = null;
    this.selectedAvatar = PRESET_AVATARS[0].svg;
    this.uploadedPhotoBase64 = null;
    this.selectedTeamLogo = PRESET_TEAM_LOGOS[0].svg;
    this.uploadedTeamLogoBase64 = null;
    this.editingRacerId = null;
    this.editingTeamId = null;
  }

  init() {
    this.startGlobalTimerLoop();
  }

  // Auction timer removed per user preference
  startGlobalTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  renderAdminDesk(containerId = 'admin-desk-view') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const state = store.getState() || {};
      const racers = Array.isArray(state.racers) ? state.racers : [];
      const teams = Array.isArray(state.teams) ? state.teams : [];
      const currentUser = state.currentUser || { isAuthenticated: false, role: 'super_admin', adminName: 'Admin' };
      const activeAuction = state.activeAuction || {
        racerId: null,
        currentBid: 0,
        leadingTeamId: null,
        bidHistory: [],
        timerSeconds: 30,
        isTimerRunning: false,
        status: 'idle'
      };
      const currentRacer = activeAuction.racerId ? racers.find((r) => r && r.id === activeAuction.racerId) : null;
      const upcomingRacers = racers.filter((r) => r && (r.status === 'upcoming' || r.status === 'unsold'));
      const activePriceNum = Number(activeAuction.currentBid) || (currentRacer ? Number(currentRacer.basePoints) : 0);

      container.innerHTML = `
        <!-- Admin Action Bar -->
        <div class="admin-actions-toolbar">
          <button class="btn btn-cyan" onclick="window.app.openAddRacerModal()">
            Add New Racer
          </button>
          <button class="btn btn-outline" onclick="window.app.openAddTeamModal()">
            Add Team
          </button>
          <button class="btn btn-outline" onclick="window.app.openSettingsModal()">
            Data & Backup
          </button>
        </div>

        <div style="display:flex; flex-direction:column; gap:1.5rem; width:100%;">
          <!-- 1. FULL-WIDTH LIVE AUCTIONEER CONSOLE -->
          <div class="glass-card operator-card" style="border-top: 3px solid var(--accent-red); width:100%;">
            <div class="section-header" style="margin-bottom:0.75rem;">
              <div class="section-title-wrap">
                <span class="section-tag" style="background:rgba(255,59,92,0.15); color:var(--accent-red); border-color:rgba(255,59,92,0.3);">LIVE OP</span>
                <h3 class="section-title" style="font-size:1.2rem;">Live Auction & Settlement Hub</h3>
              </div>
              ${currentRacer ? `<span class="racer-status-badge badge-${activeAuction.status || 'upcoming'}">${activeAuction.status || 'upcoming'}</span>` : ''}
            </div>

            <!-- Select Racer on Block -->
            <div class="control-field-group" style="margin-bottom:0.5rem;">
              <label class="control-label" style="font-size:0.78rem;">Racer On Auction Block</label>
              <div style="display:flex; gap:0.5rem; width:100%;">
                <select id="admin-racer-select" class="form-select" style="flex:1;">
                  <option value="">🏎️ -- Select a Driver for Auction --</option>
                  ${upcomingRacers.map((r) => {
                    if (!r) return '';
                    return `
                    <option value="${r.id}" ${currentRacer && currentRacer.id === r.id ? 'selected' : ''}>
                      ${r.name || 'Racer'} [${r.tier || r.category || 'Tier S'}] • Starting: ${(Number(r.basePoints) || 0).toLocaleString()} PTS
                    </option>
                  `;
                  }).join('')}
                </select>
                <button class="btn btn-primary" style="white-space:nowrap; padding:0.6rem 1.25rem;" onclick="window.app.handleAdminStartAuction()">
                  Put on Block
                </button>
              </div>
            </div>

            ${currentRacer ? `
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem; margin-top:0.5rem;">
                <!-- Driver Info Box -->
                <div style="background:rgba(10,14,22,0.85); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; gap:1.25rem; align-items:center;">
                  <img src="${currentRacer.photoUrl || currentRacer.avatar || 'assets/avatars/default.png'}" style="width:85px; height:85px; border-radius:var(--radius-md); object-fit:cover; border:2px solid var(--accent-cyan);">
                  <div style="flex:1;">
                    <div style="font-family:var(--font-display); font-size:1.35rem; font-weight:800; color:#fff;">${currentRacer.name || 'Unnamed Racer'}</div>
                    <div style="font-size:0.85rem; color:var(--accent-cyan); font-weight:700; margin-top:2px;">${currentRacer.tier || currentRacer.category || 'Tier S'} • Reserve: ${(Number(currentRacer.basePoints) || 0).toLocaleString()} PTS</div>
                    <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:800; color:#fff; margin-top:0.35rem;">
                      Current Price: <span style="color:var(--accent-gold); font-weight:900;">${activePriceNum.toLocaleString()} PTS</span>
                    </div>
                  </div>
                </div>

                <!-- Settle & Controls Box -->
                <div style="background:rgba(14,19,30,0.85); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-cyan); display:flex; flex-direction:column; gap:0.85rem;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.8rem; font-weight:800; color:var(--accent-cyan); text-transform:uppercase; letter-spacing:1px;">
                      Settle Auction & Deduct Budget
                    </span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${teams.length} Teams Available</span>
                  </div>

                  <div class="control-field-group">
                    <label class="control-label">Winning / Bidding Team</label>
                    <select id="admin-bid-team-select" class="form-select">
                      <option value="">🛡️ -- Choose Winning Team --</option>
                      ${teams.map((t) => {
                        if (!t) return '';
                        const remaining = Number(t.remainingPoints) !== undefined && !isNaN(Number(t.remainingPoints)) ? Number(t.remainingPoints) : (Number(t.startingPoints) || 10000);
                        const rosterLen = Array.isArray(t.roster) ? t.roster.length : (racers.filter(r => r && r.soldToTeamId === t.id).length);
                        const maxSlots = Number(t.maxRoster) || 4;
                        return `
                          <option value="${t.id}" ${activeAuction.leadingTeamId === t.id ? 'selected' : ''}>
                            ${t.name || 'Team'} • ${remaining.toLocaleString()} PTS Left (${rosterLen}/${maxSlots} Slots)
                          </option>
                        `;
                      }).join('')}
                    </select>
                  </div>

                  <!-- Price & Quick Increments -->
                  <div class="control-field-group">
                    <label class="control-label">Final Sale / Bid Amount (PTS)</label>
                    <div class="custom-bid-row">
                      <input type="number" id="admin-custom-bid-input" class="form-input" placeholder="e.g. 2500" value="${activePriceNum}">
                      <button class="btn btn-cyan" onclick="window.app.handleCustomBid()">Set Price</button>
                    </div>
                  </div>

                  <!-- Quick Increments -->
                  <div class="control-field-group">
                    <label class="control-label">Quick Adjust (+ PTS)</label>
                    <div class="increments-grid">
                      <button class="btn-increment" onclick="window.app.handleQuickBid(100)">+100</button>
                      <button class="btn-increment" onclick="window.app.handleQuickBid(250)">+250</button>
                      <button class="btn-increment" onclick="window.app.handleQuickBid(500)">+500</button>
                      <button class="btn-increment" onclick="window.app.handleQuickBid(1000)">+1000</button>
                    </div>
                  </div>

                  <!-- Settlement Action Buttons -->
                  <div class="auctioneer-gavel-actions" style="margin-top:0.25rem;">
                    <button class="btn btn-gold" style="flex:2; font-size:0.95rem; font-weight:800; padding:0.75rem;" onclick="window.app.handleSold()">
                      Mark SOLD (Deduct Points)
                    </button>
                    <button class="btn btn-outline" style="flex:1;" onclick="window.app.handleUnsold()">
                      Mark UNSOLD
                    </button>
                    <button class="btn btn-danger" style="flex:0.8;" onclick="window.app.handleCancelAuction()">
                      Clear Block
                    </button>
                  </div>
                </div>
              </div>
            ` : `
              <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-secondary); background:rgba(10,14,22,0.4); border-radius:var(--radius-md); border:1px dashed var(--border-subtle); margin-top:0.75rem;">
                <div style="font-size:2.5rem; margin-bottom:0.5rem;">🏁</div>
                <div style="font-size:1.1rem; font-weight:700; color:#fff;">No Driver on Auction Block</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.35rem;">Select an upcoming driver from the dropdown above and click "Put on Block".</div>
              </div>
            `}
          </div>

          <!-- 2. FULL-WIDTH TEAM BUDGETS & SLOTS -->
          <div class="glass-card" style="border-top:3px solid var(--accent-cyan); width:100%;">
            <div class="section-header" style="margin-bottom:0.75rem;">
              <div>
                <h3 class="section-title" style="font-size:1.15rem;">Team Budgets & Slots</h3>
                <span style="font-size:0.75rem; color:var(--text-muted);">${teams.length} Registered</span>
              </div>
              <button class="btn btn-cyan btn-sm" style="font-size:0.75rem; padding:0.35rem 0.75rem;" onclick="window.app.openAddTeamModal()">
                Add Team
              </button>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.65rem;">
              ${teams.length === 0 ? `
                <div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">
                  No teams registered. Click <strong>+ Add Team</strong> to add one.
                </div>
              ` : teams.map((t) => {
                if (!t) return '';
                const rosterCount = Array.isArray(t.roster) ? t.roster.length : (racers.filter(r => r && r.soldToTeamId === t.id).length);
                const maxSlots = Number(t.maxRoster) || 4;
                const remainingPts = (typeof t.remainingPoints === 'number' && !isNaN(t.remainingPoints)) ? t.remainingPoints : (Number(t.startingPoints) || 10000);
                const teamColor = t.color || '#00e5ff';
                const teamName = t.name || 'Unnamed Team';

                return `
                <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(10,14,22,0.6); padding:0.65rem 0.85rem; border-radius:var(--radius-md); border-left:3px solid ${teamColor}; gap:0.5rem;">
                  <div style="display:flex; align-items:center; gap:0.6rem; flex:1; min-width:0;">
                    ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:28px; height:28px; border-radius:4px; object-fit:cover;">` : `<span style="font-size:1.2rem;">${t.logoIcon || '🏎️'}</span>`}
                    <div style="overflow:hidden;">
                      <div style="font-weight:700; font-size:0.88rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${teamName}</div>
                      <div style="font-size:0.72rem; color:var(--text-muted);">Roster: ${rosterCount}/${maxSlots} Signed</div>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="text-align:right;">
                      <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-green); font-size:0.92rem;">
                        ${remainingPts.toLocaleString()} PTS
                      </div>
                      <div style="font-size:0.68rem; color:var(--text-muted);">Remaining</div>
                    </div>
                    <div style="display:flex; gap:0.3rem;">
                      <button class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.3rem 0.55rem;" onclick="window.app.openEditTeamModal('${t.id}')" title="Edit Team">
                        Edit
                      </button>
                      <button class="btn btn-danger btn-sm" style="font-size:0.72rem; padding:0.3rem 0.55rem;" onclick="window.app.handleDeleteTeam('${t.id}')" title="Delete Team">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              `;
              }).join('')}
            </div>
          </div>

          <!-- 3. Auditorium & Projector Tools -->
          <div class="glass-card" style="width:100%;">
            <h4 style="font-family:var(--font-display); font-size:0.9rem; margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:1px;">
              Auditorium & Projector Tools
            </h4>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
              <button class="btn btn-outline" style="flex:1; min-width:200px;" onclick="window.app.toggleFullscreen()">
                Toggle Projector Fullscreen Mode
              </button>
              <button class="btn btn-cyan" style="flex:1; min-width:200px;" onclick="window.app.openCreateAccessCodeModal()">
                Generate New Access Code
              </button>
            </div>
          </div>
        </div>

      <!-- BOTTOM: Access Codes & Permission Delegation -->
      <div class="glass-card" style="margin-top:1.5rem; border-top:3px solid var(--accent-gold);">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-tag" style="background:rgba(255,215,0,0.15); color:var(--accent-gold); border-color:var(--border-gold);">SECURITY ACCESS CODES</span>
            <h3 class="section-title" style="font-size:1.15rem;">Access Passcodes & Role Delegation</h3>
          </div>
          <div>
            <button class="btn btn-gold btn-sm" onclick="window.app.openCreateAccessCodeModal()">
              Generate New Access Code
            </button>
          </div>
        </div>

        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1rem;">
          Generate unique access passcodes to delegate tournament authority. Anyone entering an authorized passcode at sign-in receives the exact role and team permissions linked to that code.
        </p>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); text-transform:uppercase; font-size:0.72rem; font-family:var(--font-display);">
                <th style="padding:0.6rem 0.85rem;">Access Passcode</th>
                <th style="padding:0.6rem 0.85rem;">Officer / Label</th>
                <th style="padding:0.6rem 0.85rem;">Permission Role</th>
                <th style="padding:0.6rem 0.85rem;">Assigned Team</th>
                <th style="padding:0.6rem 0.85rem;">Created</th>
                <th style="padding:0.6rem 0.85rem; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${(state.accessCodes || []).map((codeObj) => {
                const assignedTeam = codeObj.teamId ? teams.find((t) => t.id === codeObj.teamId) : null;
                const isCurrentSession = currentUser.codeId === codeObj.id;

                return `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:0.75rem 0.85rem;">
                      <div style="display:inline-flex; align-items:center; gap:0.5rem;">
                        <span style="font-family:var(--font-mono); font-weight:800; font-size:0.95rem; color:var(--accent-gold); background:rgba(255,215,0,0.1); padding:0.25rem 0.6rem; border-radius:var(--radius-sm); border:1px solid rgba(255,215,0,0.3); letter-spacing:1px;">
                          ${codeObj.code}
                        </span>
                        <button class="btn btn-outline btn-sm" style="font-size:0.7rem; padding:0.25rem 0.5rem;" onclick="window.app.copyAccessCode('${codeObj.code}')" title="Copy code to clipboard">
                          Copy
                        </button>
                      </div>
                    </td>
                    <td style="padding:0.75rem 0.85rem; font-weight:700; color:#fff;">
                      ${codeObj.label} ${isCurrentSession ? '<span style="color:var(--accent-cyan); font-size:0.72rem;">(Active Session)</span>' : ''}
                    </td>
                    <td style="padding:0.75rem 0.85rem;">
                      <span class="section-tag" style="font-size:0.65rem; padding:0.15rem 0.45rem;">
                        ${codeObj.role === 'super_admin' ? 'Super Admin' : codeObj.role === 'auctioneer' ? 'Auctioneer' : 'Team Manager'}
                      </span>
                    </td>
                    <td style="padding:0.75rem 0.85rem; color:${assignedTeam ? assignedTeam.color : 'var(--text-muted)'};">
                      ${assignedTeam ? assignedTeam.name : 'Global (All Teams)'}
                    </td>
                    <td style="padding:0.75rem 0.85rem; font-size:0.75rem; color:var(--text-muted);">
                      ${codeObj.createdAt || 'Active'}
                    </td>
                    <td style="padding:0.75rem 0.85rem; text-align:right;">
                      ${codeObj.id !== 'code_root' ? `
                        <button class="btn btn-danger btn-sm" style="font-size:0.7rem; padding:0.3rem 0.6rem;" onclick="window.app.handleRevokeAccessCode('${codeObj.id}', '${codeObj.code}')">
                          Revoke
                        </button>
                      ` : '<span style="font-size:0.75rem; color:var(--accent-cyan); padding:0.3rem 0.5rem; font-weight:700;">Master Code</span>'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    } catch (e) {
      console.error('Error in renderAdminDesk:', e);
    }
  }

  openCreateAccessCodeModal() {
    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    if (!modalBody || !modalTitle) return;

    const { teams } = store.getState();
    modalTitle.textContent = 'Generate New Access Code';

    modalBody.innerHTML = `
      <form id="create-access-code-form" onsubmit="event.preventDefault(); window.app.saveNewAccessCode();">
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
          <p style="font-size:0.85rem; color:var(--text-secondary);">
            Choose the permissions for this passcode. Whoever enters this code at sign-in will unlock only the selected authority level.
          </p>

          <div class="control-field-group">
            <label class="control-label">Officer / Member Name *</label>
            <input type="text" id="new-code-label" class="form-input" required placeholder="e.g. Damon Vance (Redline Manager)">
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
            <div class="control-field-group">
              <label class="control-label">Permission Role *</label>
              <select id="new-code-role" class="form-select" onchange="document.getElementById('team-assign-wrap').style.display = this.value === 'team_admin' ? 'block' : 'none'">
                <option value="super_admin">Super Admin (Full Tournament Control)</option>
                <option value="auctioneer">Lead Auctioneer (Live Gavel & Bidding)</option>
                <option value="team_admin">Team Manager (Assigned Team Purse)</option>
              </select>
            </div>

            <div class="control-field-group" id="team-assign-wrap" style="display:none;">
              <label class="control-label">Assigned Team *</label>
              <select id="new-code-team" class="form-select">
                ${teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="control-field-group">
            <label class="control-label">Passcode (Leave blank to auto-generate)</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="new-code-custom" class="form-input font-mono" placeholder="e.g. REDLINE-99" style="text-transform:uppercase;">
              <button type="button" class="btn btn-outline" onclick="window.app.randomizeAccessCodeInput()">Randomize</button>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem;">
            <button type="button" class="btn btn-outline" onclick="window.app.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-gold">Generate & Save Code</button>
          </div>
        </div>
      </form>
    `;

    document.getElementById('general-modal').classList.add('active');
  }

  // Add / Edit Racer Modal Setup (Simplified: Name, Tier S/A/B/C/D, Starting Bid, Photo, Status & Price)
  openRacerModal(racerId = null) {
    this.editingRacerId = racerId;
    this.uploadedPhotoBase64 = null;

    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    const modal = document.getElementById('general-modal');
    const modalCard = modal?.querySelector('.modal-card');
    if (!modalBody || !modalTitle) return;

    if (modalCard) modalCard.classList.remove('modal-card-xl');

    const state = store.getState();
    const { teams } = state;

    let initialData = {
      name: '',
      tier: 'Tier S',
      basePoints: 1000,
      status: 'upcoming',
      soldPoints: null,
      soldToTeamId: null,
      avatar: PRESET_AVATARS[0].svg,
      photoUrl: null
    };

    if (racerId) {
      const racer = state.racers.find((r) => r.id === racerId);
      if (racer) initialData = { ...racer, tier: racer.tier || racer.category || 'Tier S' };
      modalTitle.textContent = 'Edit Racer Profile';
    } else {
      modalTitle.textContent = 'Add New Racer';
    }

    this.uploadedPhotoBase64 = initialData.photoUrl || null;

    modalBody.innerHTML = `
      <form id="racer-form" onsubmit="event.preventDefault(); window.app.saveRacerForm();">
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
          
          <!-- Photo Upload (Clean - No presets, No extra text) -->
          <div class="control-field-group">
            <label class="control-label">Driver Photo</label>
            <div class="photo-uploader" id="photo-dropzone" onclick="document.getElementById('racer-photo-input').click()">
              <input type="file" id="racer-photo-input" accept="image/*" style="display:none;" onchange="window.app.handlePhotoUpload(event, 'racer')">
              <div id="photo-preview-container">
                ${this.uploadedPhotoBase64 ? `
                  <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                    <img id="photo-preview-img" src="${this.uploadedPhotoBase64}" class="photo-preview-thumb" alt="Racer Photo">
                    <span style="font-size:0.72rem; color:var(--accent-cyan); font-weight:700;">Click to Change Photo</span>
                  </div>
                ` : `
                  <div class="photo-upload-empty-box">
                    <span style="font-size: 1.8rem;">📷</span>
                    <span class="photo-upload-btn-text">+ Add Photo</span>
                  </div>
                `}
              </div>
            </div>
          </div>

          <!-- Basic Info: Name, Tier S/A/B/C/D, Starting Bid -->
          <div class="control-field-group">
            <label class="control-label">Racer / Pilot Full Name *</label>
            <input type="text" id="racer-name-input" class="form-input" required placeholder="e.g. Max Verstappen" value="${initialData.name}">
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
            <div class="control-field-group">
              <label class="control-label">Tier / Rating *</label>
              <select id="racer-category-input" class="form-select">
                <option value="Tier S" ${initialData.tier === 'Tier S' || initialData.tier === 'S' ? 'selected' : ''}>Tier S</option>
                <option value="Tier A" ${initialData.tier === 'Tier A' || initialData.tier === 'A' ? 'selected' : ''}>Tier A</option>
                <option value="Tier B" ${initialData.tier === 'Tier B' || initialData.tier === 'B' ? 'selected' : ''}>Tier B</option>
                <option value="Tier C" ${initialData.tier === 'Tier C' || initialData.tier === 'C' ? 'selected' : ''}>Tier C</option>
                <option value="Tier D" ${initialData.tier === 'Tier D' || initialData.tier === 'D' ? 'selected' : ''}>Tier D</option>
              </select>
            </div>
            <div class="control-field-group">
              <label class="control-label">Starting Bid / Base Price (PTS) *</label>
              <input type="number" id="racer-base-input" class="form-input" required min="50" step="50" placeholder="1000" value="${initialData.basePoints}">
            </div>
          </div>

          <!-- Championship Status & Team Assignment -->
          <div style="background:rgba(10,14,22,0.8); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:0.75rem;">
            <span style="font-size:0.75rem; font-weight:700; color:var(--accent-cyan); text-transform:uppercase;">Championship Status & Team Purse Allocation</span>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
              <div class="control-field-group">
                <label class="control-label">Auction Status</label>
                <select id="racer-status-select" class="form-select" onchange="document.getElementById('racer-sale-meta-row').style.display = this.value === 'sold' ? 'grid' : 'none'">
                  <option value="upcoming" ${initialData.status === 'upcoming' ? 'selected' : ''}>Upcoming (In Pool)</option>
                  <option value="sold" ${initialData.status === 'sold' ? 'selected' : ''}>SOLD (Signed to Team)</option>
                  <option value="unsold" ${initialData.status === 'unsold' ? 'selected' : ''}>UNSOLD (Reserve)</option>
                </select>
              </div>

              <div id="racer-sale-meta-row" style="display:${initialData.status === 'sold' ? 'grid' : 'none'}; grid-template-columns: 1.2fr 1fr; gap:0.75rem;">
                <div class="control-field-group">
                  <label class="control-label">Signed Team</label>
                  <select id="racer-team-select" class="form-select">
                    <option value="">-- Choose Team --</option>
                    ${teams.map((t) => `
                      <option value="${t.id}" ${initialData.soldToTeamId === t.id ? 'selected' : ''}>
                        ${t.name} (${t.remainingPoints.toLocaleString()} PTS left, ${t.roster.length}/${t.maxRoster} slots)
                      </option>
                    `).join('')}
                  </select>
                </div>
                <div class="control-field-group">
                  <label class="control-label">Sold Price (PTS)</label>
                  <input type="number" id="racer-sold-price-input" class="form-input" placeholder="Price" value="${initialData.soldPoints || initialData.basePoints}">
                </div>
              </div>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted);">
              💡 If status is <strong>SOLD</strong>, points are automatically deducted from the team's prize pool budget.
            </div>
          </div>

          <!-- Submit Buttons -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
            ${racerId ? `
              <button type="button" class="btn btn-danger" onclick="window.app.handleDeleteRacer('${racerId}')">
                🗑️ Delete Racer
              </button>
            ` : '<div></div>'}
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn btn-outline" onclick="window.app.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-cyan">${racerId ? 'Update Racer' : 'Save & Add Racer'}</button>
            </div>
          </div>
        </div>
      </form>
    `;

    document.getElementById('general-modal').classList.add('active');
  }

  // Add / Edit Team Modal Setup (Simplified: Name, Budget, Max Slots, Color, Icon)
  openTeamModal(teamId = null) {
    this.editingTeamId = teamId;
    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    const modal = document.getElementById('general-modal');
    const modalCard = modal?.querySelector('.modal-card');
    if (!modalBody || !modalTitle) return;

    if (modalCard) modalCard.classList.remove('modal-card-xl');

    let initialData = {
      name: '',
      startingPoints: 12000,
      maxRoster: 4,
      color: '#00f2fe',
      logoIcon: '🏎️',
      logoUrl: null
    };

    if (teamId) {
      const t = store.getState().teams.find((item) => item.id === teamId);
      if (t) initialData = { ...t };
      modalTitle.textContent = 'Edit Racing Team';
    } else {
      modalTitle.textContent = 'Add New Racing Team';
    }

    this.uploadedTeamLogoBase64 = initialData.logoUrl || null;

    modalBody.innerHTML = `
      <form id="team-form" onsubmit="event.preventDefault(); window.app.saveTeamForm();">
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
          
          <!-- Team Logo Photo Upload (Clean - No presets, No extra text) -->
          <div class="control-field-group">
            <label class="control-label">Team Logo Photo</label>
            <div class="photo-uploader" id="team-photo-dropzone" onclick="document.getElementById('team-photo-input').click()">
              <input type="file" id="team-photo-input" accept="image/*" style="display:none;" onchange="window.app.handlePhotoUpload(event, 'team')">
              <div id="team-preview-container">
                ${this.uploadedTeamLogoBase64 ? `
                  <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                    <img id="team-preview-img" src="${this.uploadedTeamLogoBase64}" class="photo-preview-thumb" alt="Team Logo Preview" style="border-color:${initialData.color};">
                    <span style="font-size:0.72rem; color:var(--accent-cyan); font-weight:700;">Click to Change Photo</span>
                  </div>
                ` : `
                  <div class="photo-upload-empty-box">
                    <span style="font-size: 1.8rem;">🛡️</span>
                    <span class="photo-upload-btn-text">+ Add Logo Photo</span>
                  </div>
                `}
              </div>
            </div>
          </div>

          <div class="control-field-group">
            <label class="control-label">Team Name *</label>
            <input type="text" id="team-name-input" class="form-input" required placeholder="e.g. Redline Racing" value="${initialData.name}">
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
            <div class="control-field-group">
              <label class="control-label">Starting Purse / Budget (PTS) *</label>
              <input type="number" id="team-purse-input" class="form-input" required min="500" step="500" placeholder="12000" value="${initialData.startingPoints}">
            </div>
            <div class="control-field-group">
              <label class="control-label">Max Driver Roster Slots *</label>
              <input type="number" id="team-roster-limit-input" class="form-input" required min="1" max="12" value="${initialData.maxRoster}">
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr; gap:0.75rem;">
            <div class="control-field-group">
              <label class="control-label">Team Accent Color</label>
              <input type="color" id="team-color-input" class="form-input" style="height:44px; padding:2px; cursor:pointer;" value="${initialData.color}">
            </div>
          </div>

          <!-- Submit Buttons -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
            ${teamId ? `
              <button type="button" class="btn btn-danger" onclick="window.app.handleDeleteTeam('${teamId}')">
                🗑️ Delete Team
              </button>
            ` : '<div></div>'}
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn btn-outline" onclick="window.app.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-cyan">${teamId ? 'Update Team' : 'Add Team'}</button>
            </div>
          </div>
        </div>
      </form>
    `;

    document.getElementById('general-modal').classList.add('active');
  }

  // Backup / Export / Import & Cloud Sync Settings Modal
  openSettingsModal() {
    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = '⚙️ Tournament Data & Cloud Database';

    const viewerUrl = window.syncBridge ? window.syncBridge.getViewerShareUrl() : window.location.href;
    const isCloudConnected = window.syncBridge ? window.syncBridge.isCloudConnected : false;
    const isFirebaseConnected = window.syncBridge ? window.syncBridge.isFirebaseConnected : false;
    const firebaseConfig = window.syncBridge ? window.syncBridge.getFirebaseConfig() : null;
    const roomId = window.syncBridge ? window.syncBridge.roomId : 'soulcity2026';

    modalBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1.25rem;">
        
        <!-- FIREBASE REALTIME DATABASE CLOUD STORAGE -->
        <div style="background:rgba(255,184,0,0.06); padding:1.25rem; border-radius:var(--radius-md); border:1px solid rgba(255,184,0,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; flex-wrap:wrap; gap:0.5rem;">
            <h4 style="font-family:var(--font-display); font-size:1rem; color:var(--accent-gold); display:flex; align-items:center; gap:0.5rem; margin:0;">
              <span>🔥</span> Firebase Cloud Database (Permanent Storage)
            </h4>
            <span class="section-tag" style="background:${isFirebaseConnected ? 'rgba(0,255,135,0.15)' : 'rgba(255,184,0,0.15)'}; color:${isFirebaseConnected ? 'var(--accent-green)' : 'var(--accent-gold)'}; border-color:${isFirebaseConnected ? 'rgba(0,255,135,0.4)' : 'rgba(255,184,0,0.4)'}; font-size:0.75rem;">
              ${isFirebaseConnected ? '● Firebase Cloud Active' : '○ Not Configured'}
            </span>
          </div>
          <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:0.85rem; line-height:1.45;">
            Connect your Google Firebase Realtime Database to store <strong>racers, teams, rounds, and matchups permanently in the cloud</strong>. When connected, your data will never disappear on page refresh or device change.
          </p>

          <form id="firebase-config-form" onsubmit="event.preventDefault(); window.app.saveFirebaseSettings();" style="display:flex; flex-direction:column; gap:0.75rem;">
            <div class="control-field-group">
              <label class="control-label" style="font-size:0.75rem;">Firebase Database URL *</label>
              <input type="url" id="fb-database-url" class="form-input font-mono" placeholder="https://your-project-default-rtdb.firebaseio.com" value="${firebaseConfig?.databaseURL || ''}" required style="font-size:0.85rem;">
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
              <div class="control-field-group">
                <label class="control-label" style="font-size:0.75rem;">API Key *</label>
                <input type="text" id="fb-api-key" class="form-input font-mono" placeholder="AIzaSy..." value="${firebaseConfig?.apiKey || ''}" required style="font-size:0.82rem;">
              </div>
              <div class="control-field-group">
                <label class="control-label" style="font-size:0.75rem;">Project ID *</label>
                <input type="text" id="fb-project-id" class="form-input font-mono" placeholder="apex-racing-2026" value="${firebaseConfig?.projectId || ''}" required style="font-size:0.82rem;">
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:0.35rem;">
              <div style="display:flex; gap:0.5rem;">
                <button type="submit" class="btn btn-gold btn-sm">
                  💾 Connect & Save Firebase
                </button>
                <button type="button" class="btn btn-cyan btn-sm" onclick="window.app.syncAllToFirebase()" ${!isFirebaseConnected ? 'disabled' : ''}>
                  ☁️ Force Sync to Cloud
                </button>
              </div>
              ${firebaseConfig ? `
                <button type="button" class="btn btn-danger btn-sm" onclick="window.app.clearFirebaseSettings()">
                  Disconnect
                </button>
              ` : ''}
            </div>
          </form>

          <!-- Quick Setup Instructions Accordion / Card -->
          <div style="margin-top:0.85rem; padding:0.65rem 0.85rem; background:rgba(0,0,0,0.3); border-radius:var(--radius-sm); border:1px dashed var(--border-subtle); font-size:0.76rem; color:var(--text-muted);">
            <strong style="color:#fff;">Quick 1-Minute Setup:</strong>
            <ol style="margin:0.35rem 0 0 1.2rem; padding:0; display:flex; flex-direction:column; gap:0.25rem;">
              <li>Go to <a href="https://console.firebase.google.com" target="_blank" style="color:var(--accent-cyan);">Firebase Console</a> and click <strong>Create a Project</strong>.</li>
              <li>Under <strong>Build ➔ Realtime Database</strong>, click <strong>Create Database</strong> and select <strong>Test Mode</strong> (Read & Write enabled).</li>
              <li>Copy the <strong>Database URL</strong> and your <strong>Project Settings ➔ Web API Key</strong> into the fields above and click Save!</li>
            </ol>
          </div>
        </div>

        <!-- Live Cloud Multi-Device Sync Card -->
        <div style="background:rgba(0,242,254,0.06); padding:1.15rem; border-radius:var(--radius-md); border:1px solid rgba(0,242,254,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <h4 style="font-family:var(--font-display); font-size:0.95rem; color:var(--accent-cyan); display:flex; align-items:center; gap:0.5rem;">
              <span>🌐</span> Live Cloud Real-Time Sync
            </h4>
            <span class="section-tag" style="background:${isCloudConnected ? 'rgba(0,255,135,0.15)' : 'rgba(0,242,254,0.15)'}; color:${isCloudConnected ? 'var(--accent-green)' : 'var(--accent-cyan)'}; border-color:${isCloudConnected ? 'rgba(0,255,135,0.4)' : 'rgba(0,242,254,0.4)'}; font-size:0.7rem;">
              ${isCloudConnected ? '● Cloud Connected' : '● Room: ' + roomId}
            </span>
          </div>
          <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.75rem;">
            When deployed on Vercel, share the <strong>Public Viewer Link</strong> with spectators. Whenever you start an auction, mark sold/unsold, or adjust prices on your device, all viewers across the internet see the updates instantly in real time without needing admin access!
          </p>

          <div style="display:flex; gap:0.5rem; flex-direction:column;">
            <label class="control-label" style="font-size:0.72rem;">Public Viewer Live Link</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="public-viewer-url-input" class="form-input" readonly value="${viewerUrl}" style="background:rgba(10,14,22,0.9); font-size:0.8rem;">
              <button class="btn btn-cyan" style="white-space:nowrap;" onclick="window.app.copyViewerShareLink()">
                🔗 Copy Link
              </button>
            </div>
          </div>
        </div>

        <div style="background:rgba(10,14,22,0.7); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <h4 style="font-family:var(--font-display); font-size:0.95rem; margin-bottom:0.4rem;">Export Tournament State</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">Download all teams, rosters, bids, and racers as a JSON backup file.</p>
          <button class="btn btn-outline" onclick="window.app.exportTournamentJSON()">
            💾 Download Backup JSON
          </button>
        </div>

        <div style="background:rgba(10,14,22,0.7); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <h4 style="font-family:var(--font-display); font-size:0.95rem; margin-bottom:0.4rem;">Restore / Import Backup</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">Upload a previously saved tournament JSON file.</p>
          <input type="file" id="import-json-file" accept=".json" style="display:none;" onchange="window.app.importTournamentJSON(event)">
          <button class="btn btn-outline" onclick="document.getElementById('import-json-file').click()">
            📂 Select Backup File
          </button>
        </div>

        <div style="background:rgba(255,42,85,0.08); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-crimson);">
          <h4 style="font-family:var(--font-display); font-size:0.95rem; color:var(--accent-red); margin-bottom:0.4rem;">Reset Tournament</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">Reset all team points, auction records, and revert to fresh default roster.</p>
          <button class="btn btn-danger" onclick="window.app.confirmResetTournament()">
            ⚠️ Reset All Tournament Data
          </button>
        </div>
      </div>
    `;

    document.getElementById('general-modal').classList.add('active');
  }
}

export const adminView = new AdminView();
