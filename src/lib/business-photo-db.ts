import { db } from "@/lib/db";

type BusinessPhotoRow = {
  locationId: string;
  source: string;
  imageUrl: string;
  category: string | null;
};

/** Read active photos; falls back if Prisma client predates the `category` column. */
export async function listActiveBusinessPhotos(locationIds: string[]): Promise<BusinessPhotoRow[]> {
  try {
    return await db.businessPhoto.findMany({
      where: { locationId: { in: locationIds }, status: "active" },
      select: { locationId: true, source: true, imageUrl: true, category: true },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Unknown field `category`")) throw e;
    const rows = await db.businessPhoto.findMany({
      where: { locationId: { in: locationIds }, status: "active" },
      select: { locationId: true, source: true, imageUrl: true },
    });
    return rows.map((r) => ({ ...r, category: null }));
  }
}

export async function createBusinessPhotoRecord(data: {
  locationId: string;
  googlePhotoId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  category: string | null;
  uploadedBy?: string | null;
  source: string;
  status: string;
}) {
  try {
    return await db.businessPhoto.create({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Unknown field `category`")) throw e;
    const { category: _category, ...rest } = data;
    return await db.businessPhoto.create({ data: rest });
  }
}
