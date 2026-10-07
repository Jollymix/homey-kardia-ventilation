'use strict';

const net = require('net');
const Homey = require('homey');
const KardiaClient = require('../../lib/KardiaClient');

const DEFAULT_PORT = 8234;
const PROBE_TIMEOUT_MS = 8000;
const SCAN_CONNECT_TIMEOUT_MS = 800;
const SCAN_CONCURRENCY = 48;

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

  /** Sjekker raskt om en TCP-port er åpen. */
  portOpen(host, port, timeoutMs = SCAN_CONNECT_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const s = new net.Socket();
      const done = (ok) => {
        s.destroy();
        resolve(ok);
      };
      s.setTimeout(timeoutMs);
      s.once('connect', () => done(true));
      s.once('timeout', () => done(false));
      s.once('error', () => done(false));
      s.connect(port, host);
    });
  }

  /** Skanner Homeys eget /24-nett etter åpen port 8234 (reserve hvis MAC-oppdagelse ikke finner noe). */
  async scanSubnet() {
    let local;
    try {
      local = (await this.homey.cloud.getLocalAddress()).split(':')[0];
    } catch (err) {
      this.log(`Fant ikke Homeys lokale adresse: ${err.message}`);
      return [];
    }
    const prefix = local.split('.').slice(0, 3).join('.');
    const hosts = [];
    for (let i = 1; i < 255; i++) {
      const h = `${prefix}.${i}`;
      if (h !== local) hosts.push(h);
    }
    const open = [];
    for (let i = 0; i < hosts.length; i += SCAN_CONCURRENCY) {
      const batch = hosts.slice(i, i + SCAN_CONCURRENCY);
      const res = await Promise.all(batch.map((h) => this.portOpen(h, DEFAULT_PORT)));
      batch.forEach((h, j) => res[j] && open.push(h));
    }
    this.log(`Nettskann ${prefix}.0/24: port ${DEFAULT_PORT} åpen på ${open.join(', ') || 'ingen'}`);
    return open;
  }

  /** Adresser som allerede brukes av en paret enhet (adapteren tar bare én tilkobling). */
  pairedHosts() {
    return new Set(this.getDevices().map((d) => d.getSetting('host')));
  }

  async discoverDevices() {
    const paired = this.pairedHosts();
    const candidates = new Map(); // address -> { id, address, viaMac }

    for (const r of Object.values(this.getDiscoveryStrategy().getDiscoveryResults())) {
      candidates.set(r.address, { id: r.id, address: r.address, viaMac: true });
    }
    this.log(`MAC-oppdagelse: ${candidates.size} USR-adapter(e)`);

    if (candidates.size === 0) {
      for (const address of await this.scanSubnet()) {
        candidates.set(address, { id: `ip-${address}`, address, viaMac: false });
      }
    }

    const devices = await Promise.all(
      [...candidates.values()].map(async (c) => {
        const base = {
          data: { id: c.id },
          settings: { host: c.address, port: DEFAULT_PORT, debug: false },
        };
        if (paired.has(c.address)) {
          // Allerede i bruk av en enhet – kan ikke probes, men vis den (Homey markerer den som lagt til)
          return { ...base, name: 'Ventilasjon' };
        }
        try {
          await this.probe(c.address);
          return { ...base, name: 'Ventilasjon' };
        } catch (err) {
          this.log(`${c.address}: ingen ventilasjonsdata (${err.message})`);
          // Funnet via MAC men svarte ikke – vis den likevel, adapteren kan være opptatt
          return c.viaMac ? { ...base, name: `Ventilasjon (${c.address}, ikke bekreftet)` } : null;
        }
      }),
    );
    return devices.filter(Boolean);
  }

  async onPair(session) {
    const manual = [];

    session.setHandler('list_devices', async () => {
      const devices = [...(await this.discoverDevices()), ...manual];
      if (devices.length === 0) {
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
