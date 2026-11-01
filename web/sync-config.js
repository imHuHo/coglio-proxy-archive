/* Chiavi per la sincronizzazione. Si creano gratis una volta sola (guida nel README, sezione «Sincronizzazione»).
 * Se le scrivi qui valgono per tutti gli utenti dell'app; altrimenti ognuno le incolla da Dati > Sincronizzazione (restano sul dispositivo).
 * La «chiave» Dropbox e l'«ID client» Google sono pubblici per natura; il «segreto» dei client Google per dispositivi non e' davvero segreto. */
window.CPA_SYNC = {
  dropboxKey: '',      /* chiave dell'app Dropbox (App key), con accesso «App folder» */
  googleId: '',        /* ID client OAuth di Google, tipo «TV e dispositivi con input limitato» */
  googleSecret: ''     /* segreto di quel client */
};
