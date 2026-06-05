-- ============================================================
-- Procurement Legacy Drop (Procurement Reformulation — Phase 2)
--
-- Archives and drops the legacy procurement_packages family.
-- The new canonical model lives in `tender` (migration 078) and
-- Trello-sourced rows were folded in by migration 080.
--
-- Archive first (belt-and-braces), then drop tables in dependency
-- order: stage_history, documents, notes, import_batches,
-- packages. Finally drop the old procurement_method text-CHECK
-- constraint residue (none is an enum, so no type to drop).
-- ============================================================

-- 1. Archive.
CREATE TABLE IF NOT EXISTS procurement_packages_archive_20260417
  AS SELECT * FROM procurement_packages;
CREATE TABLE IF NOT EXISTS procurement_stage_history_archive_20260417
  AS SELECT * FROM procurement_stage_history;
CREATE TABLE IF NOT EXISTS procurement_documents_archive_20260417
  AS SELECT * FROM procurement_documents;
CREATE TABLE IF NOT EXISTS procurement_notes_archive_20260417
  AS SELECT * FROM procurement_notes;
CREATE TABLE IF NOT EXISTS procurement_import_batches_archive_20260417
  AS SELECT * FROM procurement_import_batches;

-- 2. Drop (dependency order; CASCADE handles any lingering FKs).
DROP TABLE IF EXISTS procurement_stage_history  CASCADE;
DROP TABLE IF EXISTS procurement_documents      CASCADE;
DROP TABLE IF EXISTS procurement_notes          CASCADE;
DROP TABLE IF EXISTS procurement_import_batches CASCADE;
DROP TABLE IF EXISTS procurement_packages       CASCADE;
