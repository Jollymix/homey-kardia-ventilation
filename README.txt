Take back control of a ventilation unit that used to be run by a Kardia Hub smart-home system.

Many Norwegian homes had their ventilation unit connected to a Kardia Hub (Raspberry Pi) through an RS-485-to-Ethernet adapter such as the USR-TCP232-304. When the hub stops working, the ventilation can no longer be controlled. This app talks directly to that adapter on your local network, so Homey can take over. No cloud, no Kardia account and no adapter password are needed.

Features:
- Set mode: Away, Home or Boost
- Set the temperature setpoint
- Indoor, outdoor, supply and exhaust temperature
- Indoor and outdoor humidity, CO2, PM2.5 and PM10 (when the unit has these sensors)
- Flow cards for mode and setpoint, plus a trigger when the mode changes

Setup: add a new device, enter the IP address of the adapter and port 8234 (Kardia's default). Turn off the old Kardia Raspberry Pi first – the adapter usually accepts only one connection at a time.

This is an unofficial community app and is not affiliated with Kardia. Source code and protocol documentation: https://github.com/Jollymix/homey-kardia-ventilation
