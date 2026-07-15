import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricMaximum,
  getMetricValue,
} from "../lib/dashboardVillageData.js";

const SVG_WIDTH = 1920;
const SVG_HEIGHT = 1600;

// ขอบเขตสำหรับวาง SVG ต้นแบบทับบนแผนที่จริง
// เป็นการปรับตำแหน่งเบื้องต้นเพื่อใช้งานระหว่างรอ GeoJSON/KML จากหน่วยงาน
const THA_PHO_BOUNDS = Object.freeze([
  [16.69, 100.15],
  [16.90, 100.31],
]);

const THA_PHO_CENTER = Object.freeze([16.80, 100.225]);
const DEFAULT_ZOOM = 12;

const BASE_LAYERS = Object.freeze({
  streets: Object.freeze({
    label: "แผนที่ถนน",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  }),
  satellite: Object.freeze({
    label: "ภาพถ่ายดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  }),
});

const COLOR_RAMPS = Object.freeze({
  total: ["#dfeee8", "#08724f"],
  pending: ["#fff0cf", "#c7790c"],
  cases: ["#fde5e2", "#c64d45"],
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidCoordinate(item) {
  const latitude = toNumber(item?.latitude);
  const longitude = toNumber(item?.longitude);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && latitude !== 0 && longitude !== 0;
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
  if (!hasData) return "#dfe7e4";
  if (value < 50) return mixColor("#f8dcd8", "#cc4f45", value / 50);
  if (value < 75) return mixColor("#fff0c8", "#d99817", (value - 50) / 25);
  return mixColor("#d8eee5", "#08724f", (value - 75) / 25);
}

function villageColor(row, metric, maximum) {
  const value = getMetricValue(row, metric);
  if (metric === "vaccination" || metric === "sterilization") {
    return coverageColor(value, row.totalPets > 0);
  }
  const [from, to] = COLOR_RAMPS[metric] || COLOR_RAMPS.total;
  return mixColor(from, to, maximum ? value / maximum : 0);
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function svgPointToLatLng(x, y) {
  const [[south, west], [north, east]] = THA_PHO_BOUNDS;
  return L.latLng(
    north - (y / SVG_HEIGHT) * (north - south),
    west + (x / SVG_WIDTH) * (east - west),
  );
}

function villageBounds(row) {
  if (!row?.bbox) return L.latLngBounds(THA_PHO_BOUNDS);
  const northWest = svgPointToLatLng(row.bbox.x1, row.bbox.y1);
  const southEast = svgPointToLatLng(row.bbox.x2, row.bbox.y2);
  return L.latLngBounds(
    [southEast.lat, northWest.lng],
    [northWest.lat, southEast.lng],
  );
}

function groupPetLocations(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    (row.pets || []).forEach((pet) => {
      if (!isValidCoordinate(pet)) return;
      const latitude = toNumber(pet.latitude);
      const longitude = toNumber(pet.longitude);
      const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
      const current = groups.get(key) || {
        latitude,
        longitude,
        villageNo: row.id,
        pets: [],
      };
      current.pets.push({ ...pet, villageNo: row.id });
      groups.set(key, current);
    });
  });

  return [...groups.values()];
}

function markerTone(group, metric) {
  if (metric === "vaccination") {
    const covered = group.pets.filter((pet) => Boolean(pet.vaccinated)).length;
    return covered === group.pets.length ? "good" : covered === 0 ? "danger" : "warning";
  }
  if (metric === "sterilization") {
    const covered = group.pets.filter((pet) => Boolean(pet.sterilized)).length;
    return covered === group.pets.length ? "good" : covered === 0 ? "danger" : "warning";
  }
  return "primary";
}

function markerHtml(group, metric) {
  const tone = markerTone(group, metric);
  return `<div class="real-map-marker real-map-marker--${tone}"><span>${group.pets.length}</span></div>`;
}

function popupHtml(group) {
  const dogs = group.pets.filter((pet) => pet.species === "DOG").length;
  const cats = group.pets.filter((pet) => pet.species === "CAT").length;
  const names = group.pets.slice(0, 4).map((pet) => pet.petName || "ไม่ระบุชื่อ").join(" · ");
  const more = Math.max(0, group.pets.length - 4);

  return `
    <div class="real-map-popup">
      <strong>จุดเลี้ยงสัตว์ หมู่ ${group.villageNo}</strong>
      <div><span>สัตว์ในจุดนี้</span><b>${group.pets.length} ตัว</b></div>
      <div><span>สุนัข / แมว</span><b>${dogs} / ${cats}</b></div>
      <p>${names}${more ? ` · อีก ${more} ตัว` : ""}</p>
      <small>พิกัด ${group.latitude.toFixed(5)}, ${group.longitude.toFixed(5)}</small>
    </div>
  `;
}

function MapTooltip({ tooltip, metric }) {
  if (!tooltip.open || !tooltip.row) return null;
  const { row } = tooltip;

  return (
    <div className="real-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status">
      <div className="real-map-tooltip__head">
        <div>
          <small>พื้นที่หมู่บ้าน</small>
          <b>{row.villageName || row.name}</b>
        </div>
        <strong>{formatMetricValue(row, metric)}</strong>
      </div>
      <div className="real-map-tooltip__grid">
        <span><small>สัตว์ทั้งหมด</small><b>{row.totalPets.toLocaleString("th-TH")}</b></span>
        <span><small>สุนัข / แมว</small><b>{row.dogs} / {row.cats}</b></span>
        <span><small>วัคซีน</small><b>{row.vaccinationCoverage}%</b></span>
        <span><small>ทำหมัน</small><b>{row.sterilizationCoverage}%</b></span>
      </div>
      <p>คลิกเพื่อเลือกพื้นที่และกรองข้อมูลทั้งหน้า</p>
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
  const baseLayerRef = useRef(null);
  const overlayRef = useRef(null);
  const markerLayerRef = useRef(null);
  const selectionLayerRef = useRef(null);
  const pathRefs = useRef(new Map());

  const [baseMap, setBaseMap] = useState("streets");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [wheelZoom, setWheelZoom] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState({ open: false, x: 0, y: 0, row: null });

  const maximum = useMemo(() => getMetricMaximum(rows, metric), [rows, metric]);
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;
  const locationGroups = useMemo(() => groupPetLocations(rows), [rows]);
  const totalPets = useMemo(() => rows.reduce((sum, row) => sum + toNumber(row.totalPets), 0), [rows]);
  const petsWithCoordinates = useMemo(
    () => rows.flatMap((row) => row.pets || []).filter(isValidCoordinate).length,
    [rows],
  );
  const missingCoordinates = Math.max(0, totalPets - petsWithCoordinates);

  const fitThaPho = useCallback(() => {
    mapRef.current?.fitBounds(THA_PHO_BOUNDS, { padding: [18, 18], animate: true, duration: 0.45 });
  }, []);

  const fitPetPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map || !locationGroups.length) {
      fitThaPho();
      return;
    }
    map.fitBounds(
      L.latLngBounds(locationGroups.map((item) => [item.latitude, item.longitude])),
      { padding: [42, 42], maxZoom: 16, animate: true },
    );
  }, [locationGroups, fitThaPho]);

  const focusVillage = useCallback((villageId) => {
    const map = mapRef.current;
    const row = rows.find((item) => item.id === Number(villageId));
    if (!map || !row) return;
    map.fitBounds(villageBounds(row), { padding: [54, 54], maxZoom: 15, animate: true, duration: 0.5 });
  }, [rows]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      center: THA_PHO_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      keyboard: true,
      boxZoom: true,
      preferCanvas: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    map.fitBounds(THA_PHO_BOUNDS, { padding: [18, 18] });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (wheelZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [wheelZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const config = BASE_LAYERS[baseMap] || BASE_LAYERS.streets;
    baseLayerRef.current = L.tileLayer(config.url, config.options).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rows.length) return undefined;

    if (overlayRef.current) map.removeLayer(overlayRef.current);
    pathRefs.current.clear();

    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`,
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": "แนวเขตหมู่ 1 ถึง 11 ตำบลท่าโพธ์",
    });
    svg.classList.add("real-village-svg");

    const shapesGroup = createSvgElement("g");
    const labelsGroup = createSvgElement("g");
    labelsGroup.classList.add("real-village-labels");

    rows.forEach((row) => {
      const path = createSvgElement("path", {
        d: row.path,
        fill: villageColor(row, metric, maximum),
        tabindex: 0,
        role: "button",
        "aria-label": `${row.name} ${formatMetricValue(row, metric)}`,
      });
      path.classList.add("real-village-shape");
      path.dataset.villageId = String(row.id);

      const showTooltip = (event) => {
        const rect = mapContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = 280;
        const height = 198;
        const x = clamp(event.clientX - rect.left + 16, 12, Math.max(12, rect.width - width - 12));
        const y = clamp(event.clientY - rect.top + 16, 12, Math.max(12, rect.height - height - 12));
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
        onVillageSelect?.(Number(selectedVillage) === row.id ? null : row.id);
      });
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onVillageSelect?.(Number(selectedVillage) === row.id ? null : row.id);
        }
      });

      pathRefs.current.set(row.id, path);
      shapesGroup.appendChild(path);

      const label = createSvgElement("g", { transform: `translate(${row.label.x} ${row.label.y})` });
      const circle = createSvgElement("circle", { r: 39 });
      const number = createSvgElement("text", { x: 0, y: -5 });
      number.textContent = String(row.id);
      number.classList.add("real-village-label__number");
      const value = createSvgElement("text", { x: 0, y: 22 });
      value.textContent = metricInfo.unit === "%" ? `${getMetricValue(row, metric)}%` : String(getMetricValue(row, metric));
      value.classList.add("real-village-label__value");
      label.append(circle, number, value);
      labelsGroup.appendChild(label);
    });

    svg.append(shapesGroup, labelsGroup);
    const overlay = L.svgOverlay(svg, THA_PHO_BOUNDS, {
      interactive: true,
      opacity: showBoundaries ? 0.72 : 0,
      className: "real-village-overlay",
    }).addTo(map);
    overlayRef.current = overlay;

    return () => {
      if (map.hasLayer(overlay)) map.removeLayer(overlay);
      if (overlayRef.current === overlay) overlayRef.current = null;
      pathRefs.current.clear();
    };
  }, [rows, metric, maximum, metricInfo.unit, onVillageHover, onVillageSelect, selectedVillage, showBoundaries]);

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
    if (!map) return undefined;

    if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
    const layer = L.layerGroup();

    if (showPoints) {
      locationGroups.forEach((group) => {
        if (selectedVillage && Number(group.villageNo) !== Number(selectedVillage)) return;
        const icon = L.divIcon({
          className: "real-map-marker-shell",
          html: markerHtml(group, metric),
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          popupAnchor: [0, -18],
        });
        L.marker([group.latitude, group.longitude], { icon, keyboard: true })
          .bindPopup(popupHtml(group), { minWidth: 240, maxWidth: 290 })
          .addTo(layer);
      });
    }

    layer.addTo(map);
    markerLayerRef.current = layer;

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (markerLayerRef.current === layer) markerLayerRef.current = null;
    };
  }, [locationGroups, metric, selectedVillage, showPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectionLayerRef.current) {
      map.removeLayer(selectionLayerRef.current);
      selectionLayerRef.current = null;
    }

    const row = rows.find((item) => item.id === Number(selectedVillage));
    if (!row) return;

    focusVillage(row.id);
    const center = svgPointToLatLng(row.label.x, row.label.y);
    selectionLayerRef.current = L.circleMarker(center, {
      radius: 15,
      color: "#ffffff",
      weight: 5,
      fillColor: "#08724f",
      fillOpacity: 1,
      interactive: false,
      className: "real-map-focus-marker",
    }).addTo(map);
  }, [selectedVillage, rows, focusVillage]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) document.exitFullscreen?.();
      else if (wheelZoom) setWheelZoom(false);
      else if (selectedVillage) onVillageSelect?.(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedVillage, wheelZoom, onVillageSelect]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 90);
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
    <section className="real-map-card" ref={shellRef}>
      <header className="real-map-card__head">
        <div>
          <small>ข้อมูลเชิงพื้นที่</small>
          <h2>ตำแหน่งสัตว์บนแผนที่ท่าโพธ์</h2>
          <p>แสดงถนน สถานที่จริง จุดเลี้ยงสัตว์ และแนวเขตหมู่แบบโต้ตอบ</p>
        </div>

        <div className="real-map-card__head-tools">
          <label>
            <span>ชั้นข้อมูล</span>
            <select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>
              {Object.values(DASHBOARD_METRICS).map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className="real-map-basemap" aria-label="รูปแบบแผนที่">
            {Object.entries(BASE_LAYERS).map(([id, item]) => (
              <button type="button" key={id} className={baseMap === id ? "is-active" : ""} onClick={() => setBaseMap(id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="real-map-stage">
        <div ref={mapContainerRef} className="real-leaflet-map" />

        <div className="real-map-toolbar" aria-label="เครื่องมือแผนที่">
          <button type="button" onClick={fitThaPho} title="ดูพื้นที่ท่าโพธ์ทั้งหมด">ดูทั้งตำบล</button>
          <button type="button" onClick={fitPetPoints} title="ซูมให้เห็นจุดสัตว์ทั้งหมด">ดูจุดสัตว์</button>
          <button type="button" onClick={() => selectedVillage && focusVillage(selectedVillage)} disabled={!selectedVillage} title="กลับไปพื้นที่ที่เลือก">
            พื้นที่ที่เลือก
          </button>
          <span />
          <button type="button" className={showBoundaries ? "is-active" : ""} onClick={() => setShowBoundaries((value) => !value)}>
            แนวเขตหมู่
          </button>
          <button type="button" className={showPoints ? "is-active" : ""} onClick={() => setShowPoints((value) => !value)}>
            จุดสัตว์
          </button>
          <button type="button" className={wheelZoom ? "is-active" : ""} onClick={() => setWheelZoom((value) => !value)} title="เปิดหรือปิดการซูมด้วยล้อเมาส์">
            ล้อเมาส์
          </button>
          <button type="button" onClick={toggleFullscreen}>{fullscreen ? "ออกเต็มจอ" : "เต็มจอ"}</button>
        </div>

        <div className="real-map-status">
          <strong>{locationGroups.length.toLocaleString("th-TH")} จุด</strong>
          <span>มีพิกัด {petsWithCoordinates.toLocaleString("th-TH")} ตัว</span>
          <span className={missingCoordinates ? "is-warning" : ""}>ขาดพิกัด {missingCoordinates.toLocaleString("th-TH")} ตัว</span>
        </div>

        {!wheelZoom ? (
          <button type="button" className="real-map-wheel-hint" onClick={() => setWheelZoom(true)}>
            คลิกเพื่อเปิดการซูมด้วยล้อเมาส์
          </button>
        ) : null}

        <div className="real-map-note">แนวเขตหมู่เป็นการวางทับจาก SVG ต้นแบบ และควรแทนด้วย GeoJSON ทางการเมื่อได้รับข้อมูล</div>
        <MapTooltip tooltip={tooltip} metric={metric} />
      </div>
    </section>
  );
}
