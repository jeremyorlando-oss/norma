#!/bin/sh
# Recrée une base de test, applique les migrations et lance tous les tests.
set -e
su postgres -c "dropdb --if-exists normatest; createdb normatest"
for f in supabase/migrations/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d normatest -f $f"; done
for t in tests/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -t -d normatest -f $t" | grep -v '^\s*$'; done
