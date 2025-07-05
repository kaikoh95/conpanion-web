-- Migration: Enable pgsodium extension
-- Description: Enables the pgsodium extension for cryptographic functions
-- pgsodium provides libsodium cryptographic functions for PostgreSQL

-- Enable pgsodium extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;
