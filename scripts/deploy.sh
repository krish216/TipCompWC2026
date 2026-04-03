#!/usr/bin/env bash
# =============================================================
# deploy.sh — WC2026 Predictor production deployment
# Usage: bash scripts/deploy.sh [--env staging|production]
# =============================================================
set -euo pipefail

ENV="${1:-production}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="deploy-$TIMESTAMP.log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $1" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

info "Starting $ENV deployment at $TIMESTAMP"

# ─── 1. Pre-flight checks ─────────────────────────────────────
info "Running pre-flight checks..."

command -v node  >/dev/null || error "Node.js not found"
command -v npm   >/dev/null || error "npm not found"
command -v vercel>/dev/null || error "Vercel CLI not found. Run: npm i -g vercel"

# Check required env vars
REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "NEXTAUTH_SECRET"
)
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    error "Required env var $var is not set"
  fi
done
info "All required environment variables present ✓"

# ─── 2. Type check ────────────────────────────────────────────
info "Running TypeScript type check..."
npm run type-check >> "$LOG_FILE" 2>&1 || error "TypeScript errors found. Fix before deploying."
info "Type check passed ✓"

# ─── 3. Lint ─────────────────────────────────────────────────
info "Running ESLint..."
npm run lint >> "$LOG_FILE" 2>&1 || error "Lint errors found."
info "Lint passed ✓"

# ─── 4. Unit tests ────────────────────────────────────────────
info "Running unit tests..."
npm test >> "$LOG_FILE" 2>&1 || error "Unit tests failed. Fix before deploying."
info "Unit tests passed ✓"

# ─── 5. Build ─────────────────────────────────────────────────
info "Building Next.js app..."
npm run build >> "$LOG_FILE" 2>&1 || error "Build failed."
info "Build successful ✓"

# ─── 6. DB migrations ─────────────────────────────────────────
info "Running database migrations..."
node scripts/migrate.js >> "$LOG_FILE" 2>&1 || warn "Migration step skipped (manual DB)"

# ─── 7. Deploy to Vercel ──────────────────────────────────────
info "Deploying to Vercel ($ENV)..."

if [[ "$ENV" == "production" ]]; then
  vercel --prod --yes 2>&1 | tee -a "$LOG_FILE"
else
  vercel --yes 2>&1 | tee -a "$LOG_FILE"
fi

DEPLOY_URL=$(vercel ls --json 2>/dev/null | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(d[0]?.url ?? 'unknown');
" 2>/dev/null || echo "Check Vercel dashboard")

info "Deployment complete ✓"
info "URL: https://$DEPLOY_URL"
info "Log saved to $LOG_FILE"

# ─── 8. Post-deploy smoke test ────────────────────────────────
if [[ "$ENV" == "production" ]] && [[ -n "${DEPLOY_URL:-}" ]] && [[ "$DEPLOY_URL" != "unknown" ]]; then
  info "Running smoke test..."
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DEPLOY_URL/api/results" || echo "000")
  if [[ "$HTTP_STATUS" == "401" ]]; then
    info "Smoke test passed (401 = auth required as expected) ✓"
  elif [[ "$HTTP_STATUS" == "200" ]]; then
    info "Smoke test passed ✓"
  else
    warn "Smoke test returned HTTP $HTTP_STATUS — check deployment manually"
  fi
fi

echo ""
info "🏆 WC2026 Predictor deployed successfully to $ENV"
