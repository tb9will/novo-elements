// APP
import { BaseControl, NovoControlConfig } from './../BaseControl';

export class CustomControl extends BaseControl {
  controlType = 'custom';
  options = [];

  constructor(config: NovoControlConfig) {
    super(config.customControl, config);
    this.controlType = config.customControl;
  }
}
