#!/bin/sh
set -eu

node node_modules/prisma/build/index.js migrate deploy --schema packages/db/prisma/schema.prisma
if [ "${SEED_ON_START:-false}" = "true" ]; then
  node packages/db/dist/seed.js
fi
exec node apps/web/server.js
