#!/usr/bin/env node
'use strict';
/**
 * Lytt på ventilasjonsadapteren fra PC-en (krever bare Node.js, ingen Homey).
 *
 *   node tools/sniff.js <IP> [port]            vis dekodede verdier
 *   node tools/sniff.js <IP> [port] --diff     vis hvilke byte i innstillingsrammen som endrer seg
 *   node tools/sniff.js <IP> [port] --raw      vis alle rammer som hex
 *
 * --diff er nyttig for å kartlegge nye parametere: endre noe på panelet til
 * aggregatet og se hvilken byte som endrer seg.
 */
const KardiaClient = require('../lib/KardiaClient');
const P = require('../lib/KardiaProtocol');

const [host, portArg, ...flags] = process.argv.slice(2);
if (!host) {
  console.error('Bruk: node tools/sniff.js <IP> [port] [--diff|--raw]');
  process.exit(1);
}
const port = portArg && !portArg.startsWith('--') ? Number(portArg) : 8234;
const allFlags = [portArg, ...flags];
const DIFF = allFlags.includes('--diff');
const RAW = allFlags.includes('--raw');

const c = new KardiaClient({ host, port, log: (m) => console.log(`[klient] ${m}`) });
let prev = { [P.TYPE.SETTINGS]: null, [P.TYPE.STATS]: null };
let lastPrint = 0;

c.on('frame', (type, buf) => {
  const name = type === P.TYPE.SETTINGS ? 'INNST' : type === P.TYPE.STATS ? 'MÅL  ' : `0x${type.toString(16)}`;
  if (RAW) console.log(`${name} ${buf.toString('hex')}`);
  if (DIFF && prev[type]) {
    const changes = [];
    for (let i = 1; i < 52; i++) if (buf[i] !== prev[type][i]) changes.push(`[${i}] ${prev[type][i]} -> ${buf[i]}`);
    if (changes.length) console.log(`${name} endret: ${changes.join(', ')}`);
  }
  if (type in prev) prev[type] = buf;
});

c.on('stats', (s) => {
  if (RAW || DIFF || Date.now() - lastPrint < 5000) return;
  lastPrint = Date.now();
  console.log(new Date().toLocaleTimeString(), JSON.stringify(s));
});

c.on('settings', (s) => {
  if (!RAW && !DIFF && Date.now() - lastPrint > 4000) console.log('innstillinger:', JSON.stringify(s));
});

c.on('error', () => {});
c.connect();
