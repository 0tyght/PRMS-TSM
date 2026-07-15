import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import villageGeoJsonText from "../assets/maps/tha-pho-villages-redrawn.geojson?raw";
import {
  DASHBOARD_METRICS,
  formatMetricValue,
  getMetricValue,
} from "../lib/dashboardVillageData.js";

const VILLAGE_GEOJSON = JSON.parse(villageGeoJsonText);
const THA_PHO_CENTER = Object.freeze([16.7445, 100.2015]);
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
    label: "ดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  }),
});

const VILLAGE_BASE_COLORS = Object.freeze({
  total: ["#e1f3ed", "#83cdb3", "#08724f"],
  vaccination: ["#f4ddd8", "#e9bd62", "#18855f"],
  sterilization: ["#eadff7", "#b797df", "#6947ae"],
  pending: ["#f7e9c3", "#e3aa3e", "#a96408"],
  cases: ["#f8dad7", "#dd7b70", "#ad332b"],
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator * 100) / denominator) : 0;
}

function interpolateColor(start, end, ratio) {
  const parseHex = (hex) => {
    const clean = hex.replace("#", "");
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  };

  const from = parseHex(start);
  const to = parseHex(end);
  const value = from.map((channel, index) =>
    Math.round(channel + ((to[index] - channel) * ratio)),
  );

  return `#${value
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getVillageFill(row, metric, maximum) {
  const palette = VILLAGE_BASE_COLORS[metric] || VILLAGE_BASE_COLORS.total;
  const value = getMetricValue(row, metric);
  const ratio = metric === "vaccination" || metric === "sterilization"
    ? clamp(value / 100, 0, 1)
    : clamp(value / Math.max(1, maximum), 0, 1);

  if (ratio <= 0.5) {
    return interpolateColor(palette[0], palette[1], ratio * 2);
  }

  return interpolateColor(palette[1], palette[2], (ratio - 0.5) * 2);
}

function villageTooltipHtml(row, metric) {
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  return `
    <div class="map-village-tooltip">
      <div>
        <strong>หมู่ ${row.id}</strong>
        <span>${row.villageName || row.name || ""}</span>
      </div>
      <b>${metricInfo.label}: ${formatMetricValue(row, metric)}</b>
      <small>สัตว์ ${row.totalPets} ตัว · สุนัข ${row.dogs} · แมว ${row.cats}</small>
    </div>
  `;
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
    const key = `${pet.latitude.toFixed(5)},${pet.longitude.toFixed(5)}`;
    const current = groups.get(key) || {
      latitude: pet.latitude,
      longitude: pet.longitude,
      pets: [],
      houseNumbers: new Set(),
      villages: new Set(),
    };

    current.pets.push(pet);
    if (pet.houseNo) current.houseNumbers.add(String(pet.houseNo));
    current.villages.add(Number(pet.villageNo));
    groups.set(key, current);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    houseNumbers: [...group.houseNumbers],
    villages: [...group.villages],
  }));
}

function clusterCellSize(zoom) {
  if (zoom <= 10) return 0.018;
  if (zoom === 11) return 0.012;
  if (zoom === 12) return 0.008;
  if (zoom === 13) return 0.0045;
  if (zoom === 14) return 0.0024;
  if (zoom === 15) return 0.0012;
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
  const villages = cluster.villages
    .sort((a, b) => a - b)
    .map((value) => `หมู่ ${value}`)
    .join(", ");
  const houseNumbers = [...new Set(cluster.households.flatMap((item) => item.houseNumbers))];
  const petNames = cluster.pets
    .slice(0, 5)
    .map((pet) => pet.petName || "ไม่ระบุชื่อ")
    .join(" · ");
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

function VillageStrip({ rows, selectedVillage, hoveredVillage, onSelect, onHover }) {
  return (
    <div className="map-village-strip" aria-label="เลือกหมู่บ้าน">
      <div className="map-village-strip__label">
        <strong>เลือกหมู่</strong>
        <small>ซูมตามขอบเขตที่วาดใหม่</small>
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
              <b>{Number(row.totalPets || 0).toLocaleString("th-TH")}</b>
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
  const villageLayerRef = useRef(null);
  const villageLayersByIdRef = useRef(new Map());
  const markerLayerRef = useRef(null);
  const didInitialFitRef = useRef(false);

  const [baseMap, setBaseMap] = useState("satellite");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [fullscreen, setFullscreen] = useState(false);
  const [showVillages, setShowVillages] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(48);
  const [wheelZoom, setWheelZoom] = useState(false);
  const [mapMessage, setMapMessage] = useState("");

  const rowsById = useMemo(
    () => new Map(rows.map((row) => [Number(row.id), row])),
    [rows],
  );
  const allPets = useMemo(() => normalizePets(rows), [rows]);
  const visiblePets = useMemo(() => {
    if (!selectedVillage) return allPets;
    return allPets.filter((pet) => Number(pet.villageNo) === Number(selectedVillage));
  }, [allPets, selectedVillage]);
  const households = useMemo(() => groupHouseholds(visiblePets), [visiblePets]);
  const clusters = useMemo(() => clusterHouseholds(households, zoom), [households, zoom]);
  const totalPets = rows.reduce((sum, row) => sum + toNumber(row.totalPets), 0);
  const missingCoordinates = Math.max(0, totalPets - allPets.length);

  const fitThaPho = useCallback(() => {
    const map = mapRef.current;
    const villageLayer = villageLayerRef.current;
    if (!map || !villageLayer) return;

    const bounds = villageLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [28, 28],
        animate: true,
        maxZoom: 14,
      });
    }
  }, []);

  const fitPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!visiblePets.length) {
      setMapMessage(
        selectedVillage
          ? `หมู่ ${selectedVillage} ยังไม่มีพิกัดที่พร้อมแสดง`
          : "ยังไม่มีพิกัดที่พร้อมแสดงบนแผนที่",
      );
      return;
    }

    setMapMessage("");
    const bounds = L.latLngBounds(
      visiblePets.map((pet) => [pet.latitude, pet.longitude]),
    );
    map.fitBounds(bounds, {
      padding: [52, 52],
      animate: true,
      maxZoom: visiblePets.length === 1 ? 17 : 16,
    });
  }, [selectedVillage, visiblePets]);

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

    map.createPane("villagePane");
    map.getPane("villagePane").style.zIndex = "420";
    map.getPane("villagePane").style.pointerEvents = "auto";

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    mapRef.current = map;

    const handleZoom = () => setZoom(map.getZoom());
    map.on("zoomend", handleZoom);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
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
    if (!map) return;
    if (wheelZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [wheelZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const maximum = Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));
    villageLayersByIdRef.current.clear();

    const layer = L.geoJSON(VILLAGE_GEOJSON, {
      pane: "villagePane",
      style: (feature) => {
        const villageNo = Number(feature?.properties?.village_no);
        const row = rowsById.get(villageNo) || {
          id: villageNo,
          totalPets: 0,
          dogs: 0,
          cats: 0,
        };
        const selected = Number(selectedVillage) === villageNo;
        const hovered = Number(hoveredVillage) === villageNo;

        return {
          color: selected ? "#064c37" : hovered ? "#08724f" : "#ffffff",
          weight: selected ? 4 : hovered ? 3 : 2,
          opacity: 0.98,
          fillColor: getVillageFill(row, metric, maximum),
          fillOpacity: selected
            ? clamp((overlayOpacity + 18) / 100, 0.2, 0.82)
            : hovered
              ? clamp((overlayOpacity + 10) / 100, 0.18, 0.75)
              : overlayOpacity / 100,
          dashArray: selected ? null : "1 0",
          lineJoin: "round",
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const villageNo = Number(feature?.properties?.village_no);
        const row = rowsById.get(villageNo) || {
          id: villageNo,
          villageName: `หมู่ ${villageNo}`,
          totalPets: 0,
          dogs: 0,
          cats: 0,
        };

        villageLayersByIdRef.current.set(villageNo, featureLayer);
        featureLayer.bindTooltip(villageTooltipHtml(row, metric), {
          sticky: true,
          direction: "top",
          offset: [0, -8],
          opacity: 1,
          className: "map-village-tooltip-shell",
        });

        featureLayer.on({
          mouseover: () => onVillageHover?.(villageNo),
          mouseout: () => onVillageHover?.(null),
          click: () => {
            const next = Number(selectedVillage) === villageNo ? null : villageNo;
            onVillageSelect?.(next);

            if (next) {
              map.fitBounds(featureLayer.getBounds(), {
                padding: [48, 48],
                animate: true,
                maxZoom: 16,
              });
            } else {
              window.setTimeout(fitThaPho, 0);
            }
          },
        });
      },
    });

    if (showVillages) layer.addTo(map);
    villageLayerRef.current = layer;

    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true;
      window.setTimeout(fitThaPho, 0);
    }

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (villageLayerRef.current === layer) villageLayerRef.current = null;
      villageLayersByIdRef.current.clear();
    };
  }, [fitThaPho, hoveredVillage, metric, onVillageHover, onVillageSelect, overlayOpacity, rows, rowsById, selectedVillage, showVillages]);

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

        L.marker([cluster.latitude, cluster.longitude], {
          icon,
          keyboard: true,
          riseOnHover: true,
        })
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
      setMapMessage("");
      return;
    }

    const featureLayer = villageLayersByIdRef.current.get(Number(selectedVillage));
    if (featureLayer && mapRef.current) {
      setMapMessage("");
      mapRef.current.fitBounds(featureLayer.getBounds(), {
        padding: [48, 48],
        animate: true,
        maxZoom: 16,
      });
    }
  }, [selectedVillage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (document.fullscreenElement) document.exitFullscreen?.();
      else if (wheelZoom) setWheelZoom(false);
      else if (selectedVillage) onVillageSelect?.(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onVillageSelect, selectedVillage, wheelZoom]);

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
          <p>วาดแนวเขตหมู่ใหม่จากภาพดาวเทียม จุดอ้างอิง 3 จุด และแนวถนน–แม่น้ำที่เห็นในภาพ</p>
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
              <button
                type="button"
                key={id}
                className={baseMap === id ? "is-active" : ""}
                onClick={() => setBaseMap(id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="real-map-stage">
        <div ref={mapContainerRef} className="real-leaflet-map" />

        <div className="real-map-toolbar" aria-label="เครื่องมือแผนที่">
          <button type="button" onClick={fitThaPho}>ดูทั้งตำบล</button>
          <button type="button" onClick={fitPoints}>ดูจุดสัตว์</button>
          <button
            type="button"
            className={showVillages ? "is-active" : ""}
            onClick={() => setShowVillages((value) => !value)}
          >
            แนวเขตหมู่
          </button>
          <button
            type="button"
            className={showPoints ? "is-active" : ""}
            onClick={() => setShowPoints((value) => !value)}
          >
            จุดสัตว์
          </button>
          <button
            type="button"
            className={wheelZoom ? "is-active" : ""}
            onClick={() => setWheelZoom((value) => !value)}
            title="เปิดแล้วสามารถใช้ล้อเมาส์ซูมแผนที่ได้"
          >
            {wheelZoom ? "ล้อเมาส์: เปิด" : "ล้อเมาส์: ปิด"}
          </button>
          <label className="real-map-opacity">
            <span>ความเข้ม</span>
            <input
              type="range"
              min="18"
              max="72"
              step="3"
              value={overlayOpacity}
              onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              disabled={!showVillages}
            />
          </label>
          <span />
          <button type="button" onClick={toggleFullscreen}>{fullscreen ? "ออกเต็มจอ" : "เต็มจอ"}</button>
        </div>

        <div className="real-map-data-status">
          <span><b>{allPets.length.toLocaleString("th-TH")}</b> ตัวมีพิกัด</span>
          <span><b>{households.length.toLocaleString("th-TH")}</b> จุดที่กำลังแสดง</span>
          {missingCoordinates ? (
            <span className="is-warning"><b>{missingCoordinates.toLocaleString("th-TH")}</b> ตัวขาดพิกัด</span>
          ) : null}
        </div>

        <div className="real-map-usage-hint">
          ลากเพื่อเลื่อน · ดับเบิลคลิกเพื่อซูม · เปิด “ล้อเมาส์” เมื่อต้องการซูมต่อเนื่อง
        </div>

        {mapMessage ? <div className="real-map-message">{mapMessage}</div> : null}

        <div className="real-map-boundary-state real-map-boundary-state--ready">
          ร่างขอบเขตใหม่จากภาพอ้างอิง — ควรให้เทศบาลตรวจรับรองก่อนใช้เป็นเขตราชการ
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
