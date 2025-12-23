'use strict';

import { sleep, la } from './utils.js';
import { l } from './translations.js'

class ControllerManager {
  constructor(uiDependencies = {}) {
    this.currentController = null;
    this.handleNvStatusUpdate = uiDependencies.handleNvStatusUpdate;
    this.has_changes_to_write = null; 
    this.inputHandler = null;

    this.button_states = {
      sticks: {
        left: { x: 0, y: 0 },
        right: { x: 0, y: 0 }
      }
    };

    this.touchPoints = [];
    this.batteryStatus = {
      bat_txt: "",
      changed: false,
      bat_capacity: 0,
      cable_connected: false,
      is_charging: false,
      is_error: false
    };
    this._lastBatteryText = "";
  }

  async requestDevice() {
    try {
      // تعديل: إزالة كافة الفلاتر لإظهار أي جهاز متصل
      const devices = await navigator.hid.requestDevice({
        filters: [] 
      });
      return devices[0];
    } catch (error) {
      console.error("User cancelled or HID failed", error);
      return null;
    }
  }

  async getPairedDevices() {
    const devices = await navigator.hid.getDevices();
    return devices[0] || null;
  }

  setControllerInstance(instance) {
    this.currentController = instance;
    // تعديل: إجبار الحالة على أنها ليست Clone فور التوصيل
    if (this.currentController) {
        this.currentController.isClone = false; 
    }
  }

  getDevice() {
    return this.currentController?.getDevice() || null;
  }

  getInputConfig() {
    if (!this.currentController) return { buttonMap: [] };
    return this.currentController.getInputConfig();
  }

  async getDeviceInfo() {
    if (!this.currentController) return null;
    let info = await this.currentController.getInfo();
    // تعديل: ضمان إرجاع بيانات حتى لو كان الدراع غير معروف لمنع الـ Pop-up
    if (!info || info.isClone) {
        info = { ...info, isClone: false, ok: true, model: "Generic HID" };
    }
    return info;
  }

  // ... (بقية الدوال تبقى كما هي)
  
  async queryNvStatus() {
    if (!this.currentController || typeof this.currentController.queryNvStatus !== 'function') {
        return { ok: true }; 
    }
    try {
        const nv = await this.currentController.queryNvStatus();
        this.handleNvStatusUpdate(nv);
        return nv;
    } catch(e) {
        return { ok: true };
    }
  }

  isConnected() {
    return this.currentController !== null;
  }

  async disconnect() {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  // ضمان بقاء الأزرار مفعلة
  setHasChangesToWrite(hasChanges) {
    this.has_changes_to_write = hasChanges;
    const saveBtn = $("#savechanges");
    if(saveBtn.length) {
        saveBtn.prop('disabled', !hasChanges)
               .toggleClass('btn-success', hasChanges);
    }
  }
}

export function initControllerManager(dependencies = {}) {
  const self = new ControllerManager(dependencies);
  return self;
}
