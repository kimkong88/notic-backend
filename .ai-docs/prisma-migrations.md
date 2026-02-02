# Prisma migrations – flow and one-time fix

**Status:** The broken out-of-order migration was removed. Use only the flow below. New migrations are created with `npm run prisma:migrate` and applied with `npm run prisma:deploy`.

---

## One-time fix (do this once on each existing DB)

Migration `20260129180000_add_note_folder_workspace_color_icon` was removed from the repo because it ran **before** the migration that creates the `Note`/`Folder`/`Workspace` tables, which broke `prisma migrate dev` (shadow DB P1014). The same schema changes (color/icon columns) are in `20260130083043_add_note_folder_workspace_color_icon`, which runs after `sync_setup`, so your schema is correct.

On **every DB** that already had `20260129180000` applied (local, staging, prod), remove that row from the migration history so Prisma stops expecting that file:

```sql
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260129180000_add_note_folder_workspace_color_icon';
```

Ways to run it:

- **Supabase:** SQL Editor → run the query above.
- **psql:** `psql $DATABASE_URL -c "DELETE FROM \"_prisma_migrations\" WHERE \"migration_name\" = '20260129180000_add_note_folder_workspace_color_icon';"`
- **Prisma Studio:** open `_prisma_migrations`, find that row, delete it.

After that, run `npm run prisma:deploy` (or `npx prisma migrate dev`) once to confirm everything is in sync. Do **not** run `prisma migrate reset` on prod (it drops data).

**Verify:** From project root run `npm run prisma:migrate`. You should see the DB in sync (or pending migrations applied). If Prisma instead says "migration(s) applied to the database but missing from the local migrations directory" and suggests reset, the one-time DELETE has not been run on that DB yet.

---

## Migration flow (use only this from now on)

### Creating a new migration (schema changed)

1. Edit `prisma/schema/` (add/change models or fields).
2. Run:
   ```bash
   npm run prisma:migrate
   ```
3. When prompted, enter a **short name** (e.g. `add_foo_column`). Prisma creates `prisma/migrations/<timestamp>_<name>/migration.sql`.
4. Commit the new migration folder.

### Applying migrations (local, CI, staging, prod)

```bash
npm run prisma:deploy
```

Use this:

- After pulling new migrations.
- In CI/CD before starting the app.
- On staging/production deploys.

### Commands summary

| Script | Command | Use when |
|--------|--------|----------|
| `npm run prisma:migrate` | `prisma migrate dev` | You changed the schema and want to **create** a new migration. |
| `npm run prisma:deploy` | `prisma migrate deploy` | You want to **apply** pending migrations (no schema edit). |
| `npm run prisma:generate` | `prisma generate` | Regenerate client only (e.g. after pull; build already runs this). |

### Rules

- **Do not** edit or delete migration files that have already been applied.
- **Do not** reorder migration folders (timestamps define order).
- **Do** run `prisma:deploy` on every environment that runs the app (local, CI, prod).
- **Do** create migrations only via `prisma:migrate` (so the shadow DB stays valid).
