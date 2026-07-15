import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricValue,
} from "../lib/dashboardVillageData.js";

const THA_PHO_FALLBACK_BOUNDS = Object.freeze([
  [16.69, 100.13],
  [16.88, 100.33],
]);

const THA_PHO_CENTER = Object.freeze([16.77, 100.22]);
const DEFAULT_ZOOM = 12;
const BOUNDARY_CACHE_KEY = "prms-thapho-osm-boundary-v2";

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
    label: "ดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  }),
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

  return (
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude !== 0 &&
    longitude !== 0
  );
}

function normalizePets(rows) {
  return rows.flatMap((row) =>
    (row.pets || [])
      .filter(isValidCoordinate)
      .map((pet) => ({
        ...pet,
        latitude: toNumber(pet.latitude),
        longitude: toNumber(pet.longitude),
        villageNo: Number(row.id),
        villageName: row.villageName || row.name,
      })),
  );
}

function groupHouseholds(pets) {
  const groups = new Map();

  pets.forEach((pet) => {
    const coordinateKey = `${pet.latitude.toFixed(5)},${pet.longitude.toFixed(5)}`;
    const current = groups.get(coordinateKey) || {
      latitude: pet.latitude,
      longitude: pet.longitude,
      pets: [],
      houseNumbers: new Set(),
      villages: new Set(),
    };

    current.pets.push(pet);
    if (pet.houseNo) current.houseNumbers.add(String(pet.houseNo));
    current.villages.add(Number(pet.villageNo));
    groups.set(coordinateKey, current);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    houseNumbers: [...group.houseNumbers],
    villages: [...group.villages],
  }));
}

function clusterCellSize(zoom) {
  if (zoom <= 11) return 0.03;
  if (zoom === 12) return 0.016;
  if (zoom === 13) return 0.009;
  if (zoom === 14) return 0.0045;
  if (zoom === 15) return 0.0022;
  return 0;
}

function clusterHouseholds(households, zoom) {
  const cellSize = clusterCellSize(zoom);
  if (!cellSize) {
    return households.map((item) => ({
      latitude: item.latitude,
      longitude: item.longitude,
      households: [item],
      pets: item.pets,
      villages: item.villages,
    }));
  }

  const clusters = new Map();

  households.forEach((household) => {
    const row = Math.round(household.latitude / cellSize);
    const column = Math.round(household.longitude / cellSize);
    const key = `${row}:${column}`;
    const current = clusters.get(key) || {
      latitudeTotal: 0,
      longitudeTotal: 0,
      count: 0,
      households: [],
      pets: [],
      villages: new Set(),
    };

    current.latitudeTotal += household.latitude;
    current.longitudeTotal += household.longitude;
    current.count += 1;
    current.households.push(household);
    current.pets.push(...household.pets);
    household.villages.forEach((village) => current.villages.add(village));
    clusters.set(key, current);
  });

  return [...clusters.values()].map((cluster) => ({
    latitude: cluster.latitudeTotal / cluster.count,
    longitude: cluster.longitudeTotal / cluster.count,
    households: cluster.households,
    pets: cluster.pets,
    villages: [...cluster.villages],
  }));
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator * 100) / denominator) : 0;
}

function markerTone(cluster, metric) {
  if (metric === "vaccination") {
    const covered = cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length;
    const value = percentage(covered, cluster.pets.length);
    return value >= 75 ? "good" : value >= 50 ? "warning" : "danger";
  }

  if (metric === "sterilization") {
    const covered = cluster.pets.filter((pet) => Boolean(pet.sterilized)).length;
    const value = percentage(covered, cluster.pets.length);
    return value >= 60 ? "good" : value >= 35 ? "warning" : "danger";
  }

  return "primary";
}

