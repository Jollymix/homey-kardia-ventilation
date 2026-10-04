'use strict';

const Homey = require('homey');
const KardiaClient = require('../../lib/KardiaClient');

class VentilationDriver extends Homey.Driver {
  async onInit() {
    this.modeChanged = this.homey.flow.getDeviceTriggerCard('ventilation_mode_changed');
  }

  async onPair(session) {
    let found = null;

    session.setHandler('test_connection', async ({ host, port }) => {
      host = String(host || '').trim();
      port = Number(port) || 8234;
      if (!host) throw new Error('Skriv inn IP-adressen til adapteren');

      const client = new KardiaClient({ host, port, log: (...a) => this.log(...a) });
      client.on('error', () => {}); // feil håndteres via timeout
      try {
        client.connect();
        const settings = await client.waitForSettings(15000);
        found = { host, port };
        return settings; // vises i paringsvinduet
      } finally {
        client.close();
      }
    });

    session.setHandler('list_devices', async () => {
      if (!found) return [];
      return [
        {
          name: 'Ventilasjon',
          data: { id: `kardia-ventilation-${found.host}` },
          settings: { host: found.host, port: found.port, debug: false },
        },
      ];
    });
  }
}

module.exports = VentilationDriver;
