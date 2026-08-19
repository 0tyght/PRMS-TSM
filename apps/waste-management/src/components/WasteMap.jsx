import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useLeafletResize from "../lib/useLeafletResize.js";
import {
  THA_PHO_CENTER,
  routeMapColor,
  thaPhoLeafletBounds,
} from "../lib/wasteMapConfig.js";

function enforceThaPhoViewport(map) {
  if (!map) return;

  const bounds =
    L.latLngBounds(
      thaPhoLeafletBounds(),
    );

  map.setMaxBounds(bounds);

  const minimumZoom =
    map.getBoundsZoom(
      bounds,
      true,
      [20, 20],
    );

  if (Number.isFinite(minimumZoom)) {
    map.setMinZoom(minimumZoom);

    if (map.getZoom() < minimumZoom) {
      map.setZoom(
        minimumZoom,
        { animate: false },
      );
    }
  }

  map.panInsideBounds(
    bounds,
    { animate: false },
  );
}

function addLayerBounds(
  points,
  leafletLayer,
) {
  const bounds =
    leafletLayer.getBounds();

  if (bounds.isValid()) {
    points.push(
      bounds.getSouthWest(),
      bounds.getNorthEast(),
    );
  }
}

function isFiniteCoordinate(
  latitude,
  longitude,
) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stopMarkerState(
  stop,
  activeStopId,
) {
  if (
    String(stop?.id || "") ===
    String(activeStopId || "")
  ) {
    return "next";
  }

  const status =
    String(
      stop?.confirmationStatus ||
      "",
    ).toUpperCase();

  if (status === "COLLECTED") {
    return "completed";
  }

  if (status === "SKIPPED") {
    return "skipped";
  }

  return "pending";
}

function createStopDivIcon(
  stop,
  index,
  activeStopId,
) {
  const state =
    stopMarkerState(
      stop,
      activeStopId,
    );

  const label =
    state === "completed"
      ? "✓"
      : String(
          stop.sequenceNo ||
          index + 1,
        );

  return L.divIcon({
    className:
      "waste-stop-div-icon",
    html:
      `<span class="waste-stop-marker is-${state}">${escapeHtml(label)}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -17],
  });
}

function createGarbageTruckIcon(
  status,
) {
  const active =
    status === "IN_PROGRESS";

  return L.divIcon({
    className:
      "waste-truck-div-icon",
    html: `
      <div class="waste-truck-marker${active ? " is-active" : ""}">
        <span class="waste-truck-marker__halo"></span>
        <span class="waste-truck-marker__body">
          <svg viewBox="0 0 64 44" aria-hidden="true" focusable="false">
            <path d="M7 10h32v24H7z" fill="currentColor" />
            <path d="M39 18h10l8 9v7H39z" fill="currentColor" />
            <path d="M44 21h4.5l4.8 5.5H44z" fill="#dff3e7" />
            <path d="M10 6h27l-3 6H10z" fill="currentColor" opacity=".82" />
            <circle cx="18" cy="35" r="6" fill="#163c31" />
            <circle cx="18" cy="35" r="2.5" fill="#eef6f1" />
            <circle cx="47" cy="35" r="6" fill="#163c31" />
            <circle cx="47" cy="35" r="2.5" fill="#eef6f1" />
          </svg>
        </span>
      </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 31],
    popupAnchor: [0, -28],
  });
}

