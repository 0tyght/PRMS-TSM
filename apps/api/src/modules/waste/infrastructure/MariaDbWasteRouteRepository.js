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

  async findActiveServiceUserById(serviceUserId) {
    const [rows] = await this.database.execute(
      `SELECT id, route_id AS routeId, full_name AS fullName, house_no AS houseNo,
              CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude,
              route_assignment_distance_m AS routeAssignmentDistanceM
       FROM waste_service_users WHERE id = ? AND is_active = 1 LIMIT 1`,
      [serviceUserId],
    );
    return rows[0] || null;
  }

  async findStopByServiceUserId(serviceUserId) {
    const [rows] = await this.database.execute(
      `SELECT id, route_id AS routeId, service_user_id AS serviceUserId, sequence_no AS sequenceNo,
              stop_name AS stopName, CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude
       FROM waste_route_stops WHERE service_user_id = ? LIMIT 1`,
      [serviceUserId],
    );
    return rows[0] || null;
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

  async confirmServiceUserAssignment({ proposal, serviceUser, routeGeojson, confirmedBy, ipAddress }) {
    const candidate = proposal.stops.find((stop) => stop.assignmentCandidate === true);
    await this.database.transaction(async (db) => {
      const [storedProposalRows] = await db.execute(`SELECT id, confirmed_at AS confirmedAt, expires_at AS expiresAt FROM waste_route_proposals WHERE id = ? FOR UPDATE`, [proposal.id]);
      const [lockedUsers] = await db.execute(`SELECT id, route_id AS routeId, latitude, longitude FROM waste_service_users WHERE id = ? AND is_active = 1 FOR UPDATE`, [serviceUser.id]);
      const [lockedRoutes] = await db.execute(`SELECT id FROM waste_routes WHERE id = ? AND is_active = 1 FOR UPDATE`, [proposal.routeId]);
      const [targetStops] = await db.execute(`SELECT id, service_user_id AS serviceUserId FROM waste_route_stops WHERE route_id = ? AND is_active = 1 FOR UPDATE`, [proposal.routeId]);
      const [existingStops] = await db.execute(`SELECT id, route_id AS routeId FROM waste_route_stops WHERE service_user_id = ? FOR UPDATE`, [serviceUser.id]);
      const storedProposal = storedProposalRows[0];
      const lockedUser = lockedUsers[0];
      if (!storedProposal || storedProposal.confirmedAt || new Date(storedProposal.expiresAt) <= new Date()) throw new Error("PROPOSAL_EXPIRED");
      if (!lockedUser || (lockedUser.routeId || null) !== (candidate.previousRouteId || null)) throw new Error("SERVICE_USER_ROUTE_CHANGED");
      if (Math.abs(Number(lockedUser.latitude) - candidate.latitude) > 0.0000001 || Math.abs(Number(lockedUser.longitude) - candidate.longitude) > 0.0000001) {
        throw new Error("SERVICE_USER_LOCATION_CHANGED");
      }
      if (!lockedRoutes[0]) throw new Error("ROUTE_NOT_FOUND");
      const expectedIds = new Set(proposal.stops.filter((stop) => !stop.assignmentCandidate).map((stop) => stop.id));
      const actualIds = targetStops.filter((stop) => stop.serviceUserId !== serviceUser.id).map((stop) => stop.id);
      if (actualIds.length !== expectedIds.size || actualIds.some((id) => !expectedIds.has(id))) throw new Error("ROUTE_STOPS_CHANGED");

      const previousRouteId = lockedUser.routeId || null;
      const existingStop = existingStops[0];
      const actualStopId = existingStop?.id || crypto.randomUUID();
      await db.execute(
        `UPDATE waste_service_users SET route_id = ?, route_assignment_status = 'CONFIRMED',
                route_assignment_distance_m = ?, route_assigned_at = NOW(), route_assigned_by = ? WHERE id = ?`,
        [proposal.routeId, candidate.routeAssignmentDistanceM, confirmedBy, serviceUser.id],
      );
      await db.execute(`UPDATE waste_route_stops SET sequence_no = sequence_no + 1000 WHERE route_id = ? AND is_active = 1`, [proposal.routeId]);
      if (existingStop) {
        await db.execute(
          `UPDATE waste_route_stops SET route_id = ?, sequence_no = 60000, stop_name = ?, latitude = ?, longitude = ?, is_active = 1 WHERE id = ?`,
          [proposal.routeId, candidate.stopName, candidate.latitude, candidate.longitude, actualStopId],
        );
      } else {
        await db.execute(
          `INSERT INTO waste_route_stops (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
           VALUES (?, ?, ?, 60000, ?, ?, ?, 1)`,
          [actualStopId, proposal.routeId, serviceUser.id, candidate.stopName, candidate.latitude, candidate.longitude],
        );
      }
      for (const [index, stop] of proposal.stops.entries()) {
        await db.execute(`UPDATE waste_route_stops SET sequence_no = ? WHERE id = ? AND route_id = ?`, [index + 1, stop.assignmentCandidate ? actualStopId : stop.id, proposal.routeId]);
      }
      routeGeojson.properties.geometryStatus = proposal.stops.length < 2 ? "RECALCULATION_REQUIRED" : "CONFIRMED_OSRM_OPTIMIZED";
      if (proposal.stops.length < 2) routeGeojson.properties.recalculationReason = "ROUTE_REQUIRES_SECOND_SERVICE_POINT";
      else delete routeGeojson.properties.recalculationReason;
      routeGeojson.properties.confirmedAt = new Date().toISOString();
      routeGeojson.properties.confirmedBy = confirmedBy;
      routeGeojson.properties.routingWaypoints = routeGeojson.properties.routingWaypoints.map((stop) => (
        stop.stopId === candidate.id ? { ...stop, stopId: actualStopId } : stop
      ));
      await db.execute(`UPDATE waste_routes SET route_geojson = ? WHERE id = ?`, [JSON.stringify(routeGeojson), proposal.routeId]);
      if (previousRouteId && previousRouteId !== proposal.routeId) {
        const [previousRows] = await db.execute(`SELECT CAST(route_geojson AS CHAR) AS routeGeojson FROM waste_routes WHERE id = ? FOR UPDATE`, [previousRouteId]);
        const previousGeojson = parseJson(previousRows[0]?.routeGeojson);
        if (previousGeojson?.properties) {
          previousGeojson.properties.geometryStatus = "RECALCULATION_REQUIRED";
          previousGeojson.properties.recalculationReason = "SERVICE_USER_MOVED_TO_ANOTHER_ROUTE";
          await db.execute(`UPDATE waste_routes SET route_geojson = ? WHERE id = ?`, [JSON.stringify(previousGeojson), previousRouteId]);
        }
      }
      await db.execute(`UPDATE waste_route_proposals SET confirmed_at = NOW(), confirmed_by = ? WHERE id = ?`, [confirmedBy, proposal.id]);
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, ip_address)
         VALUES (?, ?, 'ASSIGN_AND_OPTIMIZE_WASTE_SERVICE_ROUTE', 'WASTE_SERVICE_USER', ?, ?, ?)`,
        [crypto.randomUUID(), confirmedBy, serviceUser.id, JSON.stringify({ previousRouteId, routeId: proposal.routeId, orderedStopIds: proposal.stopIds, distanceMeters: proposal.distanceMeters }), ipAddress || null],
      );
    });
  }
}
