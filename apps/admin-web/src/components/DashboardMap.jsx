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
const STREET_LAYER = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  options: {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  },
};

const SPECIES = {
  ALL: "ทั้งหมด",
  DOG: "สุนัข",
  CAT: "แมว",
};

const HEALTH_FILTERS = {
  ALL: { label: "ทุกสถานะ", className: "" },
  critical: { label: "แดง", className: "is-critical" },
  partial: { label: "ส้ม", className: "is-partial" },
  complete: { label: "เขียว", className: "is-complete" },
};

const METRIC_COLORS = {
  total: ["#e8f3ee", "#187a5a"],
  vaccination: ["#e6f4ef", "#0d8f69"],
  sterilization: ["#f0ebf8", "#7654a6"],
  pending: ["#fff3d9", "#b26b05"],
};

const HEALTH_STATUS = {
  critical: {
    label: "ยังไม่มีทั้งวัคซีนและทำหมัน",
    shortLabel: "ต้องติดตามเร่งด่วน",
    color: "#c63f35",
  },
  partial: {
    label: "มีข้อมูลเพียงอย่างใดอย่างหนึ่ง",
    shortLabel: "ต้องติดตาม",
    color: "#d98813",
  },
  complete: {
    label: "วัคซีนและทำหมันครบ",
    shortLabel: "ข้อมูลเรียบร้อย",
    color: "#16835f",
  },
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

function petHealthStatus(pet) {
  const vaccinated = Boolean(pet.vaccinated);
  const sterilized = Boolean(pet.sterilized);
  if (vaccinated && sterilized) return "complete";
  if (vaccinated || sterilized) return "partial";
  return "critical";
}

function householdHealthStatus(pets) {
  const statuses = pets.map(petHealthStatus);
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("partial")) return "partial";
  return "complete";
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
    healthStatus: householdHealthStatus(item.pets),
  }));
}

