USE prms_tsm;

SET NAMES utf8mb4;

CREATE TEMPORARY TABLE tmp_closed_waste_line_ids (
    line_user_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (line_user_id)
);

INSERT IGNORE INTO tmp_closed_waste_line_ids (line_user_id)
SELECT line_user_id
FROM waste_service_users
WHERE is_active = 0
  AND line_user_id IS NOT NULL
  AND line_user_id <> '';

DELETE s
FROM waste_line_sessions s
INNER JOIN tmp_closed_waste_line_ids x
    ON x.line_user_id = s.line_user_id
WHERE s.channel_type = 'CITIZEN';

UPDATE waste_service_users u
INNER JOIN tmp_closed_waste_line_ids x
    ON x.line_user_id = u.line_user_id
SET u.line_user_id = NULL
WHERE u.is_active = 0;

DROP TEMPORARY TABLE tmp_closed_waste_line_ids;

SELECT 'Migration 023 completed successfully' AS migration_status;
