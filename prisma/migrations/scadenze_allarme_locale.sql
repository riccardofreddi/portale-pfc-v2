-- Portale PFC v4.118: feedback telefono→server per gli allarmi locali di scadenza.
-- Quando l'app eroga l'avviso locale delle 08:30 del giorno di scadenza
-- (sveglia vista nel vassoio / toccata / avviso immediato di recupero),
-- chiama POST /api/documenti/scadenza/allarme-confermato e qui resta
-- scritto QUANDO. Il ramo del giorno stesso del cron (check/route.ts)
-- non manda la push di riserva "Scade OGGI" se la conferma è di oggi:
-- un avviso solo, niente doppioni. NULL = nessuna conferma (la push parte).
-- Idempotente: si può rieseguire senza danni.
ALTER TABLE "scadenze" ADD COLUMN IF NOT EXISTS "allarme_locale_il" TIMESTAMP(3);
