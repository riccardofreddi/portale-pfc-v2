-- Portale PFC — Gli avvisi globali non generano più notifiche nella campanella.
-- La push arriva comunque anche ad app chiusa e il cliente vede subito l'avviso
-- in giallo nel banner sotto il benvenuto (nessuna notifica "non letta" superflua).
-- Esegui questo script su Supabase SQL Editor per ripulire le notifiche di tipo
-- "avviso" già esistenti (il banner resta intatto: legge dalla tabella notices).
-- ============================================================

DELETE FROM notifications WHERE type = 'avviso';
