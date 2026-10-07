'use strict';

const Homey = require('homey');
const KardiaClient = require('../../lib/KardiaClient');

const UPDATE_INTERVAL_MS = 5000; // ikke oppdater Homey oftere enn dette

// Målepunkt i 0xDD-rammen -> Homey-capability
const STATS_MAP = [
  ['tempIndoor', 'measure_temperature'],
  ['tempOutdoor', 'measure_temperature.outdoor'],
  ['tempSupply', 'measure_temperature.supply'],
  ['tempExhaust', 'measure_temperature.exhaust'],
  ['humidityIndoor', 'measure_humidity'],
  ['humidityOutdoor', 'measure_humidity.outdoor'],
  ['co2', 'measure_co2'],
  ['pm25Indoor', 'measure_pm25'],
  ['pm25Outdoor', 'measure_pm25.outdoor'],
  ['pm10Indoor', 'measure_pm10'],
  ['pm10Outdoor', 'measure_pm10.outdoor'],
];

class VentilationDevice extends Homey.Device {
  async onInit() {
    this._lastStats = 0;
    this._lastSettings = 0;
    this._offlineTimer = null;

    this.registerCapabilityListener('target_temperature', async (value) => {
      await this.client.setTargetTemperature(value);
    });

    this.registerCapabilityListener('ventilation_mode', async (value) => {
      await this.client.setPreset(value);
    });

    this._connect();
  }

  _connect() {
    this.client?.close();
    const { host, port } = this.getSettings();
    this.client = new KardiaClient({ host, port, log: (...a) => this.log(...a) });

    this.client.on('connected', () => {
      clearTimeout(this._offlineTimer);
      this.setAvailable().catch(this.error);
    });

    this.client.on('disconnected', () => {
      // Gi reconnect litt tid før enheten merkes som utilgjengelig
      clearTimeout(this._offlineTimer);
      this._offlineTimer = this.homey.setTimeout(() => {
        this.setUnavailable(this.homey.__('device.connection_lost')).catch(this.error);
      }, 60000);
    });

    this.client.on('error', () => {}); // logges i klienten

    this.client.on('stats', (stats) => {
      if (Date.now() - this._lastStats < UPDATE_INTERVAL_MS) return;
      this._lastStats = Date.now();
      for (const [key, cap] of STATS_MAP) {
        const v = stats[key];
        if (v !== null && v !== undefined && this.hasCapability(cap)) {
          this.setCapabilityValue(cap, v).catch(this.error);
        }
      }
    });

    this.client.on('settings', (settings) => {
      if (Date.now() - this._lastSettings < UPDATE_INTERVAL_MS) return;
      this._lastSettings = Date.now();
      if (settings.targetTemperature >= 10 && settings.targetTemperature <= 30) {
        this.setCapabilityValue('target_temperature', settings.targetTemperature).catch(this.error);
      }
      if (settings.preset && settings.preset !== this.getCapabilityValue('ventilation_mode')) {
        this.setCapabilityValue('ventilation_mode', settings.preset).catch(this.error);
        this.driver.modeChanged
          .trigger(this, { mode: settings.preset })
          .catch(this.error);
      }
    });

    this.client.on('frame', (type, buf) => {
      if (this.getSetting('debug')) {
        this.log(`RX 0x${type.toString(16)}: ${buf.toString('hex')}`);
      }
    });

    this.client.connect();
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('host') || changedKeys.includes('port')) {
      this.homey.setTimeout(() => this._connect(), 500);
    }
  }

  // --- Oppdagelse: følg adapteren hvis den får ny IP fra DHCP ---

  onDiscoveryResult(discoveryResult) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult) {
    await this._useAddress(discoveryResult.address);
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this._useAddress(discoveryResult.address).catch(this.error);
  }

  onDiscoveryLastSeenChanged() {
    if (this.client && !this.client.connected) this._connect();
  }

  async _useAddress(address) {
    if (!address || address === this.getSetting('host')) return;
    this.log(`Adapteren har fått ny adresse: ${address}`);
    await this.setSettings({ host: address });
    this._connect();
  }

  async onUninit() {
    clearTimeout(this._offlineTimer);
    this.client?.close();
  }

  async onDeleted() {
    await this.onUninit();
  }
}

module.exports = VentilationDevice;
