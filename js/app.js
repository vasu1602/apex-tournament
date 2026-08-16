import { store, CATEGORIES } from './state.js';
import { PRESET_AVATARS, PRESET_TEAM_LOGOS } from './presets.js';
import { initCanvasBackground } from './canvas-bg.js';
import { soundFX } from './audio.js';
import { sync } from './sync.js';
import { viewerView } from './viewer-view.js';
import { adminView } from './admin-view.js';
import { imageCropper } from './image-cropper.js';

class AppController {
  constructor() {
    this.activeTab = 'live-arena-view';
    this.canvasBg = null;
  }

  init() {
    // 1. Initialize canvas background
    this.canvasBg = initCanvasBackground('bg-canvas');
    viewerView.init();
    adminView.init();

    // 2. Subscribe to state updates
    store.subscribe((state, meta) => {
      this.renderCurrentView();
      this.updateHeaderStats();
    });

    // 3. Render initial views
    this.renderCurrentView();
    this.updateHeaderStats();
    this.setupEventListeners();

    // Expose app controller globally
    window.app = this;
  }

  setupEventListeners() {
    // Tab switching
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Space to toggle timer if in admin tab
      if (e.code === 'Space' && this.activeTab === 'admin-view' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.toggleTimer();
      }
    });
  }

  switchTab(tabId) {
    const state = store.getState();
    
    // Guard Race Control tab from unauthenticated viewers
    if (tabId === 'admin-view' && !state.currentUser.isAuthenticated) {
      this.openAccessCodeModal();
      return;
    }

    this.activeTab = tabId;

    // Update active tab buttons
    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show active tab section
    document.querySelectorAll('.tab-section').forEach((sec) => {
      if (sec.id === tabId) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    this.renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderCurrentView() {
    const state = store.getState();
    const isAuth = state.currentUser.isAuthenticated;

    // Control visibility of the Race Control navigation tab
    const adminNavBtn = document.getElementById('nav-admin-btn');
    if (adminNavBtn) {
      if (isAuth) {
        adminNavBtn.style.display = 'inline-flex';
      } else {
        adminNavBtn.style.display = 'none'; // HIDDEN for regular viewers
      }
    }

    // Update header role / login button
    const roleContainer = document.getElementById('header-role-container');
    if (roleContainer) {
      if (isAuth) {
        roleContainer.innerHTML = `
          <div class="admin-profile-pill">
            <span>${state.currentUser.adminName}</span>
            <button class="admin-profile-signout" onclick="window.app.handleSignOut()" title="Sign Out">
              ✕
            </button>
          </div>
        `;
      } else {
        roleContainer.innerHTML = `
          <button class="role-badge-btn" onclick="window.app.openAccessCodeModal()">
            Admin Sign In
          </button>
        `;
      }
    }

    // Always keep public views fresh
    viewerView.renderLiveStage('live-arena-view');
    viewerView.renderTeamsGrid('teams-container');
    viewerView.renderRacersGrid('racers-container');

    // Render admin view only if authenticated
    if (isAuth) {
      adminView.renderAdminDesk('admin-desk-view');
    } else {
      const adminContainer = document.getElementById('admin-desk-view');
      if (adminContainer) {
        adminContainer.innerHTML = '';
      }
    }
  }

  // --- ACCESS CODE AUTHENTICATION WORKFLOW ---
  openAccessCodeModal(prefilledCode = '') {
    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    const modal = document.getElementById('general-modal');
    const modalCard = modal?.querySelector('.modal-card');
    if (!modalBody || !modalTitle) return;

    if (modalCard) modalCard.classList.remove('modal-card-xl');
    modalTitle.textContent = 'Admin & Team Sign In';

    modalBody.innerHTML = `
      <div class="auth-box-container">
        <div class="auth-header-card">
          <h3 class="auth-title">Race Control Login</h3>
          <p class="auth-subtitle">Enter your secret authorized passcode to unlock championship controls.</p>
        </div>

        <form id="access-code-form" onsubmit="event.preventDefault(); window.app.submitAccessCode();">
          <div class="control-field-group">
            <label class="control-label">Access Passcode *</label>
            <div style="position:relative; display:flex; align-items:center;">
              <input type="password" id="auth-access-code-input" class="form-input font-mono" required placeholder="Enter Secret Passcode" value="${prefilledCode}" autocomplete="off" style="font-size:1.15rem; letter-spacing:2px; text-transform:uppercase; text-align:center; padding-right:3rem;">
              <button type="button" class="btn-icon" style="position:absolute; right:0.5rem; background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:0.9rem;" onclick="window.app.togglePasscodeVisibility()" title="Show/Hide Passcode">
                👁️
              </button>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
            <button type="button" class="btn btn-outline" onclick="window.app.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-gold">Sign In & Unlock</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('general-modal').classList.add('active');
    setTimeout(() => {
      const inp = document.getElementById('auth-access-code-input');
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 100);
  }

  togglePasscodeVisibility() {
    const input = document.getElementById('auth-access-code-input');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  submitAccessCode() {
    const input = document.getElementById('auth-access-code-input');
    if (!input || !input.value) return;
    const code = input.value.trim();
    const res = store.verifyAccessCode(code);
    if (res.success) {
      this.closeModal();
      this.showToast(`Welcome, ${res.user.adminName}! Race Control unlocked.`, 'success');
      this.switchTab('admin-view');
    } else {
      this.showToast(res.message, 'error');
    }
  }

  quickEnterAdmin() {
    store.verifyAccessCode('SOULCITYS3FULL');
    this.closeModal();
    this.showToast('Race Control unlocked as Super Admin!', 'success');
    this.switchTab('admin-view');
  }

  quickAddTeam() {
    if (!store.getState().currentUser.isAuthenticated) {
      store.verifyAccessCode('SOULCITYS3FULL');
    }
    this.openAddTeamModal();
  }

  quickAddRacer() {
    if (!store.getState().currentUser.isAuthenticated) {
      store.verifyAccessCode('SOULCITYS3FULL');
    }
    this.openAddRacerModal();
  }

  loadDemoData() {
    store.verifyAccessCode('SOULCITYS3FULL');
    store.loadSampleData();
    this.showToast('Loaded Championship Crews & Drivers!', 'success');
    this.switchTab('live-arena-view');
  }

  handleSignOut() {
    store.signOut();
    this.showToast('Signed out. Control mode hidden.', 'info');
    this.switchTab('live-arena-view');
  }

  // --- ACCESS CODE MANAGEMENT & DELEGATION ---
  openCreateAccessCodeModal() {
    adminView.openCreateAccessCodeModal();
  }

  randomizeAccessCodeInput() {
    const roleSelect = document.getElementById('new-code-role');
    const role = roleSelect ? roleSelect.value : 'super_admin';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const prefix = role === 'super_admin' ? 'ADMIN' : role === 'auctioneer' ? 'GAVEL' : 'TEAM';
    const customInput = document.getElementById('new-code-custom');
    if (customInput) {
      customInput.value = `${prefix}-${randNum}`;
    }
  }

  saveNewAccessCode() {
    const label = document.getElementById('new-code-label').value;
    const role = document.getElementById('new-code-role').value;
    const teamSelect = document.getElementById('new-code-team');
    const teamId = role === 'team_admin' && teamSelect ? teamSelect.value : null;
    const customCode = document.getElementById('new-code-custom').value;

    const result = store.createAccessCode({ label, role, teamId, customCode });
    if (result.success) {
      this.closeModal();
      this.showToast(`Generated access code "${result.accessCode.code}" for ${label}!`, 'success');
    } else {
      this.showToast(result.message, 'error');
    }
  }

  copyAccessCode(code) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    this.showToast(`Copied code "${code}" to clipboard!`, 'info');
  }

  copyViewerShareLink() {
    const url = window.syncBridge ? window.syncBridge.getViewerShareUrl() : window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    this.showToast('Copied Live Viewer Link to clipboard! Share this with your audience.', 'success');
  }

  handleRevokeAccessCode(codeId, code) {
    if (confirm(`Are you sure you want to revoke access passcode "${code}"?`)) {
      const res = store.revokeAccessCode(codeId);
      if (res.success) {
        this.showToast(`Revoked passcode "${code}"`, 'info');
      } else {
        this.showToast(res.message, 'error');
      }
    }
  }

  updateHeaderStats() {
    const state = store.getState();
    const liveTag = document.getElementById('header-live-tag');
    if (liveTag) {
      if (state.activeAuction.status === 'bidding') {
        liveTag.style.display = 'flex';
      } else {
        liveTag.style.display = 'none';
      }
    }
  }

  renderSummaryStats() {
    // Top summary stats ribbon removed per user preference
  }

  // --- FILTER & SEARCH HANDLERS ---
  setRacerCategoryFilter(cat) {
    viewerView.currentCategoryFilter = cat;
    // update buttons
    document.querySelectorAll('.cat-pill').forEach((btn) => {
      if (btn.getAttribute('data-cat') === cat) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    viewerView.renderRacersGrid('racers-container');
  }

  setRacerStatusFilter(status) {
    viewerView.currentStatusFilter = status;
    document.querySelectorAll('.status-pill').forEach((btn) => {
      if (btn.getAttribute('data-status') === status) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    viewerView.renderRacersGrid('racers-container');
  }

  setLiveArenaHistoryFilter(filter) {
    viewerView.setLiveArenaHistoryFilter(filter);
  }

  handleSearchInput(event) {
    viewerView.searchQuery = event.target.value;
    viewerView.renderRacersGrid('racers-container');
  }

  // --- MODAL CONTROLS ---
  openRoleModal() {
    const modalBody = document.getElementById('general-modal-body');
    const modalTitle = document.getElementById('general-modal-title');
    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = '👤 Select Display / Control Mode';

    modalBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div style="background:rgba(0,242,254,0.08); border:1px solid rgba(0,242,254,0.3); padding:1.25rem; border-radius:var(--radius-lg); cursor:pointer;" onclick="window.app.setUserRole('viewer', 'Spectator')">
          <div style="font-family:var(--font-display); font-size:1.1rem; font-weight:800; color:var(--accent-cyan); margin-bottom:0.25rem;">
            👁️ Viewer / Spectator Mode
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary);">
            Pure spectator screen. Ideal for tournament displays, fans, and auditorium projectors. Read-only permissions.
          </p>
        </div>

        <div style="background:rgba(255,42,85,0.08); border:1px solid var(--border-crimson); padding:1.25rem; border-radius:var(--radius-lg); cursor:pointer;" onclick="window.app.setUserRole('admin', 'Race Control Chief')">
          <div style="font-family:var(--font-display); font-size:1.1rem; font-weight:800; color:var(--accent-red); margin-bottom:0.25rem;">
            🏎️ Race Control Admin / Auctioneer
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary);">
            Full administrative power: Add racers with custom photos, operate live bidding, trigger gavel sales, and edit teams.
          </p>
        </div>
      </div>
    `;

    document.getElementById('general-modal').classList.add('active');
  }

  setUserRole(role, name) {
    store.setUserRole(role, name);
    this.closeModal();
    this.showToast(`Switched to ${role === 'admin' ? 'Race Control Admin' : 'Spectator Mode'}`, 'success');
  }

  openAddRacerModal() {
    adminView.openRacerModal(null);
  }

  openEditRacerModal(racerId) {
    adminView.openRacerModal(racerId);
  }

  openAddTeamModal() {
    adminView.openTeamModal(null);
  }

  openEditTeamModal(teamId) {
    adminView.openTeamModal(teamId);
  }

  openSettingsModal() {
    adminView.openSettingsModal();
  }

  openTeamModal(teamId) {
    viewerView.renderTeamModal(teamId);
  }

  inspectRacer(racerId) {
    viewerView.renderRacerModal(racerId);
  }

  closeModal() {
    const modal = document.getElementById('general-modal');
    if (modal) modal.classList.remove('active');
  }

  // --- RACER FORM & PHOTO UPLOAD ---
  // --- PHOTO UPLOADS & INTERACTIVE CROPPER ---
  handlePhotoUpload(event, targetType = 'racer') {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Please select a valid image file (PNG, JPG, WebP)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawImageSrc = e.target.result;

      // Open interactive cropper modal
      if (targetType === 'team') {
        imageCropper.open({
          imageSrc: rawImageSrc,
          title: '🛡️ Crop & Center Team Logo',
          shape: 'square',
          onSave: (croppedBase64) => {
            adminView.uploadedTeamLogoBase64 = croppedBase64;
            const container = document.getElementById('team-preview-container');
            if (container) {
              container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                  <img id="team-preview-img" src="${croppedBase64}" class="photo-preview-thumb" alt="Team Logo">
                  <span style="font-size:0.72rem; color:var(--accent-cyan); font-weight:700;">Click to Change Photo</span>
                </div>
              `;
            }
            this.showToast('Team logo cropped & attached!', 'success');
          }
        });
      } else {
        imageCropper.open({
          imageSrc: rawImageSrc,
          title: '🏎️ Crop & Center Pilot Photo',
          shape: 'square',
          onSave: (croppedBase64) => {
            adminView.uploadedPhotoBase64 = croppedBase64;
            const container = document.getElementById('photo-preview-container');
            if (container) {
              container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                  <img id="photo-preview-img" src="${croppedBase64}" class="photo-preview-thumb" alt="Racer Photo">
                  <span style="font-size:0.72rem; color:var(--accent-cyan); font-weight:700;">Click to Change Photo</span>
                </div>
              `;
            }
            this.showToast('Racer photo cropped & attached!', 'success');
          }
        });
      }

      // Reset file input so the same file can be chosen again if desired
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  selectPresetAvatar(idx) {
    const avatar = PRESET_AVATARS[idx];
    if (!avatar) return;
    adminView.selectedAvatar = avatar.svg;
    adminView.uploadedPhotoBase64 = null;

    const previewImg = document.getElementById('photo-preview-img');
    if (previewImg) {
      previewImg.src = avatar.svg;
    }

    document.querySelectorAll('#general-modal-body .avatar-preset-btn').forEach((btn, i) => {
      if (i === Number(idx)) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
  }

  selectPresetTeamLogo(idx) {
    const preset = PRESET_TEAM_LOGOS[idx];
    if (!preset) return;
    adminView.selectedTeamLogo = preset.svg;
    adminView.uploadedTeamLogoBase64 = null;

    const previewImg = document.getElementById('team-preview-img');
    if (previewImg) {
      previewImg.src = preset.svg;
    }

    document.querySelectorAll('#general-modal-body .avatar-preset-btn').forEach((btn, i) => {
      if (i === Number(idx)) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
  }

  saveRacerForm() {
    const name = document.getElementById('racer-name-input').value.trim();
    const tier = document.getElementById('racer-category-input').value;
    const basePoints = Number(document.getElementById('racer-base-input').value) || 1000;
    const status = document.getElementById('racer-status-select')?.value || 'upcoming';
    const soldToTeamId = status === 'sold' ? (document.getElementById('racer-team-select')?.value || null) : null;
    const soldPoints = status === 'sold' ? (Number(document.getElementById('racer-sold-price-input')?.value) || basePoints) : null;

    if (status === 'sold' && !soldToTeamId) {
      this.showToast('Please choose a winning team when status is SOLD', 'error');
      return;
    }

    const racerData = {
      name,
      tier,
      category: tier,
      basePoints,
      status,
      soldToTeamId,
      soldPoints,
      avatar: adminView.selectedAvatar,
      photoUrl: adminView.uploadedPhotoBase64
    };

    let result;
    if (adminView.editingRacerId) {
      result = store.updateRacer(adminView.editingRacerId, racerData);
      if (result && !result.success) {
        this.showToast(result.message, 'error');
        return;
      }
      this.showToast(`Updated racer ${name} and recalculated team prize pools!`, 'success');
    } else {
      result = store.addRacer(racerData);
      if (result && !result.success) {
        this.showToast(result.message, 'error');
        return;
      }
      this.showToast(`Added new racer ${name}`, 'success');
    }

    this.closeModal();
  }

  handleDeleteRacer(racerId) {
    if (confirm('Are you sure you want to delete this racer from the tournament?')) {
      store.deleteRacer(racerId);
      this.closeModal();
      this.showToast('Racer deleted', 'info');
    }
  }

  // --- TEAM FORM ---
  saveTeamForm() {
    const name = document.getElementById('team-name-input').value.trim();
    const startingPoints = Number(document.getElementById('team-purse-input').value) || 12000;
    const maxRoster = Number(document.getElementById('team-roster-limit-input')?.value || document.getElementById('team-slots-input')?.value) || 4;
    const color = document.getElementById('team-color-input').value;
    const logoUrl = adminView.uploadedTeamLogoBase64 || adminView.selectedTeamLogo || null;

    const teamData = {
      name,
      startingPoints,
      maxRoster,
      color,
      logoIcon: '🏎️',
      logoUrl
    };

    if (adminView.editingTeamId) {
      store.updateTeam(adminView.editingTeamId, teamData);
      this.showToast(`Updated team ${name}`, 'success');
    } else {
      store.addTeam(teamData);
      this.showToast(`Registered new team ${name}`, 'success');
    }

    this.closeModal();
  }

  handleDeleteTeam(teamId) {
    if (confirm('Are you sure you want to delete this team? Any signed racers will return to the pool.')) {
      store.deleteTeam(teamId);
      this.closeModal();
      this.showToast('Team removed', 'info');
    }
  }

  // --- AUCTIONEER ACTIONS ---
  handleAdminStartAuction() {
    const selectEl = document.getElementById('admin-racer-select');
    if (!selectEl || !selectEl.value) {
      this.showToast('Please select a racer to put on block', 'error');
      return;
    }
    this.startAuctionForRacer(selectEl.value);
  }

  startAuctionForRacer(racerId) {
    const res = store.startAuction(racerId);
    if (res) {
      soundFX.play('engine');
      if (this.canvasBg) this.canvasBg.boostSpeed();
      this.showToast('Racer placed on auction block!', 'success');
      this.switchTab('live-arena-view');
    }
  }

  handleQuickBid(increment) {
    const state = store.getState();
    const selectTeam = document.getElementById('admin-bid-team-select');
    const customInput = document.getElementById('admin-custom-bid-input');
    
    let currentAmount = customInput ? Number(customInput.value) : state.activeAuction.currentBid;
    if (!currentAmount || isNaN(currentAmount)) currentAmount = state.activeAuction.currentBid || 1000;

    const nextAmount = currentAmount + increment;
    if (customInput) customInput.value = nextAmount;

    if (selectTeam && selectTeam.value) {
      this.placeBidForTeam(selectTeam.value, nextAmount);
    } else {
      state.activeAuction.currentBid = nextAmount;
      store.saveState();
      this.showToast(`Price adjusted to ${nextAmount.toLocaleString()} PTS`, 'info');
    }
  }

  handleCustomBid() {
    const selectTeam = document.getElementById('admin-bid-team-select');
    const inputAmount = document.getElementById('admin-custom-bid-input');
    if (!inputAmount) return;

    const amount = Number(inputAmount.value);
    if (!amount || isNaN(amount)) {
      this.showToast('Enter a valid bid/sale amount', 'error');
      return;
    }

    if (selectTeam && selectTeam.value) {
      this.placeBidForTeam(selectTeam.value, amount);
    } else {
      const state = store.getState();
      state.activeAuction.currentBid = amount;
      store.saveState();
      this.showToast(`Price updated to ${amount.toLocaleString()} PTS`, 'info');
    }
  }

  placeBidForTeam(teamId, amount) {
    const result = store.placeBid(teamId, amount);
    if (result.success) {
      soundFX.play('bid');
      if (this.canvasBg) this.canvasBg.boostSpeed();
      this.showToast(`Bid: ${amount.toLocaleString()} PTS by ${result.bid.teamName}`, 'success');
    } else {
      this.showToast(result.message, 'error');
    }
  }

  handleSold() {
    const selectTeam = document.getElementById('admin-bid-team-select');
    const inputAmount = document.getElementById('admin-custom-bid-input');
    
    const teamId = selectTeam ? selectTeam.value : null;
    const price = inputAmount ? Number(inputAmount.value) : null;

    if (!teamId) {
      this.showToast('Please select the winning team before marking SOLD', 'error');
      return;
    }

    const result = store.soldAuction(teamId, price);
    if (result.success) {
      soundFX.play('hammer');
      viewerView.triggerConfetti();
      this.showToast(`🔨 HAMMER DOWN! Sold to ${result.winningTeam.name} for ${result.record.finalBid.toLocaleString()} PTS!`, 'sold');
    } else {
      this.showToast(result.message, 'error');
    }
  }

  handleUnsold() {
    const result = store.unsoldAuction();
    if (result.success) {
      soundFX.play('unsold');
      this.showToast('Racer marked UNSOLD. Moved to reserve.', 'info');
    }
  }

  handleCancelAuction() {
    store.cancelAuction();
    this.showToast('Auction block cleared', 'info');
  }

  // --- DATA BACKUP & EXPORT ---
  exportTournamentJSON() {
    const jsonStr = store.exportDataJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex_tournament_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Tournament backup downloaded', 'success');
  }

  importTournamentJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const res = store.importDataJSON(e.target.result);
      if (res.success) {
        this.closeModal();
        this.showToast('Tournament state restored successfully!', 'success');
      } else {
        this.showToast(`Import failed: ${res.error}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  confirmResetTournament() {
    if (confirm('Are you sure you want to reset all tournament data back to initial state? This cannot be undone.')) {
      store.resetTournament();
      this.closeModal();
      this.showToast('Tournament reset to defaults', 'info');
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  // --- TOAST NOTIFICATIONS ---
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'sold') icon = '🏆';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }
}

// Start application when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    app.init();
  });
}
