# Kardia Ventilation for Homey Pro

*[Norsk](README.no.md)*

A local [Homey Pro](https://homey.app) app (SDK 3) for ventilation units that were previously controlled by the **Kardia Hub** smart-home system (a Norwegian Home Assistant–based hub). If you moved into a house where a Kardia Raspberry Pi used to run the ventilation and it no longer works, this app lets Homey take over: no cloud, no Kardia account, no adapter password.

> Not affiliated with or endorsed by Kardia. The protocol was documented for interoperability by reading the configuration and integration code left on an old Kardia Hub SD card, and verified against a live unit.

## How it works

Kardia used an RS-485-to-Ethernet adapter (e.g. **USR-TCP232-304**) wired to the ventilation unit's control bus, configured as a transparent **TCP server on port 8234**. The unit continuously broadcasts state frames on the bus; this app opens a TCP connection to the adapter, decodes the frames and writes commands back.

- Control: mode (Away / Home / Boost) and temperature setpoint
- Sensors: indoor / outdoor / supply / exhaust temperature, indoor and outdoor humidity, CO₂, PM2.5 and PM10 (indoor and outdoor)
- Flow cards: *Set ventilation mode*, *Set temperature setpoint*, *Ventilation mode is …*, *Ventilation mode changed*
- Automatic reconnect, watchdog, optional raw-frame logging

Sensors your unit does not have will simply stay empty.

## Installation

The app is not (yet) in the Homey App Store. Install it with the Homey CLI (Node.js 18+):

```bash
git clone https://github.com/Jollymix/homey-kardia-ventilation.git
cd homey-kardia-ventilation
npm i -g homey
homey login
homey app install
```

Then in Homey: **+ → New device**, scroll the list of *installed* apps (don't search – search only covers the App Store) → **Kardia Ventilation → Ventilation unit**, enter the adapter's IP and port `8234`. Pairing waits for a valid frame before adding the device.

Requires Homey Pro firmware **12.2 or newer**.

### Finding the adapter

- Look for an unknown device (e.g. *USR*, *HF*, *Elfin*) in your router's DHCP list, or
- `nmap -p 8234 --open 192.168.1.0/24`

The adapter's web UI (default login on USR devices is often `admin`/`admin`) is not needed. **Don't factory-reset the adapter** – you would lose the port and serial settings (baud rate etc.) that match your unit.

Most of these adapters accept only one TCP client at a time. Make sure the old Raspberry Pi is switched off.

## Testing without Homey

```bash
npm test                                 # self-test against a simulated unit
node tools/sniff.js 192.168.1.52         # decoded values every 5 s
node tools/sniff.js 192.168.1.52 --diff  # show which bytes change (map new parameters)
node tools/sniff.js 192.168.1.52 --raw   # every frame as hex
```

Quick check from Windows PowerShell, no Node needed:

```powershell
$c = New-Object Net.Sockets.TcpClient('192.168.1.52', 8234)
$s = $c.GetStream(); $s.ReadTimeout = 5000
$b = New-Object byte[] 512; $n = $s.Read($b, 0, 512)
($b[0..($n-1)] | % { $_.ToString('x2') }) -join ' '
$c.Close()
```

You should see `d2`, `dd` and `cc` bytes recurring every 53 bytes.

## Protocol

Raw bytes over TCP. Frames are **53 bytes**:

| Byte | Meaning |
|---|---|
| 0 | Frame type |
| 1–51 | Payload |
| 52 | Checksum: `(0xAA + sum(bytes 0..51)) & 0xFF` |

| Type | Meaning |
|---|---|
| `0xD2` | Settings, broadcast by the unit |
| `0xDD` | Measurements, broadcast by the unit |
| `0xCC` | Same layout as `0xD2`; probably the wall panel on the same bus. Ignored. |
| `0xCD` | Command: copy of the latest `0xD2` with byte 0 = `0xCD`, the changed parameter, new checksum. Sent twice. |
| `0xFF` | 9-byte frame, unknown content, ignored |

**Settings (`0xD2`)**

| Byte | Meaning |
|---|---|
| 16 | Temperature setpoint, °C (integer) |
| 28 | Mode: `0` away, `1` home, `2` boost |

**Measurements (`0xDD`)** – 16-bit values are big-endian

| Byte | Meaning |
|---|---|
| 6 | Season |
| 7 | Outdoor temperature |
| 10 | Supply air temperature |
| 11 | Exhaust temperature |
| 13 | Indoor (extract) temperature |
| 16 | Heating |
| 17 | Indoor humidity % |
| 26 | Outdoor humidity % |
| 19–20 | CO₂ ppm |
| 21–22 / 24–25 | PM2.5 indoor / outdoor µg/m³ |
| 38–39 / 40–41 | PM10 indoor / outdoor µg/m³ |

Temperatures are read as signed bytes (assumption – not yet verified below 0 °C). `0x7F` appears to mean "no sensor".

Which ventilation brand/model speaks this protocol is not confirmed. If you have one, please open an issue with the make and model, so others can find this.

## Contributing

Issues and PRs welcome, especially:
- unit make/model confirmations
- more mapped parameters (fan levels, filter alarm, heater) – `node tools/sniff.js <ip> --diff` while changing settings on the panel is the easiest way
- verification of negative outdoor temperatures

## License

[MIT](LICENSE)
