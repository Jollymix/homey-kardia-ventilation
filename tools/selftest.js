#!/usr/bin/env node
'use strict';
/**
 * Selvtest: starter et simulert aggregat (TCP-server) og kjører KardiaClient mot det.
 * Sjekker parsing, resynk ved søppelbyte, dekoding og at kommandoer blir riktige.
 *   node tools/selftest.js
 */
const net = require('net');
const assert = require('assert');
const P = require('../lib/KardiaProtocol');
const KardiaClient = require('../lib/KardiaClient');

function frame(type, fill) {
  const b = Buffer.alloc(P.FRAME_LEN);
  b[0] = type;
  fill(b);
  b[52] = P.checksum(b);
  return b;
}

const settings = frame(P.TYPE.SETTINGS, (b) => {
  b[P.PARAM.TEMP_SETPOINT] = 20;
  b[P.PARAM.PRESET] = 1;
});
const stats = frame(P.TYPE.STATS, (b) => {
  b[7] = 0xfb; // -5 °C
  b[10] = 18;
  b[11] = 22;
  b[13] = 21;
  b[17] = 35;
  b[26] = 80;
  b[19] = 0x02; b[20] = 0x58; // 600 ppm
  b[21] = 0; b[22] = 4;
  b[24] = 0; b[25] = 9;
});

const received = [];
const server = net.createServer((sock) => {
  sock.on('data', (d) => received.push(Buffer.from(d)));
  // søppel + delte rammer for å teste resynk og bufring
  sock.write(Buffer.from([0x00, 0x12, 0xd2, 0x01]));
  sock.write(Buffer.concat([settings.subarray(0, 20)]));
  setTimeout(() => {
    sock.write(Buffer.concat([settings.subarray(20), Buffer.from([0xff, 1, 2, 3, 4, 5, 6, 7, 8]), stats]));
  }, 50);
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const c = new KardiaClient({ host: '127.0.0.1', port });
  const gotStats = new Promise((r) => c.once('stats', r));
  c.connect();
  const s = await c.waitForSettings(3000);
  assert.deepStrictEqual(s, { targetTemperature: 20, preset: 'home', presetRaw: 1 });
  const st = await gotStats;
  assert.strictEqual(st.tempOutdoor, -5);
  assert.strictEqual(st.tempIndoor, 21);
  assert.strictEqual(st.co2, 600);
  assert.strictEqual(st.pm25Outdoor, 9);
  assert.strictEqual(st.humidityOutdoor, 80);

  await c.setPreset('boost');
  await c.setTargetTemperature(22.4);
  await new Promise((r) => setTimeout(r, 100));
  const all = Buffer.concat(received);
  assert.strictEqual(all.length, 4 * P.FRAME_LEN, 'hver kommando skal sendes to ganger');
  const boost = all.subarray(0, 53);
  const temp = all.subarray(106, 159);
  assert.strictEqual(boost[0], 0xcd);
  assert.strictEqual(boost[P.PARAM.PRESET], 2);
  assert.strictEqual(boost[52], P.checksum(boost));
  assert.strictEqual(temp[P.PARAM.TEMP_SETPOINT], 22);
  assert.strictEqual(temp[52], P.checksum(temp));

  c.close();
  server.close();
  console.log('Selvtest OK');
});
