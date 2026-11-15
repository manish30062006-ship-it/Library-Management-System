#!/bin/sh
set -e

npx prisma db push --skip-generate

if [ "$SEED_ON_START" = "true" ]; then
  node dist/scripts/seed.js || echo "Seed failed; starting API with existing data."
fi

exec node dist/index.js