function markerIcon(household, selected) {
  const count = household.pets.length;
  const status = household.healthStatus || "critical";
  return L.divIcon({
    className: "v6-household-marker-shell",
    html: `
      <div class="v6-household-marker is-${status} ${selected ? "is-selected" : ""}">
        <span><i></i></span>
        ${count > 1 ? `<b>${count}</b>` : ""}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function householdPopup(household) {
  const dogs = household.pets.filter((pet) => pet.species === "DOG").length;
  const cats = household.pets.filter((pet) => pet.species === "CAT").length;
  const vaccinated = household.pets.filter((pet) => Boolean(pet.vaccinated)).length;
  const sterilized = household.pets.filter((pet) => Boolean(pet.sterilized)).length;
  const critical = household.pets.filter((pet) => petHealthStatus(pet) === "critical").length;
  const partial = household.pets.filter((pet) => petHealthStatus(pet) === "partial").length;
  const complete = household.pets.filter((pet) => petHealthStatus(pet) === "complete").length;
  const status = HEALTH_STATUS[household.healthStatus] || HEALTH_STATUS.critical;
  const names = household.pets
    .map((pet) => escapeHtml(pet.petName || "ไม่ระบุชื่อ"))
    .slice(0, 8)
    .join(" · ");
  const owners = household.ownerNames.map(escapeHtml).join(" · ") || "ไม่ระบุ";

  return `
    <article class="v6-map-popup">
      <header>
        <div>
          <small>จุดเลี้ยงสัตว์จากฐานข้อมูลจริง</small>
          <strong>${household.houseNo ? `บ้านเลขที่ ${escapeHtml(household.houseNo)}` : "จุดเลี้ยงสัตว์เลี้ยง"}</strong>
        </div>
        <span class="is-${household.healthStatus}">${escapeHtml(status.shortLabel)}</span>
      </header>
      <dl>
        <div><dt>เจ้าของ</dt><dd>${owners}</dd></div>
        <div><dt>พื้นที่</dt><dd>หมู่ ${household.villageNo}${household.addressDetail ? ` · ${escapeHtml(household.addressDetail)}` : ""}</dd></div>
        <div><dt>สัตว์เลี้ยง</dt><dd>${household.pets.length} ตัว · สุนัข ${dogs} · แมว ${cats}</dd></div>
        <div><dt>วัคซีน</dt><dd>${vaccinated} จาก ${household.pets.length} ตัว</dd></div>
        <div><dt>ทำหมัน</dt><dd>${sterilized} จาก ${household.pets.length} ตัว</dd></div>
        <div><dt>รายชื่อ</dt><dd>${names || "ไม่ระบุ"}</dd></div>
      </dl>
      <div class="v6-map-popup__status">
        <span class="is-critical">แดง ${critical}</span>
        <span class="is-partial">ส้ม ${partial}</span>
        <span class="is-complete">เขียว ${complete}</span>
      </div>
      ${household.mismatchCount > 0 ? `
        <p class="v6-map-popup__warning">
          มี ${household.mismatchCount} รายการที่หมู่ในทะเบียนไม่ตรงกับพิกัด
        </p>
      ` : ""}
      <footer>
        <a href="#/pets">เปิดทะเบียนสัตว์</a>
        <a href="#/services">เปิดงานสุขภาพ</a>
      </footer>
    </article>
  `;
}

function villageTooltip(row, metric) {
  return `
    <div class="v6-village-tooltip">
      <strong>หมู่ ${row.id}</strong>
      <span>${escapeHtml(row.villageName || row.name || "")}</span>
      <b>${escapeHtml(formatMetricValue(row, metric))}</b>
    </div>
  `;
}

function DataQualityBar({ diagnostics, visibleCount, householdCount, households }) {
  const statusCounts = households.reduce(
    (accumulator, item) => {
      accumulator[item.healthStatus] += 1;
      return accumulator;
    },
    { critical: 0, partial: 0, complete: 0 },
  );

  return (
    <div className="v6-map-footer" aria-label="สรุปคุณภาพข้อมูลแผนที่">
      <div className="v6-map-footer__health">
        <span className="is-critical"><i />ต้องติดตามเร่งด่วน {statusCounts.critical.toLocaleString("th-TH")}</span>
        <span className="is-partial"><i />ต้องติดตาม {statusCounts.partial.toLocaleString("th-TH")}</span>
        <span className="is-complete"><i />เรียบร้อย {statusCounts.complete.toLocaleString("th-TH")}</span>
      </div>
      <div className="v6-map-footer__quality">
        <span>{visibleCount === householdCount
          ? `${householdCount.toLocaleString("th-TH")} จุดพิกัดจริง`
          : `แสดง ${visibleCount.toLocaleString("th-TH")} จาก ${householdCount.toLocaleString("th-TH")} จุด`}
        </span>
        {diagnostics.missingCoordinates > 0 ? <span>{diagnostics.missingCoordinates.toLocaleString("th-TH")} ไม่มีพิกัด</span> : null}
        {diagnostics.outsideBoundary > 0 ? <span className="is-danger">{diagnostics.outsideBoundary.toLocaleString("th-TH")} นอกเขต</span> : null}
        {diagnostics.villageMismatch > 0 ? <span className="is-warning">{diagnostics.villageMismatch.toLocaleString("th-TH")} หมู่ไม่ตรง</span> : null}
      </div>
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
  const [species, setSpecies] = useState("ALL");
  const [healthFilter, setHealthFilter] = useState("ALL");
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
  const visibleHouseholds = useMemo(() => (
    healthFilter === "ALL"
      ? households
      : households.filter((household) => household.healthStatus === healthFilter)
  ), [healthFilter, households]);

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
    baseLayerRef.current = L.tileLayer(STREET_LAYER.url, STREET_LAYER.options).addTo(map);
    baseLayerRef.current.bringToBack();
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
      baseLayerRef.current = null;
    };
  }, [applyMunicipalityLimits]);

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
          fillOpacity: dimmed ? 0.12 : active ? 0.48 : 0.25,
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
          className: "v6-village-tooltip-shell",
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

    visibleHouseholds.forEach((household) => {
      const marker = L.marker([household.latitude, household.longitude], {
        icon: markerIcon(household, Boolean(selectedVillage)),
        keyboard: true,
        title: `${HEALTH_STATUS[household.healthStatus].shortLabel} · ${household.houseNo ? `บ้านเลขที่ ${household.houseNo}` : "จุดเลี้ยงสัตว์เลี้ยง"}`,
      });
      marker.bindPopup(householdPopup(household), {
        className: "v6-map-popup-shell",
        maxWidth: 390,
        minWidth: 300,
      });
      marker.addTo(layerGroup);
    });

    markerLayerRef.current = layerGroup.addTo(map);
  }, [selectedVillage, visibleHouseholds]);

  useEffect(() => {
    window.requestAnimationFrame(() => applyMunicipalityLimits(false));
  }, [applyMunicipalityLimits, fullscreen]);

  const selectedLabel = selectedVillage ? `หมู่ ${selectedVillage}` : "ทุกหมู่บ้าน";
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  return (
    <section className={`v6-map-card ${fullscreen ? "is-fullscreen" : ""}`}>
      <header className="v6-map-card__header">
        <div>
          <span>แผนที่ปฏิบัติการ</span>
          <h2>สถานะสุขภาพสัตว์เลี้ยงรายจุด</h2>
          <p>สีหมุดแสดงสถานะวัคซีนและการทำหมันของสัตว์ในแต่ละหลังคาเรือน</p>
        </div>
        <div className="v6-map-scope">
          <small>พื้นที่ที่แสดง</small>
          <strong>{selectedLabel}</strong>
        </div>
      </header>

      <div className="v6-map-toolbar" aria-label="ตัวกรองแผนที่">
        <label>
          <span>สีพื้นที่</span>
          <select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>
            {Object.values(DASHBOARD_METRICS).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>

        <div className="v6-segmented" aria-label="กรองชนิดสัตว์เลี้ยง">
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

        <div className="v7-map-health-filter" aria-label="กรองสถานะสุขภาพ">
          {Object.entries(HEALTH_FILTERS).map(([value, item]) => (
            <button
              type="button"
              key={value}
              className={`${healthFilter === value ? "is-active" : ""} ${item.className}`}
              onClick={() => setHealthFilter(value)}
              aria-pressed={healthFilter === value}
            >
              {value !== "ALL" ? <i /> : null}
              {item.label}
            </button>
          ))}
        </div>

        <div className="v6-map-actions">
          <button type="button" onClick={fitMunicipality}>ดูทั้งเขต</button>
          <button type="button" onClick={() => setFullscreen((value) => !value)}>
            {fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
          </button>
        </div>
      </div>

      <div className="v6-map-stage">
        <div ref={mapElementRef} className="v6-map-canvas" />
        {!visibleHouseholds.length ? (
          <div className="v6-map-empty">
            <strong>ไม่พบจุดพิกัดในตัวกรองนี้</strong>
            <span>รายการที่ไม่มี latitude และ longitude จะไม่ถูกสร้างเป็นหมุดจำลอง</span>
          </div>
        ) : null}
        <div className="v6-map-legend" aria-label="คำอธิบายสีหมุด">
          <strong>สถานะสุขภาพ</strong>
          <span className="is-critical"><i />แดง — ไม่มีทั้งวัคซีนและทำหมัน</span>
          <span className="is-partial"><i />ส้ม — มีข้อมูลเพียงอย่างใดอย่างหนึ่ง</span>
          <span className="is-complete"><i />เขียว — ข้อมูลครบทั้งสองอย่าง</span>
          <small>สีพื้นที่: {metricInfo.label}</small>
        </div>
      </div>

      <DataQualityBar
        diagnostics={normalized.diagnostics}
        visibleCount={visibleHouseholds.length}
        householdCount={households.length}
        households={households}
      />
    </section>
  );
}
