import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import villageTemplateText from "../assets/maps/tha-pho-villages-template.geojson?raw";
import riverTemplateText from "../assets/maps/tha-pho-river-reference.geojson?raw";
import "../boundary-editor.css";

export const VILLAGE_DRAFT_KEY = "prms-thapho-villages-draft-v2-contiguous";
export const RIVER_DRAFT_KEY = "prms-thapho-river-draft-v2";

const DEFAULT_CENTER = [16.746, 100.205];
const SHARED_VERTEX_EPSILON = 0.000045;
const RIVER_SNAP_LIMIT = 0.0025;

const BASE_LAYERS = {
  satellite: {
    label: "ดาวเทียม",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "Tiles &copy; Esri" },
  },
  streets: {
    label: "แผนที่ถนน",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" },
  },
};

const VILLAGE_COLORS = [
  "#d5b56d", "#c9db76", "#e9cd6f", "#a9d85d", "#f69a62", "#cfe7c2",
  "#b9a4dc", "#c9bfdc", "#bce9c5", "#9ebdbd", "#8fd8dd",
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function parseTemplate(text) { return JSON.parse(text); }

export function readVillageDraft() {
  try {
    const saved = window.localStorage.getItem(VILLAGE_DRAFT_KEY);
    return saved ? JSON.parse(saved) : parseTemplate(villageTemplateText);
  } catch { return parseTemplate(villageTemplateText); }
}

export function readRiverDraft() {
  try {
    const saved = window.localStorage.getItem(RIVER_DRAFT_KEY);
    return saved ? JSON.parse(saved) : parseTemplate(riverTemplateText);
  } catch { return parseTemplate(riverTemplateText); }
}

function saveJson(key, value) { window.localStorage.setItem(key, JSON.stringify(value)); }

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/geo+json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function coordinateDistance(a, b) {
  const dx = Number(a[0]) - Number(b[0]);
  const dy = Number(a[1]) - Number(b[1]);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function visitRings(featureCollection, callback) {
  featureCollection.features.forEach((feature, featureIndex) => {
    const geometry = feature.geometry;
    if (!geometry) return;
    if (geometry.type === "Polygon") {
      geometry.coordinates.forEach((ring, ringIndex) => callback(ring, { featureIndex, polygonIndex: 0, ringIndex }));
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon, polygonIndex) => {
        polygon.forEach((ring, ringIndex) => callback(ring, { featureIndex, polygonIndex, ringIndex }));
      });
    }
  });
}

function getRing(featureCollection, ref) {
  const feature = featureCollection.features[ref.featureIndex];
  if (!feature?.geometry) return null;
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates[ref.ringIndex];
  return feature.geometry.coordinates[ref.polygonIndex]?.[ref.ringIndex] || null;
}

function closeRing(ring) { if (ring?.length) ring[ring.length - 1] = [...ring[0]]; }

function moveSharedCoordinate(featureCollection, oldCoordinate, nextCoordinate) {
  const result = clone(featureCollection);
  visitRings(result, (ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      if (coordinateDistance(ring[index], oldCoordinate) <= SHARED_VERTEX_EPSILON) {
        ring[index] = [...nextCoordinate];
        if (index === 0 || index === ring.length - 1) {
          ring[0] = [...nextCoordinate];
          ring[ring.length - 1] = [...nextCoordinate];
        }
      }
    }
  });
  return result;
}

function insertCoordinate(featureCollection, ref, afterIndex, coordinate) {
  const result = clone(featureCollection);
  const ring = getRing(result, ref);
  if (!ring) return result;
  ring.splice(afterIndex + 1, 0, [...coordinate]);
  closeRing(ring);
  return result;
}

function deleteCoordinate(featureCollection, ref, vertexIndex) {
  const result = clone(featureCollection);
  const ring = getRing(result, ref);
  if (!ring || ring.length <= 5) return result;
  if (vertexIndex === 0 || vertexIndex === ring.length - 1) {
    ring.splice(0, 1);
    ring.pop();
    ring.push([...ring[0]]);
  } else {
    ring.splice(vertexIndex, 1);
    closeRing(ring);
  }
  return result;
}

