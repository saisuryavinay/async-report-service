-- Database initialization script for async report service

CREATE DATABASE IF NOT EXISTS reports_db;
USE reports_db;

-- Reports table to store report metadata and status
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(36) PRIMARY KEY,
    report_type VARCHAR(100) NOT NULL,
    request_payload JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    generated_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    failure_reason TEXT DEFAULT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Verify table creation
SELECT 'Reports table created successfully' AS status;
