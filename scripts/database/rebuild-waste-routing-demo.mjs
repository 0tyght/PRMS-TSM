import mysql from "mysql2/promise";
import crypto from "node:crypto";

const ROUTING_URL = "https://router.project-osrm.org";
const PUBLIC_DATA_NOTE = "สถานที่สาธารณะที่ตรวจสอบพิกัดได้จาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น ไม่ใช่ทะเบียนผู้ใช้บริการจริง";

const routeGroups = [
  {
    routeId: "b1100000-0000-4000-8000-000000000001",
    points: [
      ["NU Plaza", 16.7523122, 100.1964895, 3],
      ["KFC NU Plaza", 16.7524901, 100.1966076, 3],
      ["Mini Big C", 16.7538191, 100.1966309, 3],
    ],
  },
  {
    routeId: "b1100000-0000-4000-8000-000000000002",
    points: [
      ["วัดยางเอน", 16.7664083, 100.2053897, 6],
      ["โรงเรียนวัดยางเอน", 16.7677050, 100.2060960, 6],
      ["Palm Place 4", 16.7696774, 100.1986194, 4],
    ],
  },
  {
    routeId: "b1100000-0000-4000-8000-000000000003",
    points: [
      ["7-Eleven ใกล้มหาวิทยาลัยนเรศวร", 16.7527953, 100.1958045, 3],
      ["วัดสะกัดน้ำมัน", 16.7580059, 100.2090336, 3],
      ["โรงเรียนชุมชน 1 วัดสะกัดน้ำมัน", 16.7589599, 100.2103441, 3],
    ],
  },
  {
    routeId: "b1100000-0000-4000-8000-000000000004",
    points: [
      ["ศูนย์พัฒนาเด็กเล็กบ้านวังส้มซ่า", 16.7600722, 100.2115076, 4],
      ["สถานีบริการน้ำมัน PTT", 16.7600451, 100.2211993, 4],
      ["7-Eleven สาขา PTT", 16.7599445, 100.2217447, 4],
    ],
  },
  {
    routeId: "b1100000-0000-4000-8000-000000000005",
    points: [
      ["สถานีบริการน้ำมัน PT", 16.7606521, 100.1923585, 7],
      ["หมู่บ้านบุญธาริก", 16.7699367, 100.1953093, 8],
      ["สถานีบริการน้ำมัน Caltex", 16.7764094, 100.1980368, 8],
    ],
  },
  {
    routeId: "b1100000-0000-4000-8000-000000000006",
    points: [
      ["วัดจุฬามณี", 16.7878408, 100.2163920, 9],
      ["Lotus's Go Fresh", 16.7891995, 100.2205707, 9],
      ["วัดสว่างอารมณ์", 16.7946911, 100.2203579, 9],
    ],
  },
];

function uuidSuffix(index) {
  return String(index).padStart(12, "0");
}

