import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const THA_PHO_CENTER = [16.7744, 100.2254];

function validPoint(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function toControlPoints(value) {
  const waypoints = value?.properties?.waypoints;
  if (Array.isArray(waypoints)) {
    return waypoints
      .map((point) => [Number(point.latitude), Number(point.longitude)])
      .filter(([latitude, longitude]) => validPoint(latitude, longitude));
  }

  const coordinates = value?.type === "Feature" ? value.geometry?.coordinates : value?.coordinates;
  if (!Array.isArray(coordinates)) return [];

  const sampled = coordinates.length > 50
    ? coordinates.filter((_, index) => index === 0 || index === coordinates.length - 1 || index % Math.ceil(coordinates.length / 48) === 0).slice(0, 50)
    : coordinates;

  return sampled
    .map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
    .filter(([latitude, longitude]) => validPoint(latitude, longitude));
}

function readSummary(route) {
  const distanceMeters = Number(route?.properties?.distanceMeters);
  const durationSeconds = Number(route?.properties?.durationSeconds);
  if (!Number.isFinite(distanceMeters) && !Number.isFinite(durationSeconds)) return null;
  return { distanceMeters, durationSeconds };
}

function formatDistance(value) {
  return `${(Number(value || 0) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}

function formatDuration(value) {
  const minutes = Math.max(1, Math.round(Number(value || 0) / 60));
  if (minutes < 60) return `${minutes.toLocaleString("th-TH")} นาที`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} ชม. ${remaining} นาที` : `${hours} ชม.`;
}

export default function RouteEditor({ value, onChange, onResolve }) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const [points, setPoints] = useState(() => toControlPoints(value));
  const [resolvedRoute, setResolvedRoute] = useState(() => value || null);
  const [summary, setSummary] = useState(() => readSummary(value));
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState("");

  function resetResolvedRoute() {
    setResolvedRoute(null);
    setSummary(null);
    setError("");
    onChange(null);
  }

  function updatePoints(updater) {
    setPoints(updater);
    resetResolvedRoute();
  }

  useEffect(() => {
    if (!rootRef.current) return undefined;
    const map = L.map(rootRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(THA_PHO_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (event) => {
      updatePoints((current) => [...current, [event.latlng.lat, event.latlng.lng]]);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const layer = L.layerGroup().addTo(map);
    const boundsPoints = [];

    if (resolvedRoute) {
      const routeLayer = L.geoJSON(resolvedRoute, {
        style: { color: "#278432", weight: 6, opacity: 0.9 },
      }).addTo(layer);
      const bounds = routeLayer.getBounds();
      if (bounds.isValid()) boundsPoints.push(bounds.getSouthWest(), bounds.getNorthEast());
    } else if (points.length > 1) {
      L.polyline(points, { color: "#8dcc1c", weight: 4, opacity: 0.9, dashArray: "7 8" }).addTo(layer);
      boundsPoints.push(...points);
    }

    points.forEach((point, index) => {
      L.circleMarker(point, {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: index === 0 ? "#104b1b" : "#8dcc1c",
        fillOpacity: 1,
      })
        .bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "waste-route-point" })
        .addTo(layer);
      boundsPoints.push(point);
    });

    if (boundsPoints.length > 1) map.fitBounds(L.latLngBounds(boundsPoints), { padding: [26, 26], maxZoom: 16 });
    return () => layer.remove();
  }, [points, resolvedRoute]);

  async function resolveRoute() {
    if (points.length < 2 || typeof onResolve !== "function") return;
    setRouting(true);
    setError("");
    try {
      const result = await onResolve(points.map(([latitude, longitude]) => ({ latitude, longitude })));
      setResolvedRoute(result.routeGeojson);
      setSummary({ distanceMeters: result.distanceMeters, durationSeconds: result.durationSeconds });
      onChange(result.routeGeojson);
    } catch (requestError) {
      setError(requestError.message || "ไม่สามารถคำนวณเส้นทางตามถนนได้");
    } finally {
      setRouting(false);
    }
  }

  return <section className="waste-route-editor">
    <header>
      <div>
        <strong>กำหนดเส้นทางเดินรถบนแผนที่</strong>
        <span>คลิกถนนตามลำดับจุดที่รถต้องผ่าน แล้วให้ระบบคำนวณเส้นทางตามถนนจริง</span>
      </div>
      <b>{points.length} จุด</b>
    </header>
    <div className="waste-route-editor__map" ref={rootRef} aria-label="แผนที่กำหนดเส้นทางเก็บขยะในเทศบาลท่าโพธ์" />
    {summary ? <div className="waste-route-editor__summary"><strong>คำนวณตามถนนแล้ว</strong><span>{formatDistance(summary.distanceMeters)} · ประมาณ {formatDuration(summary.durationSeconds)}</span></div> : null}
    {error ? <div className="waste-route-editor__summary is-error"><strong>คำนวณเส้นทางไม่สำเร็จ</strong><span>{error}</span></div> : null}
    <footer>
      <button type="button" className="waste-button waste-button--secondary" disabled={!points.length || routing} onClick={() => updatePoints((current) => current.slice(0, -1))}>ย้อนกลับ 1 จุด</button>
      <button type="button" className="waste-button waste-button--quiet" disabled={!points.length || routing} onClick={() => updatePoints([])}>ล้างจุดทั้งหมด</button>
      <button type="button" className="waste-button waste-button--primary" disabled={points.length < 2 || routing} onClick={resolveRoute}>{routing ? "กำลังคำนวณ…" : "คำนวณตามถนน"}</button>
    </footer>
  </section>;
}
