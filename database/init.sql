-- NHS GP Appointment Booking System Database Schema
-- Compliant with NHS Data Dictionary and UK GDPR requirements

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- GP Practices table
CREATE TABLE gp_practices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ods_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    postcode VARCHAR(10),
    phone VARCHAR(20),
    contact_email VARCHAR(255),
    gp_connect_endpoint VARCHAR(500) NOT NULL,
    asid VARCHAR(20) NOT NULL,
    mesh_mailbox_id VARCHAR(50),
    notifications JSONB DEFAULT '{"email": true, "sms": false, "mesh": true}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id VARCHAR(100) UNIQUE NOT NULL,
    patient_nhs_number VARCHAR(10) NOT NULL,
    practice_ods_code VARCHAR(10) NOT NULL,
    appointment_type VARCHAR(50) NOT NULL,
    appointment_start TIMESTAMP WITH TIME ZONE NOT NULL,
    appointment_end TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'booked',
    reason_for_appointment TEXT,
    urgency VARCHAR(20) DEFAULT 'routine',
    duration_minutes INTEGER DEFAULT 15,
    booked_by VARCHAR(100) NOT NULL,
    booked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (practice_ods_code) REFERENCES gp_practices(ods_code)
);

-- Audit trail table
CREATE TABLE access_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100) NOT NULL,
    user_role VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    patient_nhs_number VARCHAR(10),
    practice_ods_code VARCHAR(10),
    justification VARCHAR(500),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    trace_id UUID,
    outcome VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_gp_practices_ods_code ON gp_practices(ods_code);
CREATE INDEX idx_appointments_patient_nhs ON appointments(patient_nhs_number);
CREATE INDEX idx_appointments_practice ON appointments(practice_ods_code);
CREATE INDEX idx_access_audit_created_at ON access_audit(created_at DESC);

-- Insert sample data
INSERT INTO gp_practices (ods_code, name, address_line_1, city, postcode, gp_connect_endpoint, asid) VALUES
('A12345', 'Example Medical Centre', '123 High Street', 'London', 'SW1A 1AA', 'https://gp.example.nhs.uk/gpconnect', 'ABC123456789'),
('B67890', 'Community Health Practice', '456 Market Square', 'Manchester', 'M1 1AA', 'https://community.example.nhs.uk/fhir', 'DEF123456789'),
('C11111', 'Riverside Surgery', '789 River Road', 'Birmingham', 'B1 1AA', 'https://riverside.example.nhs.uk/fhir', 'GHI123456789');
