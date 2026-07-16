import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import villagesGeoJsonText from "../assets/maps/tha-pho-villages.geojson?raw";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricValue,
} from "../lib/dashboardVillageData.js";
import { normalizePetsToVillages } from "../lib/geoVillageUtils.js";

const VILLAGES_GEOJSON = JSON.parse(villagesGeoJsonText);
const MUNICIPALITY_BOUNDS = L.geoJSON(VILLAGES_GEOJSON).getBounds();
const HARD_BOUNDS = MUNICIPALITY_BOUNDS.pad(0.08);
const THA_PHO_CENTER = MUNICIPALITY_BOUNDS.getCenter();

const BASE_LAYERS = {
  streets: {
    label: "แผนที่ถนน",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  satellite: {
    label: "ภาพถ่ายดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

const SPECIES = {
  ALL: "ทั้งหมด",
  DOG: "สุนัข",
  CAT: "แมว",
};

const METRIC_COLORS = {
  total: ["#e8f3ee", "#187a5a"],
  vaccination: ["#e6f4ef", "#0d8f69"],
  sterilization: ["#f0ebf8", "#7654a6"],
  pending: ["#fff3d9", "#b26b05"],
  cases: ["#fde8e6", "#b43c34"],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function interpolateColor(start, end, ratio) {
  const parse = (hex) => {
    const clean = hex.replace("#", "");
    return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16));
  };
  const from = parse(start);
  const to = parse(end);
  const channels = from.map((value, index) => Math.round(value + ((to[index] - value) * ratio)));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getPolygonFill(row, metric, maximum) {
  const [light, dark] = METRIC_COLORS[metric] || METRIC_COLORS.total;
  const value = getMetricValue(row, metric);
  const ratio = metric === "vaccination" || metric === "sterilization"
    ? clamp(value / 100, 0, 1)
    : clamp(value / Math.max(1, maximum), 0, 1);
  return interpolateColor(light, dark, 0.12 + ratio * 0.88);
}

function householdKey(pet) {
  if (pet.householdId) return `household:${pet.householdId}`;
  return [
    "coordinate",
    Number(pet.latitude).toFixed(7),
    Number(pet.longitude).toFixed(7),
    pet.houseNo || "",
    pet.ownerName || "",
  ].join("|");
}

function groupRealHouseholds(pets) {
  const groups = new Map();

  pets.forEach((pet) => {
    const key = householdKey(pet);
    const existing = groups.get(key) || {
      key,
      householdId: pet.householdId || null,
      latitude: Number(pet.latitude),
      longitude: Number(pet.longitude),
      villageNo: Number(pet.villageNo),
      houseNo: pet.houseNo || "",
      addressDetail: pet.addressDetail || "",
      ownerNames: new Set(),
      pets: [],
      mismatchCount: 0,
    };

    existing.pets.push(pet);
    if (pet.ownerName) existing.ownerNames.add(pet.ownerName);
    if (pet.coordinateStatus === "mismatch") existing.mismatchCount += 1;
    groups.set(key, existing);
  });

  return [...groups.values()].map((item) => ({
    ...item,
    ownerNames: [...item.ownerNames],
  }));
}

function markerIcon(household, selected) {
  const count = household.pets.length;
  const warning = household.mismatchCount > 0;
  return L.divIcon({
    className: "real-household-marker-shell",
    html: `
      <div class="real-household-marker ${selected ? "is-selected" : ""} ${warning ? "is-warning" : ""}">
        <span></span>
        ${count > 1 ? `<b>${count}</b>` : ""}
      </div>
    `,
    iconSize: [28, 34],
    iconAnchor: [14, 31],
    popupAnchor: [0, -28],
  });
}

function householdPopup(household) {
  const dogs = household.pets.filter((pet) => pet.species === "DOG").length;
  const cats = household.pets.filter((pet) => pet.species === "CAT").length;
  const vaccinated = household.pets.filter((pet) => Boolean(pet.vaccinated)).length;
  const sterilized = household.pets.filter((pet) => Boolean(pet.sterilized)).length;
  const names = household.pets
    .map((pet) => escapeHtml(pet.petName || "ไม่ระบุชื่อ"))
    .slice(0, 8)
    .join(" · ");
  const owners = household.ownerNames.map(escapeHtml).join(" · ") || "ไม่ระบุ";

  return `
    <article class="real-location-popup">
      <header>
        <div>
          <small>จุดพิกัดจากฐานข้อมูล</small>
          <strong>${household.houseNo ? `บ้านเลขที่ ${escapeHtml(household.houseNo)}` : "จุดเลี้ยงสัตว์"}</strong>
        </div>
        <span>หมู่ ${household.villageNo}</span>
      </header>
      <dl>
        <div><dt>เจ้าของ</dt><dd>${owners}</dd></div>
        <div><dt>สัตว์</dt><dd>${household.pets.length} ตัว · สุนัข ${dogs} · แมว ${cats}</dd></div>
        <div><dt>วัคซีน / ทำหมัน</dt><dd>${vaccinated} / ${sterilized} ตัว</dd></div>
        <div><dt>รายชื่อสัตว์</dt><dd>${names || "ไม่ระบุ"}</dd></div>
        <div><dt>พิกัดจริง</dt><dd>${household.latitude.toFixed(7)}, ${household.longitude.toFixed(7)}</dd></div>
      </dl>
      ${household.mismatchCount > 0 ? `
        <p class="real-location-popup__warning">
          พิกัดอยู่หมู่ ${household.villageNo} แต่มี ${household.mismatchCount} รายการที่หมู่ในทะเบียนไม่ตรงกัน
        </p>
      ` : ""}
    </article>
  `;
}

function villageTooltip(row, metric) {
  return `
    <div class="real-village-tooltip">
      <strong>หมู่ ${row.id}</strong>
      <span>${escapeHtml(row.villageName || row.name || "")}</span>
      <b>${escapeHtml(formatMetricValue(row, metric))}</b>
    </div>
  `;
}

function DataQualityBar({ diagnostics, householdCount }) {
  return (
    <div className="map-data-quality" aria-label="คุณภาพข้อมูลแผนที่">
      <span className="is-good"><b>{householdCount.toLocaleString("th-TH")}</b> จุดพิกัดจริง</span>
      <span><b>{diagnostics.renderedPets.toLocaleString("th-TH")}</b> สัตว์ที่แสดงได้</span>
      {diagnostics.missingCoordinates > 0 ? (
        <span className="is-muted"><b>{diagnostics.missingCoordinates.toLocaleString("th-TH")}</b> ไม่มีพิกัด</span>
      ) : null}
      {diagnostics.outsideBoundary > 0 ? (
        <span className="is-danger"><b>{diagnostics.outsideBoundary.toLocaleString("th-TH")}</b> อยู่นอกเขต</span>
      ) : null}
      {diagnostics.villageMismatch > 0 ? (
        <span className="is-warning"><b>{diagnostics.villageMismatch.toLocaleString("th-TH")}</b> หมู่ไม่ตรงทะเบียน</span>
      ) : null}
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
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const villageLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const villageLayersRef = useRef(new Map());
  const initialFitDoneRef = useRef(false);

  const [baseMap, setBaseMap] = useState("streets");
  const [species, setSpecies] = useState("ALL");
  const [fullscreen, setFullscreen] = useState(false);

  const normalized = useMemo(
    () => normalizePetsToVillages(rows, VILLAGES_GEOJSON),
    [rows],
  );

  const filteredPets = useMemo(() => normalized.pets.filter((pet) => {
    if (selectedVillage && Number(pet.villageNo) !== Number(selectedVillage)) return false;
    if (species !== "ALL" && pet.species !== species) return false;
    return true;
  }), [normalized.pets, selectedVillage, species]);

  const households = useMemo(() => groupRealHouseholds(filteredPets), [filteredPets]);

  const applyMunicipalityLimits = useCallback((fit = false) => {
    const map = mapRef.current;
    if (!map) return;

    map.invalidateSize({ pan: false });
    const fitZoom = map.getBoundsZoom(MUNICIPALITY_BOUNDS, false, L.point(48, 48));
    const minZoom = clamp(fitZoom, 10, 15);
    map.setMinZoom(minZoom);
    map.setMaxBounds(HARD_BOUNDS);

    if (fit || map.getZoom() < minZoom) {
      map.fitBounds(MUNICIPALITY_BOUNDS, {
        padding: [30, 30],
        animate: false,
      });
    }
  }, []);

  const fitMunicipality = useCallback(() => {
    onVillageSelect?.(null);
    applyMunicipalityLimits(true);
  }, [applyMunicipalityLimits, onVillageSelect]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      center: THA_PHO_CENTER,
      zoom: 12,
      minZoom: 10,
      maxZoom: 19,
      maxBounds: HARD_BOUNDS,
      maxBoundsViscosity: 1,
      zoomControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      scrollWheelZoom: true,
      preferCanvas: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => applyMunicipalityLimits(false));
    });
    resizeObserver.observe(mapElementRef.current);

    window.requestAnimationFrame(() => {
      applyMunicipalityLimits(true);
      initialFitDoneRef.current = true;
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [applyMunicipalityLimits]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const config = BASE_LAYERS[baseMap];
    baseLayerRef.current = L.tileLayer(config.url, config.options).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (villageLayerRef.current) map.removeLayer(villageLayerRef.current);
    villageLayersRef.current.clear();

    const rowsByVillage = new Map(rows.map((row) => [Number(row.id), row]));
    const maximum = Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));

    villageLayerRef.current = L.geoJSON(VILLAGES_GEOJSON, {
      style(feature) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || { id: villageNo };
        const active = Number(selectedVillage) === villageNo;
        const hovered = Number(hoveredVillage) === villageNo;
        const dimmed = selectedVillage && !active;

        return {
          color: active ? "#075b43" : hovered ? "#087454" : "#426f61",
          weight: active ? 3 : hovered ? 2.4 : 1.2,
          opacity: dimmed ? 0.5 : 0.95,
          fillColor: getPolygonFill(row, metric, maximum),
          fillOpacity: dimmed ? 0.16 : active ? 0.58 : 0.34,
        };
      },
      onEachFeature(feature, layer) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || {
          id: villageNo,
          villageName: feature.properties?.villageName || `หมู่ที่ ${villageNo}`,
        };
        villageLayersRef.current.set(villageNo, layer);

        layer.bindTooltip(villageTooltip(row, metric), {
          sticky: true,
          direction: "top",
          className: "real-village-tooltip-shell",
          opacity: 1,
        });
        layer.on({
          mouseover() {
            onVillageHover?.(villageNo);
          },
          mouseout() {
            onVillageHover?.(null);
          },
          click() {
            onVillageSelect?.(Number(selectedVillage) === villageNo ? null : villageNo);
          },
        });
      },
    }).addTo(map);
  }, [hoveredVillage, metric, onVillageHover, onVillageSelect, rows, selectedVillage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !initialFitDoneRef.current) return;

    if (!selectedVillage) {
      applyMunicipalityLimits(true);
      return;
    }

    const layer = villageLayersRef.current.get(Number(selectedVillage));
    if (layer?.getBounds?.().isValid?.()) {
      map.fitBounds(layer.getBounds(), {
        padding: [42, 42],
        maxZoom: 15.5,
        animate: true,
      });
    }
  }, [applyMunicipalityLimits, selectedVillage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
    const layerGroup = L.layerGroup();

    households.forEach((household) => {
      const marker = L.marker([household.latitude, household.longitude], {
        icon: markerIcon(household, Boolean(selectedVillage)),
        keyboard: true,
        title: household.houseNo ? `บ้านเลขที่ ${household.houseNo}` : "จุดเลี้ยงสัตว์",
      });
      marker.bindPopup(householdPopup(household), {
        className: "real-location-popup-shell",
        maxWidth: 360,
        minWidth: 280,
      });
      marker.addTo(layerGroup);
    });

    markerLayerRef.current = layerGroup.addTo(map);
  }, [households, selectedVillage]);

  useEffect(() => {
    window.requestAnimationFrame(() => applyMunicipalityLimits(false));
  }, [applyMunicipalityLimits, fullscreen]);

  const selectedLabel = selectedVillage ? `หมู่ ${selectedVillage}` : "ทุกหมู่";
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  return (
    <section className={`production-map-card ${fullscreen ? "is-fullscreen" : ""}`}>
      <header className="production-map-card__header">
        <div>
          <small>แผนที่ปฏิบัติงาน</small>
          <h2>ขอบเขตหมู่และจุดพิกัดจริง</h2>
          <p>หมุดแสดงหนึ่งจุดต่อหนึ่งหลังคาเรือนจากพิกัดในฐานข้อมูลเท่านั้น</p>
        </div>
        <div className="production-map-card__scope">
          <span>พื้นที่</span>
          <strong>{selectedLabel}</strong>
        </div>
      </header>

      <div className="production-map-toolbar" aria-label="ตัวกรองแผนที่">
        <label className="production-map-select">
          <span>ข้อมูลบนพื้นที่</span>
          <select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>
            {Object.values(DASHBOARD_METRICS).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>

        <div className="production-segmented" aria-label="กรองชนิดสัตว์">
          {Object.entries(SPECIES).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={species === value ? "is-active" : ""}
              onClick={() => setSpecies(value)}
              aria-pressed={species === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="production-map-actions">
          <button type="button" onClick={() => setBaseMap((value) => value === "streets" ? "satellite" : "streets")}>
            {baseMap === "streets" ? "ดาวเทียม" : "ถนน"}
          </button>
          <button type="button" onClick={fitMunicipality}>ดูทั้งตำบล</button>
          <button type="button" onClick={() => setFullscreen((value) => !value)}>
            {fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
          </button>
        </div>
      </div>

      <div className="production-map-stage">
        <div ref={mapElementRef} className="production-map-canvas" />
        {!households.length ? (
          <div className="production-map-empty">
            <strong>ไม่พบจุดพิกัดจริงในตัวกรองนี้</strong>
            <span>รายการที่ไม่มี latitude/longitude จะไม่สร้างหมุดขึ้นมาแทน</span>
          </div>
        ) : null}
        <div className="production-map-legend">
          <span><i className="is-area" /> สีพื้นที่: {metricInfo.label}</span>
          <span><i className="is-point" /> หมุด: หลังคาเรือนที่มีพิกัดจริง</span>
        </div>
      </div>

      <DataQualityBar diagnostics={normalized.diagnostics} householdCount={households.length} />
    </section>
  );
}
