import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricMaximum,
  getMetricValue,
} from "../lib/dashboardVillageData.js";
import { THA_PHO_VILLAGES } from "../lib/thaPhoVillageMapData.js";

const SVG_WIDTH = 1920;
const SVG_HEIGHT = 1600;
const MAP_BOUNDS = Object.freeze([[-SVG_HEIGHT, 0], [0, SVG_WIDTH]]);
const HOME_BOUNDS = Object.freeze([[-1450, 100], [-80, 1800]]);

const COLOR_RAMPS = Object.freeze({
  total: ["#e7f3ee", "#0b6847"],
  pending: ["#fff1d4", "#d97706"],
  cases: ["#fde7e4", "#c94f45"],
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColor(from, to, ratio) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const amount = clamp(ratio, 0, 1);
  const channel = (key) => Math.round(start[key] + (end[key] - start[key]) * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

function coverageColor(value, hasData) {
  if (!hasData) return "#e8eeeb";
  if (value < 50) return mixColor("#f8e2de", "#d65d50", value / 50);
  if (value < 75) return mixColor("#fff0cb", "#e3a323", (value - 50) / 25);
  return mixColor("#dff2e9", "#17845f", (value - 75) / 25);
}

function villageColor(row, metric, maximum) {
  const value = getMetricValue(row, metric);

  if (metric === "vaccination" || metric === "sterilization") {
    return coverageColor(value, row.totalPets > 0);
  }

  const [from, to] = COLOR_RAMPS[metric] || COLOR_RAMPS.total;
  return mixColor(from, to, maximum ? value / maximum : 0);
}

function toLeafletBounds(row) {
  if (!row?.bbox) return L.latLngBounds(HOME_BOUNDS);
  return L.latLngBounds([
    [-row.bbox.y2, row.bbox.x1],
    [-row.bbox.y1, row.bbox.x2],
  ]);
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function MapTooltip({ tooltip, metric }) {
  if (!tooltip.open || !tooltip.row) return null;

  const { row } = tooltip;
  return (
    <div
      className="compact-map-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
      role="status"
    >
      <div className="compact-map-tooltip__head">
        <b>{row.name}</b>
        <strong>{formatMetricValue(row, metric)}</strong>
      </div>
      <div className="compact-map-tooltip__grid">
        <span><small>สัตว์ทั้งหมด</small><b>{row.totalPets}</b></span>
        <span><small>สุนัข / แมว</small><b>{row.dogs} / {row.cats}</b></span>
        <span><small>วัคซีน</small><b>{row.vaccinationCoverage}%</b></span>
        <span><small>ทำหมัน</small><b>{row.sterilizationCoverage}%</b></span>
      </div>
      <small className="compact-map-tooltip__hint">คลิกเพื่อเลือกและซูมพื้นที่</small>
    </div>
  );
}

export default function DashboardMap({
  rows = [],
  metric = "total",
  selectedVillage = null,
  hoveredVillage = null,
  onMetricChange,
  onVillageSelect,
  onVillageHover,
}) {
  const shellRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const connectorRef = useRef(null);
  const focusMarkerRef = useRef(null);
  const pathRefs = useRef(new Map());
  const [fullscreen, setFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState({ open: false, x: 0, y: 0, row: null });

  const maximum = useMemo(() => getMetricMaximum(rows, metric), [rows, metric]);
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  const fitHome = useCallback(() => {
    mapRef.current?.fitBounds(HOME_BOUNDS, {
      padding: [18, 18],
      animate: true,
      duration: 0.45,
    });
  }, []);

  const focusVillage = useCallback((villageId) => {
    const map = mapRef.current;
    const row = rows.find((item) => item.id === Number(villageId));
    if (!map || !row) return;

    map.fitBounds(toLeafletBounds(row), {
      padding: [72, 72],
      maxZoom: 1.75,
      animate: true,
      duration: 0.5,
    });
  }, [rows]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -1.2,
      maxZoom: 2.8,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      keyboard: true,
      boxZoom: true,
      attributionControl: false,
      zoomControl: true,
      preferCanvas: false,
    });

    mapRef.current = map;
    map.zoomControl.setPosition("topright");
    map.setMaxBounds(L.latLngBounds(MAP_BOUNDS).pad(0.32));
    map.fitBounds(HOME_BOUNDS, { padding: [18, 18] });

    const handleMapClick = () => setTooltip((current) => ({ ...current, open: false }));
    map.on("click", handleMapClick);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off("click", handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rows.length) return undefined;

    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }

    pathRefs.current.clear();

    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`,
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": "แผนที่เขตหมู่บ้าน ตำบลท่าโพธ์",
    });
    svg.classList.add("compact-village-svg");

    const shapesGroup = createSvgElement("g");
    const labelsGroup = createSvgElement("g");
    labelsGroup.classList.add("compact-village-labels");

    rows.forEach((row) => {
      const path = createSvgElement("path", {
        d: row.path,
        fill: villageColor(row, metric, maximum),
        tabindex: 0,
        role: "button",
        "aria-label": `${row.name} ${formatMetricValue(row, metric)}`,
      });
      path.classList.add("compact-village-shape");
      path.dataset.villageId = String(row.id);

      const showTooltip = (event) => {
        const rect = mapContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const tooltipWidth = 230;
        const tooltipHeight = 156;
        const x = clamp(event.clientX - rect.left + 14, 10, rect.width - tooltipWidth - 10);
        const y = clamp(event.clientY - rect.top + 14, 10, rect.height - tooltipHeight - 10);
        setTooltip({ open: true, x, y, row });
      };

      path.addEventListener("mouseenter", (event) => {
        onVillageHover?.(row.id);
        showTooltip(event);
      });
      path.addEventListener("mousemove", showTooltip);
      path.addEventListener("mouseleave", () => {
        onVillageHover?.(null);
        setTooltip((current) => ({ ...current, open: false }));
      });
      path.addEventListener("focus", () => onVillageHover?.(row.id));
      path.addEventListener("blur", () => onVillageHover?.(null));
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextVillage = Number(selectedVillage) === row.id ? null : row.id;
        onVillageSelect?.(nextVillage);
      });
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const nextVillage = Number(selectedVillage) === row.id ? null : row.id;
          onVillageSelect?.(nextVillage);
        }
      });

      pathRefs.current.set(row.id, path);
      shapesGroup.appendChild(path);

      const label = createSvgElement("g", {
        transform: `translate(${row.label.x} ${row.label.y})`,
      });
      const circle = createSvgElement("circle", { r: 35 });
      const villageNumber = createSvgElement("text", { x: 0, y: -3 });
      villageNumber.textContent = String(row.id);
      villageNumber.classList.add("compact-village-label__number");
      const villageValue = createSvgElement("text", { x: 0, y: 20 });
      villageValue.textContent = metricInfo.unit === "%"
        ? `${getMetricValue(row, metric)}%`
        : String(getMetricValue(row, metric));
      villageValue.classList.add("compact-village-label__value");
      label.append(circle, villageNumber, villageValue);
      labelsGroup.appendChild(label);
    });

    svg.append(shapesGroup, labelsGroup);
    const overlay = L.svgOverlay(svg, MAP_BOUNDS, {
      interactive: true,
      opacity: 1,
      className: "compact-village-overlay",
    }).addTo(map);
    overlayRef.current = overlay;

    return () => {
      if (map.hasLayer(overlay)) map.removeLayer(overlay);
      if (overlayRef.current === overlay) overlayRef.current = null;
      pathRefs.current.clear();
    };
  }, [rows, metric, maximum, metricInfo.unit, onVillageHover, onVillageSelect, selectedVillage]);

  useEffect(() => {
    pathRefs.current.forEach((path, villageId) => {
      const selected = Number(selectedVillage) === villageId;
      const hovered = Number(hoveredVillage) === villageId;
      const dimmed = selectedVillage && !selected;
      path.classList.toggle("is-selected", selected);
      path.classList.toggle("is-hovered", hovered);
      path.classList.toggle("is-dimmed", Boolean(dimmed));
    });
  }, [selectedVillage, hoveredVillage, rows, metric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (connectorRef.current) {
      map.removeLayer(connectorRef.current);
      connectorRef.current = null;
    }
    if (focusMarkerRef.current) {
      map.removeLayer(focusMarkerRef.current);
      focusMarkerRef.current = null;
    }

    const row = rows.find((item) => item.id === Number(selectedVillage));
    if (!row) {
      fitHome();
      return;
    }

    focusVillage(row.id);
    const center = L.latLng(-row.label.y, row.label.x);
    connectorRef.current = L.polyline(
      [center, L.latLng(center.lat, SVG_WIDTH - 60)],
      {
        color: "#0b6847",
        weight: 2,
        opacity: 0.72,
        dashArray: "7 9",
        interactive: false,
        className: "compact-map-connector",
      },
    ).addTo(map);
    focusMarkerRef.current = L.circleMarker(center, {
      radius: 11,
      color: "#ffffff",
      weight: 4,
      fillColor: "#0b6847",
      fillOpacity: 1,
      interactive: false,
      className: "compact-map-focus-marker",
    }).addTo(map);
  }, [selectedVillage, rows, fitHome, focusVillage]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        } else if (selectedVillage) {
          onVillageSelect?.(null);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedVillage, onVillageSelect]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await shellRef.current.requestFullscreen?.();
  };

  return (
    <section className="compact-map-card" ref={shellRef}>
      <header className="compact-map-card__head">
        <div>
          <h2>แผนที่เขตหมู่บ้าน</h2>
          <span>คลิกพื้นที่เพื่อดูข้อมูลและซูมอัตโนมัติ</span>
        </div>
        <label className="compact-map-metric">
          <span>แสดง</span>
          <select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>
            {Object.values(DASHBOARD_METRICS).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="compact-map-stage">
        <div ref={mapContainerRef} className="compact-leaflet-map" />

        <div className="compact-map-quick-controls" aria-label="เครื่องมือแผนที่">
          <button type="button" onClick={fitHome} title="ดูทุกหมู่บ้าน" aria-label="ดูทุกหมู่บ้าน">⌂</button>
          <button
            type="button"
            onClick={() => selectedVillage && focusVillage(selectedVillage)}
            disabled={!selectedVillage}
            title="กลับไปยังหมู่ที่เลือก"
            aria-label="กลับไปยังหมู่ที่เลือก"
          >
            ◎
          </button>
          <button type="button" onClick={toggleFullscreen} title="เต็มหน้าจอ" aria-label="เต็มหน้าจอ">
            {fullscreen ? "↙" : "⛶"}
          </button>
        </div>

        <div className="compact-map-legend">
          <i className="low" /><span>ต่ำ</span>
          <i className="mid" /><span>ติดตาม</span>
          <i className="high" /><span>สูง</span>
        </div>

        <div className="compact-map-help">ลากเพื่อเลื่อน · หมุนล้อเพื่อซูม · กด Esc เพื่อล้าง</div>
        <MapTooltip tooltip={tooltip} metric={metric} />
      </div>

      <div className="compact-village-rail" aria-label="เลือกหมู่บ้านแบบรวดเร็ว">
        {rows.map((row) => {
          const active = Number(selectedVillage) === row.id;
          const hovered = Number(hoveredVillage) === row.id;
          return (
            <button
              type="button"
              key={row.id}
              className={`${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""}`}
              onClick={() => onVillageSelect?.(active ? null : row.id)}
              onMouseEnter={() => onVillageHover?.(row.id)}
              onMouseLeave={() => onVillageHover?.(null)}
              onFocus={() => onVillageHover?.(row.id)}
              onBlur={() => onVillageHover?.(null)}
              title={`${row.name}: ${formatMetricValue(row, metric)}`}
            >
              <span>หมู่ {row.id}</span>
              <b>{metricInfo.unit === "%" ? `${getMetricValue(row, metric)}%` : getMetricValue(row, metric)}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}
