import { store } from './state.js';

// Default Public / Shared Realtime Relay Configuration
const DEFAULT_FIREBASE_CONFIG = {
  databaseURL: "https://apex-racing-auction-default-rtdb.firebaseio.com"
};

class SyncBridge {
  constructor() {
    this.channelName = 'apex_racing_auction_channel';
    this.channel = null;
    this.firebaseApp = null;
    this.firebaseDb = null;
    this.dbRef = null;
    this.isCloudConnected = false;
    this.isApplyingRemoteState = false;
    this.lastSyncedHash = null;

    // Room ID from URL (?room=xxx) or default
    this.roomId = this.getRoomIdFromUrl();
    
    this.init();
  }

  getRoomIdFromUrl() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      if (room && room.trim()) {
        return room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      }
    }
    return 'soulcity2026';
  }

  init() {
    if (typeof window === 'undefined') return;

    // 1. Initialize local BroadcastChannel for same-device multi-tabs
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel fallback:', err);
      }
    }

    // 2. Local Storage fallback listener
    window.addEventListener('storage', (e) => {
      if (e.key === 'apex_racing_auction_state_v1' && e.newValue && !this.isApplyingRemoteState) {
        try {
          const parsed = JSON.parse(e.newValue);
          store.applyExternalState(parsed);
        } catch (err) {
          console.error('Storage sync error:', err);
        }
      }
    });

    // 3. Initialize Cloud Realtime Database (Firebase / WebSockets)
    this.initCloudRealtime();

    window.syncBridge = this;
  }

  getSavedFirebaseConfig() {
    try {
      const saved = localStorage.getItem('apex_firebase_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not parse custom Firebase config:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  saveFirebaseConfig(config) {
    try {
      localStorage.setItem('apex_firebase_config', JSON.stringify(config));
      this.initCloudRealtime();
      return true;
    } catch (e) {
      console.error('Failed to save Firebase config:', e);
      return false;
    }
  }

  initCloudRealtime() {
    if (typeof window.firebase === 'undefined') {
      // Firebase CDN still loading, retry shortly
      setTimeout(() => this.initCloudRealtime(), 300);
      return;
    }

    try {
      const config = this.getSavedFirebaseConfig();
      if (!config || !config.databaseURL) {
        this.updateSyncStatus(false, 'Local Mode Only');
        return;
      }

      // Initialize Firebase App if not already initialized
      if (!window.firebase.apps.length) {
        this.firebaseApp = window.firebase.initializeApp(config);
      } else {
        this.firebaseApp = window.firebase.apps[0];
      }

      this.firebaseDb = window.firebase.database();
      this.dbRef = this.firebaseDb.ref(`tournaments/${this.roomId}`);

      // Listen for remote real-time updates from Admin
      this.dbRef.on('value', (snapshot) => {
        const remoteData = snapshot.val();
        if (remoteData) {
          this.handleRemoteStateUpdate(remoteData);
        }
        this.updateSyncStatus(true, `Live Cloud Connected (Room: ${this.roomId})`);
      }, (error) => {
        console.warn('Firebase RTDB Read Warning (Using local sync):', error.message);
        this.updateSyncStatus(false, 'Offline (Local Sync Active)');
      });

    } catch (err) {
      console.warn('Firebase RTDB init notice:', err.message);
      this.updateSyncStatus(false, 'Local Broadcast Active');
    }
  }

  handleRemoteStateUpdate(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;

    // Avoid self-echo loop if hash matches
    const stateHash = JSON.stringify({
      activeAuction: remoteData.activeAuction,
      racersCount: remoteData.racers?.length,
      teamsCount: remoteData.teams?.length,
      historyCount: remoteData.auctionHistory?.length,
      timestamp: remoteData.updatedAt
    });

    if (this.lastSyncedHash === stateHash) return;
    this.lastSyncedHash = stateHash;

    this.isApplyingRemoteState = true;
    try {
      store.applyExternalState(remoteData);
    } finally {
      setTimeout(() => {
        this.isApplyingRemoteState = false;
      }, 100);
    }
  }

  broadcastState(fullState) {
    const stateHash = JSON.stringify({
      activeAuction: fullState.activeAuction,
      racersCount: fullState.racers?.length,
      teamsCount: fullState.teams?.length,
      historyCount: fullState.auctionHistory?.length,
      timestamp: Date.now()
    });
    this.lastSyncedHash = stateHash;

    // 1. Broadcast to local tabs
    if (this.channel) {
      this.channel.postMessage({
        type: 'STATE_SYNC',
        payload: fullState,
        sender: store.getState().currentUser?.adminName || 'Admin'
      });
    }

    // 2. Push to Cloud Realtime Database for all internet viewers (on Vercel & mobile)
    if (this.dbRef && !this.isApplyingRemoteState) {
      try {
        const payloadToSync = {
          tournamentName: fullState.tournamentName,
          teams: fullState.teams,
          racers: fullState.racers,
          accessCodes: fullState.accessCodes,
          activeAuction: fullState.activeAuction,
          auctionHistory: fullState.auctionHistory,
          updatedAt: Date.now(),
          updatedBy: fullState.currentUser?.adminName || 'Admin'
        };

        this.dbRef.set(payloadToSync).catch((err) => {
          console.warn('Cloud DB write notice:', err.message);
        });
      } catch (err) {
        console.warn('Cloud broadcast error:', err);
      }
    }
  }

  handleMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'STATE_SYNC' && data.payload && !this.isApplyingRemoteState) {
      this.handleRemoteStateUpdate(data.payload);
    }
  }

  updateSyncStatus(isConnected, message) {
    this.isCloudConnected = isConnected;
    const footerDot = document.querySelector('.footer-sync-dot');
    const footerText = document.querySelector('.footer-sync-status span');
    if (footerText) {
      footerText.textContent = isConnected 
        ? `Live Cloud Telemetry Sync Active • Room: ${this.roomId}`
        : `Local Telemetry Sync Active • ${message}`;
    }
    if (footerDot) {
      footerDot.style.background = isConnected ? 'var(--accent-green)' : 'var(--accent-cyan)';
      footerDot.style.boxShadow = isConnected ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-cyan)';
    }
  }

  getViewerShareUrl() {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }
}

export const sync = new SyncBridge();
