import crypto from "node:crypto";
import { WasteRouteProposal } from "../domain/WasteRouteProposal.js";

function parseJson(value) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

export class MariaDbWasteRouteRepository {
  constructor({ database }) {
    if (!database) throw new TypeError("MariaDbWasteRouteRepository requires database");
    this.database = database;
  }

  async findById(routeId) {
    const [rows] = await this.database.execute(
      `SELECT id, route_code AS routeCode, route_name AS routeName, CAST(route_geojson AS CHAR) AS routeGeojson
       FROM waste_routes WHERE id = ? LIMIT 1`,
      [routeId],
    );
    return rows[0] ? { ...rows[0], routeGeojson: parseJson(rows[0].routeGeojson) } : null;
  }

  async listActiveStops(routeId) {
    const [rows] = await this.database.execute(
      `SELECT id, service_user_id AS serviceUserId, sequence_no AS sequenceNo, stop_name AS stopName,
              CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude
       FROM waste_route_stops WHERE route_id = ? AND is_active = 1 ORDER BY sequence_no`,
      [routeId],
    );
    return rows.map((row) => ({ ...row, sequenceNo: Number(row.sequenceNo) }));
  }

  async saveProposal(proposal) {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const routeGeojson = proposal.toGeoJson();
    await this.database.execute(
      `INSERT INTO waste_route_proposals
        (id, route_id, ordered_stops, route_geojson, distance_m, duration_s, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, proposal.routeId, JSON.stringify(proposal.stops), JSON.stringify(routeGeojson), proposal.distanceMeters, proposal.durationSeconds, expiresAt],
    );
    return new WasteRouteProposal({ ...proposal, id, expiresAt });
  }

  async findProposal(proposalId) {
    const [rows] = await this.database.execute(
      `SELECT id, route_id AS routeId, CAST(ordered_stops AS CHAR) AS orderedStops,
              CAST(route_geojson AS CHAR) AS routeGeojson, distance_m AS distanceMeters,
              duration_s AS durationSeconds, created_at AS generatedAt, expires_at AS expiresAt
       FROM waste_route_proposals WHERE id = ? AND confirmed_at IS NULL LIMIT 1`,
      [proposalId],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const routeGeojson = parseJson(row.routeGeojson);
    return new WasteRouteProposal({
      id: row.id,
      routeId: row.routeId,
      stops: parseJson(row.orderedStops),
      geometry: routeGeojson.geometry,
      distanceMeters: row.distanceMeters,
      durationSeconds: row.durationSeconds,
      generatedAt: row.generatedAt,
      expiresAt: row.expiresAt,
    });
  }

  async confirmProposal({ proposalId, routeId, orderedStopIds, routeGeojson, confirmedBy, ipAddress }) {
    await this.database.transaction(async (db) => {
      await db.execute(
        `UPDATE waste_route_stops SET sequence_no = sequence_no + 1000 WHERE route_id = ? AND is_active = 1`,
        [routeId],
      );
      for (const [index, stopId] of orderedStopIds.entries()) {
        await db.execute(
          `UPDATE waste_route_stops SET sequence_no = ? WHERE id = ? AND route_id = ?`,
          [index + 1, stopId, routeId],
        );
      }
      await db.execute(
        `UPDATE waste_route_stops SET sequence_no = sequence_no - 1000 WHERE route_id = ? AND sequence_no > 1000`,
        [routeId],
      );
      routeGeojson.properties.geometryStatus = "CONFIRMED_OSRM_OPTIMIZED";
      routeGeojson.properties.confirmedAt = new Date().toISOString();
      routeGeojson.properties.confirmedBy = confirmedBy;
      await db.execute(`UPDATE waste_routes SET route_geojson = ? WHERE id = ?`, [JSON.stringify(routeGeojson), routeId]);
      await db.execute(`UPDATE waste_route_proposals SET confirmed_at = NOW(), confirmed_by = ? WHERE id = ?`, [confirmedBy, proposalId]);
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, ip_address)
         VALUES (?, ?, 'CONFIRM_OPTIMIZED_WASTE_ROUTE', 'WASTE_ROUTE', ?, ?, ?)`,
        [crypto.randomUUID(), confirmedBy, routeId, JSON.stringify({ orderedStopIds, distanceMeters: routeGeojson.properties.distanceMeters }), ipAddress || null],
      );
    });
  }
}
