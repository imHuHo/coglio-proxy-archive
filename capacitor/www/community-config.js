/* Dove vivono le funzioni community (Codighel ID, e in seguito amici e tavoli condivisi).
 * Si crea gratis un progetto su supabase.com, si incolla supabase/schema.sql nel suo «SQL Editor» e si scrivono qui i due valori
 * (Project Settings > API): l'indirizzo del progetto e la chiave «anon public». Entrambi sono pubblici per natura: la tabella e'
 * chiusa a tutti e le funzioni controllano il codice di recupero di ognuno (guida nel README, sezione «Community»).
 * Finche' sono vuoti, il pannello Codighel ID in Dati dice che le funzioni non sono ancora attive. */
window.CPA_COMMUNITY = {
  url: '',   /* es. https://abcdefghijkl.supabase.co */
  key: ''    /* la chiave «anon public» (una lunga stringa che inizia per eyJ…) */
};
