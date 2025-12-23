'use strict';

import { sleep, float_to_str, dec2hex, dec2hex32, lerp_color, initAnalyticsApi, la, createCookie, readCookie } from './utils.js';
import { initControllerManager } from './controller-manager.js';
import ControllerFactory from './controllers/controller-factory.js';
import { lang_init, l } from './translations.js';
import { loadAllTemplates } from './template-loader.js';
import { draw_stick_position, CIRCULARITY_DATA_SIZE } from './stick-renderer.js';
import { ds5_finetune, isFinetuneVisible, finetune_handle_controller_input } from './modals/finetune-modal.js';
import { calibrate_stick_centers, auto_calibrate_stick_centers } from './modals/calib-center-modal.js';
import { calibrate_range } from './modals/calib-range-modal.js';
import { 
  show_quick_test_modal,
  isQuickTestVisible,
  quicktest_handle_controller_input
} from './modals/quick-test-modal.js';

// Application State
const app = {
  disable_btn: 0,
  last_disable_btn: 0,
  shownRangeCalibrationWarning: false,
  lang_orig_text: {},
  lang_cur: {},
  lang_disabled: true,
  lang_cur_direction: "ltr",
  gj: 0,
  gu: 0
};

const ll_data = new Array(CIRCULARITY_DATA_SIZE);
const rr_data = new Array(CIRCULARITY_DATA_SIZE);
let controller = null;

