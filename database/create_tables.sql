USE prms_tsm;

CREATE TABLE IF NOT EXISTS villages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  village_no TINYINT UNSIGNED NOT NULL UNIQUE,
  name_th VARCHAR(120) NOT NULL,
  boundary_geojson JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','OFFICER','VIEWER') NOT NULL DEFAULT 'OFFICER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS households (
  id CHAR(36) PRIMARY KEY,
  house_no VARCHAR(30) NOT NULL,
  village_id INT UNSIGNED NOT NULL,
  address_detail VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_households_village FOREIGN KEY (village_id) REFERENCES villages(id),
  INDEX idx_household_location (village_id, house_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS owners (
  id CHAR(36) PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  national_id VARCHAR(13) NULL,
  phone VARCHAR(10) NOT NULL,
  line_user_id VARCHAR(100) NULL,
  consent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_owners_household FOREIGN KEY (household_id) REFERENCES households(id),
  UNIQUE KEY uk_owner_national_id (national_id),
  INDEX idx_owner_phone (phone)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pets (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  registration_no VARCHAR(30) NULL UNIQUE,
  microchip_no VARCHAR(50) NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  species ENUM('DOG','CAT') NOT NULL,
  sex ENUM('MALE','FEMALE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  breed VARCHAR(100) NULL,
  color VARCHAR(100) NULL,
  birth_date DATE NULL,
  status ENUM('ACTIVE','MISSING','TRANSFERRED','DECEASED') NOT NULL DEFAULT 'ACTIVE',
  photo_path VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES owners(id),
  INDEX idx_pet_species_status (species, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) PRIMARY KEY,
  reference_no VARCHAR(30) NOT NULL UNIQUE,
  owner_id CHAR(36) NOT NULL,
  pet_id CHAR(36) NOT NULL,
  status ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_INFO','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  review_note VARCHAR(500) NULL,
  reviewed_by CHAR(36) NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_registration_owner FOREIGN KEY (owner_id) REFERENCES owners(id),
  CONSTRAINT fk_registration_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
  CONSTRAINT fk_registration_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
  INDEX idx_registration_status_date (status, submitted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vaccination_records (
  id CHAR(36) PRIMARY KEY,
  pet_id CHAR(36) NOT NULL,
  vaccine_name VARCHAR(150) NOT NULL,
  lot_no VARCHAR(100) NULL,
  vaccinated_at DATE NOT NULL,
  next_due_at DATE NULL,
  provider_name VARCHAR(150) NULL,
  recorded_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vaccination_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
  CONSTRAINT fk_vaccination_user FOREIGN KEY (recorded_by) REFERENCES users(id),
  INDEX idx_vaccination_pet_date (pet_id, vaccinated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sterilization_records (
  id CHAR(36) PRIMARY KEY,
  pet_id CHAR(36) NOT NULL,
  sterilized_at DATE NOT NULL,
  provider_name VARCHAR(150) NULL,
  note VARCHAR(500) NULL,
  recorded_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sterilization_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
  CONSTRAINT fk_sterilization_user FOREIGN KEY (recorded_by) REFERENCES users(id),
  UNIQUE KEY uk_sterilization_pet (pet_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cases (
  id CHAR(36) PRIMARY KEY,
  reference_no VARCHAR(30) NOT NULL UNIQUE,
  reporter_name VARCHAR(150) NULL,
  reporter_phone VARCHAR(10) NULL,
  village_id INT UNSIGNED NOT NULL,
  category ENUM('STRAY','BITE','SICK','NUISANCE','OTHER') NOT NULL,
  description TEXT NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  status ENUM('RECEIVED','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'RECEIVED',
  assigned_to CHAR(36) NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_village FOREIGN KEY (village_id) REFERENCES villages(id),
  CONSTRAINT fk_cases_assignee FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_case_status_date (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id CHAR(36) PRIMARY KEY,
  entity_type ENUM('REGISTRATION','PET','CASE','SERVICE') NOT NULL,
  entity_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attachment_entity (entity_type, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;
