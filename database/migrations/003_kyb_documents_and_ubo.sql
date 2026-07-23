-- Migration: 003_kyb_documents_and_ubo.sql
-- Description: Enhances KYB schema to support document uploads, UBO shareholding structures, and 17-checkpoint compliance risk audit trail.

USE crypto_payment_db;

-- 1. Table for uploaded KYB compliance documents (ACRA BizFile, NRICs, Passports, Bank Statements)
CREATE TABLE IF NOT EXISTS kyc_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kyc_submission_id VARCHAR(64) NOT NULL,
  merchant_id INT NOT NULL,
  document_type ENUM('ACRA_BIZFILE', 'DIRECTOR_NRIC', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'OTHER') NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  file_size_bytes INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table for Ultimate Beneficial Owners (UBO) shareholding structure (>25% equity)
CREATE TABLE IF NOT EXISTS kyc_ubos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kyc_submission_id VARCHAR(64) NOT NULL,
  merchant_id INT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  nric_or_passport VARCHAR(50) NOT NULL,
  nationality VARCHAR(100) DEFAULT 'Singaporean',
  ownership_percentage DECIMAL(5, 2) NOT NULL,
  is_pep TINYINT(1) DEFAULT 0,
  designation VARCHAR(100) DEFAULT 'Shareholder',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
