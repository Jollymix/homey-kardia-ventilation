# Kardia-ventilasjon for Homey Pro

*[English](README.md)*

Lokal Homey-app (SDK 3) som styrer ventilasjonsaggregatet direkte via seriell-til-Ethernet-adapteren som Kardia Hub brukte. Ingen sky, ingen passord.

## Protokoll (rå TCP, port 8234)
53-byte rammer. Byte 0 = type, byte 52 = sjekksum `(0xAA + sum(byte 0..51)) & 0xFF`.

| Type | Betydning |
|---|---|
| `0xD2` | Innstillinger (sendes kontinuerlig av aggregatet) |
| `0xDD` | Målinger (sendes kontinuerlig) |
| `0xCD` | Kommando: kopi av siste `0xD2` med byte 0 = `0xCD`, endret parameter, ny sjekksum. Sendes 2× |
| `0xFF` | 9-byte ramme, ukjent innhold, ignoreres |

**Innstillinger (`0xD2`):** byte 16 = temperatur-settpunkt (°C, heltall), byte 28 = modus (0 borte, 1 hjemme, 2 boost).

**Målinger (`0xDD`):** 6 sesong · 7 ute-temp · 10 tilluft · 11 avtrekk · 13 inne-temp · 16 varme · 17 fukt inne · 26 fukt ute · 19:20 CO₂ · 21:22 PM2.5 inne · 24:25 PM2.5 ute · 38:39 PM10 inne · 40:41 PM10 ute (16-bit verdier er big-endian).

Temperaturer tolkes som signert byte (Kardia gjorde ikke det, så kuldegrader ble filtrert bort der). Dette er en antagelse – bekreft når det er kuldegrader ute.

## 1. Finn adapteren
- Se etter en ukjent enhet i DHCP-listen på ruteren, eller
- `nmap -p 8234 --open 192.168.1.0/24` (bytt til ditt subnett)

Adapteren tillater ofte bare én TCP-klient om gangen – ikke kjør sniff.js og Homey-appen samtidig.

## 2. Test fra PC-en (Node.js 18+)
```
cd homey-kardia-ventilation
npm test                                  # selvtest mot simulert aggregat
node tools/sniff.js 192.168.1.50          # dekodede verdier hvert 5. sekund
node tools/sniff.js 192.168.1.50 --diff   # vis hvilke byte som endrer seg
node tools/sniff.js 192.168.1.50 --raw    # alle rammer i hex
```

## 3. Installer på Homey Pro
```
npm i -g homey
homey login
homey app install          # (eller `homey app run` for live-logg)
```
Legg til enhet: *Kardia-ventilasjon → Ventilasjonsaggregat*, skriv inn IP og port 8234. Appen tester forbindelsen og venter på data før enheten legges til.

## Hva du får i Homey
- Modus (borte/hjemme/boost) og temperatur-settpunkt – kan styres
- Temperatur inne/ute/tilluft/avtrekk, fukt inne/ute, CO₂, PM2.5 og PM10 inne/ute
- Flows: *Sett ventilasjonsmodus*, *Sett temperatur-settpunkt*, *Ventilasjonsmodus er …*, *Ventilasjonsmodus endret*
- Innstilling «Logg rå rammer» for feilsøking (`homey app run` viser loggen)

Sensorer som aggregatet ditt ikke har (f.eks. PM) vil bare stå tomme.
