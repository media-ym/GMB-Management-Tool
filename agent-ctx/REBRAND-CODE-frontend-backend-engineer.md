# Task: REBRAND-CODE — Rebrand source files from Home Interiors → Multi-Brand Car Service

**Agent:** Frontend/Backend Engineer
**Scope:** All `src/` files (excluding `prisma/seed.ts` which is handled by another agent)

## Changes Made

### `src/lib/ai.ts` — 5 AI prompts rebranded
1. **`aiReviewReply`** (line 88): "home interiors & services brand" → "multi-brand car service & repair brand" with 4 cities (Mumbai, Navi Mumbai, Thane, Pune). Positive-tone branch updated to reference "car model, service type, etc.".
2. **`aiGeneratePost`** (line 161): Now "MyFNG Autocare (multi-brand car service & repair brand across Mumbai, Navi Mumbai, Thane, Pune, India)". Body rule updated to "highlight value to local car owners (Maruti, Hyundai, Honda, Tata, Mahindra, Toyota)".
3. **`aiSeoSuggestions`** (line 223): "multi-city home services brand" → "multi-brand car service brand" with 4-city list.
4. **`aiMonthlySummary`** (line 273): "MyFNG marketing team" → "MyFNG Autocare marketing team".
5. **`aiChat`** (line 320): "multi-city home interiors & services brand" → "multi-brand car service & repair brand". Removed the 11 extra cities (Nashik, Panvel, Kalyan, Dombivli, Bhiwandi, Mira Road, Vasai, Virar, Ambernath, Badlapur, Raigad). Now just "Mumbai, Navi Mumbai, Thane, and Pune".

### `src/app/api/locations/route.ts` — default new-location seed
- `categoriesJson`: `["Interior Designer"]` → `["Auto Repair Shop"]`
- `servicesJson`: `["Modular Kitchen", "Wardrobe Design", "Full Home Interiors"]` → `["Periodic Service", "Brake Repair", "AC Service & Repair"]`
- Default `BusinessCategory` rows: `Interior Designer` (primary), `Home Improvement Store`, `Furniture Store` → `Auto Repair Shop` (primary), `Car Service Station`, `Auto Air Conditioning Service`
- Default `Service` rows: Modular Kitchen / Wardrobe Design / Full Home Interiors / False Ceiling → Periodic Service / Brake Repair / AC Service & Repair / Multi-Brand Repair (with car-service descriptions)

### `src/app/api/locations/import/route.ts` (line 95)
- Fallback `primaryCategory`: `"Interior Designer"` → `"Auto Repair Shop"`

### `src/lib/google-service.ts` (line 1163)
- Fallback `categoryName` when Google's `displayName` is empty: `"Interior Designer"` → `"Auto Repair Shop"`
- **NOTE:** Left untouched — Google photo category enum values `INTERIOR`/`EXTERIOR` (lines 506, etc.) and Google category ID examples `gcid:interior_designer` in comments (lines 351, 372, 761). These are official Google Business Profile API constants/category IDs, NOT business-context strings. Changing them would break the API integration.

### `src/components/views/dashboard-view.tsx` (line 271)
- AI suggestion body: `"'modular kitchen mumbai' and 'home interiors pune' slipped this week..."` → `"'car service mumbai' and 'car repair pune' slipped this week..."`

### `src/components/views/settings-view.tsx` (line 1320)
- Tagline placeholder: `"Home Interiors & Services"` → `"Multi-Brand Car Service & Repair"`

### `src/components/views/seo-view.tsx` (line 1117)
- Keyword placeholder: `"e.g. interior designer mumbai"` → `"e.g. car service mumbai"`

### `src/components/views/posts-view.tsx` (lines 1566, 1779)
- MiSA AI topic example: `"Monsoon modular kitchen offer"` → `"Monsoon car AC service offer"`
- Post title placeholder: `"e.g. Monsoon Sale — Up to 30% off modular kitchens"` → `"e.g. Monsoon Sale — Up to 30% off car AC service"`

### `src/components/views/ai-view.tsx` (lines 49-50)
- Suggestion prompt: `"Write a business description for a new Thane showroom"` → `"Write a business description for a new Thane car service centre"`
- Suggestion prompt: `"Suggest 3 SEO keywords for modular kitchens in Nashik"` → `"Suggest 3 SEO keywords for car service in Pune"` (also removed the out-of-footprint Nashik reference)

### `src/components/views/media-view.tsx` (lines 377, 728)
- Upload filename placeholder: `"e.g. thane_showroom_hero.jpg"` → `"e.g. thane_centre_hero.jpg"`
- Stat card hint: `"Storefront & interior shots"` → `"Storefront & workshop shots"` (avoid the word "interior" being mistaken for the old business context; "workshop" is more apt for a car service centre anyway)

## NOT Modified (intentional)
- **`src/components/login-screen.tsx`**: Already shows a car repair scene illustration (mechanic fixing a car with hood open). Heading "One Dashboard for Every MyFNG Google Business Profile" is neutral. No "interiors" references — verified by grep.
- **Google API constants & category ID examples** in `src/lib/google-service.ts` and `src/app/api/media/route.ts`: `INTERIOR` (photo category enum), `gcid:interior_designer` (Google category ID example) — these are Google Business Profile API contract values, not business-context strings.
- **`src/components/views/wireframes-view.tsx`** line 351: `"cover/interior/team photos"` — refers to Google photo category enum values (COVER, INTERIOR, TEAM). Left untouched.
- **CSS class names, component names, variable names**: None touched.
- **`prisma/seed.ts`**: Excluded per task brief — handled by another agent.

## Verification
- `bun run lint` → 0 errors, 0 warnings ✅
- `rg -i "interiors|home interiors|interior designer|MyFNG Interiors Pvt" src/` → 0 matches (exit 1) ✅
- `rg -i "interiors|home interiors|interior designer|MyFNG Interiors Pvt" prisma/seed.ts` → 0 matches (exit 1) ✅ (note: seed.ts is the other agent's responsibility but verified clean anyway as of this pass)
- `rg -i "showroom|kitchen|wardrobe|Nashik|Panvel|Kalyan|Dombivli|Bhiwandi|Mira Road|Vasai|Virar|Ambernath|Badlapur|Raigad" src/` → 0 matches ✅
- Dev log: only a stale `EADDRINUSE :3000` startup error from an earlier moment — no code errors after my edits. Lint is the authoritative signal (clean).

## Stage Summary
All source files rebranded to multi-brand car service context. The platform's user-facing copy, AI prompts, default new-location seed data, and placeholder text now consistently describe MyFNG Autocare as a multi-brand car service & repair brand operating in Mumbai, Navi Mumbai, Thane, and Pune. Google API integration constants (photo category enums, gcid examples) preserved untouched to avoid breaking the GBP integration contract.
