import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const THA_PHO_CENTER = [16.7547209, 100.2004448];

function validCoordinate(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
}

export default function MapPicker({
  latitude,
  longitude,
  onChange,
  required = false,
  disabled = false,
}) {
  const mapId = useId().replace(/:/g, "");
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [mapMessage, setMapMessage] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;

    const hasValue = validCoordinate(latitude, longitude);
    const initial = hasValue
      ? [Number(latitude), Number(longitude)]
      : THA_PHO_CENTER;

    const map = L.map(mapNode.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView(initial, hasValue ? 17 : 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const icon = L.divIcon({
      className: "prms-map-pin-wrap",
      html: '<span class="prms-map-pin" aria-hidden="true"><span></span></span>',
      iconSize: [36, 46],
      iconAnchor: [18, 44],
    });

    const marker = L.marker(initial, {
      draggable: !disabled,
      icon,
      opacity: hasValue ? 1 : 0.72,
    }).addTo(map);

    marker.bindTooltip(
      hasValue ? "ตำแหน่งที่เลือก" : "ลากหมุดหรือแตะแผนที่เพื่อเลือกตำแหน่ง",
      { direction: "top", offset: [0, -38] },
    );

    function commit(latlng) {
      if (disabled) return;
      const next = {
        latitude: Number(latlng.lat.toFixed(7)),
        longitude: Number(latlng.lng.toFixed(7)),
      };
      marker.setLatLng(latlng);
      marker.setOpacity(1);
      marker.setTooltipContent("ตำแหน่งที่เลือก");
      onChangeRef.current?.(next);
      setMapMessage("");
    }

    marker.on("dragend", () => commit(marker.getLatLng()));
    map.on("click", (event) => commit(event.latlng));

    mapRef.current = map;
    markerRef.current = marker;

    window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [disabled, mapId]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (!validCoordinate(latitude, longitude)) return;

    const point = [Number(latitude), Number(longitude)];
    markerRef.current.setLatLng(point);
    markerRef.current.setOpacity(1);

    if (!mapRef.current.getBounds().contains(point)) {
      mapRef.current.setView(point, 17);
    }
  }, [latitude, longitude]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMapMessage("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }

    setLocating(true);
    setMapMessage("กำลังค้นหาตำแหน่งปัจจุบัน...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        };

        markerRef.current?.setLatLng([next.latitude, next.longitude]);
        markerRef.current?.setOpacity(1);
        mapRef.current?.setView([next.latitude, next.longitude], 18);
        onChangeRef.current?.(next);
        setMapMessage(
          position.coords.accuracy
            ? `พบตำแหน่ง ความแม่นยำประมาณ ${Math.round(position.coords.accuracy)} เมตร`
            : "พบตำแหน่งปัจจุบันแล้ว",
        );
        setLocating(false);
      },
      (error) => {
        const text = {
          1: "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาแตะแผนที่เพื่อเลือกเอง",
          2: "ไม่พบตำแหน่งปัจจุบัน กรุณาแตะแผนที่เพื่อเลือกเอง",
          3: "ค้นหาตำแหน่งนานเกินไป กรุณาลองอีกครั้งหรือเลือกบนแผนที่",
        }[error.code] || "ไม่สามารถอ่านตำแหน่งปัจจุบันได้";

        setMapMessage(text);
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      },
    );
  }

  const hasValue = validCoordinate(latitude, longitude);

  return (
    <section className={`map-picker ${required && !hasValue ? "map-picker-required" : ""}`}>
      <div className="map-picker-head">
        <div>
          <h3>เลือกตำแหน่งบ้านบนแผนที่</h3>
          <p>แตะจุดบนแผนที่ ลากหมุด หรือใช้ตำแหน่งปัจจุบัน</p>
        </div>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={useCurrentLocation}
          disabled={disabled || locating}
        >
          {locating ? "กำลังค้นหา..." : "ใช้ตำแหน่งปัจจุบัน"}
        </button>
      </div>

      <div
        id={mapId}
        ref={mapNode}
        className="map-picker-canvas"
        aria-label="แผนที่เลือกตำแหน่งบ้าน"
      />

      <div className="coordinate-row">
        <span>
          ละติจูด
          <strong>{hasValue ? Number(latitude).toFixed(7) : "ยังไม่เลือก"}</strong>
        </span>
        <span>
          ลองจิจูด
          <strong>{hasValue ? Number(longitude).toFixed(7) : "ยังไม่เลือก"}</strong>
        </span>
      </div>

      {mapMessage && <p className="map-message">{mapMessage}</p>}
      {required && !hasValue && (
        <p className="field-error">กรุณาเลือกตำแหน่งบ้านก่อนส่งข้อมูล</p>
      )}
    </section>
  );
}
