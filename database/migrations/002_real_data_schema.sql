USE prms_tsm;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- PRMS-TSM Migration 002
-- เพิ่มโครงสร้างสำหรับใช้งานข้อมูลจริง
--
-- ไฟล์นี้:
-- 1. ไม่ลบตารางเดิม
-- 2. ไม่ลบข้อมูลเดิม
-- 3. สามารถรันซ้ำได้
-- =========================================================

DELIMITER $$

-- =========================================================
-- Procedure: เพิ่มคอลัมน์เมื่อยังไม่มี
-- =========================================================

DROP PROCEDURE IF EXISTS prms_add_column_if_missing$$

CREATE PROCEDURE prms_add_column_if_missing(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = p_table_name
          AND column_name = p_column_name
    ) THEN
        SET @ddl_statement = CONCAT(
            'ALTER TABLE `',
            REPLACE(p_table_name, '`', '``'),
            '` ADD COLUMN `',
            REPLACE(p_column_name, '`', '``'),
            '` ',
            p_column_definition
        );

        PREPARE prms_statement FROM @ddl_statement;
        EXECUTE prms_statement;
        DEALLOCATE PREPARE prms_statement;
    END IF;
END$$

-- =========================================================
-- Procedure: เพิ่ม Index เมื่อยังไม่มี
-- =========================================================

DROP PROCEDURE IF EXISTS prms_add_index_if_missing$$

CREATE PROCEDURE prms_add_index_if_missing(
    IN p_table_name VARCHAR(64),
    IN p_index_name VARCHAR(64),
    IN p_index_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = p_table_name
          AND index_name = p_index_name
    ) THEN
        SET @ddl_statement = CONCAT(
            'ALTER TABLE `',
            REPLACE(p_table_name, '`', '``'),
            '` ADD INDEX `',
            REPLACE(p_index_name, '`', '``'),
            '` ',
            p_index_definition
        );

        PREPARE prms_statement FROM @ddl_statement;
        EXECUTE prms_statement;
        DEALLOCATE PREPARE prms_statement;
    END IF;
END$$

DELIMITER ;

-- =========================================================
-- 1. เพิ่มข้อมูลวันที่แก้ไขและ Soft Delete ให้ครัวเรือน
-- =========================================================

CALL prms_add_column_if_missing(
    'households',
    'updated_at',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`'
);

CALL prms_add_column_if_missing(
    'households',
    'deleted_at',
    'DATETIME NULL AFTER `updated_at`'
);

-- =========================================================
-- 2. เพิ่ม Soft Delete ให้เจ้าของสัตว์
-- owners มี updated_at อยู่แล้วในโครงสร้างเดิม
-- =========================================================

CALL prms_add_column_if_missing(
    'owners',
    'deleted_at',
    'DATETIME NULL AFTER `updated_at`'
);

-- =========================================================
-- 3. เพิ่มวันที่อนุมัติขึ้นทะเบียนจริงให้สัตว์
-- =========================================================

CALL prms_add_column_if_missing(
    'pets',
    'registered_at',
    'DATETIME NULL AFTER `photo_path`'
);

-- =========================================================
-- 4. เพิ่ม Index สำหรับการค้นหาและรายงาน
-- =========================================================

CALL prms_add_index_if_missing(
    'households',
    'idx_household_active_location',
    '(`deleted_at`, `village_id`, `house_no`)'
);

CALL prms_add_index_if_missing(
    'owners',
    'idx_owner_active_household',
    '(`deleted_at`, `household_id`)'
);

CALL prms_add_index_if_missing(
    'owners',
    'idx_owner_name_phone',
    '(`full_name`, `phone`)'
);

CALL prms_add_index_if_missing(
    'pets',
    'idx_pet_owner_name',
    '(`owner_id`, `name`)'
);

CALL prms_add_index_if_missing(
    'pets',
    'idx_pet_active_status',
    '(`deleted_at`, `status`)'
);

CALL prms_add_index_if_missing(
    'pets',
    'idx_pet_registered_at',
    '(`registered_at`)'
);

CALL prms_add_index_if_missing(
    'registrations',
    'idx_registration_pet_status',
    '(`pet_id`, `status`)'
);

CALL prms_add_index_if_missing(
    'registrations',
    'idx_registration_owner_status',
    '(`owner_id`, `status`)'
);

CALL prms_add_index_if_missing(
    'vaccination_records',
    'idx_vaccination_next_due',
    '(`next_due_at`)'
);

CALL prms_add_index_if_missing(
    'cases',
    'idx_case_village_status',
    '(`village_id`, `status`)'
);

-- =========================================================
-- 5. ตารางประวัติสถานะสัตว์
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
-- 6. ตารางประวัติการเปลี่ยนเจ้าของสัตว์
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

-- =========================================================
-- 7. เติมวันที่ขึ้นทะเบียนให้ข้อมูลเดิมที่อนุมัติแล้ว
-- =========================================================

UPDATE pets AS p
INNER JOIN (
    SELECT
        r.pet_id,
        MIN(
            COALESCE(
                r.reviewed_at,
                r.submitted_at,
                r.created_at
            )
        ) AS approved_at
    FROM registrations AS r
    WHERE r.status = 'APPROVED'
    GROUP BY r.pet_id
) AS approved_registration
    ON approved_registration.pet_id = p.id
SET p.registered_at = approved_registration.approved_at
WHERE p.registered_at IS NULL;

-- =========================================================
-- 8. สร้างประวัติสถานะเริ่มต้นให้สัตว์เดิม
-- =========================================================

INSERT INTO pet_status_history (
    id,
    pet_id,
    old_status,
    new_status,
    effective_at,
    note,
    recorded_by
)
SELECT
    UUID(),
    p.id,
    NULL,
    p.status,
    COALESCE(
        p.registered_at,
        p.created_at,
        NOW()
    ),
    'สถานะเริ่มต้นจากข้อมูลเดิมก่อนเริ่มใช้ระบบประวัติ',
    NULL
FROM pets AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM pet_status_history AS history
    WHERE history.pet_id = p.id
);

-- =========================================================
-- 9. สร้างประวัติเจ้าของเริ่มต้นให้สัตว์เดิม
-- =========================================================

INSERT INTO pet_owner_history (
    id,
    pet_id,
    previous_owner_id,
    new_owner_id,
    transferred_at,
    reason,
    recorded_by
)
SELECT
    UUID(),
    p.id,
    NULL,
    p.owner_id,
    COALESCE(
        p.registered_at,
        p.created_at,
        NOW()
    ),
    'เจ้าของเริ่มต้นจากข้อมูลเดิมก่อนเริ่มใช้ระบบประวัติ',
    NULL
FROM pets AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM pet_owner_history AS history
    WHERE history.pet_id = p.id
);

-- =========================================================
-- 10. ลบ Procedure ชั่วคราว
-- =========================================================

DROP PROCEDURE IF EXISTS prms_add_column_if_missing;
DROP PROCEDURE IF EXISTS prms_add_index_if_missing;

-- =========================================================
-- 11. ผลตรวจสอบ
-- =========================================================

SELECT
    'Migration 002 completed successfully' AS migration_status;

SELECT
    COUNT(*) AS total_pets
FROM pets;

SELECT
    COUNT(*) AS total_pet_status_history
FROM pet_status_history;

SELECT
    COUNT(*) AS total_pet_owner_history
FROM pet_owner_history;