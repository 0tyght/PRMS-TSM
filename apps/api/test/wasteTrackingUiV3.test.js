import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const trackingPage =
  fs.readFileSync(
    new URL(
      "../../waste-management/src/pages/TrackingPage.jsx",
      import.meta.url,
    ),
    "utf8",
  );

const wasteMap =
  fs.readFileSync(
    new URL(
      "../../waste-management/src/components/WasteMap.jsx",
      import.meta.url,
    ),
    "utf8",
  );

const wasteCss =
  fs.readFileSync(
    new URL(
      "../../waste-management/src/waste.css",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "tracking map auto-fits the selected plan after layout settles",
  () => {
    assert.match(
      trackingPage,
      /focusKey=\{`\$\{selectedId\}:\$\{track\.routeName \|\| ""\}`\}/,
    );

    assert.match(
      wasteMap,
      /invalidateSize\([\s\S]*?fitBounds\(/,
    );

    assert.match(
      wasteMap,
      /setTimeout\([\s\S]*?80/,
    );

    assert.match(
      trackingPage,
      /setTrack\(null\);[\s\S]*?\[selectedId\]/,
    );
  },
);

test(
  "tracking route visually separates planned route from actual GPS trail",
  () => {
    assert.match(
      wasteMap,
      /trackingMode[\s\S]*?#a9cbb8/,
    );

    assert.match(
      wasteMap,
      /waste-route-flow/,
    );

    assert.match(
      wasteMap,
      /waste-route-travelled/,
    );

    assert.match(
      wasteMap,
      /historySegments\.forEach/,
    );

    assert.match(
      wasteCss,
      /@keyframes waste-route-flow/,
    );
  },
);

test(
  "tracking map uses a garbage-truck marker and emphasizes the next stop",
  () => {
    assert.match(
      wasteMap,
      /createGarbageTruckIcon/,
    );

    assert.match(
      wasteMap,
      /waste-truck-marker/,
    );

    assert.match(
      trackingPage,
      /const nextStop = useMemo/,
    );

    assert.match(
      trackingPage,
      /activeStopId=\{nextStop\?\.id \|\| ""\}/,
    );

    assert.match(
      wasteCss,
      /waste-stop-marker\.is-next/,
    );
  },
);

test(
  "tracking UI provides route and vehicle recenter controls without forcing refit on every GPS refresh",
  () => {
    assert.match(
      wasteMap,
      /ดูทั้งเส้นทาง/,
    );

    assert.match(
      wasteMap,
      /ติดตามรถ/,
    );

    assert.match(
      wasteMap,
      /lastAutoFitKeyRef/,
    );

    assert.match(
      wasteMap,
      /focusVehicle/,
    );
  },
);