import { importGbpProductCatalogForLocation } from "../src/lib/gbp-product-catalog-import.ts";

const result = await importGbpProductCatalogForLocation("cmrdhaph400a0ehqqn1ad4psl");
console.log(JSON.stringify(result, null, 2));
