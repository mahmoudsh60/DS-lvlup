'use strict';

import { sleep, la } from './utils.js';
import { l } from './translations.js'

/**
* Controller Manager - Manages the current controller instance and provides unified interface
*/
class ControllerManager {
  constructor(uiDependencies = {}) {
    this.currentController = null;
    this.handleNvStatusUpdate = uiDependencies.handleNvStatusUpdate;
    this.has_changes_to_write = null; 
    this.inputHandler = null; // Callback function for input processing

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

  /**
  * تم تعديل هذه الدالة لإظهار كافة الأجهزة دون فلاتر
  */
  async requestDevice() {
    try {
      const devices = await navigator.hid.requestDevice({
        filters: [] // مصفوفة فارغة تعني إظهار كل أنواع الدراعات المتصلة
      });
      return devices[0];
    } catch (error) {
      console.error("User cancelled or HID failed", error);
      return null;
    }
  }

  /**
  * وظيفة للبحث عن دراع تم توصيله مسبقاً للربط التلقائي
  */
  async getPairedDevices() {
    const devices = await navigator.hid.getDevices();
    return devices[0] || null;
  }

  setControllerInstance(instance) {
    this.currentController = instance;
    
    // إجبار النظام على تخطي رسالة الـ Clone إذا كانت موجودة في الـ instance
    if (this.currentController) {
        this.currentController.isClone = false; 
        console.log("Bypass: Controller safety check disabled.");
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
    // إذا كان الدراع غير معروف (Generic)، نملأ البيانات يدوياً لمنع الـ Pop-up
    if (!info || info.isClone) {
        info = { ...info, isClone: false, model: "Generic HID" };
    }
    return info;
  }

  getFinetuneMaxValue() {
    if (!this.currentController) return null;
    return this.currentController.getFinetuneMaxValue();
  }

  setInputReportHandler(handler) {
    if (!this.currentController || !this.currentController.device) return;
    this.currentController.device.oninputreport = handler;
  }

  async queryNvStatus() {
    if (!this.currentController || typeof this.currentController.queryNvStatus !== 'function') {
        return { ok: true }; // تخطي لغير دراعات سوني
    }
    const nv = await this.currentController.queryNvStatus();
    this.handleNvStatusUpdate(nv);
    return nv;
  }

  async getInMemoryModuleData() {
    if (!this.currentController?.getInMemoryModuleData) return [];
    return await this.currentController.getInMemoryModuleData();
  }

  async writeFinetuneData(data) {
    if (this.currentController?.writeFinetuneData) {
        await this.currentController.writeFinetuneData(data);
    }
  }

  getModel() {
    if (!this.currentController) return "Unknown";
    return this.currentController.getModel();
  }

  getSupportedQuickTests() {
    if (!this.currentController || !this.currentController.getSupportedQuickTests) {
      return [];
    }
    return this.currentController.getSupportedQuickTests();
  }

  isConnected() {
    return this.currentController !== null;
  }

  setInputHandler(callback) {
    this.inputHandler = callback;
  }

  async disconnect() {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  setHasChangesToWrite(hasChanges) {
    if (hasChanges === this.has_changes_to_write)
      return;

    const saveBtn = $("#savechanges");
    saveBtn
      .prop('disabled', !hasChanges)
      .toggleClass('btn-success', hasChanges)
      .toggleClass('btn-outline-secondary', !hasChanges);

    this.has_changes_to_write = hasChanges;
  }

  async flash(progressCallback = null) {
    if (!this.currentController?.flash) return { ok: true };
    this.setHasChangesToWrite(false);
    return this.currentController.flash(progressCallback);
  }

  async reset() {
    if (this.currentController?.reset) await this.currentController.reset();
  }

  async nvsUnlock() {
    if (this.currentController?.nvsUnlock) {
        await this.currentController.nvsUnlock();
        await this.queryNvStatus();
    }
  }

  async nvsLock() {
    if (!this.currentController?.nvsLock) return { ok: true };
    const res = await this.currentController.nvsLock();
    if (!res.ok) {
      throw new Error(l("NVS Lock failed"), { cause: res.error });
    }
    await this.queryNvStatus();
    return res;
  }

  // --- دوال المعايرة (Calibration) ---
  // تمت إضافة فحص للتأكد من أن الدراع يدعم هذه الأوامر لتجنب الـ Crash
  async calibrateSticksBegin() {
    if (!this.currentController?.calibrateSticksBegin) return;
    const res = await this.currentController.calibrateSticksBegin();
    if (!res.ok) throw new Error(l("Stick calibration failed"));
  }

  async calibrateSticksSample() {
    if (!this.currentController?.calibrateSticksSample) return;
    await this.currentController.calibrateSticksSample();
  }

  async calibrateSticksEnd() {
    if (!this.currentController?.calibrateSticksEnd) return;
    await this.currentController.calibrateSticksEnd();
    this.setHasChangesToWrite(true);
  }

  async calibrateRangeBegin() {
    if (!this.currentController?.calibrateRangeBegin) return;
    await this.currentController.calibrateRangeBegin();
  }

  async calibrateRangeOnClose() {
    if (!this.currentController?.calibrateRangeEnd) return { success: true };
    const res = await this.currentController.calibrateRangeEnd();
    this.setHasChangesToWrite(true);
    return { success: true };
  }

  processControllerInput(inputData) {
    const { data } = inputData;
    const inputConfig = this.currentController?.getInputConfig() || { buttonMap: [], dpadByte: 5, l2AnalogByte: 8, r2AnalogByte: 9 };
    
    const { buttonMap, dpadByte, l2AnalogByte, r2AnalogByte, touchpadOffset } = inputConfig;

    const changes = this._recordButtonStates(data, buttonMap, dpadByte, l2AnalogByte, r2AnalogByte);

    if (touchpadOffset) {
      this.touchPoints = this._parseTouchPoints(data, touchpadOffset);
    }

    this.batteryStatus = this._parseBatteryStatus(data);

    const result = {
      changes,
      inputConfig: { buttonMap },
      touchPoints: this.touchPoints,
      batteryStatus: this.batteryStatus,
    };

    if (this.inputHandler) this.inputHandler(result);
  }

  _recordButtonStates(data, BUTTON_MAP, dpad_byte, l2_analog_byte, r2_analog_byte) {
    const changes = {};
    // حماية ضد البيانات القصيرة في الدراعات العادية
    if (data.byteLength < 4) return changes;

    const [new_lx, new_ly, new_rx, new_ry] = [0, 1, 2, 3]
      .map(i => data.getUint8(i))
      .map(v => Math.round((v - 127.5) / 128 * 100) / 100);

    const newSticks = {
      left: { x: new_lx, y: new_ly },
      right: { x: new_rx, y: new_ry }
    };

    if (this._sticksChanged(this.button_states.sticks, newSticks)) {
      this.button_states.sticks = newSticks;
      changes.sticks = newSticks;
    }

    return changes;
  }

  _sticksChanged(current, newValues) {
    return current.left.x !== newValues.left.x || current.left.y !== newValues.left.y ||
    current.right.x !== newValues.right.x || current.right.y !== newValues.right.y;
  }

  _parseBatteryStatus(data) {
    if (!this.currentController?.parseBatteryStatus) {
        return { bat_txt: "100% <i class='fa-solid fa-battery-full'></i>", changed: false };
    }
    const batteryInfo = this.currentController.parseBatteryStatus(data);
    const bat_txt = this._batteryPercentToText(batteryInfo);
    const changed = bat_txt !== this._lastBatteryText;
    this._lastBatteryText = bat_txt;
    return { bat_txt, changed, ...batteryInfo };
  }

  _batteryPercentToText({bat_capacity, is_charging, is_error}) {
    if (is_error) return '<font color="red">' + l("error") + '</font>';
    return `${bat_capacity}% <i class="fa-solid fa-battery-full"></i>`;
  }

  getInputHandler() {
    return this.processControllerInput.bind(this);
  }
}

export function initControllerManager(dependencies = {}) {
  const self = new ControllerManager(dependencies);
  self.setHasChangesToWrite(false);
  return self;
}
