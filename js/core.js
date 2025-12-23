// ابحث عن دالة continue_connection واستبدلها بهذا الجزء:

async function continue_connection({data, device}) {
  try {
    if (!controller || controller.isConnected()) {
      device.oninputreport = null;
      return;
    }

    // إعداد واجهة المستخدم لتكون مفعلة دائماً
    function applyDeviceUI() {
      $("#infoshowall").show();
      $("#ds5finetune").show();
      $("#info-tab").show();
      $("#four-step-center-calib").show();
      $("#quick-center-calib").show();
      $("#quick-tests-div").css("visibility", "visible");
      $(".ds-btn").prop("disabled", false); // تفعيل كل الأزرار
    }

    let controllerInstance = null;
    let info = null;

    try {
      controllerInstance = ControllerFactory.createControllerInstance(device);
      controller.setControllerInstance(controllerInstance);
      // إجبار الكنترولر على تخطي فحص الأمان
      if(controllerInstance) controllerInstance.isClone = false;
      info = await controllerInstance.getInfo();
    } catch (error) {
       console.warn("Using Generic Profile");
    }

    // تعديل: إجبار الـ info على النجاح لتخطي رسالة "The device appears to be a clone"
    if(!info) info = { ok: true, infoItems: [] };
    info.isClone = false;
    info.ok = true;

    applyDeviceUI();

    device.oninputreport = controller.getInputHandler();

    const deviceName = device.productName || "Gamepad";
    $("#devname").text(deviceName + " (Bypassed)");

    $("#offlinebar").hide();
    $("#onlinebar").show();
    $("#mainmenu").show();
    $('#controller-tab').tab('show');

    const model = controllerInstance ? controllerInstance.getModel() : "DS4";
    await init_svg_controller(model === "Unknown" ? "DS4" : model);

    render_info_to_dom(info.infoItems || []);
    
    // إلغاء أي تعطيل للأزرار ناتج عن الـ Clone check
    app.disable_btn = 0;
    $(".ds-btn").prop("disabled", false);

  } catch(err) {
    console.error("Connection error:", err);
    await disconnect();
  } finally {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
  }
}
