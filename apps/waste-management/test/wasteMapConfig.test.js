import assert from "node:assert/strict";
import test from "node:test";

import {
  THA_PHO_SERVICE_BOUNDS,
  isInsideThaPhoServiceBounds,
  routeMapColor,
  thaPhoLeafletBounds,
} from "../src/lib/wasteMapConfig.js";

test(
  "waste map uses Tha Pho municipal service bounds",
  () => {
    assert.deepEqual(
      THA_PHO_SERVICE_BOUNDS,
      {
        south: 16.70,
        north: 16.805,
        west: 100.15,
        east: 100.27,
      },
    );

    assert.deepEqual(
      thaPhoLeafletBounds(),
      [
        [16.70, 100.15],
        [16.805, 100.27],
      ],
    );

    assert.equal(
      isInsideThaPhoServiceBounds(
        16.7744,
        100.2254,
      ),
      true,
    );

    assert.equal(
      isInsideThaPhoServiceBounds(
        16.90,
        100.2254,
      ),
      false,
    );

    assert.equal(
      isInsideThaPhoServiceBounds(
        16.7744,
        100.40,
      ),
      false,
    );
  },
);

test(
  "each waste route receives a distinct map color",
  () => {
    const colors =
      Array.from(
        { length: 32 },
        (_, index) =>
          routeMapColor(index),
      );

    assert.equal(
      new Set(colors).size,
      colors.length,
    );

    const officialRouteColors = [
      "THP-OFFICIAL-01",
      "THP-OFFICIAL-02",
      "THP-OFFICIAL-03",
      "THP-OFFICIAL-04",
      "THP-OFFICIAL-05",
      "THP-OFFICIAL-06",
    ].map(routeMapColor);

    assert.equal(
      new Set(officialRouteColors).size,
      officialRouteColors.length,
    );

    assert.equal(
      routeMapColor("THP-OFFICIAL-01"),
      routeMapColor("THP-OFFICIAL-01"),
      "the route keeps its color after sorting or filtering",
    );
  },
);