function projectPointOnSegment(point, start, end) {
  const [px, py] = point;
  const [ax, ay] = start;
  const [bx, by] = end;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared))
    : 0;
  return [ax + (ratio * dx), ay + (ratio * dy)];
}

function nearestPointOnLine(point, lineCoordinates) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lineCoordinates.length - 1; index += 1) {
    const projected = projectPointOnSegment(point, lineCoordinates[index], lineCoordinates[index + 1]);
    const distance = coordinateDistance(point, projected);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = projected;
    }
  }
  return { coordinate: nearest, distance: nearestDistance };
}

function makeVertexIcon(kind = "vertex", selected = false) {
  return L.divIcon({
    className: "boundary-handle-shell",
    html: `<span class="boundary-handle boundary-handle--${kind} ${selected ? "is-selected" : ""}"></span>`,
    iconSize: kind === "midpoint" ? [12, 12] : [16, 16],
    iconAnchor: kind === "midpoint" ? [6, 6] : [8, 8],
  });
}

function getRiverCoordinates(riverCollection) {
  return riverCollection?.features?.[0]?.geometry?.coordinates || [];
}

function replaceRiverCoordinate(riverCollection, index, coordinate) {
  const result = clone(riverCollection);
  result.features[0].geometry.coordinates[index] = [...coordinate];
  return result;
}
function insertRiverCoordinate(riverCollection, afterIndex, coordinate) {
  const result = clone(riverCollection);
  result.features[0].geometry.coordinates.splice(afterIndex + 1, 0, [...coordinate]);
  return result;
}
function deleteRiverCoordinate(riverCollection, index) {
  const result = clone(riverCollection);
  const coordinates = result.features[0].geometry.coordinates;
  if (coordinates.length > 2) coordinates.splice(index, 1);
  return result;
}

