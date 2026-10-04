'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const P = require('./KardiaProtocol');

/**
 * TCP-klient mot seriell-til-Ethernet-adapteren (rå TCP, standard port 8234).
 *
 * Events:
 *   'connected'            TCP-forbindelse oppe
 *   'disconnected'         TCP-forbindelse nede (reconnect skjer automatisk)
 *   'settings' (obj, buf)  ny gyldig innstillingsramme
 *   'stats'    (obj, buf)  ny gyldig måleramme
 *   'frame'    (type, buf) alle gyldige rammer (for feilsøking)
 *   'error'    (err)
 */
class KardiaClient extends EventEmitter {
  constructor({ host, port = 8234, log = () => {} }) {
    super();
    this.host = host;
    this.port = Number(port) || 8234;
    this.log = log;
    this.socket = null;
    this.lastSettings = null;
    this.lastFrameAt = 0;
    this.connected = false;
    this._closing = false;
    this._retryMs = 2000;
    this._retryTimer = null;
    this._watchdog = null;
    this.parser = new P.FrameParser((type, buf) => this._onFrame(type, buf));
  }

  connect() {
    this._closing = false;
    this._open();
    clearInterval(this._watchdog);
    // Aggregatet sender rammer kontinuerlig. Får vi ingenting på 60 s, kobler vi til på nytt.
    this._watchdog = setInterval(() => {
      if (this.connected && Date.now() - this.lastFrameAt > 60000) {
        this.log('Ingen gyldige rammer på 60 s – kobler til på nytt');
        this.socket?.destroy();
      }
    }, 15000);
  }

  _open() {
    clearTimeout(this._retryTimer);
    const socket = new net.Socket();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10000);
    socket.setTimeout(20000);

    socket.on('connect', () => {
      this.connected = true;
      this._retryMs = 2000;
      this.lastFrameAt = Date.now();
      this.log(`Tilkoblet ${this.host}:${this.port}`);
      this.emit('connected');
    });
    socket.on('data', (chunk) => this.parser.push(chunk));
    socket.on('timeout', () => {
      this.log('Socket-timeout');
      socket.destroy();
    });
    socket.on('error', (err) => {
      this.log(`Socket-feil: ${err.message}`);
      this.emit('error', err);
    });
    socket.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.emit('disconnected');
      if (this._closing || this.socket !== socket) return;
      this._retryTimer = setTimeout(() => this._open(), this._retryMs);
      this._retryMs = Math.min(this._retryMs * 2, 60000);
    });

    socket.connect(this.port, this.host);
  }

  _onFrame(type, buf) {
    this.lastFrameAt = Date.now();
    this.emit('frame', type, buf);
    if (type === P.TYPE.SETTINGS) {
      this.lastSettings = buf;
      this.emit('settings', P.decodeSettings(buf), buf);
    } else if (type === P.TYPE.STATS) {
      this.emit('stats', P.decodeStats(buf), buf);
    }
  }

  /** Venter til første innstillingsramme er mottatt (brukes ved paring). */
  waitForSettings(timeoutMs = 15000) {
    if (this.lastSettings) return Promise.resolve(P.decodeSettings(this.lastSettings));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off('settings', onSettings);
        reject(new Error('Fikk ingen data fra aggregatet. Sjekk IP-adresse og port.'));
      }, timeoutMs);
      const onSettings = (s) => {
        clearTimeout(t);
        resolve(s);
      };
      this.once('settings', onSettings);
    });
  }

  async setParam(index, value) {
    if (!this.connected) throw new Error('Ikke tilkoblet ventilasjonsaggregatet');
    const cmd = P.buildCommand(this.lastSettings, index, value);
    // Kardia sendte kommandoen to ganger etter hverandre – vi gjør det samme.
    await this._write(cmd);
    await this._write(cmd);
    this.log(`Sendt param[${index}] = ${value}`);
  }

  setTargetTemperature(celsius) {
    return this.setParam(P.PARAM.TEMP_SETPOINT, Math.round(celsius));
  }

  setPreset(preset) {
    const v = P.PRESET[preset];
    if (v === undefined) throw new Error(`Ukjent modus: ${preset}`);
    return this.setParam(P.PARAM.PRESET, v);
  }

  _write(buf) {
    return new Promise((resolve, reject) => {
      this.socket.write(buf, (err) => (err ? reject(err) : resolve()));
    });
  }

  close() {
    this._closing = true;
    clearTimeout(this._retryTimer);
    clearInterval(this._watchdog);
    this.socket?.destroy();
    this.socket = null;
    this.removeAllListeners();
  }
}

module.exports = KardiaClient;
