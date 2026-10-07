'use strict';

const Homey = require('homey');

class KardiaVentilationApp extends Homey.App {
  async onInit() {
    const setMode = this.homey.flow.getActionCard('set_ventilation_mode');
    setMode.registerRunListener(async ({ device, mode }) => {
      await device.triggerCapabilityListener('ventilation_mode', mode);
    });

    const modeIs = this.homey.flow.getConditionCard('ventilation_mode_is');
    modeIs.registerRunListener(async ({ device, mode }) => device.getCapabilityValue('ventilation_mode') === mode);

    this.log('Kardia-ventilasjon startet');
  }
}

module.exports = KardiaVentilationApp;
