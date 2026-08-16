-- Portale PFC: campo email sul cliente + flag email_inviata sulla scadenza.
-- L'email e il fallback della push per i promemoria di pagamento/scadenza.
-- Il campo e' opzionale (piu' clienti possono non averla), ma se presente
-- deve essere univoco: niente due clienti con la stessa email.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT UNIQUE;

ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "email_inviata" BOOLEAN NOT NULL DEFAULT false;