export default function WasteMap({
  plans = [],
  routes = [],
  selectedRouteId = "",
  routeGeojson = null,
  previousRouteGeojson = null,
  routeStops = [],
  history = [],
  historySegments = [],
  onStopClick = null,
  trackingMode = false,
  trackingStatus = "",
  focusKey = "",
  activeStopId = "",
}) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const contentBoundsRef = useRef(null);
  const lastAutoFitKeyRef = useRef("");

  useEffect(() => {
    if (!rootRef.current) {
      return undefined;
    }

    const bounds =
      L.latLngBounds(
        thaPhoLeafletBounds(),
      );

    const map =
      L.map(
        rootRef.current,
        {
          zoomControl: true,
          scrollWheelZoom: false,
          maxBounds: bounds,
          maxBoundsViscosity: 1,
          worldCopyJump: false,
        },
      )
        .setView(
          THA_PHO_CENTER,
          13,
        );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          "© OpenStreetMap contributors",
      },
    ).addTo(map);

    const keepInside =
      () =>
        enforceThaPhoViewport(map);

    map.on(
      "resize",
      keepInside,
    );

    map.on(
      "zoomend",
      keepInside,
    );

    map.on(
      "moveend",
      keepInside,
    );

    mapRef.current = map;

    window.requestAnimationFrame(
      () => {
        map.invalidateSize({
          pan: false,
        });
        keepInside();
      },
    );

    return () => {
      map.off(
        "resize",
        keepInside,
      );

      map.off(
        "zoomend",
        keepInside,
      );

      map.off(
        "moveend",
        keepInside,
      );

      map.remove();
      mapRef.current = null;
    };
  }, []);

  useLeafletResize(
    mapRef,
    rootRef,
  );

  const fitContent =
    useCallback(
      (animated = true) => {
        const map = mapRef.current;
        const bounds =
          contentBoundsRef.current;

        if (
          !map ||
          !bounds ||
          !bounds.isValid()
        ) {
          return;
        }

        map.invalidateSize({
          pan: false,
        });

        window.requestAnimationFrame(
          () => {
            if (!mapRef.current) {
              return;
            }

            if (animated) {
              map.flyToBounds(
                bounds,
                {
                  padding: [48, 48],
                  maxZoom: 16,
                  duration: 0.55,
                },
              );
            } else {
              map.fitBounds(
                bounds,
                {
                  padding: [48, 48],
                  maxZoom: 16,
                  animate: false,
                },
              );
            }

            enforceThaPhoViewport(
              map,
            );
          },
        );
      },
      [],
    );

  const focusVehicle =
    useCallback(
      () => {
        const map = mapRef.current;
        const current =
          plans.find(
            (plan) =>
              isFiniteCoordinate(
                plan.latitude,
                plan.longitude,
              ),
          );

        if (!map || !current) {
          return;
        }

        map.flyTo(
          [
            Number(current.latitude),
            Number(current.longitude),
          ],
          Math.max(
            map.getZoom(),
            16,
          ),
          {
            animate: true,
            duration: 0.45,
          },
        );
      },
      [plans],
    );

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return undefined;
    }

    const layer =
      L.layerGroup()
        .addTo(map);

    const points = [];
    let autoFitTimer = null;

    // เส้นทางเดิม กรณีเปรียบเทียบ route optimization
    if (previousRouteGeojson) {
      const previousLayer =
        L.geoJSON(
          previousRouteGeojson,
          {
            style: {
              color: "#697871",
              weight: 5,
              opacity: 0.7,
              dashArray: "9 9",
            },
          },
        ).addTo(layer);

      addLayerBounds(
        points,
        previousLayer,
      );
    }

    // เส้นทางของแผน: tracking mode ใช้เส้นฐานสีอ่อน
    // เพื่อให้รอยวิ่ง GPS จริงที่วาดทับด้านบนสื่อว่า "ผ่านแล้ว" ชัดเจน
    if (routeGeojson) {
      const routeLayer =
        L.geoJSON(
          routeGeojson,
          {
            style: {
              color:
                trackingMode
                  ? "#a9cbb8"
                  : "#278432",
              weight:
                trackingMode
                  ? 8
                  : 6,
              opacity:
                trackingMode
                  ? 0.72
                  : 0.88,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ).addTo(layer);

      addLayerBounds(
        points,
        routeLayer,
      );

      if (
        trackingMode &&
        trackingStatus !== "COMPLETED"
      ) {
        L.geoJSON(
          routeGeojson,
          {
            style: {
              color: "#3f956c",
              weight: 3,
              opacity: 0.78,
              dashArray: "10 15",
              lineCap: "round",
              className:
                trackingStatus ===
                "IN_PROGRESS"
                  ? "waste-route-flow"
                  : "waste-route-flow is-paused",
            },
          },
        ).addTo(layer);
      }
    }

    // Dashboard routes
    routes.forEach(
      (route, index) => {
        if (
          selectedRouteId &&
          route.id !== selectedRouteId
        ) {
          return;
        }

        if (!route.routeGeojson) {
          return;
        }

        const color =
          routeMapColor(
            route.routeCode ||
            route.id ||
            index,
          );

        const selected =
          Boolean(
            selectedRouteId &&
            route.id === selectedRouteId,
          );

        const routeLayer =
          L.geoJSON(
            route.routeGeojson,
            {
              style: {
                color,
                weight:
                  selected ? 7 : 5,
                opacity:
                  selected
                    ? 0.96
                    : 0.82,
              },
            },
          )
            .addTo(layer);

        const label =
          [
            route.routeCode,
            route.routeName,
          ]
            .filter(Boolean)
            .join(" · ");

        if (label) {
          routeLayer.bindTooltip(
            label,
            {
              sticky: true,
              direction: "top",
            },
          );
        }

        addLayerBounds(
          points,
          routeLayer,
        );
      },
    );

    routeStops.forEach(
      (stop, index) => {
        const latitude =
          Number(stop.latitude);

        const longitude =
          Number(stop.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        const markerRole =
          stop.markerRole || "STOP";

        let marker;

        if (
          trackingMode &&
          markerRole === "STOP"
        ) {
          marker =
            L.marker(
              [
                latitude,
                longitude,
              ],
              {
                icon:
                  createStopDivIcon(
                    stop,
                    index,
                    activeStopId,
                  ),
                keyboard: true,
                riseOnHover: true,
              },
            ).addTo(layer);
        } else {
          const fillColor =
            markerRole === "START"
              ? "#137d4c"
              : markerRole === "END"
                ? "#d26a1b"
                : markerRole === "HOME"
                  ? "#2476a8"
                  : stop.confirmationStatus === "COLLECTED"
                    ? "#176323"
                    : "#8dcc1c";

          marker =
            L.circleMarker(
              [
                latitude,
                longitude,
              ],
              {
                radius:
                  markerRole === "STOP"
                    ? 8
                    : 10,
                weight: 2,
                color: "#fff",
                fillColor,
                fillOpacity: 1,
              },
            ).addTo(layer);

          const markerLabel =
            markerRole === "START"
              ? "เริ่ม"
              : markerRole === "END"
                ? "จบ"
                : markerRole === "HOME"
                  ? "บ้าน"
                  : String(
                      stop.sequenceNo ||
                      index + 1,
                    );

          marker.bindTooltip(
            markerLabel,
            {
              permanent: true,
              direction: "center",
              className:
                `waste-route-point waste-route-point--${markerRole.toLowerCase()}`,
            },
          );
        }

        const markerState =
          stopMarkerState(
            stop,
            activeStopId,
          );

        const statusLabel =
          markerState === "completed"
            ? "เก็บแล้ว"
            : markerState === "next"
              ? "จุดถัดไป"
              : markerState === "skipped"
                ? "ข้ามจุด"
                : "ยังไม่ถึง";

        marker.bindPopup(
          `<strong>${escapeHtml(stop.stopName || "จุดเก็บขยะ")}</strong><br>${escapeHtml(statusLabel)}`,
        );

        if (onStopClick) {
          marker.on(
            "click",
            () => onStopClick(stop),
          );
        }

        points.push([
          latitude,
          longitude,
        ]);
      },
    );

    // ใน Tracking V3 ไม่วาดจุด GPS ทุกจุดเพื่อลด visual noise;
    // ใช้เส้นรอยวิ่งจริงด้านล่างแทน และเก็บรายละเอียดครบในตารางประวัติ
    if (!trackingMode) {
      history.forEach(
        (point) => {
          const latitude =
            Number(point.latitude);

          const longitude =
            Number(point.longitude);

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
          ) {
            return;
          }

          L.circleMarker(
            [
              latitude,
              longitude,
            ],
            {
              radius: 4,
              weight: 2,
              color: "#fff",
              fillColor: "#2476a8",
              fillOpacity: 1,
            },
          )
            .addTo(layer)
            .bindPopup(
              `<strong>พิกัด GPS ที่ได้รับ</strong><br>${
                point.recordedAt
                  ? new Date(
                      point.recordedAt,
                    ).toLocaleString(
                      "th-TH",
                    )
                  : ""
              }`,
            );

          points.push([
            latitude,
            longitude,
          ]);
        },
      );
    }

    // รอยวิ่งจริง: สีเข้มและทึบ วาดทับเส้นทางตามแผนสีอ่อน
    historySegments.forEach(
      (segment) => {
        const line =
          segment
            .map(
              (point) => [
                Number(point.latitude),
                Number(point.longitude),
              ],
            )
            .filter(
              (point) =>
                point.every(
                  Number.isFinite,
                ),
            );

        if (line.length > 1) {
          if (trackingMode) {
            L.polyline(
              line,
              {
                color: "#0e4f38",
                weight: 9,
                opacity: 0.16,
                lineCap: "round",
                lineJoin: "round",
              },
            ).addTo(layer);
          }

          L.polyline(
            line,
            {
              color:
                trackingMode
                  ? "#176b50"
                  : "#2476a8",
              weight:
                trackingMode
                  ? 6
                  : 4,
              opacity:
                trackingMode
                  ? 0.96
                  : 0.82,
              lineCap: "round",
              lineJoin: "round",
              className:
                trackingMode
                  ? "waste-route-travelled"
                  : "",
            },
          ).addTo(layer);
        }
      },
    );

    plans.forEach(
      (plan) => {
        const latitude =
          Number(plan.latitude);

        const longitude =
          Number(plan.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        let marker;

        if (trackingMode) {
          marker =
            L.marker(
              [
                latitude,
                longitude,
              ],
              {
                icon:
                  createGarbageTruckIcon(
                    trackingStatus ||
                    plan.status,
                  ),
                keyboard: true,
                riseOnHover: true,
                zIndexOffset: 1000,
              },
            ).addTo(layer);
        } else {
          marker =
            L.circleMarker(
              [
                latitude,
                longitude,
              ],
              {
                radius: 10,
                weight: 3,
                color: "#fff",
                fillColor:
                  plan.status ===
                  "IN_PROGRESS"
                    ? "#176323"
                    : "#8dcc1c",
                fillOpacity: 1,
              },
            ).addTo(layer);
        }

        marker.bindPopup(
          `<strong>${escapeHtml(plan.vehicleCode || "รถเก็บขยะ")}</strong><br>${escapeHtml(plan.routeName || "ไม่ระบุเส้นทาง")}<br>${escapeHtml(plan.driverName || "ไม่ระบุพนักงานประจำรถขยะ")}`,
        );

        points.push([
          latitude,
          longitude,
        ]);
      },
    );

    const nextBounds =
      points.length
        ? L.latLngBounds(points)
        : null;

    contentBoundsRef.current =
      nextBounds?.isValid()
        ? nextBounds
        : null;

    if (
      contentBoundsRef.current
    ) {
      const autoFitIdentity =
        trackingMode
          ? String(
              focusKey ||
              "tracking",
            )
          : [
              selectedRouteId,
              routes.length,
              routeStops.length,
              Boolean(routeGeojson),
              Boolean(previousRouteGeojson),
            ].join(":");

      if (
        !trackingMode ||
        lastAutoFitKeyRef.current !==
          autoFitIdentity
      ) {
        lastAutoFitKeyRef.current =
          autoFitIdentity;

        // Leaflet อาจคำนวณขนาด map ก่อน grid/layout จัดตัวเสร็จใน initial render.
        // invalidateSize + delayed fit ทำให้แผนแรก auto-focus ได้โดยไม่ต้องเลือกซ้ำ.
        autoFitTimer =
          window.setTimeout(
            () => {
              const currentMap =
                mapRef.current;
              const currentBounds =
                contentBoundsRef.current;

              if (
                !currentMap ||
                !currentBounds ||
                !currentBounds.isValid()
              ) {
                return;
              }

              currentMap.invalidateSize({
                pan: false,
              });

              window.requestAnimationFrame(
                () => {
                  if (!mapRef.current) {
                    return;
                  }

                  currentMap.fitBounds(
                    currentBounds,
                    {
                      padding: [48, 48],
                      maxZoom: 16,
                      animate: false,
                    },
                  );

                  enforceThaPhoViewport(
                    currentMap,
                  );
                },
              );
            },
            80,
          );
      }
    }

    enforceThaPhoViewport(map);

    return () => {
      if (autoFitTimer) {
        window.clearTimeout(
          autoFitTimer,
        );
      }
      layer.remove();
    };
  }, [
    plans,
    routes,
    selectedRouteId,
    previousRouteGeojson,
    routeGeojson,
    routeStops,
    history,
    historySegments,
    onStopClick,
    trackingMode,
    trackingStatus,
    focusKey,
    activeStopId,
  ]);

  const hasVehiclePosition =
    plans.some(
      (plan) =>
        isFiniteCoordinate(
          plan.latitude,
          plan.longitude,
        ),
    );

  return (
    <div
      className={`waste-map-shell${trackingMode ? " is-tracking" : ""}`}
    >
      <div
        className="waste-map"
        ref={rootRef}
        aria-label="แผนที่การเก็บขยะภายในเขตเทศบาลเมืองท่าโพธิ์"
      />

      {trackingMode ? (
        <div
          className="waste-map-floating-controls"
          aria-label="เครื่องมือแผนที่ติดตามรถเก็บขยะ"
        >
          <button
            type="button"
            onClick={() =>
              fitContent(true)
            }
          >
            <span aria-hidden="true">⌖</span>
            ดูทั้งเส้นทาง
          </button>

          {hasVehiclePosition ? (
            <button
              type="button"
              className="is-primary"
              onClick={focusVehicle}
            >
              <span aria-hidden="true">●</span>
              ติดตามรถ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}