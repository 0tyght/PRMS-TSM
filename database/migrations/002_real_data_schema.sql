USE prms_tsm;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- PRMS-TSM Database Migration
-- เพิ่มโครงสร้างสำหรับใช้งานข้อมูลจริง
-- ไม่ลบตารางและไม่ลบข้อมูลเดิม
-- =========================================================

DELIMITER $$

-- ---------------------------------------------------------
-- เพิ่มคอลัมน์เฉพาะเมื่อยังไม่มี
-- ---------------------------------------------------------

DROP PROCEDURE IF EXISTS add_column_if_missing$$

CREATE PROCEDURE add_column_if_missing(
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
        SET @sql_statement = CONCAT(
            'ALTER TABLE `',
            REPLACE(p_table_name, '`', '``'),
            '` ADD COLUMN `',
            REPLACE(p_column_name, '`', '``'),
            '` ',
            p_column_definition
        );

        PREPARE prepared_statement FROM @sql_statement;
        EXECUTE prepared_statement;
        DEALLOCATE PREPARE prepared_statement;
    END IF;
END$$

-- ---------------------------------------------------------
-- เพิ่ม Index เฉพาะเมื่อยังไม่มี
-- ---------------------------------------------------------

DROP PROCEDURE IF EXISTS add_index_if_missing$$

CREATE PROCEDURE add_index_if_missing(
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
        SET @sql_statement = CONCAT(
            'ALTER TABLE `',
            REPLACE(p_table_name, '`', '``'),
            '` ADD INDEX `',
            REPLACE(p_index_name, '`', '``'),
            '` ',
            p_index_definition
        );

        PREPARE prepared_statement FROM @sql_statement;
        EXECUTE prepared_statement;
        DEALLOCATE PREPARE prepared_statement;
    END IF;
END$$

DELIMITER ;

-- =========================================================
-- 1. ปรับตาราง households
-- =========================================================

CALL add_column_if_missing(
    'households',
    'updated_at',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`'
);

CALL add_column_if_missing(
    'households',
    'deleted_at',
    'DATETIME NULL AFTER `updated_at`'
);

-- =========================================================
-- 2. ปรับตาราง owners
-- =========================================================

CALL add_column_if_missing(
    'owners',
    'deleted_at',
    'DATETIME NULL AFTER `updated_at`'
);

-- =========================================================
-- 3. ปรับตาราง pets
-- registered_at คือวันที่สัตว์ได้รับการอนุมัติขึ้นทะเบียนจริง
-- =========================================================

CALL add_column_if_missing(
    'pets',
    'registered_at',
    'DATETIME NULL AFTER `photo_path`'
);

-- =========================================================
-- 4. เพิ่มดัชนีสำหรับค้นหาและสรุปข้อมูลจริง
-- =========================================================

CALL add_index_if_missing(
    'households',
    'idx_household_deleted',
    '(`deleted_at`)'
);

CALL add_index_if_missing(
    'owners',
    'idx_owner_name_phone',
    '(`full_name`, `phone`)'
);

CALL add_index_if_missing(
    'owners',
    'idx_owner_household_active',
    '(`household_id`, `deleted_at`)'
);

CALL add_index_if_missing(
    'pets',
    'idx_pet_owner_name',
    '(`owner_id`, `name`)'
);

CALL add_index_if_missing(
    'pets',
    'idx_pet_status_deleted',
    '(`status`, `deleted_at`)'
);

CALL add_index_if_missing(
    'registrations',
    'idx_registration_pet_status',
    '(`pet_id`, `status`)'
);

CALL add_index_if_missing(
    'registrations',
    'idx_registration_owner_status',
    '(`owner_id`, `status`)'
);

CALL add_index_if_missing(
    'vaccination_records',
    'idx_vaccination_due',
    '(`next_due_at`)'
);

CALL add_index_if_missing(
    'cases',
    'idx_case_village_status',
    '(`village_id`, `status`)'
);

-- =========================================================
-- 5. ตารางประวัติสถานะสัตว์
-- ใช้เก็บทุกครั้งที่สถานะสัตว์เปลี่ยน เช่น
-- ACTIVE, MISSING, TRANSFERRED, DECEASED
-- =========================================================

CREATE TABLE IF NOT EXISTS pet_status_history (
    id CHAR(36) PRIMARY KEY,

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

    CONSTRAINT fk_pet_status_history_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id),

    CONSTRAINT fk_pet_status_history_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id),

    INDEX idx_pet_status_history_pet_date (
        pet_id,
        effective_at
    ),

    INDEX idx_pet_status_history_status (
        new_status,
        effective_at
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 6. ตารางประวัติการเปลี่ยนเจ้าของ
-- ป้องกันข้อมูลเจ้าของเดิมสูญหายเมื่อมีการโอนสัตว์
-- =========================================================

CREATE TABLE IF NOT EXISTS pet_owner_history (
    id CHAR(36) PRIMARY KEY,

    pet_id CHAR(36) NOT NULL,

    previous_owner_id CHAR(36) NULL,

    new_owner_id CHAR(36) NOT NULL,

    transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reason VARCHAR(500) NULL,

    recorded_by CHAR(36) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pet_owner_history_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id),

    CONSTRAINT fk_pet_owner_history_previous_owner
        FOREIGN KEY (previous_owner_id)
        REFERENCES owners(id),

    CONSTRAINT fk_pet_owner_history_new_owner
        FOREIGN KEY (new_owner_id)
        REFERENCES owners(id),

    CONSTRAINT fk_pet_owner_history_user
        FOREIGN KEY (recorded_by)
        REFERENCES users(id),

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
-- เลือกวันที่ตรวจสอบก่อน หากไม่มีจึงใช้วันที่ยื่นคำขอ
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
-- 8. สร้างประวัติสถานะเริ่มต้นสำหรับสัตว์เดิม
-- จะไม่เพิ่มซ้ำหากสัตว์มีประวัติอยู่แล้ว
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
-- 9. สร้างประวัติเจ้าของเริ่มต้นสำหรับสัตว์เดิม
-- จะไม่เพิ่มซ้ำหากสัตว์มีประวัติเจ้าของอยู่แล้ว
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
-- 10. ลบ Stored Procedure ชั่วคราว
-- =========================================================

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- =========================================================
-- 11. แสดงผลตรวจสอบหลัง Migration
-- =========================================================

SELECT
    'Migration completed successfully' AS migration_status;

SELECT
    COUNT(*) AS total_pet_status_history
FROM pet_status_history;

SELECT
    COUNT(*) AS total_pet_owner_history
FROM pet_owner_history;