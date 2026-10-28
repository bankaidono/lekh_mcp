-- Migration: 0002_nested_children.sql
-- Adds children_json column to features table to support nested sub-features, fixes, and decisions.

ALTER TABLE features ADD COLUMN children_json TEXT NOT NULL DEFAULT '[]';
