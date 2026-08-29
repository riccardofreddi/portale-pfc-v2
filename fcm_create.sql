-- Crea SOLO la nuova tabella fcm_tokens (nessuna alter/drop su tabelle esistenti).
-- Eseguito una volta sola sul DB di produzione (Supabase).
-- Tutto inline in un'unica istruzione CREATE TABLE per evitare problemi di
-- transaction pooling (pgbouncer) con statement multipli.

CREATE TABLE IF NOT EXISTS "fcm_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fcm_tokens_token_key" UNIQUE ("token"),
    CONSTRAINT "fcm_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id");