export default function VillageBoundaryEditor({ open, onClose, onSaved }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const polygonLayerRef = useRef(null);
  const riverLayerRef = useRef(null);
  const handleLayerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [villages, setVillages] = useState(() => readVillageDraft());
  const [river, setRiver] = useState(() => readRiverDraft());
  const [selectedVillage, setSelectedVillage] = useState(5);
  const [mode, setMode] = useState("boundary");
  const [baseMap, setBaseMap] = useState("satellite");
  const [autoSnapRiver, setAutoSnapRiver] = useState(true);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [message, setMessage] = useState("เลือกหมู่ แล้วลากจุดให้ตรงแนวถนนหรือแม่น้ำ");

  const selectedFeatureIndex = useMemo(
    () => villages.features.findIndex((feature) => Number(feature.properties?.villageNo) === Number(selectedVillage)),
    [selectedVillage, villages],
  );

  const pushHistory = (currentVillages = villages, currentRiver = river) => {
    setHistory((items) => [...items.slice(-29), { villages: clone(currentVillages), river: clone(currentRiver) }]);
    setFuture([]);
  };

  useEffect(() => {
    if (!open || !mapElementRef.current || mapRef.current) return undefined;
    const map = L.map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
      minZoom: 11,
      maxZoom: 20,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapElementRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    const config = BASE_LAYERS[baseMap];
    baseLayerRef.current = L.tileLayer(config.url, config.options).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [baseMap, open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polygonLayerRef.current) map.removeLayer(polygonLayerRef.current);
    const layer = L.geoJSON(villages, {
      style(feature) {
        const villageNo = Number(feature.properties?.villageNo);
        const active = villageNo === Number(selectedVillage);
        return {
          color: active ? "#063f8c" : "#3d4b4a",
          weight: active ? 3.5 : 1.6,
          opacity: 0.95,
          fillColor: VILLAGE_COLORS[villageNo - 1] || "#8fc9a9",
          fillOpacity: active ? 0.48 : 0.28,
        };
      },
      onEachFeature(feature, featureLayer) {
        const villageNo = Number(feature.properties?.villageNo);
        featureLayer.bindTooltip(`หมู่ ${villageNo}`, { sticky: true, className: "boundary-editor-tooltip" });
        featureLayer.on("click", () => {
          setSelectedVillage(villageNo);
          setMode("boundary");
          setSelectedVertex(null);
        });
      },
    }).addTo(map);
    polygonLayerRef.current = layer;
    if (!map._boundaryEditorFitted) {
      map.fitBounds(layer.getBounds(), { padding: [24, 24] });
      map._boundaryEditorFitted = true;
    }
  }, [open, selectedVillage, villages]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (riverLayerRef.current) map.removeLayer(riverLayerRef.current);
    riverLayerRef.current = L.geoJSON(river, {
      style: { color: "#0754b8", weight: mode === "river" ? 6 : 4, opacity: 0.95 },
      interactive: true,
    }).addTo(map);
  }, [mode, open, river]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (handleLayerRef.current) map.removeLayer(handleLayerRef.current);
    const group = L.layerGroup().addTo(map);
    handleLayerRef.current = group;

    if (mode === "river") {
      const coordinates = getRiverCoordinates(river);
      coordinates.forEach((coordinate, index) => {
        const marker = L.marker([coordinate[1], coordinate[0]], {
          draggable: true,
          icon: makeVertexIcon("river", selectedVertex?.riverIndex === index),
          zIndexOffset: 1100,
        }).addTo(group);
        marker.on("click", () => setSelectedVertex({ riverIndex: index, coordinate }));
        marker.on("dragstart", () => pushHistory());
        marker.on("dragend", (event) => {
          const point = event.target.getLatLng();
          setRiver((current) => replaceRiverCoordinate(current, index, [point.lng, point.lat]));
          setSelectedVertex({ riverIndex: index, coordinate: [point.lng, point.lat] });
        });
        marker.on("contextmenu", () => {
          pushHistory();
          setRiver((current) => deleteRiverCoordinate(current, index));
          setSelectedVertex(null);
        });
        if (index < coordinates.length - 1) {
          const next = coordinates[index + 1];
          const midpoint = [(coordinate[0] + next[0]) / 2, (coordinate[1] + next[1]) / 2];
          const middleMarker = L.marker([midpoint[1], midpoint[0]], {
            icon: makeVertexIcon("midpoint"), zIndexOffset: 1000,
          }).addTo(group);
          middleMarker.on("click", () => {
            pushHistory();
            setRiver((current) => insertRiverCoordinate(current, index, midpoint));
          });
        }
      });
      return;
    }

    if (selectedFeatureIndex < 0) return;
    const selectedFeature = villages.features[selectedFeatureIndex];
    const polygonGroups = selectedFeature.geometry.type === "Polygon"
      ? [selectedFeature.geometry.coordinates]
      : selectedFeature.geometry.coordinates;

    polygonGroups.forEach((polygon, polygonIndex) => {
      const ring = polygon[0];
      const ringRef = { featureIndex: selectedFeatureIndex, polygonIndex, ringIndex: 0 };
      const visibleLength = Math.max(0, ring.length - 1);
      for (let index = 0; index < visibleLength; index += 1) {
        const coordinate = ring[index];
        const isSelected = selectedVertex
          && selectedVertex.featureIndex === selectedFeatureIndex
          && selectedVertex.polygonIndex === polygonIndex
          && selectedVertex.vertexIndex === index;
        const marker = L.marker([coordinate[1], coordinate[0]], {
          draggable: true,
          icon: makeVertexIcon("vertex", isSelected),
          zIndexOffset: 1200,
        }).addTo(group);
        marker.on("click", () => setSelectedVertex({ ...ringRef, vertexIndex: index, coordinate: [...coordinate] }));
        marker.on("dragstart", () => pushHistory());
        marker.on("dragend", (event) => {
          const point = event.target.getLatLng();
          let next = [point.lng, point.lat];
          const oldCoordinate = coordinate;
          if (autoSnapRiver) {
            const nearest = nearestPointOnLine(next, getRiverCoordinates(river));
            if (nearest.coordinate && nearest.distance <= RIVER_SNAP_LIMIT) next = nearest.coordinate;
          }
          setVillages((current) => moveSharedCoordinate(current, oldCoordinate, next));
          setSelectedVertex({ ...ringRef, vertexIndex: index, coordinate: next });
        });
        marker.on("contextmenu", () => {
          pushHistory();
          setVillages((current) => deleteCoordinate(current, ringRef, index));
          setSelectedVertex(null);
        });
        const nextCoordinate = ring[index + 1];
        const midpoint = [(coordinate[0] + nextCoordinate[0]) / 2, (coordinate[1] + nextCoordinate[1]) / 2];
        const middleMarker = L.marker([midpoint[1], midpoint[0]], {
          icon: makeVertexIcon("midpoint"), zIndexOffset: 1000,
        }).addTo(group);
        middleMarker.on("click", () => {
          pushHistory();
          setVillages((current) => insertCoordinate(current, ringRef, index, midpoint));
        });
      }
    });
  }, [autoSnapRiver, mode, open, river, selectedFeatureIndex, selectedVertex, villages]);

  if (!open) return null;

  const snapSelectedVertex = () => {
    if (!selectedVertex || selectedVertex.riverIndex !== undefined) {
      setMessage("กรุณาเลือกจุดขอบเขตหมู่ก่อน");
      return;
    }
    const nearest = nearestPointOnLine(selectedVertex.coordinate, getRiverCoordinates(river));
    if (!nearest.coordinate) return;
    pushHistory();
    setVillages((current) => moveSharedCoordinate(current, selectedVertex.coordinate, nearest.coordinate));
    setSelectedVertex((current) => ({ ...current, coordinate: nearest.coordinate }));
    setMessage("ย้ายจุดไปยังแนวแม่น้ำแล้ว");
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture((items) => [{ villages: clone(villages), river: clone(river) }, ...items]);
    setVillages(previous.villages);
    setRiver(previous.river);
    setHistory((items) => items.slice(0, -1));
    setSelectedVertex(null);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, { villages: clone(villages), river: clone(river) }]);
    setVillages(next.villages);
    setRiver(next.river);
    setFuture((items) => items.slice(1));
    setSelectedVertex(null);
  };

  const saveDraft = () => {
    saveJson(VILLAGE_DRAFT_KEY, villages);
    saveJson(RIVER_DRAFT_KEY, river);
    onSaved?.(clone(villages));
    setMessage("บันทึกร่างแล้ว Dashboard จะใช้ขอบเขตชุดนี้ทันที");
  };

  const resetTemplate = () => {
    pushHistory();
    setVillages(parseTemplate(villageTemplateText));
    setRiver(parseTemplate(riverTemplateText));
    setSelectedVertex(null);
    setMessage("คืนค่าเป็นต้นแบบขอบเขตต่อเนื่องแล้ว — ถนนและแม่น้ำเป็นเส้นแบ่ง ไม่ใช่ช่องว่าง");
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
      pushHistory();
      setVillages(data);
      setSelectedVertex(null);
      setMessage(`นำเข้า ${file.name} แล้ว`);
    } catch (error) {
      setMessage(error.message || "นำเข้าไฟล์ไม่สำเร็จ");
    }
  };

  return (
    <div className="boundary-editor-modal" role="dialog" aria-modal="true" aria-label="ปรับแนวเขตหมู่บ้าน">
      <div className="boundary-editor-panel">
        <header className="boundary-editor-header">
          <div>
            <small>เครื่องมือจัดทำ GeoJSON</small>
            <h2>ปรับแนวเขตหมู่บ้านบนแผนที่จริง</h2>
            <p>ลากเส้นร่วมให้ตรงกึ่งกลางถนน คลอง และแม่น้ำ โดยไม่มีพื้นที่ว่างระหว่างหมู่ จุดร่วมจะเคลื่อนพร้อมกัน</p>
          </div>
          <button type="button" className="boundary-editor-close" onClick={onClose} aria-label="ปิด">×</button>
        </header>

        <div className="boundary-editor-toolbar">
          <label><span>แก้ไข</span><select value={mode} onChange={(event) => { setMode(event.target.value); setSelectedVertex(null); }}><option value="boundary">ขอบเขตหมู่</option><option value="river">แนวแม่น้ำอ้างอิง</option></select></label>
          <label><span>หมู่</span><select value={selectedVillage} disabled={mode !== "boundary"} onChange={(event) => setSelectedVillage(Number(event.target.value))}>{villages.features.map((feature) => <option key={feature.properties.villageNo} value={feature.properties.villageNo}>หมู่ {feature.properties.villageNo}</option>)}</select></label>
          <div className="boundary-editor-segmented">{Object.entries(BASE_LAYERS).map(([id, item]) => <button type="button" key={id} className={baseMap === id ? "is-active" : ""} onClick={() => setBaseMap(id)}>{item.label}</button>)}</div>
          <label className="boundary-editor-check"><input type="checkbox" checked={autoSnapRiver} onChange={(event) => setAutoSnapRiver(event.target.checked)} /><span>ดูดจุดใกล้แม่น้ำขณะลาก</span></label>
          <button type="button" onClick={snapSelectedVertex} disabled={mode !== "boundary" || !selectedVertex}>ดูดจุดเข้าแม่น้ำ</button>
          <button type="button" onClick={undo} disabled={!history.length}>ย้อนกลับ</button>
          <button type="button" onClick={redo} disabled={!future.length}>ทำซ้ำ</button>
        </div>

        <div className="boundary-editor-workspace">
          <div ref={mapElementRef} className="boundary-editor-map" />
          <aside className="boundary-editor-sidebar">
            <section><h3>วิธีใช้งาน</h3><ol><li>เลือก “แนวแม่น้ำอ้างอิง” แล้วลากจุดสีน้ำเงินให้ตามกลางแม่น้ำจริงก่อน</li><li>กลับมาเลือก “ขอบเขตหมู่” แล้วลากจุดสีขาวให้ตรงเส้นแบ่งจริง</li><li>จุดจางกลางเส้นใช้เพิ่ม Vertex และคลิกขวาที่จุดหลักเพื่อลบ</li><li>กด “ดูดจุดเข้าแม่น้ำ” สำหรับขอบที่ใช้แม่น้ำเป็นเส้นแบ่ง</li></ol></section>
            <section><h3>จุดที่เลือก</h3>{selectedVertex?.coordinate ? <div className="boundary-coordinate-card"><span>Latitude</span><b>{selectedVertex.coordinate[1].toFixed(7)}</b><span>Longitude</span><b>{selectedVertex.coordinate[0].toFixed(7)}</b></div> : <p>คลิกจุดบนแผนที่เพื่อดูพิกัด</p>}</section>
            <section className="boundary-editor-note"><h3>สถานะ</h3><p>{message}</p><small>ต้นแบบนี้ไม่มีช่องว่างระหว่างหมู่ แต่ยังต้องปรับแนวแม่น้ำ/ถนนและให้เจ้าหน้าที่ท้องถิ่นตรวจรับรอง</small></section>
          </aside>
        </div>

        <footer className="boundary-editor-footer">
          <div><button type="button" onClick={resetTemplate}>คืนค่าต้นแบบ</button><button type="button" onClick={() => fileInputRef.current?.click()}>นำเข้า GeoJSON</button><input ref={fileInputRef} hidden type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={handleImport} /><button type="button" onClick={() => downloadJson("tha-pho-river-reference.geojson", river)}>ส่งออกแนวแม่น้ำ</button><button type="button" onClick={() => downloadJson("tha-pho-villages.geojson", villages)}>ส่งออกขอบเขต</button></div>
          <div><button type="button" onClick={onClose}>ปิด</button><button type="button" className="is-primary" onClick={saveDraft}>บันทึกและใช้บน Dashboard</button></div>
        </footer>
      </div>
    </div>
  );
}
