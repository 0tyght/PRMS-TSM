/* ============================================================
   GEO.js — เรขาคณิตของแผนที่หมู่บ้าน ตำบลท่าโพธิ์ (ใช้ร่วมทุกหน้า)
   ตำแหน่งอ้างอิงจริง: ตำบลท่าโพธิ์ อำเภอเมืองพิษณุโลก จังหวัดพิษณุโลก
   ============================================================ */
const GEO = (function () {
  const CENTER = [16.7550, 100.1950];
  const KM_PER_DEG_LAT = 111.32;
  const LNG_KM_PER_DEG = KM_PER_DEG_LAT * Math.cos((CENTER[0] * Math.PI) / 180);
  const HEX_RADIUS_KM = 0.24; // เล็กและตรงตำแหน่งจริง ไม่เน้นขนาดใหญ่

  // ตำแหน่งศูนย์กลางแต่ละหมู่บ้าน (หน่วย กม. จากจุดศูนย์กลางตำบล)
  // ได้จากการวัดตำแหน่งจริงบนแผนที่แบ่งเขตเทศบาลเมืองท่าโพธิ์ (แบบที่ 1)
  // เพื่อให้หกเหลี่ยม/หมุดบนแผนที่เว็บตรงกับตำแหน่งสัมพัทธ์ในแผนที่ต้นฉบับ
  const VILLAGE_POS = [
    { id: 11, cx: -1.33, cy: -1.62 }, // เหนือสุด ค่อนไปทางตะวันตก
    { id: 4,  cx: -1.82, cy: -0.98 }, // ตะวันตก ใต้หมู่ 11
    { id: 10, cx: -1.79, cy: -0.47 }, // ตะวันตก ใต้หมู่ 4
    { id: 5,  cx:  0.00, cy: -0.63 }, // กลางค่อนไปทางเหนือ
    { id: 3,  cx:  1.39, cy: -0.52 }, // ตะวันออก ค่อนไปทางเหนือ
    { id: 2,  cx:  2.46, cy: -0.39 }, // ตะวันออกสุด
    { id: 6,  cx: -1.79, cy:  0.00 }, // ตะวันตก กึ่งกลาง
    { id: 7,  cx: -0.04, cy:  0.21 }, // กึ่งกลางตำบล
    { id: 1,  cx:  2.00, cy:  0.25 }, // ตะวันออก กึ่งกลาง
    { id: 8,  cx:  0.68, cy:  0.77 }, // กลางค่อนไปทางใต้
    { id: 9,  cx: -0.62, cy:  1.98 }, // ใต้สุด
  ];

  function kmToLatLng(x, y) {
    return [CENTER[0] + -y / KM_PER_DEG_LAT, CENTER[1] + x / LNG_KM_PER_DEG];
  }
  function hexPolygon(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push(kmToLatLng(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return pts;
  }

  const VILLAGES = VILLAGE_POS.map((v) => {
    return {
      id: v.id,
      name: "หมู่ " + v.id,
      cx: v.cx, cy: v.cy,
      center: kmToLatLng(v.cx, v.cy),
      polygon: hexPolygon(v.cx, v.cy, HEX_RADIUS_KM),
    };
  }).sort((a, b) => a.id - b.id);

  const villageById = Object.fromEntries(VILLAGES.map((v) => [v.id, v]));

  // ขอบเขตรวมของทั้งตำบล (ใช้จำกัดการเลื่อน/ซูมแผนที่ ไม่ให้ออกนอกพื้นที่)
  function bounds(padKm = 1.2) {
    let lats = [], lngs = [];
    VILLAGES.forEach((v) => v.polygon.forEach(([la, ln]) => { lats.push(la); lngs.push(ln); }));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const padLat = padKm / KM_PER_DEG_LAT;
    const padLng = padKm / LNG_KM_PER_DEG;
    return [
      [minLat - padLat, minLng - padLng],
      [maxLat + padLat, maxLng + padLng],
    ];
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { CENTER, VILLAGES, villageById, HEX_RADIUS_KM, kmToLatLng, hexPolygon, bounds, mulberry32 };
})();
