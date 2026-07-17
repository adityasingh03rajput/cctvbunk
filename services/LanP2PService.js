/**
 * LAN UDP P2P Service — primary classroom communication over local Wi-Fi.
 * Reliable delivery: packet ID, sequence, timestamp, ACK, retry, duplicate detection.
 * Falls back to socket relay when LAN send fails or ACK times out.
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

const { LanP2PModule } = NativeModules;
const lanEmitter = LanP2PModule ? new NativeEventEmitter(LanP2PModule) : null;

const ACK_TIMEOUT_MS = 3000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;
const SEEN_PACKET_TTL_MS = 120000;
const TIMER_HEARTBEAT_MS = 5000;

class LanP2PService {
  constructor() {
    this.isInitialized = false;
    this.role = null;
    this.enrollmentNo = null;
    this.localIp = null;
    this.listeners = [];
    this.pendingAcks = new Map();
    this.seenPacketIds = new Map();
    this.packetSeq = 0;
    this.socketRelayFn = null;
    this.lastTimerBroadcastAt = 0;
    this._subs = [];
  }

  async initialize(role, enrollmentNo) {
    if (!LanP2PModule) {
      console.warn('[LAN] Native LanP2PModule not available');
      return false;
    }
    if (this.isInitialized && this.role === role && this.enrollmentNo === enrollmentNo) {
      return true;
    }
    if (this.isInitialized) {
      await this.shutdown();
    }
    this.role = role;
    this.enrollmentNo = enrollmentNo;

    try {
      this.localIp = await LanP2PModule.getLocalIpAddress();
      await LanP2PModule.startListening();
      if (role === 'teacher') {
        await LanP2PModule.startAckListening();
      }
      this._attachNativeListeners();
      this.isInitialized = true;
      console.log(`[LAN] Initialized as ${role}, IP=${this.localIp}`);
      return true;
    } catch (err) {
      console.warn('[LAN] Init failed:', err.message);
      return false;
    }
  }

  setSocketRelay(fn) {
    this.socketRelayFn = fn;
  }

  getLocalIp() {
    return this.localIp;
  }

  _attachNativeListeners() {
    if (!lanEmitter) return;
    this._subs.forEach(s => s.remove());
    this._subs = [];

    this._subs.push(
      lanEmitter.addListener('onLanPacketReceived', ({ message, senderIp }) => {
        this._handleIncoming(message, senderIp, false);
      })
    );

    if (this.role === 'teacher') {
      this._subs.push(
        lanEmitter.addListener('onLanAckReceived', ({ message, senderIp }) => {
          this._handleIncoming(message, senderIp, true);
        })
      );
    }
  }

  _nextPacketId() {
    this.packetSeq += 1;
    return `${this.enrollmentNo || 'unknown'}_${Date.now()}_${this.packetSeq}`;
  }

  _buildPacket(type, payload, packetId) {
    return JSON.stringify({
      v: 1,
      packetId: packetId || this._nextPacketId(),
      seq: this.packetSeq,
      ts: Date.now(),
      type,
      sender: this.enrollmentNo,
      senderIp: this.localIp,
      payload,
    });
  }

  _parsePacket(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  _isDuplicate(packetId) {
    if (!packetId) return false;
    const now = Date.now();
    for (const [id, ts] of this.seenPacketIds.entries()) {
      if (now - ts > SEEN_PACKET_TTL_MS) this.seenPacketIds.delete(id);
    }
    if (this.seenPacketIds.has(packetId)) return true;
    this.seenPacketIds.set(packetId, now);
    return false;
  }

  async _sendLan(raw) {
    if (!LanP2PModule) return false;
    try {
      await LanP2PModule.broadcast(raw);
      return true;
    } catch (err) {
      console.warn('[LAN] Broadcast failed:', err.message);
      return false;
    }
  }

  async _sendAck(original, senderIp) {
    const ack = JSON.stringify({
      v: 1,
      type: 'ACK',
      ackFor: original.packetId,
      sender: this.enrollmentNo,
      ts: Date.now(),
    });
    console.log(`[LAN] ACK Packet ${original.packetId} → ${senderIp}`);
    try {
      await LanP2PModule.sendAck(ack, senderIp);
    } catch (err) {
      console.warn('[LAN] ACK send failed:', err.message);
    }
  }

  _handleIncoming(raw, senderIp, isAckChannel) {
    console.warn(`[LAN] Raw incoming packet: ${raw} (isAckChannel=${isAckChannel}, senderIp=${senderIp})`);
    const pkt = this._parsePacket(raw);
    if (!pkt) {
      console.warn(`[LAN] Failed to parse packet: ${raw}`);
      return;
    }

    if (pkt.type === 'ACK') {
      const pending = this.pendingAcks.get(pkt.ackFor);
      if (pending) {
        console.warn(`[LAN] ACK Received for Packet ${pkt.ackFor} from ${pkt.sender || senderIp}`);
        clearTimeout(pending.timeout);
        this.pendingAcks.delete(pkt.ackFor);
        pending.resolve(true);
      }
      return;
    }

    // Ignore our own broadcasts heard back on the shared listen port.
    if (pkt.sender && this.enrollmentNo && pkt.sender === this.enrollmentNo) {
      return;
    }

    if (this._isDuplicate(pkt.packetId)) {
      console.warn(`[LAN] Duplicate Packet ${pkt.packetId} — ignored`);
      if (this.role === 'student' && senderIp) {
        this._sendAck(pkt, senderIp);
      }
      return;
    }

    console.warn(`[LAN] RECEIVED Packet ${pkt.packetId} type=${pkt.type} from ${pkt.sender || senderIp}`);

    if (this.role === 'student' && senderIp) {
      this._sendAck(pkt, senderIp);
    }

    this._notifyListeners({ ...pkt, senderIp, via: 'lan' });
  }

  /**
   * Reliable broadcast from teacher with ACK tracking and server fallback.
   */
  async broadcastReliable(type, payload, options = {}) {
    const packetId = this._nextPacketId();
    const raw = this._buildPacket(type, payload, packetId);
    const targets = options.targetEnrollmentNos || [];
    const label = targets.length ? targets.join(',') : 'ALL';

    console.log(`[LAN] SEND Packet ${packetId} (${type}) → ${label}`);

    let attempt = 0;
    let acked = false;

    while (attempt < MAX_RETRIES && !acked) {
      attempt += 1;
      const sent = await this._sendLan(raw);
      if (!sent && this.socketRelayFn) {
        console.log(`[LAN] LAN send failed — relaying via server (attempt ${attempt})`);
        try {
          await this.socketRelayFn(type, payload, packetId, targets);
        } catch (e) {
          console.warn('[LAN] Server relay failed:', e.message);
        }
      }

      acked = await new Promise((resolve) => {
        if (this.role !== 'teacher' || options.requireAck === false) {
          resolve(true);
          return;
        }
        const timeout = setTimeout(() => {
          this.pendingAcks.delete(packetId);
          console.warn(`[LAN] ACK timeout Packet ${packetId} attempt ${attempt}/${MAX_RETRIES}`);
          resolve(false);
        }, ACK_TIMEOUT_MS);
        this.pendingAcks.set(packetId, { resolve, timeout });
      });

      if (!acked && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    if (!acked && this.socketRelayFn) {
      console.log(`[LAN] All retries exhausted for Packet ${packetId} — server fallback`);
      try {
        await this.socketRelayFn(type, payload, packetId, targets);
      } catch (e) {
        console.warn('[LAN] Final server relay failed:', e.message);
      }
    }

    return acked;
  }

  /** Throttled timer heartbeat — avoids flooding LAN every second */
  async sendTimerUpdate(seconds, isRunning, status) {
    const now = Date.now();
    if (now - this.lastTimerBroadcastAt < TIMER_HEARTBEAT_MS) return;
    this.lastTimerBroadcastAt = now;

    const raw = this._buildPacket('TIMER_UPDATE', {
      timerValue: seconds,
      isRunning,
      status,
      studentId: this.enrollmentNo,
    });
    console.log(`[LAN] SEND TIMER_UPDATE ${seconds}s running=${isRunning}`);
    await this._sendLan(raw);
  }

  /** Send a typed message over LAN (e.g. RANDOM_RING_RESPONSE from student) */
  async sendMessage(type, payload) {
    const raw = this._buildPacket(type, payload);
    console.log(`[LAN] SEND ${type}`);
    return this._sendLan(raw);
  }

  /** Immediate timer state change (start/stop/pause) — always sent */
  async sendTimerStateChange(seconds, isRunning, status) {
    this.lastTimerBroadcastAt = Date.now();
    const raw = this._buildPacket('TIMER_UPDATE', {
      timerValue: seconds,
      isRunning,
      status,
      studentId: this.enrollmentNo,
      stateChange: true,
    });
    console.log(`[LAN] SEND TIMER_STATE ${seconds}s running=${isRunning} status=${status}`);
    await this._sendLan(raw);
  }

  addListener(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  _notifyListeners(event) {
    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) { console.warn('[LAN] Listener error:', e.message); }
    });
  }

  async shutdown() {
    this._subs.forEach(s => s.remove());
    this._subs = [];
    this.pendingAcks.forEach(p => clearTimeout(p.timeout));
    this.pendingAcks.clear();
    this.seenPacketIds.clear();
    if (LanP2PModule) {
      try { await LanP2PModule.stopListening(); } catch (_) {}
    }
    this.isInitialized = false;
    this.role = null;
    this.enrollmentNo = null;
  }
}

export default new LanP2PService();
