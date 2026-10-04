Få tilbake kontrollen over et ventilasjonsaggregat som tidligere ble styrt av Kardia Hub.

Mange boliger fikk ventilasjonsaggregatet koblet til en Kardia Hub (Raspberry Pi) via en RS-485-til-Ethernet-adapter, for eksempel USR-TCP232-304. Når huben slutter å virke, kan ventilasjonen ikke lenger styres. Denne appen snakker direkte med adapteren på det lokale nettverket, slik at Homey kan ta over. Ingen sky, ingen Kardia-konto og ikke noe adapterpassord.

Funksjoner:
- Sett modus: Borte, Hjemme eller Boost
- Sett temperatur-settpunkt
- Temperatur inne, ute, tilluft og avtrekk
- Fukt inne og ute, CO2, PM2.5 og PM10 (hvis aggregatet har disse sensorene)
- Flowkort for modus og settpunkt, og en trigger når modus endres

Oppsett: legg til en ny enhet, skriv inn IP-adressen til adapteren og port 8234 (Kardias standard). Slå av den gamle Kardia-Pi-en først – adapteren tar vanligvis bare imot én tilkobling om gangen.

Dette er en uoffisiell app og er ikke tilknyttet Kardia. Kildekode og protokollbeskrivelse: https://github.com/Jollymix/homey-kardia-ventilation
