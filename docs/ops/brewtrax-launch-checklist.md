# Production Ops Checklist — Brand Layer (BrewTrax)

## Prerequisites
- Brand layer code is merged to main
- All tests passing (647 tests)
- Build clean with `/brand/[brandId]` route confirmed

## Post-Merge: Production Environment Setup

### 1. Domain Registration & Vercel Integration
- [ ] `vercel domains add brewtrax.com` (on the existing TraxEvent project — **no new Vercel project**)
- [ ] `vercel domains add www.brewtrax.com` (same project)
- [ ] Confirm domains appear in Vercel project dashboard under "Domains"

### 2. Environment Variables
- [ ] Set `NEXT_PUBLIC_APP_ORIGIN=https://traxevent.com` in Vercel production environment
- [ ] Verify variable is set in Project Settings → Environment Variables

### 3. DNS Configuration
- [ ] Configure DNS records for `brewtrax.com` to point to Vercel per Vercel domains dashboard
  - Typically: CNAME `www.brewtrax.com` → `cname.vercel-dns.com`
  - And A record for root domain per dashboard instructions
- [ ] Allow up to 24 hours for DNS propagation
- [ ] Test resolution: `nslookup brewtrax.com` / `dig brewtrax.com`

### 4. Verification (After DNS Propagation)
- [ ] `curl -I https://brewtrax.com/` → 200 OK (BrewTrax landing page)
- [ ] `curl -I https://www.brewtrax.com/` → 200 OK
- [ ] Test signup funnel: `https://brewtrax.com/signup?brand=brewtrax`
- [ ] Verify org creation carries `brand_id: "brewtrax"` in Firestore

### 5. Monitoring
- [ ] Check Vercel deployment logs for brand routing errors
- [ ] Monitor Firestore for any org creation issues with brand_id
- [ ] Set up alerts for 404s on `/brand/*` endpoints (should be minimal)

### 6. Firebase & Auth
- [ ] **No Firebase changes required** — auth does not run on brand domains in v1
- [ ] Confirm marketing pages serve without Firebase auth requirement
- [ ] Verify signup flow correctly routes through main TraxEvent auth

## Rollback Plan
If issues arise after deployment:
1. Remove brewtrax.com domain from Vercel
2. Revert brand registry feature flag (if one was added) or redeploy without brand routing
3. Ensure org creation defaults to `brand_id: "traxevent"` during rollback

## ⚠️ BLOCKING pre-DNS decision (from final code review, deferred by choice)

Brand domains currently pass ALL non-root paths through to the full app
(brewtrax.com/login works). Before pointing brewtrax.com DNS, decide:
redirect non-root paths to traxevent.com (recommended), or keep pass-through
+ robots rules + auth-route redirects. See proxy.ts brand branch and the
middleware test "leaves non-root paths on brand domains untouched".
Risks if skipped: host-scoped session split-brain; duplicate crawlable content.

## Additional review notes
- NEXT_PUBLIC_APP_ORIGIN is build-time inlined: setting it in Vercel requires a REDEPLOY.
- Scope it to Preview too, or preview-deploy brand CTAs will jump to production.
- Spec mandates a USPTO trademark check before any brand goes live.
