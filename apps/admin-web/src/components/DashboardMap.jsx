import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import villagesGeoJsonText from "../assets/maps/tha-pho-villages.geojson?raw";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricValue,
} from "../lib/dashboardVillageData.js";
import {
  createVillageIndex,
  getVillageLabelPoint,
  normalizePetsToVillages,
  pointInGeometry,
} from "../lib/geoVillageUtils.js";

const THA_PHO_CENTER = [16.755, 100.207];
const DEFAULT_ZOOM = 12;
const VILLAGES_GEOJSON = JSON.parse(villagesGeoJsonText);
const VILLAGE_INDEX = createVillageIndex(VILLAGES_GEOJSON);

const BASE_LAYERS = {
  streets: {
    label: "แผนที่ถนน",
    shortLabel: "ถนน",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  satellite: {
    label: "ภาพถ่ายดาวเทียม",
    shortLabel: "ดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

const SPECIES_FILTERS = {
  ALL: { label: "ทั้งหมด", shortLabel: "ทั้งหมด" },
  DOG: { label: "เฉพาะสุนัข", shortLabel: "สุนัข" },
  CAT: { label: "เฉพาะแมว", shortLabel: "แมว" },
};

const COLOR_RAMPS = {
  total: ["#e8f5ef", "#73c6a5", "#08724f"],
  vaccination: ["#fde7e4", "#f0c35d", "#15956f"],
  sterilization: ["#efe8f8", "#b493da", "#7250ad"],
  pending: ["#fff4da", "#e9b34f", "#ad6c09"],
  cases: ["#fde6e3", "#e78075", "#b83c34"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator * 100) / denominator) : 0;
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
  const values = from.map((channel, index) => (
    Math.round(channel + ((to[index] - channel) * ratio))
  ));
  return `#${values.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getFill(row, metric, maximum) {
  const ramp = COLOR_RAMPS[metric] || COLOR_RAMPS.total;
  const value = getMetricValue(row, metric);
  const ratio = metric === "vaccination" || metric === "sterilization"
    ? clamp(value / 100, 0, 1)
    : clamp(value / Math.max(1, maximum), 0, 1);

  return ratio <= 0.5
    ? interpolateColor(ramp[0], ramp[1], ratio * 2)
    : interpolateColor(ramp[1], ramp[2], (ratio - 0.5) * 2);
}

function getHouseholdKey(pet) {
  return [
    pet.villageNo,
    pet.householdId || "",
    pet.houseNo || "",
    pet.ownerName || "",
    Number(pet.latitude).toFixed(6),
    Number(pet.longitude).toFixed(6),
  ].join("|");
}

function groupHouseholds(pets) {
  const groups = new Map();

  pets.forEach((pet) => {
    const key = getHouseholdKey(pet);
    const item = groups.get(key) || {
      key,
      latitude: pet.latitude,
      longitude: pet.longitude,
      villageNo: Number(pet.villageNo),
      pets: [],
      houseNumbers: new Set(),
      ownerNames: new Set(),
      coordinateStatuses: new Set(),
    };

    item.pets.push(pet);
    if (pet.houseNo) item.houseNumbers.add(String(pet.houseNo));
    if (pet.ownerName) item.ownerNames.add(String(pet.ownerName));
    item.coordinateStatuses.add(pet.coordinateStatus);
    groups.set(key, item);
  });

  return [...groups.values()].map((item) => {
    const coordinateStatuses = [...item.coordinateStatuses];

    return {
      ...item,
      houseNumbers: [...item.houseNumbers],
      ownerNames: [...item.ownerNames],
      coordinateStatuses,
      hasCoordinateMismatch: coordinateStatuses.includes("mismatch"),
    };
  });
}

function clusterSize(zoom) {
  if (zoom <= 11) return 0.012;
  if (zoom === 12) return 0.006;
  if (zoom === 13) return 0.003;
  if (zoom === 14) return 0.0015;
  if (zoom === 15) return 0.00072;
  return 0;
}

function squaredDistance(first, second) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2;
}

function resolveClusterCenter(cluster) {
  const average = [
    cluster.longitudeTotal / cluster.count,
    cluster.latitudeTotal / cluster.count,
  ];
  const feature = VILLAGE_INDEX.get(Number(cluster.villageNo));

  if (feature && pointInGeometry(average, feature.geometry)) {
    return { longitude: average[0], latitude: average[1] };
  }

  const nearest = [...cluster.households].sort((first, second) => (
    squaredDistance([first.longitude, first.latitude], average)
      - squaredDistance([second.longitude, second.latitude], average)
  ))[0];

  return {
    latitude: nearest?.latitude ?? average[1],
    longitude: nearest?.longitude ?? average[0],
  };
}

function clusterHouseholds(households, zoom) {
  const size = clusterSize(zoom);
  if (!size) {
    return households.map((item) => ({
      ...item,
      households: [item],
      hasCoordinateMismatch: item.hasCoordinateMismatch,
    }));
  }

  const groups = new Map();
  households.forEach((item) => {
    const key = [
      item.villageNo,
      Math.round(item.latitude / size),
      Math.round(item.longitude / size),
    ].join(":");
    const cluster = groups.get(key) || {
      villageNo: item.villageNo,
      latitudeTotal: 0,
      longitudeTotal: 0,
      count: 0,
      households: [],
      pets: [],
      hasCoordinateMismatch: false,
    };

    cluster.latitudeTotal += item.latitude;
    cluster.longitudeTotal += item.longitude;
    cluster.count += 1;
    cluster.households.push(item);
    cluster.pets.push(...item.pets);
    cluster.hasCoordinateMismatch = cluster.hasCoordinateMismatch || item.hasCoordinateMismatch;
    groups.set(key, cluster);
  });

  return [...groups.values()].map((cluster) => ({
    ...cluster,
    ...resolveClusterCenter(cluster),
  }));
}

function markerTone(cluster, metric) {
  if (metric === "vaccination") {
    const value = percent(
      cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length,
      cluster.pets.length,
    );
    return value >= 75 ? "good" : value >= 50 ? "warning" : "danger";
  }
  if (metric === "sterilization") {
    const value = percent(
      cluster.pets.filter((pet) => Boolean(pet.sterilized)).length,
      cluster.pets.length,
    );
    return value >= 60 ? "good" : value >= 35 ? "warning" : "danger";
  }
  if (metric === "pending") return "warning";
  if (metric === "cases") return "danger";
  return "primary";
}

function markerHtml(cluster, metric, selectedVillage, hoveredVillage) {
  const selected = Number(selectedVillage) === Number(cluster.villageNo);
  const hovered = Number(hoveredVillage) === Number(cluster.villageNo);
  const clustered = cluster.households.length > 1;
  const detail = clustered
    ? `${cluster.households.length} จุด`
    : cluster.pets.length > 1
      ? `${cluster.pets.length} ตัว`
      : "1 ตัว";

  return `
    <div class="map-cluster-marker map-cluster-marker--${markerTone(cluster, metric)} ${selected ? "is-selected" : ""} ${hovered ? "is-hovered" : ""} ${cluster.hasCoordinateMismatch ? "has-coordinate-warning" : ""}">
      <strong>${cluster.pets.length}</strong>
      <small>${detail}</small>
    </div>
  `;
}

function popupHtml(cluster) {
  const dogs = cluster.pets.filter((pet) => pet.species === "DOG").length;
  const cats = cluster.pets.filter((pet) => pet.species === "CAT").length;
  const vaccinated = cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length;
  const sterilized = cluster.pets.filter((pet) => Boolean(pet.sterilized)).length;
  const petNames = cluster.pets
    .slice(0, 5)
    .map((pet) => escapeHtml(pet.petName || "ไม่ระบุชื่อ"))
    .join(" · ");
  const more = Math.max(0, cluster.pets.length - 5);
  const owners = [...new Set(cluster.households.flatMap((item) => item.ownerNames))]
    .slice(0, 2)
    .map(escapeHtml)
    .join(" · ");
  const houses = [...new Set(cluster.households.flatMap((item) => item.houseNumbers))]
    .slice(0, 3)
    .map(escapeHtml)
    .join(", ");
  const mismatchedPets = cluster.pets.filter((pet) => pet.coordinateStatus === "mismatch");
  const coordinateMessage = mismatchedPets.length
    ? `พบ ${mismatchedPets.length} รายการที่พิกัดจริงอยู่หมู่ ${cluster.villageNo} แต่ข้อมูลทะเบียนระบุหมู่อื่น โปรดตรวจสอบข้อมูลเจ้าของ/ครัวเรือน`
    : "ตำแหน่งนี้ใช้พิกัดที่บันทึกจริงและอยู่ภายในขอบเขตหมู่";
  const coordinateClass = mismatchedPets.length ? "is-warning" : "is-verified";
  const coordinateLabel = mismatchedPets.length ? "ต้องตรวจสอบหมู่" : "พิกัดจริง";
  const coordinateText = cluster.households.length === 1
    ? `${Number(cluster.latitude).toFixed(6)}, ${Number(cluster.longitude).toFixed(6)}`
    : `${cluster.households.length} จุดพิกัดจริง`;

  return `
    <div class="map-data-popup">
      <div class="map-data-popup__title">
        <div>
          <small>หมู่ ${cluster.villageNo}</small>
          <strong>${cluster.households.length > 1 ? "กลุ่มจุดเลี้ยงสัตว์" : "จุดเลี้ยงสัตว์"}</strong>
        </div>
        <span class="${mismatchedPets.length ? "is-warning" : ""}">${coordinateLabel}</span>
      </div>
      <div class="map-data-popup__stats">
        <span><small>สัตว์</small><b>${cluster.pets.length} ตัว</b></span>
        <span><small>บ้าน/จุด</small><b>${cluster.households.length}</b></span>
        <span><small>สุนัข / แมว</small><b>${dogs} / ${cats}</b></span>
        <span><small>วัคซีน / ทำหมัน</small><b>${vaccinated} / ${sterilized}</b></span>
      </div>
      ${houses ? `<p><b>บ้านเลขที่:</b> ${houses}</p>` : ""}
      ${owners ? `<p><b>เจ้าของ:</b> ${owners}</p>` : ""}
      <p><b>สัตว์:</b> ${petNames}${more ? ` · อีก ${more} ตัว` : ""}</p>
      <p><b>พิกัด:</b> ${coordinateText}</p>
      <div class="map-data-popup__coordinate ${coordinateClass}">${coordinateMessage}</div>
    </div>
  `;
}

function villageTooltipHtml(row, metric, feature) {
  const areaSqKm = Number(feature?.properties?.areaSqKm || 0);
  return `
    <div class="map-village-tooltip">
      <div><strong>หมู่ ${row.id}</strong><span>${escapeHtml(row.villageName || row.name || "")}</span></div>
      <b>${escapeHtml(DASHBOARD_METRICS[metric]?.label || "ข้อมูล")}: ${escapeHtml(formatMetricValue(row, metric))}</b>
      <small>สัตว์ ${toNumber(row.totalPets).toLocaleString("th-TH")} ตัว · สุนัข ${toNumber(row.dogs).toLocaleString("th-TH")} · แมว ${toNumber(row.cats).toLocaleString("th-TH")}</small>
      ${areaSqKm ? `<em>พื้นที่ประมาณ ${areaSqKm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.กม.</em>` : ""}
    </div>
  `;
}

function VillageStrip({ rows, selectedVillage, hoveredVillage, onSelect, onHover }) {
  return (
    <div className="map-village-strip" aria-label="เลือกหมู่บ้าน">
      <div className="map-village-strip__label">
        <strong>เลือกหมู่</strong>
        <small>เลือกเพื่อซูมและกรองข้อมูล</small>
      </div>
      <div className="map-village-strip__list">
        {rows.map((row) => {
          const active = Number(selectedVillage) === Number(row.id);
          const hovered = Number(hoveredVillage) === Number(row.id);
          return (
            <button
              type="button"
              key={row.id}
              className={`${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""}`}
              onMouseEnter={() => onHover?.(row.id)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(row.id)}
              onBlur={() => onHover?.(null)}
              onClick={() => onSelect?.(active ? null : row.id)}
              aria-pressed={active}
            >
              <span>หมู่ {row.id}</span>
              <b>{Number(row.totalPets || 0).toLocaleString("th-TH")}</b>
              <small>ตัว</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataQualityStatus({ diagnostics, missingMapRecords, householdCount }) {
  const unavailable = diagnostics.missingCoordinates + diagnostics.outsideBoundary + missingMapRecords;

  return (
    <div className="real-map-data-status" aria-label="สถานะข้อมูลพิกัด">
      <span className="is-primary"><b>{diagnostics.renderedPets.toLocaleString("th-TH")}</b> ตัวบนแผนที่</span>
      <span><b>{householdCount.toLocaleString("th-TH")}</b> จุดเลี้ยงจริง</span>
      <span className="is-verified"><b>{diagnostics.verified.toLocaleString("th-TH")}</b> พิกัดตรงหมู่</span>
      {diagnostics.villageMismatch > 0 ? (
        <span className="is-warning" title="แสดงที่ตำแหน่งพิกัดจริง แต่หมู่จากพิกัดไม่ตรงกับหมู่ในทะเบียน">
          <b>{diagnostics.villageMismatch.toLocaleString("th-TH")}</b> หมู่ไม่ตรงทะเบียน
        </span>
      ) : null}
      {unavailable > 0 ? (
        <span
          className="is-danger"
          title={`ไม่มีพิกัด ${diagnostics.missingCoordinates} · อยู่นอกเขตตำบล ${diagnostics.outsideBoundary} · ไม่มีรายการจาก API ${missingMapRecords}`}
        >
          <b>{unavailable.toLocaleString("th-TH")}</b> รายการไม่แสดง
        </span>
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
  const shellRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const villageLayerRef = useRef(null);
  const labelLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const villageLayersRef = useRef(new Map());

  const [baseMap, setBaseMap] = useState("streets");
  const [species, setSpecies] = useState("ALL");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showVillages, setShowVillages] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
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
  const households = useMemo(() => groupHouseholds(filteredPets), [filteredPets]);
  const clusters = useMemo(() => clusterHouseholds(households, zoom), [households, zoom]);
  const totalPets = rows.reduce((sum, row) => sum + toNumber(row.totalPets), 0);
  const missingMapRecords = Math.max(0, totalPets - normalized.diagnostics.sourcePets);

  const fitAllVillages = useCallback(() => {
    const bounds = villageLayerRef.current?.getBounds?.();
    if (bounds?.isValid?.()) {
      mapRef.current?.fitBounds(bounds, {
        padding: [28, 28],
        maxZoom: 14,
        animate: true,
      });
    }
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      center: THA_PHO_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      preferCanvas: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    const handleZoom = () => setZoom(map.getZoom());
    map.on("zoomend", handleZoom);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapElementRef.current);

    return () => {
      observer.disconnect();
      map.off("zoomend", handleZoom);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    if (!map) return undefined;

    if (villageLayerRef.current) map.removeLayer(villageLayerRef.current);
    if (labelLayerRef.current) map.removeLayer(labelLayerRef.current);
    villageLayersRef.current.clear();

    const maximum = Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));
    const rowsByVillage = new Map(rows.map((row) => [Number(row.id), row]));
    const labelLayer = L.layerGroup();

    const layer = L.geoJSON(VILLAGES_GEOJSON, {
      style(feature) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || {
          id: villageNo,
          totalPets: 0,
          dogs: 0,
          cats: 0,
        };
        const active = Number(selectedVillage) === villageNo;
        const hovered = Number(hoveredVillage) === villageNo;
        const dimmed = selectedVillage && !active;

        return {
          color: active ? "#07543d" : hovered ? "#08724f" : "#315f51",
          weight: active ? 3.1 : hovered ? 2.3 : 1.15,
          opacity: dimmed ? 0.55 : 0.96,
          fillColor: getFill(row, metric, maximum),
          fillOpacity: active ? 0.56 : hovered ? 0.45 : dimmed ? 0.15 : 0.31,
          lineJoin: "round",
        };
      },
      onEachFeature(feature, featureLayer) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || {
          id: villageNo,
          totalPets: 0,
          dogs: 0,
          cats: 0,
        };
        const active = Number(selectedVillage) === villageNo;
        const hovered = Number(hoveredVillage) === villageNo;
        villageLayersRef.current.set(villageNo, featureLayer);

        featureLayer.bindTooltip(villageTooltipHtml(row, metric, feature), {
          sticky: true,
          className: "map-village-tooltip-shell",
          opacity: 1,
          direction: "top",
        });
        featureLayer.on({
          mouseover: () => onVillageHover?.(villageNo),
          mouseout: () => onVillageHover?.(null),
          click: () => onVillageSelect?.(active ? null : villageNo),
        });

        const labelPoint = getVillageLabelPoint(feature);
        if (labelPoint) {
          const labelIcon = L.divIcon({
            className: "map-village-number-shell",
            html: `<button type="button" class="map-village-number ${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""}" aria-label="หมู่ ${villageNo}"><span>${villageNo}</span><small>${toNumber(row.totalPets).toLocaleString("th-TH")}</small></button>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          });
          const labelMarker = L.marker([labelPoint[1], labelPoint[0]], {
            icon: labelIcon,
            keyboard: true,
            riseOnHover: true,
            zIndexOffset: active ? 900 : 500,
          });
          labelMarker.on({
            mouseover: () => onVillageHover?.(villageNo),
            mouseout: () => onVillageHover?.(null),
            click: () => onVillageSelect?.(active ? null : villageNo),
          });
          labelMarker.addTo(labelLayer);
        }
      },
    });

    villageLayerRef.current = layer;
    labelLayerRef.current = labelLayer;

    if (showVillages) layer.addTo(map);
    if (showVillages && showLabels) labelLayer.addTo(map);

    if (!map._prmsBoundaryFitted) {
      map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 14 });
      map._prmsBoundaryFitted = true;
    }

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
    };
  }, [hoveredVillage, metric, onVillageHover, onVillageSelect, rows, selectedVillage, showLabels, showVillages]);

  useEffect(() => {
    const map = mapRef.current;
    const villageLayer = villageLayerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!map || !villageLayer || !labelLayer) return;

    if (showVillages && !map.hasLayer(villageLayer)) villageLayer.addTo(map);
    if (!showVillages && map.hasLayer(villageLayer)) map.removeLayer(villageLayer);

    if (showVillages && showLabels && !map.hasLayer(labelLayer)) labelLayer.addTo(map);
    if ((!showVillages || !showLabels) && map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
  }, [showLabels, showVillages]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
    const layer = L.layerGroup();

    if (showPoints) {
      clusters.forEach((cluster) => {
        const icon = L.divIcon({
          className: "map-cluster-marker-shell",
          html: markerHtml(cluster, metric, selectedVillage, hoveredVillage),
          iconSize: [46, 46],
          iconAnchor: [23, 23],
          popupAnchor: [0, -20],
        });

        L.marker([cluster.latitude, cluster.longitude], {
          icon,
          keyboard: true,
          riseOnHover: true,
          zIndexOffset: 1000,
        })
          .bindPopup(popupHtml(cluster), { minWidth: 290, maxWidth: 360 })
          .addTo(layer);
      });
      layer.addTo(map);
    }

    markerLayerRef.current = layer;
    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (markerLayerRef.current === layer) markerLayerRef.current = null;
    };
  }, [clusters, hoveredVillage, metric, selectedVillage, showPoints]);

  useEffect(() => {
    if (!selectedVillage) {
      fitAllVillages();
      return;
    }

    const layer = villageLayersRef.current.get(Number(selectedVillage));
    const bounds = layer?.getBounds?.();
    if (bounds?.isValid?.()) {
      mapRef.current?.fitBounds(bounds, {
        padding: [52, 52],
        maxZoom: 16,
        animate: true,
      });
    }
  }, [fitAllVillages, selectedVillage]);

  useEffect(() => {
    const handleFullscreen = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await shellRef.current?.requestFullscreen?.();
  };

  return (
    <section className="real-map-card" ref={shellRef}>
      <header className="real-map-card__head">
        <div className="real-map-card__title">
          <small>ข้อมูลเชิงพื้นที่</small>
          <h2>ตำแหน่งสัตว์และขอบเขตหมู่ท่าโพธ์</h2>
          <p>แสดงเฉพาะพิกัดที่บันทึกจริง พร้อมตรวจสอบหมู่จาก Polygon QGIS โดยไม่สร้างหรือย้ายจุดอัตโนมัติ</p>
        </div>

        <div className="real-map-card__head-tools">
          <label className="real-map-select">
            <span>ชั้นข้อมูล</span>
            <select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>
              {Object.values(DASHBOARD_METRICS).map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <div className="real-map-segment" aria-label="รูปแบบแผนที่">
            {Object.entries(BASE_LAYERS).map(([id, item]) => (
              <button
                type="button"
                key={id}
                className={baseMap === id ? "is-active" : ""}
                onClick={() => setBaseMap(id)}
                title={item.label}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="real-map-stage">
        <div ref={mapElementRef} className="real-leaflet-map" />

        <div className="real-map-toolbar" aria-label="เครื่องมือแผนที่">
          <button type="button" onClick={fitAllVillages}>ดูทั้งตำบล</button>
          <button
            type="button"
            className={showVillages ? "is-active" : ""}
            onClick={() => setShowVillages((value) => !value)}
          >
            แนวเขตหมู่
          </button>
          <button
            type="button"
            className={showLabels ? "is-active" : ""}
            onClick={() => setShowLabels((value) => !value)}
            disabled={!showVillages}
          >
            เลขหมู่
          </button>
          <button
            type="button"
            className={showPoints ? "is-active" : ""}
            onClick={() => setShowPoints((value) => !value)}
          >
            จุดสัตว์
          </button>
          <span />
          <button type="button" onClick={toggleFullscreen}>
            {fullscreen ? "ออกเต็มจอ" : "เต็มจอ"}
          </button>
        </div>

        <div className="real-map-species" aria-label="กรองชนิดสัตว์">
          {Object.entries(SPECIES_FILTERS).map(([id, item]) => (
            <button
              type="button"
              key={id}
              className={species === id ? "is-active" : ""}
              onClick={() => setSpecies(id)}
              title={item.label}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>

        <DataQualityStatus
          diagnostics={normalized.diagnostics}
          missingMapRecords={missingMapRecords}
          householdCount={households.length}
        />

        <div className="real-map-usage-hint">
          ลากเพื่อเลื่อน · ดับเบิลคลิกเพื่อซูม · คลิกหมู่เพื่อกรอง
        </div>

        <div className="real-map-legend" aria-label="คำอธิบายสี">
          <span><i className="low" />น้อย</span>
          <span><i className="medium" />ปานกลาง</span>
          <span><i className="high" />มาก</span>
          <em>{DASHBOARD_METRICS[metric]?.label}</em>
        </div>
      </div>

      <VillageStrip
        rows={rows}
        selectedVillage={selectedVillage}
        hoveredVillage={hoveredVillage}
        onSelect={onVillageSelect}
        onHover={onVillageHover}
      />
    </section>
  );
}
