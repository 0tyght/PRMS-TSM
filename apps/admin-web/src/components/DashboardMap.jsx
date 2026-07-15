import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import villagesGeoJsonText from "../assets/maps/tha-pho-villages.geojson?raw";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricValue,
} from "../lib/dashboardVillageData.js";

const THA_PHO_CENTER = [16.755, 100.207];
const DEFAULT_ZOOM = 12;
const VILLAGES_GEOJSON = JSON.parse(villagesGeoJsonText);

const BASE_LAYERS = {
  streets: {
    label: "แผนที่ถนน",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" },
  },
  satellite: {
    label: "ดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "Tiles &copy; Esri" },
  },
};

const COLOR_RAMPS = {
  total: ["#e6f4ee", "#8bd2b8", "#08724f"],
  vaccination: ["#f7d8d4", "#efc76b", "#15956f"],
  sterilization: ["#eee5f9", "#b99bde", "#7553ba"],
  pending: ["#fff3d6", "#e7ae48", "#ad6c09"],
  cases: ["#fbe0dd", "#e68479", "#b83c34"],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function toNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function percent(a, b) { return b ? Math.round((a * 100) / b) : 0; }

function interpolateColor(start, end, ratio) {
  const parse = (hex) => {
    const clean = hex.replace("#", "");
    return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16));
  };
  const from = parse(start);
  const to = parse(end);
  const values = from.map((channel, index) => Math.round(channel + ((to[index] - channel) * ratio)));
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

