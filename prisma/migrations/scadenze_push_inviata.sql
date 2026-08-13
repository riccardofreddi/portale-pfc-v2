-- Portale PFC: aggiunge lo stato "push_inviata" alle scadenze.
-- Distingue "campanella creata" (notificata) da "push consegnata" (push_inviata):
-- se la push fallisce o il cliente non ha ancora una subscription, il cron ritenta
-- finché non viene consegnata, così nessun cliente viene saltato.
ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "push_inviata" BOOLEAN NOT NULL DEFAULT false;