async function calculateRoute(points) {
  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = `${ROUTING_URL}/trip/v1/driving/${coordinates}?source=first&roundtrip=true&overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, { headers: { "User-Agent": "Smart-Tha-Pho/1.0 route-demo-builder" } });
  if (!response.ok) throw new Error(`OSRM returned ${response.status} for ${url}`);
  const payload = await response.json();
  if (payload.code !== "Ok" || !payload.trips?.[0]) throw new Error(`OSRM could not calculate route: ${payload.code}`);
  const orderedPoints = [...points].sort((left, right) => payload.waypoints[left.inputIndex].waypoint_index - payload.waypoints[right.inputIndex].waypoint_index);
  return { trip: payload.trips[0], orderedPoints };
}

async function main() {
  const connection = await mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", database: "prms_tsm", charset: "utf8mb4" });
  try {
    const [villages] = await connection.execute("SELECT id, village_no AS villageNo FROM villages");
    const villageIds = new Map(villages.map((village) => [Number(village.villageNo), village.id]));
    const groups = [];
    let index = 0;
    for (const group of routeGroups) {
      const points = group.points.map(([name, latitude, longitude, villageNo]) => {
        index += 1;
        return {
          inputIndex: index - (groups.length * 3) - 1,
          id: `a4000000-0000-4000-8000-${uuidSuffix(index)}`,
          stopId: `a5000000-0000-4000-8000-${uuidSuffix(index)}`,
          serviceNo: `TEST-PT${String(index).padStart(3, "0")}`,
          phone: `099100${String(index).padStart(4, "0")}`,
          name, latitude, longitude, villageNo,
        };
      });
      points.forEach((point, pointIndex) => { point.inputIndex = pointIndex; });
      groups.push({ ...group, points });
    }

    await connection.beginTransaction();
    const allIds = groups.flatMap((group) => group.points.map((point) => point.id));
    const placeholders = allIds.map(() => "?").join(",");
    await connection.execute(`DELETE FROM waste_service_users WHERE service_no LIKE 'DEMO-S%' AND id NOT IN (${placeholders})`, allIds);

    for (const group of groups) {
      for (const point of group.points) {
        const villageId = villageIds.get(point.villageNo);
        if (!villageId) throw new Error(`Village ${point.villageNo} was not found`);
        await connection.execute(
          `INSERT INTO waste_service_users
            (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, route_id,
             route_assignment_status, route_assignment_distance_m, route_assigned_at, latitude, longitude, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'CONFIRMED', 0, NOW(), ?, ?, 1)
           ON DUPLICATE KEY UPDATE service_no=VALUES(service_no), full_name=VALUES(full_name), phone=VALUES(phone),
             house_no=VALUES(house_no), village_id=VALUES(village_id), address_detail=VALUES(address_detail),
             line_user_id=NULL, route_id=VALUES(route_id), route_assignment_status='CONFIRMED',
             route_assignment_distance_m=0, route_assigned_at=NOW(), latitude=VALUES(latitude),
             longitude=VALUES(longitude), is_active=1`,
          [point.id, point.serviceNo, `[จุดทดสอบ] ${point.name}`, point.phone, `จุด ${point.serviceNo.slice(-3)}`, villageId, PUBLIC_DATA_NOTE, group.routeId, point.latitude, point.longitude],
        );
      }

    }

    for (const group of groups) {
      const [registeredRows] = await connection.execute(
        `SELECT u.id, u.service_no AS serviceNo, u.full_name AS name, u.house_no AS houseNo,
                u.latitude, u.longitude, s.id AS stopId
         FROM waste_service_users u
         LEFT JOIN waste_route_stops s ON s.service_user_id = u.id
         WHERE u.route_id = ? AND u.is_active = 1 AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL`,
        [group.routeId],
      );
      const registeredPoints = registeredRows.map((point, pointIndex) => ({
        ...point,
        inputIndex: pointIndex,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        stopId: point.stopId || crypto.randomUUID(),
      }));
      if (registeredPoints.length < 2) throw new Error(`Route ${group.routeId} has fewer than two registered service points`);
      Object.assign(group, { points: registeredPoints, ...(await calculateRoute(registeredPoints)) });

      await connection.execute(
        `UPDATE waste_route_stops s LEFT JOIN waste_service_users u ON u.id = s.service_user_id
         SET s.is_active = 0
         WHERE s.route_id = ? AND (u.id IS NULL OR u.route_id <> ? OR u.is_active = 0)`,
        [group.routeId, group.routeId],
      );
      await connection.execute(
        `UPDATE waste_route_stops SET sequence_no = sequence_no + 1000 WHERE route_id = ?`,
        [group.routeId],
      );
      for (const [pointIndex, point] of group.orderedPoints.entries()) {
        const stopLabel = point.serviceNo.startsWith("TEST-PT") ? `จุดทดสอบ · ${point.name.replace(/^\[จุดทดสอบ\]\s*/, "")}` : `บ้าน ${point.houseNo} · ${point.name}`;
        await connection.execute(
          `INSERT INTO waste_route_stops (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE route_id=VALUES(route_id), service_user_id=VALUES(service_user_id),
             sequence_no=VALUES(sequence_no), stop_name=VALUES(stop_name), latitude=VALUES(latitude), longitude=VALUES(longitude), is_active=1`,
          [point.stopId, group.routeId, point.id, pointIndex + 1, stopLabel, point.latitude, point.longitude],
        );
      }

      const [[routeRow]] = await connection.execute("SELECT CAST(route_geojson AS CHAR) AS routeGeojson FROM waste_routes WHERE id = ? FOR UPDATE", [group.routeId]);
      const current = routeRow?.routeGeojson ? JSON.parse(routeRow.routeGeojson) : { type: "Feature", properties: {} };
      const routeGeojson = {
        type: "Feature",
        properties: {
          ...(current.properties || {}),
          geometryStatus: "CONFIRMED_OSRM_OPTIMIZED",
          geometrySource: "REGISTERED_SERVICE_POINTS_OSRM",
          testDataClassification: "PUBLIC_PLACE_TEST_POINTS_AND_REGISTERED_SERVICE_POINTS",
          distanceMeters: Math.round(group.trip.distance),
          durationSeconds: Math.round(group.trip.duration),
          stopCount: group.orderedPoints.length,
          routingWaypoints: group.orderedPoints.map((point) => ({ stopId: point.stopId, serviceUserId: point.id, name: point.name, latitude: point.latitude, longitude: point.longitude })),
          computedAt: new Date().toISOString(),
        },
        geometry: group.trip.geometry,
      };
      await connection.execute("UPDATE waste_routes SET route_geojson = ? WHERE id = ?", [JSON.stringify(routeGeojson), group.routeId]);
    }

    await connection.execute(
      `DELETE s FROM waste_route_stops s
       INNER JOIN waste_service_users u ON u.id = s.service_user_id
       WHERE u.service_no LIKE 'TEST-PT%' AND s.route_id <> u.route_id`,
    );
    await connection.execute(
      `UPDATE waste_stop_confirmations c INNER JOIN waste_route_stops s ON s.id = c.stop_id
       SET c.latitude = s.latitude, c.longitude = s.longitude`,
    );

    const [plans] = await connection.execute(
      `SELECT p.id, p.route_id AS routeId, p.status FROM waste_operation_plans p WHERE p.plan_no LIKE 'DEMO-%'`,
    );
    await connection.execute(
      `DELETE c FROM waste_stop_confirmations c
       INNER JOIN waste_operation_plans p ON p.id = c.plan_id
       WHERE p.plan_no LIKE 'DEMO-%'`,
    );
    for (const plan of plans) {
      const group = groups.find((item) => item.routeId === plan.routeId);
      if (!group) continue;
      await connection.execute("DELETE FROM waste_location_logs WHERE plan_id = ?", [plan.id]);
      const coordinates = group.trip.geometry.coordinates;
      const samples = [0.15, 0.5, 0.85].map((fraction) => coordinates[Math.min(coordinates.length - 1, Math.floor(coordinates.length * fraction))]);
      for (const [sampleIndex, coordinate] of samples.entries()) {
        await connection.execute(
          `INSERT INTO waste_location_logs (plan_id, latitude, longitude, accuracy_m, speed_kph, recorded_at, source)
           VALUES (?, ?, ?, 8, ?, DATE_ADD(TIMESTAMP(CURDATE(), '06:00:00'), INTERVAL ? MINUTE), 'DEVICE')`,
          [plan.id, coordinate[1], coordinate[0], sampleIndex === 2 ? 0 : 12 + (sampleIndex * 4), sampleIndex * 35],
        );
      }
      const confirmedPoints = plan.status === "COMPLETED" ? group.orderedPoints : ["IN_PROGRESS", "INTERRUPTED"].includes(plan.status) ? group.orderedPoints.slice(0, 1) : [];
      for (const [confirmedIndex, point] of confirmedPoints.entries()) {
        await connection.execute(
          `INSERT INTO waste_stop_confirmations
            (id, plan_id, stop_id, status, confirmed_at, latitude, longitude, note)
           VALUES (UUID(), ?, ?, 'COLLECTED', DATE_ADD(TIMESTAMP(CURDATE(), '06:00:00'), INTERVAL ? MINUTE), ?, ?, 'ข้อมูลทดสอบจากจุดสาธารณะ')`,
          [plan.id, point.stopId, 12 + (confirmedIndex * 35), point.latitude, point.longitude],
        );
      }
    }
    await connection.commit();
    console.log(`Rebuilt ${groups.length} routes from ${allIds.length} verified public-place test points plus active registered points.`);
    for (const group of groups) console.log(`${group.routeId}: ${Math.round(group.trip.distance)} m, ${group.trip.geometry.coordinates.length} road coordinates`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

await main();
