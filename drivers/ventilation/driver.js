'use strict';

const Homey = require('homey');
const KardiaClient = require('../../lib/KardiaClient');

const DEFAULT_PORT = 8234;
const PROBE_TIMEOUT_MS = 8000;

class VentilationDriver extends Homey.Driver {
  async onInit() {
    this.modeChanged = this.homey.flow.getDeviceTriggerCard('ventilation_mode_changed');
  }

  /** Kobler til adresse:port og venter på en gyldig innstillingsramme. */
  async probe(host, port = DEFAULT_PORT, timeoutMs = PROBE_TIMEOUT_MS) {
    const client = new KardiaClient({ host, port, log: () => {} });
    client.on('error', () => {});
    try {
      client.connect();
      return await client.waitForSettings(timeoutMs);
    } finally {
      client.close();
    }
  }

  /** Adaptere funnet via MAC-oppdagelse (USR IOT) som faktisk svarer med ventilasjonsdata. */
  async discoverDevices() {
    const results = Object.values(this.getDiscoveryStrategy().getDiscoveryResults());
    this.log(`Oppdaget ${results.length} USR-adapter(e)`);
    const probed = await Promise.all(
      results.map(async (r) => {
        try {
          await this.probe(r.address);
          return {
            name: 'Ventilasjon',
            data: { id: r.id },
            settings: { host: r.address, port: DEFAULT_PORT, debug: false },
          };
        } catch (err) {
          this.log(`${r.address}: ingen ventilasjonsdata (${err.message})`);
          return null;
        }
      }),
    );
    return probed.filter(Boolean);
  }

  async onPair(session) {
    const manual = [];

    session.setHandler('list_devices', async () => {
      const devices = [...(await this.discoverDevices()), ...manual];
      if (devices.length === 0) {
        // Ingen funnet automatisk – la brukeren skrive inn adressen
        await session.showView('connect');
      }
      return devices;
    });

    session.setHandler('test_connection', async ({ host, port }) => {
      host = String(host || '').trim();
      port = Number(port) || DEFAULT_PORT;
      if (!host) throw new Error(this.homey.__('pair.no_host'));
      const settings = await this.probe(host, port, 15000).catch(() => {
        throw new Error(this.homey.__('pair.no_data'));
      });
      manual.length = 0;
      manual.push({
        name: 'Ventilasjon',
        data: { id: `manual-${host}:${port}` },
        settings: { host, port, debug: false },
      });
      return settings;
    });
  }
}

module.exports = VentilationDriver;
