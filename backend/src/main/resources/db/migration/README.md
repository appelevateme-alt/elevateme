# Flyway placeholder — canonical migrations live in ../../database/migrations
# (repo-relative: elevateme/database/migrations).
#
# Until automation syncs them, copy new V*.sql files here for local runs:
#   cp ../database/migrations/V*__*.sql src/main/resources/db/migration/
# Do NOT author canonical SQL here; this directory mirrors the database/migrations source.
# Requires the migration-owner role for DDL; runtime uses the least-privilege JDBC_USER.
