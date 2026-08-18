import fs from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import {
  WasteDriver,
} from "../src/modules/waste/domain/WasteDriver.js";

test(
  "FR2 stores the municipal driver code",
  () => {
    const driver =
      new WasteDriver({
        id: "driver-1",
        driverCode: "DRV-001",
        fullName: "พนักงานทดสอบ",
        phone: "0812345678",
        lineUserId: null,
        isActive: true,
      });

    assert.equal(
      driver.toObject().driverCode,
      "DRV-001",
    );
  },
);

test(
  "FR2 LINE verifies driver code before phone and distinguishes identity states",
  async () => {
    const source =
      await fs.readFile(
        new URL(
          "../src/modules/line/wasteLine.js",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /session\.currentStep === "DRIVER_CODE"/,
    );

    assert.match(
      source,
      /WHERE driver_code = \?/,
    );

    assert.match(
      source,
      /classifyDriverCodeCheckpoint/,
    );

    assert.match(
      source,
      /session\.currentStep === "PHONE"/,
    );

    assert.match(
      source,
      /classifyDriverPhoneCheckpoint/,
    );

    assert.match(
      source,
      /PHONE_MISMATCH/,
    );

    assert.match(
      source,
      /Boolean\(Number\(driver\.isActive\)\)/,
    );

    assert.match(
      source,
      /SET line_user_id = \?/,
    );

    const codeStep =
      source.match(
        /session\.currentStep === "DRIVER_CODE"[\s\S]*?session\.currentStep === "PHONE"/,
      )?.[0] || "";

    assert.ok(
      codeStep.indexOf("WHERE driver_code = ?") >= 0,
      "driver code must be looked up during DRIVER_CODE step",
    );

    assert.doesNotMatch(
      codeStep,
      /driver_code = \? AND phone = \?/,
      "DRIVER_CODE step must not wait for phone before validating employee code",
    );

    assert.doesNotMatch(
      source,
      /รหัสเชื่อมบัญชี 6 หลัก/,
    );

    assert.doesNotMatch(
      source,
      /ยืนยันพนักงานประจำรถขยะ\\s*\\d/,
    );

    assert.doesNotMatch(
      source,
      /กรุณาใช้รหัสจากเจ้าหน้าที่เทศบาล/,
    );
  },
);
test(
  "FR2 repository persists driver code",
  async () => {
    const source =
      await fs.readFile(
        new URL(
          "../src/modules/waste/infrastructure/MariaDbWasteDriverRepository.js",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /driver_code AS driverCode/,
    );

    assert.match(
      source,
      /driver\.driverCode/,
    );

    assert.match(
      source,
      /VALUES \(\?, \?, \?, \?, \?, \?\)/,
    );
  },
);

test(
  "FR2 migration creates unique driver codes",
  async () => {
    const migration =
      await fs.readFile(
        new URL(
          "../../../database/migrations/025_waste_driver_identity_fr2.sql",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      migration,
      /driver_code/,
    );

    assert.match(
      migration,
      /uk_waste_driver_code/,
    );
  },
);

test(
  "FR2 staff UI collects driver code and removes the old six-digit workflow",
  async () => {
    const source =
      await fs.readFile(
        new URL(
          "../../waste-management/src/pages/ResourcesPage.jsx",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /name="driverCode"/,
    );

    assert.match(
      source,
      /driverCode: value\.driverCode/,
    );

    assert.doesNotMatch(
      source,
      /สร้างรหัส LINE/,
    );

    assert.doesNotMatch(
      source,
      /line-link-code/,
    );

    assert.doesNotMatch(
      source,
      /linkCode/,
    );
  },
);

test(
  "FR2 fully retires the legacy six-digit backend",
  async () => {
    const files = [
      "../src/modules/line/wasteLine.js",
      "../src/modules/waste/waste.router.js",
      "../src/composition-root/createWasteManagementServices.js",
      "../src/contracts/openapi.js",
      "../../../database/migrations/016_waste_line_workflows.sql",
    ];

    const sources =
      await Promise.all(
        files.map(
          (path) =>
            fs.readFile(
              new URL(
                path,
                import.meta.url,
              ),
              "utf8",
            ),
        ),
      );

    const runtime =
      sources.join("\n");

    assert.doesNotMatch(
      runtime,
      /line-link-code/,
    );

    assert.doesNotMatch(
      runtime,
      /WasteDriverLineLinkService/,
    );

    assert.doesNotMatch(
      runtime,
      /MariaDbWasteDriverLinkRepository/,
    );

    assert.doesNotMatch(
      runtime,
      /DriverLinkCodeSecurity/,
    );

    assert.doesNotMatch(
      runtime,
      /waste_driver_link_codes/,
    );

    assert.doesNotMatch(
      runtime,
      /hashCode/,
    );

    const removedFiles = [
      "../src/modules/waste/application/WasteDriverLineLinkService.js",
      "../src/modules/waste/infrastructure/MariaDbWasteDriverLinkRepository.js",
      "../src/modules/waste/infrastructure/DriverLinkCodeSecurity.js",
    ];

    for (
      const removedFile
      of removedFiles
    ) {
      await assert.rejects(
        fs.access(
          new URL(
            removedFile,
            import.meta.url,
          ),
        ),
      );
    }
  },
);
