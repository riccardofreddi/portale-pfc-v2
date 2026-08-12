-- Portale PFC — Scadenze documenti (1 riga per file R2)
-- Tabella scadenze: il cron /api/scadenze/check avvisa il cliente N giorni prima.

CREATE TABLE IF NOT EXISTS "scadenze" (
  "id"               TEXT    NOT NULL PRIMARY KEY,
  "file_path"        TEXT    NOT NULL UNIQUE,
  "user_id"          TEXT    NOT NULL,
  "titolo"           TEXT    NOT NULL,
  "data_scadenza"    TIMESTAMP(3) NOT NULL,
  "anticipo_giorni"  INTEGER NOT NULL DEFAULT 10,
  "notificata"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "scadenze_user_id_idx"   ON "scadenze" ("user_id");
CREATE INDEX IF NOT EXISTS "scadenze_data_scadenza_idx" ON "scadenze" ("data_scadenza");

ALTER TABLE "scadenze"
  ADD CONSTRAINT "scadenze_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
