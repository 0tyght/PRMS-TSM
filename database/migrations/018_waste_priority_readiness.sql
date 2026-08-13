USE prms_tsm;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS waste_plan_sequences (
    plan_date DATE NOT NULL,
    last_number INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (plan_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO waste_plan_sequences (plan_date, last_number)
SELECT scheduled_date,
       MAX(CAST(SUBSTRING_INDEX(plan_no, '-', -1) AS UNSIGNED)) AS last_number
FROM waste_operation_plans
WHERE plan_no REGEXP '^WST-[0-9]{8}-[0-9]+$'
GROUP BY scheduled_date
ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number));

SELECT 'Migration 018 completed successfully' AS migration_status;
