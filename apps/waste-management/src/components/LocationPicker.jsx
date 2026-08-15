import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useLeafletResize from "../lib/useLeafletResize.js";
import {
  THA_PHO_CENTER,
  isInsideThaPhoServiceBounds,
  thaPhoLeafletBounds,
} from "../lib/wasteMapConfig.js";

function enforceThaPhoViewport(map) {
  if (!map) return;

  const bounds =
    L.latLngBounds(
      thaPhoLeafletBounds(),
    );

  map.setMaxBounds(bounds);

  const minimumZoom =
    map.getBoundsZoom(
      bounds,
      true,
      [20, 20],
    );

  if (Number.isFinite(minimumZoom)) {
    map.setMinZoom(minimumZoom);

    if (map.getZoom() < minimumZoom) {
      map.setZoom(
        minimumZoom,
        { animate: false },
      );
    }
  }

  map.panInsideBounds(
    bounds,
    { animate: false },
  );
}

export default function LocationPicker({
  latitude,
  longitude,
  onChange,
}) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current) {
      return undefined;
    }

    const bounds =
      L.latLngBounds(
        thaPhoLeafletBounds(),
      );

    const hasPoint =
      isInsideThaPhoServiceBounds(
        latitude,
        longitude,
      );

    const map =
      L.map(
        rootRef.current,
        {
          zoomControl: true,
          scrollWheelZoom: false,

          maxBounds: bounds,
          maxBoundsViscosity: 1,

          worldCopyJump: false,
        },
      )
        .setView(
          hasPoint
            ? [
                Number(latitude),
                Number(longitude),
              ]
            : THA_PHO_CENTER,
          hasPoint ? 17 : 13,
        );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          "© OpenStreetMap contributors",
      },
    ).addTo(map);

    const keepInside =
      () =>
        enforceThaPhoViewport(map);

    map.on(
      "resize",
      keepInside,
    );

    map.on(
      "zoomend",
      keepInside,
    );

    map.on(
      "moveend",
      keepInside,
    );

    map.on(
      "click",
      (event) => {
        if (
          !isInsideThaPhoServiceBounds(
            event.latlng.lat,
            event.latlng.lng,
          )
        ) {
          return;
        }

        onChange({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      },
    );

    mapRef.current = map;

    window.requestAnimationFrame(
      keepInside,
    );

    return () => {
      map.off(
        "resize",
        keepInside,
      );

      map.off(
        "zoomend",
        keepInside,
      );

      map.off(
        "moveend",
        keepInside,
      );

      map.remove();

      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useLeafletResize(
    mapRef,
    rootRef,
  );

  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) return;

    markerRef.current?.remove();
    markerRef.current = null;

    if (
      !isInsideThaPhoServiceBounds(
        latitude,
        longitude,
      )
    ) {
      return;
    }

    const point = [
      Number(latitude),
      Number(longitude),
    ];

    markerRef.current =
      L.circleMarker(
        point,
        {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: "#278432",
          fillOpacity: 1,
        },
      )
        .addTo(map)
        .bindTooltip(
          "สถานที่รับบริการ",
          {
            direction: "top",
          },
        );

    map.panTo(
      point,
      { animate: false },
    );

    enforceThaPhoViewport(map);
  }, [
    latitude,
    longitude,
  ]);

  const hasPoint =
    isInsideThaPhoServiceBounds(
      latitude,
      longitude,
    );

  return (
    <section className="waste-location-picker">
      <header>
        <div>
          <strong>
            ตำแหน่งสถานที่รับบริการ
          </strong>

          <span>
            เลือกตำแหน่งภายในเขตเทศบาลเมืองท่าโพธิ์
          </span>
        </div>

        {hasPoint ? (
          <button
            type="button"
            className="waste-button waste-button--quiet"
            onClick={() =>
              onChange({
                latitude: null,
                longitude: null,
              })
            }
          >
            ล้างตำแหน่ง
          </button>
        ) : null}
      </header>

      <div
        ref={rootRef}
        className="waste-location-picker__map"
        aria-label="แผนที่เลือกตำแหน่งผู้ใช้บริการเก็บขยะภายในเทศบาลเมืองท่าโพธิ์"
      />

      <footer>
        {hasPoint
          ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`
          : "ยังไม่ได้เลือกตำแหน่ง"}
      </footer>
    </section>
  );
}