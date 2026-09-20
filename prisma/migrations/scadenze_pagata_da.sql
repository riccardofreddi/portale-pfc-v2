-- Portale PFC v4.60: chi ha segnato la scadenza come pagata e quando.
-- Il pulsante "Pagato" del cliente e il pulsante admin "Segna come pagata"
-- compilano queste due colonne in automatico (pagata_da = username).
-- Migrazione idempotente e additiva: sicura da eseguire piu' volte e
-- trasparente per il codice gia' in produzione. Applicata il 20/09/2026.
ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "pagata_da" TEXT;
ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "pagata_il" TIMESTAMPTZ;
