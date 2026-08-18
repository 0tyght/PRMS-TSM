USE prms_tsm;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS waste_vehicles (
    id CHAR(36) NOT NULL,
    vehicle_code VARCHAR(30) NOT NULL,
    registration_no VARCHAR(30) NOT NULL,
    vehicle_type VARCHAR(100) NOT NULL,
    capacity_kg INT UNSIGNED NULL,
    status ENUM('AVAILABLE', 'IN_SERVICE', 'MAINTENANCE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'AVAILABLE',
    last_latitude DECIMAL(10,7) NULL,
    last_longitude DECIMAL(10,7) NULL,
    last_gps_at DATETIME NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_vehicle_code (vehicle_code),
    UNIQUE KEY uk_waste_vehicle_registration (registration_no),
    INDEX idx_waste_vehicle_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_drivers (
    id CHAR(36) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    line_user_id VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_driver_line_user (line_user_id),
    INDEX idx_waste_driver_active_name (is_active, full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_routes (
    id CHAR(36) NOT NULL,
    route_code VARCHAR(30) NOT NULL,
    route_name VARCHAR(150) NOT NULL,
    description VARCHAR(500) NULL,
    route_geojson JSON NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_route_code (route_code),
    INDEX idx_waste_route_active_name (is_active, route_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_service_users (
    id CHAR(36) NOT NULL,
    service_no VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    house_no VARCHAR(30) NOT NULL,
    village_id INT UNSIGNED NOT NULL,
    address_detail VARCHAR(255) NULL,
    line_user_id VARCHAR(100) NULL,
    route_id CHAR(36) NULL,
    route_assignment_status ENUM('UNASSIGNED', 'SUGGESTED', 'CONFIRMED') NOT NULL DEFAULT 'UNASSIGNED',
    route_assignment_distance_m DECIMAL(10,2) NULL,
    route_assigned_at DATETIME NULL,
    route_assigned_by CHAR(36) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_service_no (service_no),
    UNIQUE KEY uk_waste_service_line_user (line_user_id),
    CONSTRAINT fk_waste_service_village FOREIGN KEY (village_id)
        REFERENCES villages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_waste_service_route FOREIGN KEY (route_id)
        REFERENCES waste_routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_waste_service_route (route_id, is_active),
    INDEX idx_waste_service_assignment (route_assignment_status, route_id, is_active),
    INDEX idx_waste_service_village (village_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_route_stops (
    id CHAR(36) NOT NULL,
    route_id CHAR(36) NOT NULL,
    service_user_id CHAR(36) NULL,
    sequence_no SMALLINT UNSIGNED NOT NULL,
    stop_name VARCHAR(150) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_stop_route FOREIGN KEY (route_id)
        REFERENCES waste_routes(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_waste_stop_service_user FOREIGN KEY (service_user_id)
        REFERENCES waste_service_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uk_waste_stop_sequence (route_id, sequence_no),
    INDEX idx_waste_stop_service_user (service_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_operation_plans (
    id CHAR(36) NOT NULL,
    plan_no VARCHAR(30) NOT NULL,
    scheduled_date DATE NOT NULL,
    route_id CHAR(36) NOT NULL,
    vehicle_id CHAR(36) NOT NULL,
    driver_id CHAR(36) NOT NULL,
    scheduled_start_at DATETIME NULL,
    scheduled_end_at DATETIME NULL,
    actual_start_at DATETIME NULL,
    actual_end_at DATETIME NULL,
    status ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INTERRUPTED') NOT NULL DEFAULT 'SCHEDULED',
    note VARCHAR(500) NULL,
    created_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_plan_no (plan_no),
    CONSTRAINT fk_waste_plan_route FOREIGN KEY (route_id)
        REFERENCES waste_routes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_waste_plan_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES waste_vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_waste_plan_driver FOREIGN KEY (driver_id)
        REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_waste_plan_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_waste_plan_schedule (scheduled_date, status),
    INDEX idx_waste_plan_vehicle_date (vehicle_id, scheduled_date),
    INDEX idx_waste_plan_driver_date (driver_id, scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_location_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    plan_id CHAR(36) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    accuracy_m DECIMAL(8,2) NULL,
    speed_kph DECIMAL(7,2) NULL,
    recorded_at DATETIME NOT NULL,
    source ENUM('LINE', 'DEVICE', 'OFFICER') NOT NULL DEFAULT 'LINE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_location_plan FOREIGN KEY (plan_id)
        REFERENCES waste_operation_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_waste_location_plan_time (plan_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_stop_confirmations (
    id CHAR(36) NOT NULL,
    plan_id CHAR(36) NOT NULL,
    stop_id CHAR(36) NOT NULL,
    status ENUM('COLLECTED', 'SKIPPED') NOT NULL DEFAULT 'COLLECTED',
    confirmed_at DATETIME NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_confirmation_plan FOREIGN KEY (plan_id)
        REFERENCES waste_operation_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_waste_confirmation_stop FOREIGN KEY (stop_id)
        REFERENCES waste_route_stops(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE KEY uk_waste_confirmation_plan_stop (plan_id, stop_id),
    INDEX idx_waste_confirmation_plan_status (plan_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_incidents (
    id CHAR(36) NOT NULL,
    plan_id CHAR(36) NULL,
    vehicle_id CHAR(36) NULL,
    replacement_vehicle_id CHAR(36) NULL,
    replacement_driver_id CHAR(36) NULL,
    driver_id CHAR(36) NULL,
    incident_type ENUM('VEHICLE_BREAKDOWN', 'ACCIDENT', 'ROAD_CLOSED', 'ACCESS_BLOCKED', 'OTHER') NOT NULL,
    status ENUM('REPORTED', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'REPORTED',
    description VARCHAR(1000) NOT NULL,
    happened_at DATETIME NOT NULL,
    resolved_at DATETIME NULL,
    resolution_note VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_incident_plan FOREIGN KEY (plan_id)
        REFERENCES waste_operation_plans(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_incident_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES waste_vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_incident_replacement FOREIGN KEY (replacement_vehicle_id)
        REFERENCES waste_vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_incident_replacement_driver FOREIGN KEY (replacement_driver_id)
        REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_incident_driver FOREIGN KEY (driver_id)
        REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_waste_incident_replacement_driver (replacement_driver_id),
    INDEX idx_waste_incident_status_time (status, happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_fee_rates (
    id CHAR(36) NOT NULL,
    rate_name VARCHAR(150) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    billing_cycle ENUM('MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_waste_fee_rate_active (is_active, rate_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_service_charges (
    id CHAR(36) NOT NULL,
    service_user_id CHAR(36) NOT NULL,
    fee_rate_id CHAR(36) NULL,
    billing_period DATE NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('PENDING', 'PAID', 'OVERDUE', 'VOID') NOT NULL DEFAULT 'PENDING',
    paid_at DATETIME NULL,
    notice_requested_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_charge_service_user FOREIGN KEY (service_user_id)
        REFERENCES waste_service_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_waste_charge_fee_rate FOREIGN KEY (fee_rate_id)
        REFERENCES waste_fee_rates(id) ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uk_waste_charge_period (service_user_id, billing_period),
    INDEX idx_waste_charge_status_due (status, due_date),
    INDEX idx_waste_charge_period (billing_period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 015 completed successfully' AS migration_status;
