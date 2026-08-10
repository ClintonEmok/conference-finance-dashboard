#!/usr/bin/env bash
# Vercel build wrapper.
#
# Production builds (VERCEL_ENV=production, triggered by pushes to the Vercel
# project's production branch, `master`) deploy Convex functions to the
# production deployment AND build the frontend.
#
# Preview/development builds build the frontend only. `convex deploy` refuses
# a production deploy key in a non-production build environment, so previews
# must skip it; they connect to production Convex via the NEXT_PUBLIC_CONVEX_URL
# env var.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  npx convex deploy --cmd 'npm run build'
else
  npm run build
fi
