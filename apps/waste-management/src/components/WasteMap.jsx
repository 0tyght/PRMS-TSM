import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useLeafletResize from "../lib/useLeafletResize.js";

const THA_PHO_CENTER = [16.7744, 100.2254];

export default function WasteMap({ plans = [], routeGeojson = null, previousRouteGeojson = null, routeStops = [], history = [], historySegments = [], onStopClick = null }) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    if (!rootRef.current) return undefined;
    const map = L.map(rootRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(THA_PHO_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useLeafletResize(mapRef, rootRef);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const layer = L.layerGroup().addTo(map);
    const points = [];
    if (previousRouteGeojson) {
      const previousLayer = L.geoJSON(previousRouteGeojson, { style: { color: "#697871", weight: 5, opacity: 0.7, dashArray: "9 9" } }).addTo(layer);
      const previousBounds = previousLayer.getBounds(); if (previousBounds.isValid()) points.push(previousBounds.getSouthWest(), previousBounds.getNorthEast());
    }
    if (routeGeojson) {
      const routeLayer = L.geoJSON(routeGeojson, { style: { color: "#278432", weight: 6, opacity: 0.86 } }).addTo(layer);
      const bounds = routeLayer.getBounds(); if (bounds.isValid()) points.push(bounds.getSouthWest(), bounds.getNorthEast());
    }
    routeStops.forEach((stop, index) => {
      const latitude = Number(stop.latitude); const longitude = Number(stop.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const markerRole = stop.markerRole || "STOP";
      const fillColor = markerRole === "START" ? "#137d4c" : markerRole === "END" ? "#d26a1b" : markerRole === "HOME" ? "#2476a8" : stop.confirmationStatus === "COLLECTED" ? "#176323" : "#8dcc1c";
      const marker = L.circleMarker([latitude, longitude], { radius: markerRole === "STOP" ? 8 : 10, weight: 2, color: "#fff", fillColor, fillOpacity: 1 }).addTo(layer);
      const markerLabel = markerRole === "START" ? "เริ่ม" : markerRole === "END" ? "จบ" : markerRole === "HOME" ? "บ้าน" : String(stop.sequenceNo || index + 1);
      marker.bindTooltip(markerLabel, { permanent: true, direction: "center", className: `waste-route-point waste-route-point--${markerRole.toLowerCase()}` });
      marker.bindPopup(`<strong>${stop.stopName || "จุดเก็บขยะ"}</strong>`);
      if (onStopClick) marker.on("click", () => onStopClick(stop));
      points.push([latitude, longitude]);
    });
    history.forEach((point) => {
      const latitude = Number(point.latitude); const longitude = Number(point.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      L.circleMarker([latitude, longitude], { radius: 4, weight: 2, color: "#fff", fillColor: "#2476a8", fillOpacity: 1 }).addTo(layer).bindPopup(`<strong>พิกัด GPS ที่ได้รับ</strong><br>${point.recordedAt ? new Date(point.recordedAt).toLocaleString("th-TH") : ""}`);
      points.push([latitude, longitude]);
    });
    historySegments.forEach((segment) => {
      const line = segment.map((point) => [Number(point.latitude), Number(point.longitude)]).filter((point) => point.every(Number.isFinite));
      if (line.length > 1) L.polyline(line, { color: "#2476a8", weight: 4, opacity: 0.82 }).addTo(layer);
    });
    plans.forEach((plan) => { const latitude = Number(plan.latitude); const longitude = Number(plan.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return; const marker = L.circleMarker([latitude, longitude], { radius: 10, weight: 3, color: "#fff", fillColor: plan.status === "IN_PROGRESS" ? "#176323" : "#8dcc1c", fillOpacity: 1 }).addTo(layer); marker.bindPopup(`<strong>${plan.vehicleCode || "รถเก็บขยะ"}</strong><br>${plan.routeName || "ไม่ระบุเส้นทาง"}<br>${plan.driverName || "ไม่ระบุพนักงานประจำรถขยะ"}`); points.push([latitude, longitude]); });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 16 });
    return () => layer.remove();
  }, [plans, previousRouteGeojson, routeGeojson, routeStops, history, historySegments, onStopClick]);
  return <div className="waste-map" ref={rootRef} aria-label="แผนที่ติดตามรถเก็บขยะ" />;
}
