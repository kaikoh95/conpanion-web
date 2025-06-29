-- Migration: Add approval action tracking
-- Description: This migration adds columns to track approval actions and comments
-- for decline/revision reasons

-- Add action_comment column to approvals table for decline/revision reasons
ALTER TABLE public.approvals 
ADD COLUMN action_comment TEXT,
ADD COLUMN action_taken_by UUID REFERENCES auth.users(id),
ADD COLUMN action_taken_at TIMESTAMP WITH TIME ZONE;