function markerHtml(cluster, metric, selectedVillage, hoveredVillage) {
  const tone = markerTone(cluster, metric);
  const selected = selectedVillage && cluster.villages.includes(Number(selectedVillage));
  const hovered = hoveredVillage && cluster.villages.includes(Number(hoveredVillage));
  const classes = [
    "map-cluster-marker",
    `map-cluster-marker--${tone}`,
    selected ? "is-selected" : "",
    hovered ? "is-hovered" : "",
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}">
      <strong>${cluster.pets.length}</strong>
      <small>${cluster.households.length > 1 ? `${cluster.households.length} จุด` : "จุดเลี้ยง"}</small>
    </div>
  `;
}

function popupHtml(cluster) {
  const dogs = cluster.pets.filter((pet) => pet.species === "DOG").length;
  const cats = cluster.pets.filter((pet) => pet.species === "CAT").length;
  const vaccinated = cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length;
  const sterilized = cluster.pets.filter((pet) => Boolean(pet.sterilized)).length;
  const villages = cluster.villages.sort((a, b) => a - b).map((value) => `หมู่ ${value}`).join(", ");
  const houseNumbers = [...new Set(cluster.households.flatMap((item) => item.houseNumbers))];
  const petNames = cluster.pets.slice(0, 5).map((pet) => pet.petName || "ไม่ระบุชื่อ").join(" · ");
  const more = Math.max(0, cluster.pets.length - 5);

  return `
    <div class="map-data-popup">
      <div class="map-data-popup__title">
        <strong>${cluster.households.length > 1 ? "กลุ่มจุดเลี้ยงสัตว์" : "จุดเลี้ยงสัตว์"}</strong>
        <span>${villages || "ไม่ระบุหมู่"}</span>
      </div>
      <div class="map-data-popup__stats">
        <span><small>สัตว์</small><b>${cluster.pets.length} ตัว</b></span>
        <span><small>บ้าน/จุด</small><b>${cluster.households.length}</b></span>
        <span><small>สุนัข / แมว</small><b>${dogs} / ${cats}</b></span>
        <span><small>วัคซีน / ทำหมัน</small><b>${vaccinated} / ${sterilized}</b></span>
      </div>
      <p>${petNames}${more ? ` · อีก ${more} ตัว` : ""}</p>
      ${houseNumbers.length ? `<small>บ้านเลขที่ ${houseNumbers.slice(0, 6).join(", ")}${houseNumbers.length > 6 ? "…" : ""}</small>` : ""}
    </div>
  `;
}

function readBoundaryCache() {
  try {
    const value = window.localStorage.getItem(BOUNDARY_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeBoundaryCache(value) {
  try {
    window.localStorage.setItem(BOUNDARY_CACHE_KEY, JSON.stringify(value));
  } catch {
    // ไม่ให้การบันทึก cache กระทบการแสดงแผนที่
  }
}

async function fetchThaPhoBoundary() {
  const cached = readBoundaryCache();
  if (cached?.geometry) return cached;

  const query = new URLSearchParams({
    format: "geojson",
    polygon_geojson: "1",
    limit: "5",
    countrycodes: "th",
    "accept-language": "th",
    q: "Tha Pho, Mueang Phitsanulok, Phitsanulok, Thailand",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
    headers: { Accept: "application/geo+json, application/json" },
  });

  if (!response.ok) throw new Error("โหลดขอบเขตตำบลไม่สำเร็จ");
  const data = await response.json();
  const feature = (data.features || []).find((item) =>
    ["Polygon", "MultiPolygon"].includes(item?.geometry?.type),
  );

  if (!feature) throw new Error("ไม่พบขอบเขตตำบลจาก OpenStreetMap");
  writeBoundaryCache(feature);
  return feature;
}

function VillageStrip({ rows, selectedVillage, hoveredVillage, onSelect, onHover }) {
  return (
    <div className="map-village-strip" aria-label="เลือกหมู่บ้าน">
      <div className="map-village-strip__label">
        <strong>เลือกหมู่</strong>
        <small>ซูมตามจุดข้อมูลจริง</small>
      </div>
      <div className="map-village-strip__list">
        {rows.map((row) => {
          const active = Number(selectedVillage) === row.id;
          const hovered = Number(hoveredVillage) === row.id;
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
              <b>{row.totalPets.toLocaleString("th-TH")}</b>
            </button>
          );
        })}
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
  const shellRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const boundaryLayerRef = useRef(null);
  const markerLayerRef = useRef(null);

  const [baseMap, setBaseMap] = useState("streets");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [fullscreen, setFullscreen] = useState(false);
  const [boundaryState, setBoundaryState] = useState("loading");
  const [mapMessage, setMapMessage] = useState("");

  const allPets = useMemo(() => normalizePets(rows), [rows]);
  const visiblePets = useMemo(() => {
    if (!selectedVillage) return allPets;
    return allPets.filter((pet) => Number(pet.villageNo) === Number(selectedVillage));
  }, [allPets, selectedVillage]);
  const households = useMemo(() => groupHouseholds(visiblePets), [visiblePets]);
  const clusters = useMemo(() => clusterHouseholds(households, zoom), [households, zoom]);
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;
  const totalPets = rows.reduce((sum, row) => sum + toNumber(row.totalPets), 0);
  const missingCoordinates = Math.max(0, totalPets - allPets.length);

  const fitThaPho = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const boundaryBounds = boundaryLayerRef.current?.getBounds?.();
    if (boundaryBounds?.isValid?.()) {
      map.fitBounds(boundaryBounds, { padding: [24, 24], animate: true, maxZoom: 14 });
      return;
    }

    map.fitBounds(THA_PHO_FALLBACK_BOUNDS, { padding: [24, 24], animate: true, maxZoom: 13 });
  }, []);

  const fitPoints = useCallback((pets = visiblePets) => {
    const map = mapRef.current;
    if (!map || !pets.length) {
      setMapMessage(selectedVillage ? `หมู่ ${selectedVillage} ยังไม่มีพิกัดที่พร้อมแสดง` : "ยังไม่มีพิกัดที่พร้อมแสดงบนแผนที่");
      fitThaPho();
      return;
    }

    setMapMessage("");
    const bounds = L.latLngBounds(pets.map((pet) => [pet.latitude, pet.longitude]));
    map.fitBounds(bounds, {
      padding: [52, 52],
      animate: true,
      maxZoom: pets.length === 1 ? 17 : 16,
    });
  }, [fitThaPho, selectedVillage, visiblePets]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      center: THA_PHO_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 9,
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
    map.fitBounds(THA_PHO_FALLBACK_BOUNDS, { padding: [18, 18], maxZoom: 13 });

    const handleZoom = () => setZoom(map.getZoom());
    map.on("zoomend", handleZoom);

    const container = map.getContainer();
    const handleWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      map.setZoom(clamp(map.getZoom() + direction, map.getMinZoom(), map.getMaxZoom()), { animate: true });
    };
    container.addEventListener("wheel", handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("wheel", handleWheel);
      map.off("zoomend", handleZoom);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    if (!map) return undefined;

    let cancelled = false;
    setBoundaryState("loading");

    fetchThaPhoBoundary()
      .then((feature) => {
        if (cancelled || !mapRef.current) return;
        if (boundaryLayerRef.current) map.removeLayer(boundaryLayerRef.current);

        const layer = L.geoJSON(feature, {
          style: {
            color: "#08724f",
            weight: 3,
            opacity: 0.9,
            fillColor: "#3aa67d",
            fillOpacity: 0.06,
            dashArray: "8 7",
          },
          interactive: false,
        }).addTo(map);

        boundaryLayerRef.current = layer;
        setBoundaryState("ready");
        fitThaPho();
      })
      .catch(() => {
        if (!cancelled) setBoundaryState("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, [fitThaPho]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
    const layer = L.layerGroup();

    clusters.forEach((cluster) => {
      const icon = L.divIcon({
        className: "map-cluster-marker-shell",
        html: markerHtml(cluster, metric, selectedVillage, hoveredVillage),
        iconSize: [52, 52],
        iconAnchor: [26, 26],
        popupAnchor: [0, -22],
      });

      L.marker([cluster.latitude, cluster.longitude], {
        icon,
        keyboard: true,
        riseOnHover: true,
      })
        .bindPopup(popupHtml(cluster), { minWidth: 280, maxWidth: 340 })
        .addTo(layer);
    });

    layer.addTo(map);
    markerLayerRef.current = layer;

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (markerLayerRef.current === layer) markerLayerRef.current = null;
    };
  }, [clusters, hoveredVillage, metric, selectedVillage]);

  useEffect(() => {
    if (!selectedVillage) {
      setMapMessage("");
      return;
    }
    fitPoints(visiblePets);
  }, [selectedVillage, visiblePets, fitPoints]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) document.exitFullscreen?.();
      else if (selectedVillage) onVillageSelect?.(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onVillageSelect, selectedVillage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
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
          <p>จุดบนแผนที่มาจากพิกัดบ้านที่บันทึกจริง และรวมเป็นกลุ่มอัตโนมัติเพื่อลดการซ้อนทับ</p>
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
          <button type="button" onClick={fitThaPho}>ขอบเขตท่าโพธ์</button>
          <button type="button" onClick={() => fitPoints(allPets)} disabled={!allPets.length}>จุดทั้งหมด</button>
          <button type="button" onClick={() => fitPoints(visiblePets)} disabled={!selectedVillage}>หมู่ที่เลือก</button>
          <span />
          <button type="button" onClick={toggleFullscreen}>{fullscreen ? "ออกเต็มจอ" : "เต็มจอ"}</button>
        </div>

        <div className="real-map-data-status">
          <span><b>{allPets.length.toLocaleString("th-TH")}</b> ตัวมีพิกัด</span>
          <span><b>{households.length.toLocaleString("th-TH")}</b> จุดที่กำลังแสดง</span>
          {missingCoordinates ? <span className="is-warning"><b>{missingCoordinates.toLocaleString("th-TH")}</b> ตัวขาดพิกัด</span> : null}
        </div>

        <div className="real-map-usage-hint">ลากเพื่อเลื่อน · ดับเบิลคลิกหรือกด <kbd>Ctrl</kbd> + ล้อเมาส์เพื่อซูม</div>

        {mapMessage ? <div className="real-map-message">{mapMessage}</div> : null}

        <div className={`real-map-boundary-state real-map-boundary-state--${boundaryState}`}>
          {boundaryState === "ready" ? "ขอบเขตตำบลจาก OpenStreetMap" : boundaryState === "loading" ? "กำลังโหลดขอบเขตตำบล" : "ใช้กรอบพื้นที่สำรอง"}
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
