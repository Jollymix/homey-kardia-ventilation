'use strict';

/**
 * Proprietær seriell protokoll for ventilasjonsaggregatet, slik den var
 * implementert i Kardia Hub (kardiahub/components/ventilation).
 *
 * Rammer er 53 byte:
 *   byte 0      rammetype  0xD2 = innstillinger, 0xDD = målinger,
 *                          0xCD = kommando (skriving), 0xCC = ukjent
 *   byte 1..51  data
 *   byte 52     sjekksum   (0xAA + sum(byte 0..51)) & 0xFF
 *
 * I tillegg finnes 9-byte rammer som starter med 0xFF (innhold ukjent, ignoreres).
 */

const FRAME_LEN = 53;
const SHORT_FRAME_LEN = 9;

const TYPE = Object.freeze({
  SETTINGS: 0xd2,
  STATS: 0xdd,
  COMMAND: 0xcd,
  UNKNOWN_CC: 0xcc,
  SHORT: 0xff,
});

const LONG_TYPES = new Set([TYPE.SETTINGS, TYPE.STATS, TYPE.COMMAND, TYPE.UNKNOWN_CC]);

/** Parameter-indekser i innstillingsrammen (0xD2) */
const PARAM = Object.freeze({
  TEMP_SETPOINT: 16,
  PRESET: 28,
});

const PRESET = Object.freeze({
  away: 0,
  home: 1,
  boost: 2,
});
const PRESET_BY_VALUE = Object.freeze({ 0: 'away', 1: 'home', 2: 'boost' });

/** Indekser i målerammen (0xDD) */
const STATS = Object.freeze({
  SEASON: 6,
  TEMP_OUTDOOR: 7,
  TEMP_SUPPLY: 10,
  TEMP_EXHAUST: 11,
  TEMP_INDOOR: 13,
  HEATING: 16,
  HUMIDITY_INDOOR: 17,
  CO2: 19, // 16 bit, 19:20
  PM25_INDOOR: 21, // 16 bit, 21:22
  PM25_OUTDOOR: 24, // 16 bit, 24:25
  HUMIDITY_OUTDOOR: 26,
  PM10_INDOOR: 38, // 16 bit, 38:39
  PM10_OUTDOOR: 40, // 16 bit, 40:41
});

function checksum(buf) {
  let sum = 0xaa;
  for (let i = 0; i < FRAME_LEN - 1; i++) sum += buf[i];
  return sum & 0xff;
}

/** Temperaturer sendes som én byte. Tolkes som signert slik at kuldegrader blir riktige. */
function s8(b) {
  return b > 127 ? b - 256 : b;
}

function u16(buf, i) {
  return (buf[i] << 8) | buf[i + 1];
}

function inRange(v, min, max) {
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
}

function decodeStats(buf) {
  return {
    season: buf[STATS.SEASON],
    tempOutdoor: inRange(s8(buf[STATS.TEMP_OUTDOOR]), -50, 50),
    tempSupply: inRange(s8(buf[STATS.TEMP_SUPPLY]), -50, 60),
    tempExhaust: inRange(s8(buf[STATS.TEMP_EXHAUST]), -50, 60),
    tempIndoor: inRange(s8(buf[STATS.TEMP_INDOOR]), -50, 50),
    heating: buf[STATS.HEATING],
    humidityIndoor: inRange(buf[STATS.HUMIDITY_INDOOR], 0, 100),
    humidityOutdoor: inRange(buf[STATS.HUMIDITY_OUTDOOR], 0, 100),
    co2: inRange(u16(buf, STATS.CO2), 100, 10000),
    pm25Indoor: inRange(u16(buf, STATS.PM25_INDOOR), 0, 250),
    pm25Outdoor: inRange(u16(buf, STATS.PM25_OUTDOOR), 0, 250),
    pm10Indoor: inRange(u16(buf, STATS.PM10_INDOOR), 0, 250),
    pm10Outdoor: inRange(u16(buf, STATS.PM10_OUTDOOR), 0, 250),
  };
}

function decodeSettings(buf) {
  return {
    targetTemperature: buf[PARAM.TEMP_SETPOINT],
    preset: PRESET_BY_VALUE[buf[PARAM.PRESET]] ?? null,
    presetRaw: buf[PARAM.PRESET],
  };
}

/** Lager en kommandoramme basert på siste innstillingsramme. */
function buildCommand(lastSettings, index, value) {
  if (!lastSettings || lastSettings.length !== FRAME_LEN) {
    throw new Error('Har ikke mottatt innstillinger fra aggregatet ennå');
  }
  if (index < 1 || index > 51) throw new Error(`Ugyldig parameterindeks ${index}`);
  const cmd = Buffer.from(lastSettings);
  cmd[0] = TYPE.COMMAND;
  cmd[index] = value & 0xff;
  cmd[FRAME_LEN - 1] = checksum(cmd);
  return cmd;
}

/**
 * Strømparser: tar imot vilkårlige TCP-biter og leverer hele, gyldige rammer.
 * Resynkroniserer byte for byte hvis sjekksummen ikke stemmer.
 */
class FrameParser {
  constructor(onFrame, onBadByte) {
    this.buf = Buffer.alloc(0);
    this.onFrame = onFrame;
    this.onBadByte = onBadByte || (() => {});
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    let i = 0;
    while (i < this.buf.length) {
      const b = this.buf[i];
      if (LONG_TYPES.has(b)) {
        if (this.buf.length - i < FRAME_LEN) break; // vent på mer data
        const frame = this.buf.subarray(i, i + FRAME_LEN);
        if (checksum(frame) === frame[FRAME_LEN - 1]) {
          this.onFrame(b, Buffer.from(frame));
          i += FRAME_LEN;
        } else {
          this.onBadByte(b);
          i += 1;
        }
      } else if (b === TYPE.SHORT) {
        if (this.buf.length - i < SHORT_FRAME_LEN) break;
        i += SHORT_FRAME_LEN;
      } else {
        this.onBadByte(b);
        i += 1;
      }
    }
    this.buf = this.buf.subarray(i);
    // Beskytt mot ubegrenset vekst ved søppeldata
    if (this.buf.length > 4 * FRAME_LEN) this.buf = this.buf.subarray(this.buf.length - FRAME_LEN);
  }
}

module.exports = {
  FRAME_LEN,
  TYPE,
  PARAM,
  PRESET,
  PRESET_BY_VALUE,
  STATS,
  checksum,
  decodeStats,
  decodeSettings,
  buildCommand,
  FrameParser,
};
