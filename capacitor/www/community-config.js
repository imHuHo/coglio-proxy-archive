/* Dove vivono le funzioni community (Codighel ID, e in seguito amici e tavoli condivisi).
 * Si crea gratis un progetto su supabase.com, si incolla supabase/schema.sql nel suo «SQL Editor» e si scrivono qui i due valori
 * (Settings > API Keys): l'indirizzo del progetto e la chiave «publishable» (sb_publishable_…; va bene anche la vecchia «anon», in «Legacy API keys»). Entrambi sono pubblici per natura: la tabella e'
 * chiusa a tutti e le funzioni controllano il codice di recupero di ognuno (guida nel README, sezione «Community»).
 * Finche' sono vuoti, il pannello Codighel ID in Dati dice che le funzioni non sono ancora attive. */
window.CPA_COMMUNITY = {
  url: 'https://mvhegxnvqsptzdeusnho.supabase.co',
  key: 'sb_publishable_YGNBn8QWBcfyzr821EBAdw_A0ARJ4gQ'    /* la chiave «publishable» (inizia per sb_publishable_) oppure la vecchia «anon» (inizia per eyJ) */
};
