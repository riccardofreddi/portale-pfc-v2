-- ============================================================
-- Portale PFC — Migrazione PushSubscription
-- Esegui questo script su Supabase SQL Editor per creare la
-- tabella push_subscriptions. (Compatibile con il modello
-- PushSubscription nel prisma/schema.prisma.)
-- ============================================================

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Indici
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- Foreign key verso users(id) - ON DELETE CASCADE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'push_subscriptions_user_id_fkey'
        AND table_name = 'push_subscriptions'
    ) THEN
        ALTER TABLE "push_subscriptions"
        ADD CONSTRAINT "push_subscriptions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- Verifica
SELECT 'push_subscriptions creata con successo' AS msg;
