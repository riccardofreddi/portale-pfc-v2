-- Portale PFC: aggiunge lo stato "pagata" alle scadenze.
-- Quando il cliente conferma il pagamento, la scadenza sparisce dal banner.
ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "pagata" BOOLEAN NOT NULL DEFAULT false;
