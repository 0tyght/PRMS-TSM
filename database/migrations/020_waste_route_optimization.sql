USE prms_tsm;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS waste_route_proposals (
    id CHAR(36) NOT NULL,
    route_id CHAR(36) NOT NULL,
    ordered_stops JSON NOT NULL,
    route_geojson JSON NOT NULL,
    distance_m INT UNSIGNED NOT NULL,
    duration_s INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    confirmed_at DATETIME NULL,
    confirmed_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_route_proposal_route FOREIGN KEY (route_id)
        REFERENCES waste_routes(id) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_waste_route_proposal_active (route_id, confirmed_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 020 completed successfully' AS migration_status;