function isValidCoordinate(item) {
  const latitude = toNumber(item?.latitude);
  const longitude = toNumber(item?.longitude);
  return latitude !== 0 && longitude !== 0 && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function normalizePets(rows) {
  return rows.flatMap((row) => (row.pets || []).filter(isValidCoordinate).map((pet) => ({
    ...pet,
    latitude: toNumber(pet.latitude),
    longitude: toNumber(pet.longitude),
    villageNo: Number(row.id),
  })));
}

function groupHouseholds(pets) {
  const groups = new Map();
  pets.forEach((pet) => {
    const key = `${pet.latitude.toFixed(5)},${pet.longitude.toFixed(5)}`;
    const item = groups.get(key) || {
      latitude: pet.latitude,
      longitude: pet.longitude,
      pets: [],
      villages: new Set(),
      houseNumbers: new Set(),
    };
    item.pets.push(pet);
    item.villages.add(Number(pet.villageNo));
    if (pet.houseNo) item.houseNumbers.add(String(pet.houseNo));
    groups.set(key, item);
  });
  return [...groups.values()].map((item) => ({
    ...item,
    villages: [...item.villages],
    houseNumbers: [...item.houseNumbers],
  }));
}

function clusterSize(zoom) {
  if (zoom <= 11) return 0.018;
  if (zoom === 12) return 0.009;
  if (zoom === 13) return 0.0045;
  if (zoom === 14) return 0.0022;
  if (zoom === 15) return 0.001;
  return 0;
}

function clusterHouseholds(households, zoom) {
  const size = clusterSize(zoom);
  if (!size) return households.map((item) => ({ ...item, households: [item] }));
  const groups = new Map();
  households.forEach((item) => {
    const key = `${Math.round(item.latitude / size)}:${Math.round(item.longitude / size)}`;
    const cluster = groups.get(key) || {
      latitudeTotal: 0,
      longitudeTotal: 0,
      count: 0,
      households: [],
      pets: [],
      villages: new Set(),
    };
    cluster.latitudeTotal += item.latitude;
    cluster.longitudeTotal += item.longitude;
    cluster.count += 1;
    cluster.households.push(item);
    cluster.pets.push(...item.pets);
    item.villages.forEach((village) => cluster.villages.add(village));
    groups.set(key, cluster);
  });
  return [...groups.values()].map((cluster) => ({
    latitude: cluster.latitudeTotal / cluster.count,
    longitude: cluster.longitudeTotal / cluster.count,
    households: cluster.households,
    pets: cluster.pets,
    villages: [...cluster.villages],
  }));
}

function markerTone(cluster, metric) {
  if (metric === "vaccination") {
    const value = percent(cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length, cluster.pets.length);
    return value >= 75 ? "good" : value >= 50 ? "warning" : "danger";
  }
  if (metric === "sterilization") {
    const value = percent(cluster.pets.filter((pet) => Boolean(pet.sterilized)).length, cluster.pets.length);
    return value >= 60 ? "good" : value >= 35 ? "warning" : "danger";
  }
  return "primary";
}

function markerHtml(cluster, metric, selectedVillage, hoveredVillage) {
  const selected = selectedVillage && cluster.villages.includes(Number(selectedVillage));
  const hovered = hoveredVillage && cluster.villages.includes(Number(hoveredVillage));
  return `<div class="map-cluster-marker map-cluster-marker--${markerTone(cluster, metric)} ${selected ? "is-selected" : ""} ${hovered ? "is-hovered" : ""}"><strong>${cluster.pets.length}</strong><small>${cluster.households.length > 1 ? `${cluster.households.length} จุด` : "จุดเลี้ยง"}</small></div>`;
}

function popupHtml(cluster) {
  const dogs = cluster.pets.filter((pet) => pet.species === "DOG").length;
  const cats = cluster.pets.filter((pet) => pet.species === "CAT").length;
  const vaccinated = cluster.pets.filter((pet) => Boolean(pet.vaccinated)).length;
  const sterilized = cluster.pets.filter((pet) => Boolean(pet.sterilized)).length;
  const villages = [...cluster.villages].sort((a, b) => a - b).map((village) => `หมู่ ${village}`).join(", ");
  const petNames = cluster.pets.slice(0, 5).map((pet) => pet.petName || "ไม่ระบุชื่อ").join(" · ");
  const more = Math.max(0, cluster.pets.length - 5);
  return `<div class="map-data-popup"><div class="map-data-popup__title"><strong>${cluster.households.length > 1 ? "กลุ่มจุดเลี้ยงสัตว์" : "จุดเลี้ยงสัตว์"}</strong><span>${villages || "ไม่ระบุหมู่"}</span></div><div class="map-data-popup__stats"><span><small>สัตว์</small><b>${cluster.pets.length} ตัว</b></span><span><small>บ้าน/จุด</small><b>${cluster.households.length}</b></span><span><small>สุนัข / แมว</small><b>${dogs} / ${cats}</b></span><span><small>วัคซีน / ทำหมัน</small><b>${vaccinated} / ${sterilized}</b></span></div><p>${petNames}${more ? ` · อีก ${more} ตัว` : ""}</p></div>`;
}

function VillageStrip({ rows, selectedVillage, hoveredVillage, onSelect, onHover }) {
  return (
    <div className="map-village-strip" aria-label="เลือกหมู่บ้าน">
      <div className="map-village-strip__label"><strong>เลือกหมู่</strong><small>คลิกเพื่อซูมตาม Polygon</small></div>
      <div className="map-village-strip__list">
        {rows.map((row) => {
          const active = Number(selectedVillage) === Number(row.id);
          const hovered = Number(hoveredVillage) === Number(row.id);
          return <button type="button" key={row.id} className={`${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""}`} onMouseEnter={() => onHover?.(row.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(row.id)} onBlur={() => onHover?.(null)} onClick={() => onSelect?.(active ? null : row.id)}><span>หมู่ {row.id}</span><b>{Number(row.totalPets || 0).toLocaleString("th-TH")}</b></button>;
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
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const villageLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const villageLayersRef = useRef(new Map());

  const [baseMap, setBaseMap] = useState("streets");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showVillages, setShowVillages] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const allPets = useMemo(() => normalizePets(rows), [rows]);
  const visiblePets = useMemo(() => selectedVillage
    ? allPets.filter((pet) => Number(pet.villageNo) === Number(selectedVillage))
    : allPets, [allPets, selectedVillage]);
  const households = useMemo(() => groupHouseholds(visiblePets), [visiblePets]);
  const clusters = useMemo(() => clusterHouseholds(households, zoom), [households, zoom]);
  const totalPets = rows.reduce((sum, row) => sum + toNumber(row.totalPets), 0);
  const missingCoordinates = Math.max(0, totalPets - allPets.length);

  const fitAllVillages = useCallback(() => {
    const bounds = villageLayerRef.current?.getBounds?.();
    if (bounds?.isValid?.()) mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 14, animate: true });
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
    if (!map) return;
    if (villageLayerRef.current) map.removeLayer(villageLayerRef.current);
    villageLayersRef.current.clear();
    const maximum = Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));
    const rowsByVillage = new Map(rows.map((row) => [Number(row.id), row]));

    const layer = L.geoJSON(VILLAGES_GEOJSON, {
      style(feature) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || { id: villageNo, totalPets: 0, dogs: 0, cats: 0 };
        const active = Number(selectedVillage) === villageNo;
        const hovered = Number(hoveredVillage) === villageNo;
        return {
          color: active ? "#064a37" : hovered ? "#08724f" : "#365f54",
          weight: active ? 3.2 : hovered ? 2.4 : 1.05,
          opacity: 0.95,
          fillColor: getFill(row, metric, maximum),
          fillOpacity: active ? 0.58 : hovered ? 0.46 : 0.30,
        };
      },
      onEachFeature(feature, featureLayer) {
        const villageNo = Number(feature.properties?.villageNo);
        const row = rowsByVillage.get(villageNo) || { id: villageNo, totalPets: 0, dogs: 0, cats: 0 };
        villageLayersRef.current.set(villageNo, featureLayer);
        featureLayer.bindTooltip(`<div class="map-village-tooltip"><div><strong>หมู่ ${villageNo}</strong></div><b>${DASHBOARD_METRICS[metric]?.label || "ข้อมูล"}: ${formatMetricValue(row, metric)}</b><small>สัตว์ ${row.totalPets || 0} ตัว · สุนัข ${row.dogs || 0} · แมว ${row.cats || 0}</small></div>`, { sticky: true, className: "map-village-tooltip-shell", opacity: 1 });
        featureLayer.on({
          mouseover: () => onVillageHover?.(villageNo),
          mouseout: () => onVillageHover?.(null),
          click: () => onVillageSelect?.(Number(selectedVillage) === villageNo ? null : villageNo),
        });
      },
    });

    villageLayerRef.current = layer;
    if (showVillages) layer.addTo(map);
    if (!map._prmsBoundaryFitted) {
      map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 14 });
      map._prmsBoundaryFitted = true;
    }
  }, [hoveredVillage, metric, onVillageHover, onVillageSelect, rows, selectedVillage, showVillages]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = villageLayerRef.current;
    if (!map || !layer) return;
    if (showVillages && !map.hasLayer(layer)) layer.addTo(map);
    if (!showVillages && map.hasLayer(layer)) map.removeLayer(layer);
  }, [showVillages]);

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
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          popupAnchor: [0, -18],
        });
        L.marker([cluster.latitude, cluster.longitude], { icon, keyboard: true, riseOnHover: true })
          .bindPopup(popupHtml(cluster), { minWidth: 280, maxWidth: 340 })
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
    if (bounds?.isValid?.()) mapRef.current?.fitBounds(bounds, { padding: [42, 42], maxZoom: 16, animate: true });
  }, [fitAllVillages, selectedVillage]);

  useEffect(() => {
    const handle = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
    };
    document.addEventListener("fullscreenchange", handle);
    return () => document.removeEventListener("fullscreenchange", handle);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await shellRef.current?.requestFullscreen?.();
  };

  return (
    <section className="real-map-card" ref={shellRef}>
        <header className="real-map-card__head">
          <div><small>ข้อมูลเชิงพื้นที่</small><h2>ตำแหน่งสัตว์และขอบเขตหมู่ท่าโพธ์</h2><p>ใช้ขอบเขตหมู่ 1–11 ที่จัดทำจาก QGIS บนแผนที่จริง</p></div>
          <div className="real-map-card__head-tools">
            <label><span>ชั้นข้อมูล</span><select value={metric} onChange={(event) => onMetricChange?.(event.target.value)}>{Object.values(DASHBOARD_METRICS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <div className="real-map-basemap">{Object.entries(BASE_LAYERS).map(([id, item]) => <button type="button" key={id} className={baseMap === id ? "is-active" : ""} onClick={() => setBaseMap(id)}>{item.label}</button>)}</div>
          </div>
        </header>

        <div className="real-map-stage">
          <div ref={mapElementRef} className="real-leaflet-map" />
          <div className="real-map-toolbar">
            <button type="button" onClick={fitAllVillages}>ดูทั้งตำบล</button>
            <button type="button" className={showVillages ? "is-active" : ""} onClick={() => setShowVillages((value) => !value)}>แนวเขตหมู่</button>
            <button type="button" className={showPoints ? "is-active" : ""} onClick={() => setShowPoints((value) => !value)}>จุดสัตว์</button>
            <span />
            <button type="button" onClick={toggleFullscreen}>{fullscreen ? "ออกเต็มจอ" : "เต็มจอ"}</button>
          </div>
          <div className="real-map-data-status"><span><b>{allPets.length.toLocaleString("th-TH")}</b> ตัวมีพิกัด</span><span><b>{households.length.toLocaleString("th-TH")}</b> จุดที่กำลังแสดง</span>{missingCoordinates ? <span className="is-warning"><b>{missingCoordinates.toLocaleString("th-TH")}</b> ตัวขาดพิกัด</span> : null}</div>
          <div className="real-map-usage-hint">ลากเพื่อเลื่อน · ดับเบิลคลิกเพื่อซูม · คลิกพื้นที่หมู่เพื่อกรองข้อมูลและซูมเข้าพื้นที่</div>
          <div className="real-map-boundary-state real-map-boundary-state--ready">ขอบเขตจาก QGIS · 11 หมู่ · Geometry ผ่านการตรวจสอบและไม่มีพื้นที่ซ้อนกัน</div>
        </div>

        <VillageStrip rows={rows} selectedVillage={selectedVillage} hoveredVillage={hoveredVillage} onSelect={onVillageSelect} onHover={onVillageHover} />
    </section>
  );
}
