-- Align Postgres schema with runtime sync code (reviews / photos / posts / products).
-- Fixes: Unknown argument deletedAt | category | couponCode | name | googleItemId | reviewChange

-- ── Review ──────────────────────────────────────────────────────────────────
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Review_syncStatus_idx" ON "Review"("syncStatus");

-- ── ReviewChange ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReviewChange" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT,
    "locationId" TEXT NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorPhoto" TEXT,
    "previousRating" INTEGER,
    "previousText" TEXT,
    "newRating" INTEGER,
    "newText" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReviewChange_locationId_idx" ON "ReviewChange"("locationId");
CREATE INDEX IF NOT EXISTS "ReviewChange_changeType_idx" ON "ReviewChange"("changeType");
CREATE INDEX IF NOT EXISTS "ReviewChange_detectedAt_idx" ON "ReviewChange"("detectedAt");
CREATE INDEX IF NOT EXISTS "ReviewChange_googleReviewId_idx" ON "ReviewChange"("googleReviewId");

DO $$ BEGIN
  ALTER TABLE "ReviewChange"
    ADD CONSTRAINT "ReviewChange_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ReviewChange"
    ADD CONSTRAINT "ReviewChange_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── BusinessPhoto ───────────────────────────────────────────────────────────
ALTER TABLE "BusinessPhoto" ADD COLUMN IF NOT EXISTS "category" TEXT;

-- ── Post (offer / event extras) ─────────────────────────────────────────────
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "redeemUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "offerTerms" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "endTime" TEXT;

-- ── Product (code uses name/source/googleItemId, not productName/status) ────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'productName'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'name'
  ) THEN
    ALTER TABLE "Product" RENAME COLUMN "productName" TO "name";
  END IF;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "name" TEXT;
UPDATE "Product" SET "name" = COALESCE("name", 'Untitled') WHERE "name" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "googleItemId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "googleEditId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "landingUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'status'
  ) THEN
    UPDATE "Product" SET "isActive" = ("status" = 'active') WHERE "status" IS NOT NULL;
    ALTER TABLE "Product" DROP COLUMN "status";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Product_googleItemId_idx" ON "Product"("googleItemId");
CREATE INDEX IF NOT EXISTS "Product_source_idx" ON "Product"("source");

-- Match grants on existing Prisma tables so myfng_app can read/write ReviewChange
GRANT ALL ON TABLE "ReviewChange" TO myfng_app;
GRANT ALL ON TABLE "ReviewChange" TO authenticated;
GRANT ALL ON TABLE "ReviewChange" TO service_role;
GRANT ALL ON TABLE "ReviewChange" TO anon;