function gboot() {
  app.gu = crypto.randomUUID();

  async function initializeApp() {
    $("#btnconnect").hide();

    window.addEventListener("error", (event) => {
      console.error(event.error?.stack || event.message);
      show_popup(event.error?.message || event.message);
    });

    window.addEventListener("unhandledrejection", async (event) => {
      console.error("Unhandled rejection:", event.reason?.stack || event.reason);
      close_all_modals();
      let errorMessage = "An unexpected error occurred";
      if (event.reason) {
        if (event.reason.message) errorMessage = `<strong>Error:</strong> ${event.reason.message}`;
        let allStackTraces = event.reason.stack ? event.reason.stack.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;') : '';
        if (allStackTraces) {
          errorMessage += `<br><details><summary>Details</summary>${allStackTraces}</details>`;
        }
      }
      errorAlert(errorMessage);
      event.preventDefault();
    });

    await loadAllTemplates();
    AnalyticsApi(app);
    lang_init(app, handleLanguageChange, show_welcome_modal);
    show_welcome_modal();

    $("input[name='displayMode']").on('change', on_stick_mode_change);

    // Auto Connect Logic - Enhanced to support non-Sony devices
    if ("hid" in navigator) {
        try {
            const devices = await navigator.hid.getDevices();
            if (devices.length > 0) {
                console.log("Auto-connecting...");
                await connect(); 
            } else {
                $("#btnconnect").show();
            }
        } catch (e) {
            $("#btnconnect").show();
        }
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  if (!("hid" in navigator)) {
    $("#offlinebar").hide();
    $("#missinghid").show();
    return;
  }

  $("#offlinebar").show();
  navigator.hid.addEventListener("disconnect", handleDisconnectedDevice);
}

async function connect() {
  app.gj = crypto.randomUUID();
  initAnalyticsApi(app);

  controller = initControllerManager({ handleNvStatusUpdate });
  controller.setInputHandler(handleControllerInput);

  reset_circularity_mode();
  clearAllAlerts();

  try {
    $("#btnconnect").prop("disabled", true);
    $("#connectspinner").show();

    // MODIFICATION: No filters to allow all HID gamepads
    const requestParams = { filters: [] }; 
    let devices = await navigator.hid.getDevices();
    
    if (devices.length == 0) {
      devices = await navigator.hid.requestDevice(requestParams);
    }
    
    if (devices.length == 0) {
      $("#btnconnect").prop("disabled", false);
      $("#connectspinner").hide();
      return;
    }

    const [device] = devices;
    if(device.opened) await device.close();
    await device.open();

    la("connect", {"p": device.productId, "v": device.vendorId});
    device.oninputreport = continue_connection;
  } catch(error) {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
    throw error;
  }
}

async function continue_connection({data, device}) {
  try {
    // 1. منع تكرار الاتصال
    if (!controller || controller.isConnected()) {
      device.oninputreport = null;
      return;
    }

    // 2. إجبار الواجهة على الظهور وتفعيل كل الأزرار فوراً
    function forceEnableUI() {
      $("#infoshowall").show();
      $("#ds5finetune").show();
      $("#info-tab").show();
      $("#four-step-center-calib").show();
      $("#quick-center-calib").show();
      $("#quick-tests-div").css("visibility", "visible");
      $(".ds-btn").prop("disabled", false); // تفعيل أزرار المعايرة إجبارياً
    }

    let controllerInstance = null;
    let info = { ok: true, isClone: false, infoItems: [] };

    try {
      // محاولة إنشاء Instance، وإذا فشل نستخدم ملف تعريفي افتراضي (Generic)
      controllerInstance = ControllerFactory.createControllerInstance(device);
      controller.setControllerInstance(controllerInstance);
    } catch (e) {
      console.warn("Using Generic Profile for unknown device");
    }

    // 3. تخطي رسالة "The device appears to be a clone" نهائياً
    device.oninputreport = controller.getInputHandler();

    // 4. تحديث النصوص في الواجهة
    const deviceName = device.productName || "Generic Controller";
    $("#devname").text(deviceName + " (Connected)");

    $("#offlinebar").hide();
    $("#onlinebar").show();
    $("#mainmenu").show();
    $('#controller-tab').tab('show');

    // استخدام موديل افتراضي للرسم (SVG) لتجنب اختفاء صورة الدراع
    await init_svg_controller("DS4"); 

    forceEnableUI();
    app.disable_btn = 0; // تصفير عداد التعطيل

  } catch(err) {
    console.error("Connection error:", err);
    await disconnect();
  } finally {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
  }
}}

    // Bluetooth check disabled to allow more flexibility with non-original clones
    // if(data.byteLength != 63) { ... }

    function applyDeviceUI(config) {
      $("#infoshowall").toggle(true); // Always show info for generic devices
      $("#ds5finetune").toggle(!!config.showFinetune);
      $("#info-tab").toggle(true);
      $("#four-step-center-calib").toggle(true);
      $("#quick-tests-div").css("visibility", "visible");
      $("#quick-center-calib").toggle(true);
    }

    let controllerInstance = null;
    let info = null;

    try {
      controllerInstance = ControllerFactory.createControllerInstance(device);
      controller.setControllerInstance(controllerInstance);
      info = await controllerInstance.getInfo();
    } catch (error) {
       console.warn("Using Generic Profile for unknown device");
    }

    // Force info object to be valid even for clones
    if(!info) info = { ok: true, infoItems: [] };
    info.ok = true; 

    const ui = ControllerFactory.getUIConfig(device.productId) || { showQuickTests: true };
    applyDeviceUI(ui);

    device.oninputreport = controller.getInputHandler();

    const deviceName = device.productName || "Generic Controller";
    $("#devname").text(deviceName + " (" + dec2hex(device.vendorId) + ":" + dec2hex(device.productId) + ")");

    $("#offlinebar").hide();
    $("#onlinebar").show();
    $("#mainmenu").show();
    $("#resetBtn").show();
    $('#controller-tab').tab('show');

    const model = controllerInstance ? controllerInstance.getModel() : "Generic";
    await init_svg_controller(model === "Unknown" ? "DS4" : model);

    render_info_to_dom(info.infoItems || []);
    
    // Bypass Clone check and force update buttons
    app.disable_btn = 0; 
    update_disable_btn();

  } catch(err) {
    console.error("Connection error:", err);
    await disconnect();
  } finally {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
  }
}

async function disconnect() {
  if(!controller?.isConnected()) return;
  await controller.disconnect();
  controller = null;
  $("#offlinebar").show();
  $("#onlinebar").hide();
  $("#mainmenu").hide();
  $("#btnconnect").show();
}

function update_disable_btn() {
  // MODIFICATION: Always keep buttons enabled
  $(".ds-btn").prop("disabled", false);
  console.log("Buttons unlocked for all devices.");
}

// ... (باقي الدوال مثل refresh_stick_pos و render_info_to_dom تبقى كما هي بدون تغيير جوهري) ...

window.gboot = gboot;
gboot();
