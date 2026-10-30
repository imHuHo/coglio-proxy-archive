# Coglio Proxy Archive

**Download:** nella pagina [Releases](https://github.com/imHuHo/coglio-proxy-archive/releases/latest) ci sono lo zip per Windows (estrai tutta la cartella e avvia `Coglio Proxy Archive.exe`) e l'APK per Android.
Per pubblicare una nuova versione: scheda *Actions* → *Windows app* (e *Android APK*) → *Run workflow* → scrivi il nome della versione, ad esempio `v1.2.0`.

Archivio delle tue carte Magic. Importi le liste dei mazzi in `.txt`, segni quali mazzi sono attivi
e l'app ti dice quali carte hai, quante sono libere e in quale mazzo sono impegnate.

## Cosa fa

- **Importa mazzi da .txt**: righe tipo `1 Sol Ring`, `1x Sol Ring (C21) 263`, `1 Sol Ring [CMM] 400 *F*`,
  liste di Moxfield/Archidekt, o semplici nomi senza quantità. Il sideboard viene escluso.
  Dopo l'importazione scegli il **commander** dalla lista (quello suggerito è già selezionato).
- **Mazzi attivi / non attivi**: un mazzo attivo è montato, le sue carte risultano *in uso*.
- **Archivio**: per ogni carta vedi copie possedute, in uso e libere, e in quale mazzo sono.
  Ricerca per nome, filtri per disponibilità, mazzo e collezione, ordinamento.
- **Upgrade di un mazzo**: incolli la lista aggiornata, l'app mostra cosa esce, cosa entra e per ogni carta
  entrante se ce l'hai già libera in un altro mazzo o nella raccolta (niente doppioni da ristampare) oppure è da procurare.
  Dentro l'upgrade c'è una **barra di ricerca** e un filtro (*Già in archivio* / *Da procurare*) per trovare al volo le carte da scambiare.
  Quando hai fatto lo scambio fisico premi *Applica al mazzo*: la lista del mazzo diventa quella dell'upgrade,
  **le carte tolte finiscono tra le carte sciolte** e quelle entrate escono dalle sciolte (o dai mazzi non attivi), così nulla viene contato due volte.
- **Carte sciolte**: carte non in nessun mazzo (le importi come lista o arrivano dagli upgrade). Sono sempre libere.
  Quando importi un nuovo mazzo l'app mostra **«CODIGHEL! Queste carte le hai già stampate, verifica prima di stampare nuovamente»**
  con le carte della lista che hai già tra le sciolte (e, a parte, quelle libere in mazzi non attivi).
- **Immagini delle carte**: ogni carta ha la sua miniatura (presa da [Scryfall](https://scryfall.com) in base a nome e collezione, con il numero
  quando c'è). Tocca la miniatura per ingrandirla (le carte a due facce hanno *Gira*), sul PC basta passarci sopra con il mouse.
  **Per mostrare esattamente la stampa che hai**: nelle liste di un mazzo (e nel dettaglio di una carta dell'archivio) apri la miniatura e premi
  *Cambia stampa*: scegli la stampa tra quelle di Scryfall e la collezione e il numero vengono salvati nel mazzo (con *Annulla*).
  Se la lista che importi ha già collezione e numero, la stampa è quella fin da subito; senza numero l'app mostra la prima stampa di quella collezione, senza collezione quella predefinita di Scryfall.
  Se la stampa indicata nella lista non esiste su Scryfall, la miniatura ha un **«!»** e aprendola l'app dice quale stampa mostra al posto di quella.
  Nell'archivio, dove la stessa carta può stare in più mazzi, la miniatura in cima alla riga è la stampa del mazzo attivo (o quella con più copie): le altre sono nel dettaglio.
  Gli indirizzi trovati restano salvati sul dispositivo, quindi ogni carta si cerca una volta sola. Si spengono dalla scheda *Dati*.
  Funzionano nell'app Windows, nell'APK e nella versione web installata; **non** dentro la pagina di anteprima di Claude, che blocca i siti esterni.
- **Verifica bracket**: il tasto giallo sui mazzi calcola il bracket (2, 3 o 4) con le regole di Wizards e i dati dell'API pubblica di
  [Commander Spellbook](https://commanderspellbook.com): Game Changer, distruzione di terre di massa, turni extra, combo, carte bandite.
  Il pannello spiega *perché* esce quel numero. Il numero resta salvato nel mazzo e compare in un box colorato accanto al titolo
  (1 blu, 2 verde, 3 giallo, 4 arancione, 5 rosso, ✕ carte bandite); se poi cambi la lista, il box diventa tratteggiato finché non ricalcoli.
  **Non misura la velocità di gioco** e non calcola 1 e 5 (cEDH): se il tuo riferimento (ad esempio commanderbracket.app) dà un altro
  numero, lo imposti a mano dal pannello. Nell'app Windows la richiesta parte dal programma (`electron/preload.js` + `main.js`), su Android da una
  chiamata nativa (`CapacitorHttp`); nel browser Commander Spellbook blocca le richieste da altre pagine (CORS) e il pannello propone
  «copia la lista e apri [commanderbracket.app](https://commanderbracket.app/bracket)». Per il calcolo la lista viene inviata a Commander Spellbook.
- **Stampe diverse = carte diverse.** Per l'archivio una carta è identificata da nome *e* stampa (collezione + numero). Quando importi un mazzo,
  l'avviso CODIGHEL separa le carte che hai già libere **in quella esatta stampa** da quelle che hai **ma in un'altra stampa** (le puoi riusare, oppure
  stampare quella nuova). Negli upgrade ogni differenza è di tre tipi: *esce*, *entra*, *cambia solo la stampa*; per le carte che entrano si vede se
  la stampa voluta è già libera o se hai solo un'altra stampa, e applicando l'upgrade si prendono dalle sciolte solo copie con la stampa esatta
  (la vecchia stampa torna tra le sciolte). Se nella lista non è indicata la collezione, qualsiasi stampa va bene; per le terre base la stampa non conta
  finché sono considerate illimitate.
- **Coglio Proxy Builder (scheda «Stampa»).** Crea il PDF da stampare, partendo da un mazzo dell'archivio (pulsante **Crea PDF** nel mazzo, con la stampa
  esatta salvata) oppure da una **lista incollata** (qualsiasi formato; non viene salvata nell'archivio). Le immagini sono quelle di Scryfall in qualità
  «large» (672 × 936 px, ~270 dpi a 63 mm), incorporate nel PDF **senza ricompressione** e **senza filigrana** né ritocchi. Opzioni:
  carta A4 / Letter / A3 / A5 / Legal / Tabloid / personalizzata, verticale o orizzontale; misura carta (Magic 63 × 88, Poker, Bridge, Mini, Tarocchi, personalizzata)
  e rotazione di 90°; colonne e righe (automatiche o fisse), spazi, margine; **abbondanza** (bleed) con colore automatico (il bordo della carta), nero o bianco;
  angoli arrotondati riempiti di nero/bianco; guide di taglio (segni agli angoli o linee tra le carte, colore, spessore, lunghezza, tratteggio);
  **segni di registrazione** per plotter (Silhouette a 3 angoli o a 4); spostamento della stampante (X/Y, e a parte per il retro); **fronte-retro** (bordo lungo o corto,
  pagine alternate o prima i fronti poi i retro; le carte doppie hanno il vero retro, le altre niente); gettoni collegati; terre base escluse; scelta di un'altra
  stampa per ogni carta; **immagini proprie** (JPG diretti, PNG/WebP convertiti ad alta qualità) con eventuale abbondanza già presente; intervallo di pagine;
  pagina con la lista; **pagina di prova** con righello e barra da 100 mm; impostazioni con nome salvate sul dispositivo; scarico di tutte le immagini in `.zip`.
  Serve internet (le immagini arrivano da Scryfall) e non funziona dentro Claude.
- **Backup** in JSON (scarica, copia, ripristina). Ogni azione distruttiva ha *Annulla*.

### Come vengono contate le carte
- **Possedute**: tutte le copie nelle liste inserite (mazzi + carte sciolte). Stessa carta in due mazzi = due copie.
- **In uso**: copie nei mazzi attivi. **Libere**: possedute meno in uso (mazzi smontati e carte sciolte).
- Le carte sono riconosciute per nome (la faccia anteriore per le carte doppie); collezione e numero servono a ritrovare la stampa.
- Le terre base possono essere considerate sempre disponibili negli upgrade (impostazione).

## Come averla sui tuoi dispositivi

### Windows
Sul repository GitHub: scheda *Actions* → *Windows app* → *Run workflow*, poi scarichi la cartella da *Artifacts* (con l'icona dell'app).
Decomprimi `Coglio-Proxy-Archive-Windows.zip` e avvia `Coglio Proxy Archive.exe`. Non è firmata: se SmartScreen avvisa,
scegli *Ulteriori informazioni → Esegui comunque*. I dati restano in `%APPDATA%\Coglio Proxy Archive`.
Per rigenerarla: `cd electron && npm install && npm run pack:win` (o `npm run dist:win` per installer e versione portable).

### Android e iOS (installabile, funziona offline)
La cartella `web/` è una PWA. Mettila su un qualsiasi hosting statico HTTPS (GitHub Pages, Netlify, Cloudflare Pages),
poi dal telefono:
- **Android (Chrome)**: menu ⋮ → *Installa app*.
- **iPhone/iPad (Safari)**: Condividi → *Aggiungi alla schermata Home*.

### APK Android senza Android Studio (GitHub Actions)
1. Crea un repository GitHub e carica tutto il contenuto di questa cartella.
2. Scheda **Actions** → **Android APK** → **Run workflow**.
3. A fine esecuzione scarica `coglio-proxy-archive-apk` dagli *Artifacts*, decomprimi e installa `app-debug.apk`
   sul telefono (serve consentire l'installazione da fonti sconosciute).
Il workflow è in `.github/workflows/android-apk.yml`.

### App nativa (APK / iOS) con Capacitor in locale
```
python3 tools/build.py          # copia web/ in capacitor/www
cd capacitor && npm install
npx cap add android && npx cap open android     # Android Studio: Build → Build APK
npx cap add ios && npx cap open ios             # serve un Mac con Xcode
```
Nota: nella versione nativa il pulsante *Scarica backup* può non funzionare; usa *Copia backup*.

### Sul PC senza installare nulla
Apri `web/index.html` con Chrome o Edge: funziona anche da file locale (senza modalità offline/installazione).

## Struttura
```
web/        l'app (HTML, CSS, JS senza dipendenze) = PWA
            core.js (archivio) · pdf.js (motore PDF) · proxy.js (Scryfall e immagini) · builder.js (schermata Stampa) · app.js
electron/   wrapper Windows
capacitor/  wrapper Android/iOS
tools/      test (test.js, pdf-test.js, proxy-test.js, ui-smoke.js, builder-smoke.js, img-smoke.js), build.py, make_icons.py
dist/       coglio-proxy-archive.html = pagina unica
```
Tutti i dati restano sul dispositivo (IndexedDB del browser). Nessun account, nessun server.

## Note
- `pdf-test.js` e `proxy-test.js` girano con solo Node (il primo, se ci sono `python3` con Pillow, `pdfinfo`, `qpdf` e `pdftoppm`, controlla anche i PDF con strumenti esterni e confronta i pixel); `ui-smoke.js`, `builder-smoke.js` e `img-smoke.js` usano jsdom (`node tools/builder-smoke.js <percorso-di-jsdom>`).
- `test.js`, `ui-smoke.js` e `img-smoke.js` leggono alcune liste di mazzi da `tools/fixtures/`, che non sono nel repository: servono liste tue per provarli.
- Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast. Immagini e dati delle carte: [Scryfall](https://scryfall.com). Magic: The Gathering è un marchio di Wizards of the Coast.
