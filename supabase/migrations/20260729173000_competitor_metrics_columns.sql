-- Competitor metrics used by Discover nearby / compare UI (schema drift fix)

ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "photoCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "serviceCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "productCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "qnaCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "categoryCount" INTEGER;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "distance" DOUBLE PRECISION;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "website" TEXT;

CREATE INDEX IF NOT EXISTS "Competitor_locationId_idx" ON "Competitor"("locationId");
CREATE INDEX IF NOT EXISTS "Competitor_googlePlaceId_idx" ON "Competitor"("googlePlaceId");
