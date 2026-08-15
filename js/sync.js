import { store } from './state.js';

class SyncBridge {
  constructor() {
    this.channelName = 'apex_racing_auction_channel';
    this.channel = null;
    this.init();
  }

  init() {
    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        try {
          this.channel = new BroadcastChannel(this.channelName);
          this.channel.onmessage = (event) => {
            this.handleMessage(event.data);
          };
        } catch (err) {
          console.warn('BroadcastChannel failed, fallback to storage listener:', err);
        }
      }

      // Storage fallback for older browsers or if BroadcastChannel is isolated
      window.addEventListener('storage', (e) => {
        if (e.key === 'apex_racing_auction_state_v1' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            store.applyExternalState(parsed);
          } catch (err) {
            console.error('Storage sync error:', err);
          }
        }
      });

      window.syncBridge = this;
    }
  }

  broadcastState(fullState) {
    if (this.channel) {
      this.channel.postMessage({
        type: 'STATE_SYNC',
        payload: fullState,
        sender: store.getState().currentUser?.adminName || 'Admin'
      });
    }
  }

  broadcastAction(actionType, payload) {
    if (this.channel) {
      this.channel.postMessage({
        type: actionType,
        payload,
        sender: store.getState().currentUser?.adminName || 'Admin'
      });
    }
  }

  handleMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'STATE_SYNC' && data.payload) {
      store.applyExternalState(data.payload);
    } else if (data.type === 'TRIGGER_AUDIO') {
      if (window.soundFX) {
        window.soundFX.play(data.payload.soundName);
      }
    }
  }
}

export const sync = new SyncBridge();
