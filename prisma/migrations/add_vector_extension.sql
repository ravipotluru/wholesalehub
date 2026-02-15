-- ============================================================
-- WholesaleHub: pgvector extension and semantic search indexes
-- ============================================================
-- This migration enables vector similarity search on the products table.
-- It adds:
--   1. The pgvector extension
--   2. A 1024-dimension embedding column to products
--   3. An IVFFlat index for fast cosine similarity queries
--   4. A GIN full-text search index for keyword search
--
-- Prerequisites:
--   - PostgreSQL 15+ with pgvector extension installed
--   - Superuser or CREATE EXTENSION privileges
--
-- Run with:
--   psql -d wholesalehub -f prisma/migrations/add_vector_extension.sql
-- ============================================================

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column (1024 dimensions, matching Titan Embeddings V2)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 3. IVFFlat index for approximate nearest-neighbour cosine similarity search.
--    The 'lists' parameter controls the number of clusters. 100 is a good
--    starting point for tables with up to ~100k rows. Increase for larger
--    datasets (rule of thumb: sqrt(num_rows)).
CREATE INDEX IF NOT EXISTS idx_products_embedding
  ON products
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. GIN full-text search index across product text columns.
--    Used by keywordSearch() in src/lib/search.ts for ts_rank queries.
CREATE INDEX IF NOT EXISTS idx_products_fulltext
  ON products
  USING gin(
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce("searchKeywords", '') || ' ' ||
      coalesce(description, '')
    )
  );
