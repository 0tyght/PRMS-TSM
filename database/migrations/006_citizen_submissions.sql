USE prms_tsm;
SET NAMES utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
