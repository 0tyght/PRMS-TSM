USE prms_tsm;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- PRMS-TSM
-- โครงสร้างฐานข้อมูลหลักสำหรับการติดตั้งใหม่
-- =========================================================

-- =========================================================
-- 1. หมู่บ้าน
-- =========================================================

CREATE TABLE IF NOT EXISTS villages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,

    village_no TINYINT UNSIGNED NOT NULL,

    name_th VARCHAR(120) NOT NULL,

    boundary_geojson JSON NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uk_village_no (village_no),

    INDEX idx_village_active (
        is_active,
        village_no
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 2. ผู้ใช้งานระบบ
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL,

    full_name VARCHAR(150) NOT NULL,

    email VARCHAR(190) NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    role ENUM(
        'ADMIN',
        'OFFICER',
        'VIEWER'
    ) NOT NULL DEFAULT 'OFFICER',

    scope_village_id INT UNSIGNED NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    last_login_at DATETIME NULL,

    failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,

    locked_until DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uk_user_email (email),

    CONSTRAINT fk_user_scope_village
        FOREIGN KEY (scope_village_id)
        REFERENCES villages(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    INDEX idx_user_active_role (
        is_active,
        role
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- เก็บผลคำขอที่มี Idempotency-Key เพื่อป้องกันการบันทึกซ้ำ
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key_hash CHAR(64) NOT NULL,
    scope VARCHAR(80) NOT NULL,
    response_status SMALLINT UNSIGNED NULL,
    response_body JSON NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (key_hash, scope),
    INDEX idx_idempotency_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 3. ครัวเรือน
-- =========================================================

CREATE TABLE IF NOT EXISTS households (
    id CHAR(36) NOT NULL,

    house_no VARCHAR(30) NOT NULL,

    village_id INT UNSIGNED NOT NULL,

    address_detail VARCHAR(255) NULL,

    latitude DECIMAL(10,7) NULL,

    longitude DECIMAL(10,7) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    CONSTRAINT fk_households_village
        FOREIGN KEY (village_id)
        REFERENCES villages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    INDEX idx_household_location (
        village_id,
        house_no
    ),

    INDEX idx_household_active_location (
        deleted_at,
        village_id,
        house_no
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 4. เจ้าของสัตว์
-- =========================================================

CREATE TABLE IF NOT EXISTS owners (
    id CHAR(36) NOT NULL,

    household_id CHAR(36) NOT NULL,

    full_name VARCHAR(150) NOT NULL,

    national_id VARCHAR(13) NULL,

    phone VARCHAR(10) NOT NULL,

    line_user_id VARCHAR(100) NULL,

    consent_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    CONSTRAINT fk_owners_household
        FOREIGN KEY (household_id)
        REFERENCES households(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    UNIQUE KEY uk_owner_national_id (
        national_id
    ),

    INDEX idx_owner_phone (
        phone
    ),

    INDEX idx_owner_active_household (
        deleted_at,
        household_id
    ),

    INDEX idx_owner_name_phone (
        full_name,
        phone
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 5. สัตว์เลี้ยง
-- =========================================================

CREATE TABLE IF NOT EXISTS pets (
    id CHAR(36) NOT NULL,

    owner_id CHAR(36) NOT NULL,

    registration_no VARCHAR(30) NULL,

    microchip_no VARCHAR(50) NULL,

    name VARCHAR(100) NOT NULL,

    species ENUM(
        'DOG',
        'CAT'
    ) NOT NULL,

    sex ENUM(
        'MALE',
        'FEMALE',
        'UNKNOWN'
    ) NOT NULL DEFAULT 'UNKNOWN',

    breed VARCHAR(100) NULL,

    color VARCHAR(100) NULL,

    birth_date DATE NULL,

    status ENUM(
        'ACTIVE',
        'MISSING',
        'TRANSFERRED',
        'DECEASED'
    ) NOT NULL DEFAULT 'ACTIVE',

    photo_path VARCHAR(255) NULL,

    registered_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    PRIMARY KEY (id),

    CONSTRAINT fk_pets_owner
        FOREIGN KEY (owner_id)
        REFERENCES owners(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    UNIQUE KEY uk_pet_registration_no (
        registration_no
    ),

    UNIQUE KEY uk_pet_microchip_no (
        microchip_no
    ),

    INDEX idx_pet_species_status (
        species,
        status
    ),

    INDEX idx_pet_owner_name (
        owner_id,
        name
    ),

    INDEX idx_pet_active_status (
        deleted_at,
        status
    ),

    INDEX idx_pet_registered_at (
        registered_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 6. คำขอขึ้นทะเบียนสัตว์
-- =========================================================

CREATE TABLE IF NOT EXISTS registrations (
    id CHAR(36) NOT NULL,

    reference_no VARCHAR(30) NOT NULL,

    owner_id CHAR(36) NOT NULL,

    pet_id CHAR(36) NOT NULL,

    status ENUM(
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'NEED_MORE_INFO',
        'APPROVED',
        'REJECTED'
    ) NOT NULL DEFAULT 'DRAFT',

    review_note VARCHAR(500) NULL,

    reviewed_by CHAR(36) NULL,

    submitted_at DATETIME NULL,

    reviewed_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_registration_owner
        FOREIGN KEY (owner_id)
        REFERENCES owners(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_registration_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_registration_reviewer
        FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    UNIQUE KEY uk_registration_reference_no (
        reference_no
    ),

    INDEX idx_registration_status_date (
        status,
        submitted_at
    ),

    INDEX idx_registration_pet_status (
        pet_id,
        status
    ),

    INDEX idx_registration_owner_status (
        owner_id,
        status
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 7. คำขอเปลี่ยนแปลงข้อมูลจากประชาชน
-- =========================================================

CREATE TABLE IF NOT EXISTS citizen_submissions (
    id CHAR(36) NOT NULL,
    reference_no VARCHAR(30) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    pet_id CHAR(36) NOT NULL,
    subject_type ENUM('PET_UPDATE','VACCINATION','STERILIZATION','PET_STATUS') NOT NULL,
    current_payload JSON NULL,
    proposed_payload JSON NOT NULL,
    status ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_INFO','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
    review_note VARCHAR(500) NULL,
    reviewed_by CHAR(36) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_citizen_submission_reference (reference_no),
    INDEX idx_citizen_submission_queue (status, subject_type, submitted_at),
    INDEX idx_citizen_submission_owner (owner_id, created_at),
    INDEX idx_citizen_submission_pet_status (pet_id, status),
    CONSTRAINT fk_citizen_submission_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_citizen_submission_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_citizen_submission_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 8. ประวัติการฉีดวัคซีน
-- =========================================================

CREATE TABLE IF NOT EXISTS vaccination_records (
    id CHAR(36) NOT NULL,

    pet_id CHAR(36) NOT NULL,

    vaccine_name VARCHAR(150) NOT NULL,

    lot_no VARCHAR(100) NULL,

    vaccinated_at DATE NOT NULL,

    next_due_at DATE NULL,

    provider_name VARCHAR(150) NULL,

    recorded_by CHAR(36) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_vaccination_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    INDEX idx_vaccination_pet_date (
        pet_id,
        vaccinated_at
    ),

    INDEX idx_vaccination_next_due (
        next_due_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 8. ประวัติการทำหมัน
-- =========================================================

CREATE TABLE IF NOT EXISTS sterilization_records (
    id CHAR(36) NOT NULL,

    pet_id CHAR(36) NOT NULL,

    sterilized_at DATE NOT NULL,

    provider_name VARCHAR(150) NULL,

    note VARCHAR(500) NULL,

    recorded_by CHAR(36) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_sterilization_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_sterilization_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    UNIQUE KEY uk_sterilization_pet (
        pet_id
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 9. เรื่องร้องเรียนและเหตุการณ์
-- =========================================================

CREATE TABLE IF NOT EXISTS cases (
    id CHAR(36) NOT NULL,

    reference_no VARCHAR(30) NOT NULL,

    reporter_name VARCHAR(150) NULL,

    reporter_phone VARCHAR(10) NULL,

    village_id INT UNSIGNED NOT NULL,

    category ENUM(
        'STRAY',
        'BITE',
        'SICK',
        'NUISANCE',
        'OTHER'
    ) NOT NULL,

    description TEXT NOT NULL,

    latitude DECIMAL(10,7) NULL,

    longitude DECIMAL(10,7) NULL,

    status ENUM(
        'RECEIVED',
        'ASSIGNED',
        'IN_PROGRESS',
        'RESOLVED',
        'CLOSED'
    ) NOT NULL DEFAULT 'RECEIVED',

    assigned_to CHAR(36) NULL,

    resolved_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_cases_village
        FOREIGN KEY (village_id)
        REFERENCES villages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_cases_assignee
        FOREIGN KEY (assigned_to)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    UNIQUE KEY uk_case_reference_no (
        reference_no
    ),

    INDEX idx_case_status_date (
        status,
        created_at
    ),

    INDEX idx_case_village_status (
        village_id,
        status
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 10. ไฟล์แนบ
-- =========================================================

CREATE TABLE IF NOT EXISTS attachments (
    id CHAR(36) NOT NULL,

    entity_type ENUM(
        'REGISTRATION',
        'PET',
        'CASE',
        'SERVICE'
    ) NOT NULL,

    entity_id CHAR(36) NOT NULL,

    file_name VARCHAR(255) NOT NULL,

    storage_path VARCHAR(500) NOT NULL,

    mime_type VARCHAR(100) NOT NULL,

    file_size INT UNSIGNED NOT NULL,

    checksum_sha256 CHAR(64) NULL,

    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    INDEX idx_attachment_entity (
        entity_type,
        entity_id
    ),

    UNIQUE KEY uk_attachment_entity_checksum (
        entity_type,
        entity_id,
        checksum_sha256
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 11. ประวัติการดำเนินงานในระบบ
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) NOT NULL,

    user_id CHAR(36) NULL,

    action VARCHAR(80) NOT NULL,

    entity_type VARCHAR(80) NOT NULL,

    entity_id CHAR(36) NULL,

    old_value JSON NULL,

    new_value JSON NULL,

    ip_address VARCHAR(45) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    INDEX idx_audit_entity (
        entity_type,
        entity_id
    ),

    INDEX idx_audit_created (
        created_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 12. ประวัติการเปลี่ยนสถานะสัตว์
-- =========================================================

CREATE TABLE IF NOT EXISTS pet_status_history (
    id CHAR(36) NOT NULL,

    pet_id CHAR(36) NOT NULL,

    old_status ENUM(
        'ACTIVE',
        'MISSING',
        'TRANSFERRED',
        'DECEASED'
    ) NULL,

    new_status ENUM(
        'ACTIVE',
        'MISSING',
        'TRANSFERRED',
        'DECEASED'
    ) NOT NULL,

    effective_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    note VARCHAR(500) NULL,

    recorded_by CHAR(36) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_pet_status_history_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pet_status_history_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    INDEX idx_pet_status_history_pet_date (
        pet_id,
        effective_at
    ),

    INDEX idx_pet_status_history_status_date (
        new_status,
        effective_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 13. ประวัติการเปลี่ยนเจ้าของสัตว์
-- =========================================================

CREATE TABLE IF NOT EXISTS pet_owner_history (
    id CHAR(36) NOT NULL,

    pet_id CHAR(36) NOT NULL,

    previous_owner_id CHAR(36) NULL,

    new_owner_id CHAR(36) NOT NULL,

    transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reason VARCHAR(500) NULL,

    recorded_by CHAR(36) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_pet_owner_history_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pet_owner_history_previous_owner
        FOREIGN KEY (previous_owner_id)
        REFERENCES owners(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pet_owner_history_new_owner
        FOREIGN KEY (new_owner_id)
        REFERENCES owners(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_pet_owner_history_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    INDEX idx_pet_owner_history_pet_date (
        pet_id,
        transferred_at
    ),

    INDEX idx_pet_owner_history_new_owner (
        new_owner_id,
        transferred_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

SELECT
    'PRMS-TSM database tables created successfully' AS status;
