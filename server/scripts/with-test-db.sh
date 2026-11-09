#!/bin/sh
# Runs the given command against a throwaway PostgreSQL instance
# (uses initdb/pg_ctl from the nix dev shell). Honours an existing TEST_DATABASE_URL.
set -e
if [ -n "$TEST_DATABASE_URL" ]; then
  DATABASE_URL="$TEST_DATABASE_URL" exec "$@"
fi
DIR=$(mktemp -d)
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
createdb -h "$DIR" -U postgres grades_test
DATABASE_URL="postgresql://postgres@/grades_test?host=$DIR" "$@"
