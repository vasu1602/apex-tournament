import { store } from './state.js';

class SyncBridge {
  constructor() {
    this.channelName = 'apex_racing_auction_channel';
    this.channel = null;
    this.mqttClient = null;
    this.eventSource = null;
    this.peer = null;
    this.peerHostConn = null;
    this.peerConnections = new Set();
    this.firebaseDb = null;
    this.isFirebaseConnected = false;
    this.isCloudConnected = false;
    this.isLocalServerConnected = false;
    this.isApplyingRemoteState = false;
    this.lastSyncedHash = null;

    // Room ID from URL (?room=xxx) or default
    this.roomId = this.getRoomIdFromUrl();
    this.mqttTopic = `apex_racing_auction/v3/${this.roomId}`;

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

    // 0. Connect to Google Firebase Realtime Database (Persistent Cloud Storage)
    this.initFirebase();

    // 1. Local BroadcastChannel for same-device multi-tab synchronization
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel notice:', err);
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

    // Request sync when window gains focus or tab becomes visible
    window.addEventListener('focus', () => this.requestSync());
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.requestSync();
    });

    // 3. Connect to Local Server Sync (SSE / HTTP API for Wi-Fi & LAN)
    this.initLocalServerSync();

    // 4. Connect to Global Cloud MQTT over WebSockets (for Vercel & Internet)
    this.initCloudMqtt();

    // 5. Connect to Direct WebRTC Mesh Cloud Sync (for iPhones, Androids, Tablets & Remote PCs)
    this.initWebRtc();

    // Trigger initial sync requests
    setTimeout(() => this.requestSync(), 300);
    setTimeout(() => this.requestSync(), 1200);

    window.syncBridge = this;
  }

  // --- GOOGLE FIREBASE REALTIME DATABASE ENGINE ---
  initFirebase(customConfig = null) {
    if (typeof window === 'undefined') return;
    if (!window.firebase) {
      setTimeout(() => this.initFirebase(customConfig), 500);
      return;
    }

    try {
      const config = customConfig || this.getFirebaseConfig();
      if (!config || !config.databaseURL) {
        return;
      }

      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(config);
      }
      this.firebaseDb = window.firebase.database();
      this.isFirebaseConnected = true;

      // Real-time listener for live cloud updates
      const tournamentRef = this.firebaseDb.ref(`tournaments/${this.roomId}`);
      tournamentRef.on('value', (snapshot) => {
        const cloudData = snapshot.val();
        if (cloudData && typeof cloudData === 'object' && !this.isApplyingRemoteState) {
          this.handleRemoteStateUpdate(cloudData);
        }
      });

      this.updateSyncStatus(true, 'Firebase Realtime DB Active');
    } catch (err) {
      console.warn('[Firebase Cloud] Init notice:', err);
      this.isFirebaseConnected = false;
    }
  }

  getFirebaseConfig() {
    try {
      const stored = localStorage.getItem('apex_firebase_config');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  }

  saveFirebaseConfig(config) {
    try {
      localStorage.setItem('apex_firebase_config', JSON.stringify(config));
      this.initFirebase(config);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  clearFirebaseConfig() {
    localStorage.removeItem('apex_firebase_config');
    this.isFirebaseConnected = false;
    this.firebaseDb = null;
  }

  syncAllToFirebase() {
    if (!this.firebaseDb) return { success: false, message: 'Firebase is not connected.' };
    const currentState = store.getState();
    this.broadcastState(currentState);
    return { success: true };
  }

  requestSync() {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'SYNC_REQUEST' });
      } catch (e) {}
    }
    if (this.mqttClient && this.mqttClient.connected) {
      try {
        this.mqttClient.publish(`${this.mqttTopic}/events`, JSON.stringify({ type: 'SYNC_REQUEST' }), { qos: 1 });
      } catch (e) {}
    }
    if (this.peerHostConn && this.peerHostConn.open) {
      try {
        this.peerHostConn.send({ type: 'SYNC_REQUEST' });
      } catch (e) {}
    }
  }

  // --- WEBRTC DIRECT CLOUD P2P MESH (For 100% Mobile & Cross-Device Sync) ---
  initWebRtc() {
    if (typeof window.Peer === 'undefined') {
      setTimeout(() => this.initWebRtc(), 500);
      return;
    }

    try {
      const hostId = `apex_grandprix_${this.roomId}_host`;
      const isCandidateAdmin = store.getState().currentUser?.isAuthenticated;

      if (isCandidateAdmin) {
        this.peer = new window.Peer(hostId);
        this.peer.on('open', () => {
          this.updateSyncStatus(true, `Cloud Host Active (${this.roomId})`);
        });

        this.peer.on('connection', (conn) => {
          this.peerConnections.add(conn);
          conn.on('open', () => {
            conn.send({
              type: 'STATE_SYNC',
              payload: store.getState()
            });
          });
          conn.on('data', (data) => {
            this.handleMessage(data);
          });
          conn.on('close', () => {
            this.peerConnections.delete(conn);
          });
        });

        this.peer.on('error', (err) => {
          if (err.type === 'unavailable-id') {
            this.connectAsPeerViewer(hostId);
          }
        });
      } else {
        this.connectAsPeerViewer(hostId);
      }
    } catch (err) {
      console.warn('WebRTC notice:', err);
    }
  }

  connectAsPeerViewer(hostId) {
    try {
      const viewerId = `apex_v_${Math.random().toString(36).substr(2, 8)}`;
      this.peer = new window.Peer(viewerId);

      this.peer.on('open', () => {
        this.connectToHost(hostId);
      });

      this.peer.on('error', (e) => {
        console.warn('Peer viewer notice:', e);
      });
    } catch (e) {}
  }

  connectToHost(hostId) {
    if (!this.peer || this.peer.destroyed) return;
    try {
      const conn = this.peer.connect(hostId, { reliable: true });
      conn.on('open', () => {
        this.peerHostConn = conn;
        this.updateSyncStatus(true, `Live P2P Cloud Link Active (${this.roomId})`);
        conn.send({ type: 'SYNC_REQUEST' });
      });

      conn.on('data', (data) => {
        this.handleMessage(data);
      });

      conn.on('close', () => {
        this.peerHostConn = null;
        setTimeout(() => this.connectToHost(hostId), 3500);
      });
    } catch (e) {}
  }

  // --- SERVER & CLOUD API SYNC (Works on Vercel + Local Wi-Fi) ---
  initLocalServerSync() {
    // Initial fetch on load
    this.pollLocalState();

    // Listen for live Server-Sent Events from local server (for local network Wi-Fi)
    if (typeof EventSource !== 'undefined') {
      try {
        this.eventSource = new EventSource('/api/events');
        this.eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.type === 'STATE_SYNC' && data.payload) {
              this.isLocalServerConnected = true;
              this.handleRemoteStateUpdate(data.payload);
              this.updateSyncStatus(true, 'Local Network Server Active');
            } else if (data && data.type === 'BOX_EVENT' && data.payload) {
              this.handleMessage(data);
            }
          } catch (err) {
            console.warn('SSE parse error:', err);
          }
        };
        this.eventSource.onerror = () => {
          this.isLocalServerConnected = false;
        };
      } catch (err) {
        console.warn('EventSource notice:', err);
      }
    }
  }

  pollLocalState() {
    fetch('/api/state')
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.state) {
          this.handleRemoteStateUpdate(data.state);
        }
      })
      .catch(() => {});
  }

  // --- GLOBAL CLOUD WEBSOCKET SYNC (MQTT Broker for Vercel) ---
  initCloudMqtt(brokerIndex = 0) {
    if (typeof window.mqtt === 'undefined') {
      setTimeout(() => this.initCloudMqtt(brokerIndex), 350);
      return;
    }

    const brokers = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];
    const brokerUrl = brokers[brokerIndex % brokers.length];

    try {
      const clientId = 'apex_' + Math.random().toString(16).substr(2, 8);

      this.mqttClient = window.mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 3000
      });

      this.mqttClient.on('connect', () => {
        this.isCloudConnected = true;
        this.updateSyncStatus(true, `Connected to Cloud Room (${this.roomId})`);

        // Subscribe to tournament topics
        this.mqttClient.subscribe(this.mqttTopic, { qos: 1 });
        this.mqttClient.subscribe(`${this.mqttTopic}/events`, { qos: 1 });

        // Request latest state immediately upon connecting
        this.requestSync();
      });

      this.mqttClient.on('message', (topic, message) => {
        try {
          const payload = JSON.parse(message.toString());
          if (topic === `${this.mqttTopic}/events` || payload?.type === 'BOX_EVENT' || payload?.type === 'SYNC_REQUEST') {
            this.handleMessage(payload);
          } else if (topic === this.mqttTopic && payload?.state) {
            this.handleRemoteStateUpdate(payload.state);
          }
        } catch (err) {
          console.warn('[Cloud Sync] Message parse error:', err);
        }
      });

      this.mqttClient.on('error', (err) => {
        console.warn('[Cloud Sync] Connection notice:', err.message);
        this.isCloudConnected = false;
      });

      this.mqttClient.on('offline', () => {
        this.isCloudConnected = false;
      });

    } catch (err) {
      console.warn('[Cloud Sync] Init notice:', err);
    }
  }

  handleRemoteStateUpdate(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;

    const currentState = store.getState();
    const isAdmin = Boolean(currentState.currentUser && currentState.currentUser.isAuthenticated);

    // If current tab is Admin, only ignore if incoming state is older
    if (isAdmin) {
      const remoteTime = Number(remoteData.updatedAt) || 0;
      const localTime = Number(currentState.updatedAt) || 0;
      if (remoteTime <= localTime) {
        return;
      }
    }

    // Hash state including racers, teams, matchups details (so any racer edit/delete triggers instant re-render)
    const stateHash = JSON.stringify({
      activeAuction: remoteData.activeAuction,
      racers: remoteData.racers,
      teams: remoteData.teams,
      historyCount: remoteData.auctionHistory?.length,
      rounds: remoteData.tournamentRounds,
      activeRound: remoteData.activeTournamentRoundId,
      matchups: remoteData.tournamentMatchups,
      pending1: remoteData.pendingTeam1?.id,
      pending2: remoteData.pendingTeam2?.id,
      timestamp: remoteData.updatedAt
    });

    if (this.lastSyncedHash === stateHash) return;
    this.lastSyncedHash = stateHash;

    this.isApplyingRemoteState = true;
    try {
      store.applyExternalState(remoteData);
      if (typeof remoteData.pendingTeam1 !== 'undefined' && window.tournamentBox && !window.tournamentBox.isDrawing) {
        window.tournamentBox.pendingTeam1 = remoteData.pendingTeam1;
      }
      if (typeof remoteData.pendingTeam2 !== 'undefined' && window.tournamentBox && !window.tournamentBox.isDrawing) {
        window.tournamentBox.pendingTeam2 = remoteData.pendingTeam2;
      }
    } finally {
      setTimeout(() => {
        this.isApplyingRemoteState = false;
      }, 50);
    }
  }

  broadcastState(fullState, isExplicitClear = false) {
    const payloadToSync = {
      tournamentName: fullState.tournamentName,
      teams: fullState.teams,
      racers: fullState.racers,
      accessCodes: fullState.accessCodes,
      activeAuction: fullState.activeAuction,
      auctionHistory: fullState.auctionHistory,
      tournamentRounds: fullState.tournamentRounds || [],
      activeTournamentRoundId: fullState.activeTournamentRoundId || 'round_qualifiers',
      tournamentMatchups: fullState.tournamentMatchups || [],
      pendingTeam1: window.tournamentBox?.pendingTeam1 || null,
      pendingTeam2: window.tournamentBox?.pendingTeam2 || null,
      updatedAt: Date.now(),
      updatedBy: fullState.currentUser?.adminName || 'Admin',
      isExplicitClear
    };

    const stateHash = JSON.stringify({
      activeAuction: payloadToSync.activeAuction,
      racers: payloadToSync.racers,
      teams: payloadToSync.teams,
      historyCount: payloadToSync.auctionHistory?.length,
      rounds: payloadToSync.tournamentRounds,
      activeRound: payloadToSync.activeTournamentRoundId,
      matchups: payloadToSync.tournamentMatchups,
      pending1: payloadToSync.pendingTeam1?.id,
      pending2: payloadToSync.pendingTeam2?.id,
      timestamp: payloadToSync.updatedAt
    });
    this.lastSyncedHash = stateHash;

    // 1. Broadcast to local browser tabs via BroadcastChannel
    if (this.channel) {
      this.channel.postMessage({
        type: 'STATE_SYNC',
        payload: payloadToSync,
        sender: store.getState().currentUser?.adminName || 'Admin'
      });
    }

    // 2. Post to Local Server API (for Wi-Fi & LAN phones)
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToSync)
    }).catch(() => {
      // Ignored if purely static host
    });

    // 3. Publish to Global Cloud MQTT WebSockets (for Vercel & Internet Viewers)
    if (this.mqttClient && this.mqttClient.connected && !this.isApplyingRemoteState) {
      try {
        const msg = JSON.stringify({
          type: 'STATE_SYNC',
          roomId: this.roomId,
          state: payloadToSync
        });
        // retain: true ensures newly connected viewers immediately get the latest tournament state!
        this.mqttClient.publish(this.mqttTopic, msg, { qos: 1, retain: true });
      } catch (err) {
        console.warn('[Cloud Sync] Publish notice:', err);
      }
    }

    // 4. Send over Direct WebRTC Mesh to all connected mobile phones & devices
    if (this.peerConnections && this.peerConnections.size > 0) {
      this.peerConnections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send({
              type: 'STATE_SYNC',
              payload: payloadToSync
            });
          } catch (e) {}
        }
      });
    }

    // 5. Save directly to Google Firebase Realtime Database (Persistent Cloud Storage)
    if (this.firebaseDb && !this.isApplyingRemoteState) {
      try {
        this.firebaseDb.ref(`tournaments/${this.roomId}`).set(payloadToSync);
      } catch (err) {
        console.warn('[Firebase Cloud] Database save notice:', err);
      }
    }
  }

  broadcastBoxEvent(payload) {
    const eventData = {
      type: 'BOX_EVENT',
      payload,
      sender: store.getState().currentUser?.adminName || 'Admin'
    };

    // 1. Local browser tabs via BroadcastChannel
    if (this.channel) {
      this.channel.postMessage(eventData);
    }

    // 2. Local Server SSE/REST (Wi-Fi and mobile phones)
    fetch('/api/box-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    // 3. Global Cloud MQTT (Vercel internet viewers)
    if (this.mqttClient && this.mqttClient.connected) {
      try {
        this.mqttClient.publish(`${this.mqttTopic}/events`, JSON.stringify(eventData), { qos: 1 });
      } catch (err) {
        console.warn('[Cloud Sync] Box event publish notice:', err);
      }
    }

    // 4. Direct WebRTC Mesh Event to all phones and connected viewers
    if (this.peerConnections && this.peerConnections.size > 0) {
      this.peerConnections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(eventData);
          } catch (e) {}
        }
      });
    }
  }

  handleMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'SYNC_REQUEST') {
      const state = store.getState();
      const isAdmin = Boolean(state.currentUser && state.currentUser.isAuthenticated);
      if (isAdmin || (state.racers && state.racers.length > 0) || (state.teams && state.teams.length > 0) || (state.tournamentMatchups && state.tournamentMatchups.length > 0)) {
        this.broadcastState(state);
      }
    } else if (data.type === 'STATE_SYNC' && data.payload && !this.isApplyingRemoteState) {
      this.handleRemoteStateUpdate(data.payload);
    } else if (data.type === 'BOX_EVENT' && data.payload) {
      if (window.tournamentBox) {
        window.tournamentBox.handleRemoteBoxEvent(data.payload);
      }
    }
  }

  updateSyncStatus(isConnected, message) {
    const footerDot = document.querySelector('.footer-sync-dot');
    const footerText = document.querySelector('.footer-sync-status span');
    if (footerText) {
      footerText.textContent = isConnected 
        ? `Real-Time Sync Active • Room: ${this.roomId}`
        : `Local Sync Active • ${message}`;
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
