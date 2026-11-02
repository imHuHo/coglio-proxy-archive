# Coglio Proxy Archive

**Versione web:** https://imhuho.github.io/coglio-proxy-archive/ (si aggiorna da sola a ogni push su `main`, vedi `.github/workflows/pages.yml`; una tantum: Settings → Pages → Source: *GitHub Actions*). Si installa come app dal browser; i dati stanno nel browser e si spostano con Backup/Ripristino.

**Download:** nella pagina [Releases](https://github.com/imHuHo/coglio-proxy-archive/releases/latest) ci sono lo zip per Windows (estrai tutta la cartella e avvia `Coglio Proxy Archive.exe`) e l'APK per Android.
Per pubblicare una nuova versione: scheda *Actions* → *Windows app* (e *Android APK*) → *Run workflow* → scrivi il nome della versione, ad esempio `v1.2.0`.

Archivio delle tue carte Magic. Importi le liste dei mazzi in `.txt`, segni quali mazzi sono attivi
e l'app ti dice quali carte hai, quante sono libere e in quale mazzo sono impegnate.

## Aspetto
I colori sono quelli del Coglio (blu denim e giallo banana); i cinque colori del mana (bianco, blu, nero, rosso, verde) fanno da linguaggio dei dettagli, e «Codighel!» ha il suo adesivo. I caratteri (Cinzel, Syne, Manrope, JetBrains Mono) sono in `web/fonts` e funzionano offline. L'icona è `web/icon.svg`: `python3 tools/make_icons.py` rigenera i PNG (serve playwright per python).

## Cosa fa

- **Importa mazzi da .txt**: righe tipo `1 Sol Ring`, `1x Sol Ring (C21) 263`, `1 Sol Ring [CMM] 400 *F*`,
  liste di Moxfield/Archidekt, o semplici nomi senza quantità. Il sideboard viene escluso.
  Dopo l'importazione scegli il **commander** dalla lista (quello suggerito è già selezionato).
- **Mazzi attivi / non attivi**: un mazzo attivo è montato, le sue carte risultano *in uso*.
- **Archivio**: per ogni carta vedi copie possedute, in uso e libere, e in quale mazzo sono.
  Ricerca per nome **o con la sintassi di Scryfall** (`t:creature c:rg mv<=3 o:"draw" r:mythic`, `or`, `-`, parentesi, `/regex/`),
  più un pannello **Filtri** (colori di mana, tipo, costo, rarità, testo, disponibilità, mazzo, collezione) che scrive la ricerca per te.
  Si ordina anche per costo di mana e per prezzo.
- **Pagina del mazzo (4.0, stile Moxfield)**: titolo grande su un banner con l'artwork del commander; lista a tutta pagina già divisa
  per tipo (commander, creature, stregonerie, incantesimi, istantanei, artefatti, terre), con la carta grande a lato quando passi il mouse
  (su telefono si tocca). Accanto al nome l'icona per **cambiare stampa**, con il prezzo in euro della stampa tra parentesi.
  Nome, commander e stato si cambiano da «Gestisci»; upgrade e prezzi carta per carta sono nelle schede in alto.
- **Prezzi (4.0)**: la barra giallo banana in fondo al mazzo mostra le carte totali e per tipo; **«Calcola valore mazzo»** apre il pop-up
  «Ma questo risparmio è crazy!» con il costo in euro (Cardmarket, via Scryfall) con le stampe che hai scelto e con la stampa più
  economica di ogni carta, cioè quanto risparmi stampando invece di comprare. Terre base e carte del Designer non contano.
- **Sincronizzazione (4.0)**: archivio, mazzi e impostazioni uguali su PC e telefono tramite Dropbox e/o Google Drive (vedi sotto).
- **Upgrade di un mazzo**: incolli la lista aggiornata, l'app mostra cosa esce, cosa entra e per ogni carta
  entrante se ce l'hai già libera in un altro mazzo o nella raccolta (niente doppioni da ristampare) oppure è da procurare.
  Dentro l'upgrade c'è una **barra di ricerca** e un filtro (*Già in archivio* / *Da procurare*) per trovare al volo le carte da scambiare.
  Quando hai fatto lo scambio fisico premi *Applica al mazzo*: la lista del mazzo diventa quella dell'upgrade,
  **le carte tolte finiscono tra le carte sciolte** e quelle entrate escono dalle sciolte (o dai mazzi non attivi), così nulla viene contato due volte.
- **Carte sciolte**: carte non in nessun mazzo (le importi come lista o arrivano dagli upgrade). Sono sempre libere.
  Quando importi un nuovo mazzo l'app mostra **«CODIGHEL! Queste carte le hai già stampate, verifica prima di stampare nuovamente»**
  con le carte della lista che hai già tra le sciolte (e, a parte, quelle libere in mazzi non attivi).
- **Designer (3.0)**: crea proxy personalizzate (carte tue, token, cornici speciali, alter di carte Scryfall) con anteprima in tempo reale.
  Cornici, simboli e grafica di base sono disegnati nel codice; in più l'app include `web/risorse.json` (83 cornici in 10 stili, simboli di mana, font, 28 filigrane e 89 extra — corone leggendarie, stampi olo, P/C scuro, pips, The List —, importati da Magic Set Editor) che si carica da solo al primo avvio — per ritirarlo basta togliere il file e rifare `python3 tools/build.py`. Il **catalogo cornici** (`web/packs/`, 174 pacchetti da Card Conjurer, ~41 MB) non entra nelle app: si scarica da GitHub Pages solo per i pacchetti scelti, e si rigenera dagli script in `tools/cardconjurer/`. Puoi importare anche **le tue cornici PNG**,
  che restano solo nel dispositivo (anche come pacchetto `.json` con più cornici, una per colore, e geometria dei testi: `{app:'coglio-frames', groups, frames:[{key,name,group,ink,geo,png,pt}], symbols:{W:dataURL,…}, fonts:[{role,family,style,ttf}], watermarks:[{key,name,png}], overlays:[{key,png,b:[x,y,w,h],erase?}]}` — simboli, font, filigrane ed extra opzionali; con «automatica» la cornice segue i colori). I design si raggruppano in cartelle, si elimina dalla lista e, partendo da una carta Scryfall, si sceglie la stampa. Un design si aggiunge a un mazzo come carta nuova o sostituisce una carta esistente (nel PDF si stampa il design).
  Design e arte stanno in un database a parte (IndexedDB `coglio-designer`) e si esportano in `.json` con l'arte incorporata. Il motore è `web/cardrender.js`, l'interfaccia `web/designer.js`.
- **Immagini delle carte**: ogni carta ha la sua miniatura (presa da [Scryfall](https://scryfall.com) in base a nome e collezione, con il numero
  quando c'è). Tocca la miniatura per ingrandirla (le carte a due facce hanno *Gira*), sul PC basta passarci sopra con il mouse.
  **Per mostrare esattamente la stampa che hai**: nelle liste di un mazzo (e nel dettaglio di una carta dell'archivio) apri la miniatura e premi
  *Cambia stampa*: scegli la stampa tra quelle di Scryfall e la collezione e il numero vengono salvati nel mazzo (con *Annulla*).
  Se la lista che importi ha già collezione e numero, la stampa è quella fin da subito; senza numero l'app mostra la prima stampa di quella collezione, senza collezione quella predefinita di Scryfall.
  Se la stampa indicata nella lista non esiste su Scryfall, la miniatura ha un **«!»** e aprendola l'app dice quale stampa mostra al posto di quella.
  Nell'archivio, dove la stessa carta può stare in più mazzi, la miniatura in cima alla riga è la stampa del mazzo attivo (o quella con più copie): le altre sono nel dettaglio.
  Gli indirizzi trovati restano salvati sul dispositivo, quindi ogni carta si cerca una volta sola. Si spengono dalla scheda *Dati*.
  Funzionano nell'app Windows, nell'APK e nella versione web installata; **non** dentro la pagina di anteprima di Claude, che blocca i siti esterni.
- **Stati del mazzo**: Attivo (montato, carte in uso), Non ancora stampato (le sue carte non entrano nell'archivio, non fanno scattare CODIGHEL e, se tolte con un upgrade, non diventano sciolte) e Non attivo (smontato, carte libere: restano disponibili come le sciolte per altri mazzi e upgrade). Si sceglie in importazione e si cambia dalla lista dei mazzi o dalla pagina del mazzo.
- **CODIGHEL che si usa**: nell'avviso dell'importazione si spuntano le carte da riusare; escono dalle sciolte (o dal mazzo non attivo) e restano nel nuovo mazzo, con la stampa posseduta se diversa.
- **Novità**: la sezione «Codighel! che novità!» in Dati e l'avviso alla prima apertura dopo un aggiornamento leggono `web/changelog.js`. **A ogni release si aggiunge in cima la voce della nuova versione** (e si aggiorna `web/version.js`).
- **Aggiornamenti**: in *Dati* il pulsante *Verifica aggiornamenti* interroga l'ultima release su GitHub e confronta la versione. Nell'app Windows scarica lo zip nella cartella Download (con barra di avanzamento) e lo mostra; da estrarre sopra la vecchia cartella, i dati stanno in `%APPDATA%` e restano. Su Android apre il download dell'APK; nella versione web rimanda alla pagina della release. La versione installata viene scritta da GitHub Actions a partire dal tag (`web/version.js`).
- **Verifica bracket**: il tasto giallo sui mazzi apre un report calcolato **in locale** (`web/bracket.js`, senza accesso al DOM) a partire dai dati di
  Scryfall già scaricati: Game Changer e carte bandite dai campi `game_changer` e `legalities.commander`; turni extra, distruzione di terre di massa,
  tutor, accelerazione, rimozioni e pescata dal testo delle carte. Il bracket (2, 3 o 4) segue le regole pubbliche di Wizards: vale l'elemento più forte.
  Il report mostra il perché, «Cosa decide il bracket» con le miniature, la **costanza di pescata** (simulazione di 20.000 mani con seme fisso: stesso
  mazzo, stessi numeri), la salute del mazzo (conteggi contro 36–38 terre e ~10 carte per ruolo, nessun voto inventato) e i combo. I combo e i turni extra
  di [Commander Spellbook](https://commanderspellbook.com) si sommano quando raggiungibile (app Windows via `electron/preload.js` + `main.js`, Android via
  `CapacitorHttp`; nel browser lo blocca il CORS e il report lo dice). Le carte salvate prima di 4.1 non hanno il campo Game Changer: la prima verifica
  le riscarica. **Non calcola** il «turno di vittoria previsto» né il livello di nemico (modelli proprietari), né 1 e 5 (cEDH): se il tuo riferimento dà un altro numero lo
  imposti a mano dal pannello. Il numero resta salvato e compare accanto al titolo (1 blu, 2 verde, 3 giallo, 4 arancione, 5 rosso, ✕ carte bandite);
  se cambi la lista il box diventa tratteggiato. Se non ci sono né dati di Scryfall né Spellbook, il pulsante copia la lista e apre
  [commanderbracket.app](https://commanderbracket.app/bracket).
- **Modifica del mazzo a mano (4.2).** Nella pagina del mazzo: «+ Aggiungi carta» (campo con suggerimenti `cards/autocomplete` di Scryfall; il testo si legge
- **Stampe della comunità, MPC Fill (4.3).** Solo nelle app Windows e Android: in «Cambia stampa» (dal mazzo) c'è la scheda «MPC Fill · comunità, fino a 1200 dpi». La ricerca per nome parte dall'app (Electron: handler `cpa:mpc` limitato a `mpcfill.com` e ai quattro indirizzi `/2/sources/`, `/2/tags/`, `/2/editorSearch/`, `/2/cards/`; Android: `CapacitorHttp`), perché il sito accetta dal browser solo certe origini (CORS); dal web la scheda lo spiega. Le immagini arrivano da `lh4.googleusercontent.com/d/<id>=h<px>` (altezza = dpi × 1110 / 300: 600 dpi → h2220, 1200 dpi → h4440; 69 × 94 mm, cioè con 3 mm di abbondanza). Ogni risultato mostra i dpi, l'archivio, il peso e le etichette; il bollino rosso «non ufficiale» viene dalle etichette della comunità (Custom Art, AI Art/Remaster, Altered Art, Upscaled Scan, cornice inventata…); **senza etichette non vuol dire ufficiale**. La riga del mazzo salva `mpc` (id Drive), `mdpi`, `muo` (non ufficiale), `msrc`, `mnm` e fa parte dell'identità della riga (come `design`): si può dare a tutte le copie o a una sola. Nel builder un pannello sceglie 300/600/1200 dpi; l'immagine si scarica solo al momento del PDF (con `cpaNet.image` su Windows, `CapacitorWebFetch` su Android) e si libera subito dopo. Se la protezione anti-bot di Cloudflare blocca le richieste native, la scheda lo dice e il resto dell'app non ne risente (le stampe scelte restano valide, le miniature sono normali immagini). `web/mpc.js` non tocca il DOM: `node tools/mpc-test.js`; `node tools/mpc-smoke.js` prova tutto in Chromium con MPC Fill, Google e Scryfall simulati.
- **Analisi del piscio (5.0).** Il tasto accanto a «Verifica bracket» apre un pop-up con curva di mana, torta dei simboli per colore, conteggio per tipo, costo medio, fonti di mana, identità di colore e legalità Commander. `web/analysis.js` non tocca il DOM (`CPAAnalysis.analyze(deck, {rec, isBasic, keyOf})`) e parte dai dati di `cards.js`: tipo, costo, colori, identità, `pm` (mana prodotto) e i campi `bn` (bandita) e il nuovo `nl` (non legale in Commander; le carte salvate prima della 5.0 non lo hanno e vengono riscaricate al primo uso). I simboli ibridi contano per entrambi i colori; il commander resta fuori da curva, colori e fonti ma conta nei cento e nei tipi; il sideboard non conta. Le fonti sono una regola pratica (12 per il colore principale, 8 per gli altri), mai un verdetto. Il pop-up (`AN` in `app.js`) disegna i grafici in SVG con descrizione testuale (`role="img"` + `aria-label`) e usa i colori del mana (`--m-w…--m-g`) per la torta. `node tools/analysis-test.js` (logica) e `node tools/analysis-smoke.js` (Chromium).
- **The Pescher (5.0).** Il compagno di partita dal vivo, 7ª voce del menu con Botto a goccia (`web/mana/botto.svg`; nel menu la stessa goccia con la faccia in versione a tratto). Non sa nulla dei mazzi: si gioca con gli amici, quindi niente scelta del mazzo né bracket. `web/pescher.js` è logica pura (`CPAPescher`): partita con 2–6 giocatori, vita (anche valore esatto), veleno (10), danno da comandante per avversario (21, toglie anche vita se `cmdLife`), «fuori» derivato dai numeri (rialzandoli si rientra), segnalini esperienza/energia/lanci del comandante (+2 a lancio), monarca e iniziativa (uno solo ciascuno), turni con conteggio dei giri (si conta un giro quando si ripassa da chi ha iniziato), annulla (60 passi, include turno, giro, monarca e iniziativa), registro (80 voci), dadi e moneta con `rng` iniettabile. «Fine partita» (`P.finish`) salva un record `{id,t,ms,rounds,start,players:[{name,life,out}],winner,deck,table}` in `localStorage` (`cpa:pescher:hist:v1`, al massimo 200, ripulito da `P.restoreHistory`). I **tavoli salvati** (`P.makeTable/applyTable/sameTable/restoreTables`, `cpa:pescher:tables:v1`, al massimo 20) ricordano nomi, posti, vita iniziale e `cmdLife`; la partita porta con sé l'id del tavolo (`g.table`) e il record lo copia. La classifica è **sempre di un tavolo**: `P.forTable(history, id)` filtra le partite (id vuoto = senza tavolo, che non fanno classifica) e `P.tally` ne ricava la classifica per nome (maiuscole ignorate: partite, vittorie, mazzo più vincente). Eliminare un tavolo elimina le sue partite. `web/pescher-ui.js` disegna solo il proprio contenitore `#pe` (un tocco sulla vita non rifà l'app), mostra la bolla del cambio di vita e il cronometro senza ridisegnare, e salva la partita in `localStorage` (`cpa:pescher:v1`, solo su questo dispositivo, non sincronizzata; i salvataggi della prima versione con mazzi e bracket si leggono lo stesso, i campi vecchi si ignorano). Schermo acceso con la Wake Lock API dove c'è; modalità focus e «gira i giocatori in alto» dal menu. `node tools/pescher-test.js` (logica) e `node tools/pescher-smoke.js` (Chromium).
  con lo stesso parser dell'import, quindi `2 Sol Ring (C21) 263` funziona; un nome che Scryfall non trova si può aggiungere comunque), menu «⋯» su ogni riga
  (±1 copia, rimuovi, sposta in/da sideboard) e «Annulla» su ogni modifica (`mutate`). Se si toglie il commander, il mazzo resta senza.
  **Sideboard**: `deck.side` (stessa forma di `deck.cards`, solo per i mazzi). Non entra in bracket, impronta del bracket, statistiche, prezzi del mazzo e upgrade;
  entra in archivio, disponibilità/riuso (`C.allCards`) e Stampa (a 0 copie). L'import riempie `side` dalla sezione Sideboard. **Export**: `C.exportDeck`
  (Commander / Deck / Sideboard con quantità, nome, `(SET) numero`) per «Scarica lista .txt» e «Copia lista»; si rilegge con `C.parseList`.
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
  angoli delle carte arrotondati, riempiti di nero/bianco oppure **quadrati** (l'immagine è ingrandita di ~3% e ritagliata, così non resta nessun angolo nero); logo e nome dell'app nel margine in alto del foglio (se c'è spazio, disattivabile); guide di taglio (segni agli angoli o linee tra le carte, colore, spessore, lunghezza, tratteggio);
  **segni di registrazione** per plotter (Silhouette a 3 angoli o a 4); spostamento della stampante (X/Y, e a parte per il retro); **fronte-retro** (bordo lungo o corto,
  pagine alternate o prima i fronti poi i retro; le carte doppie hanno il vero retro, le altre niente); token collegati; terre base escluse; scelta di un'altra
  stampa per ogni carta; **immagini proprie** (JPG diretti, PNG/WebP convertiti ad alta qualità) con eventuale abbondanza già presente; intervallo di pagine;
  pagina con la lista; **pagina di prova** con righello e barra da 100 mm; impostazioni con nome salvate sul dispositivo; scarico di tutte le immagini in `.zip`.
  L'**anteprima** della pagina si aggiorna in tempo reale a ogni modifica ed esegue le stesse istruzioni di disegno del PDF (guide, abbondanza, angoli, intestazione; con immagini ridotte). Serve internet (le immagini arrivano da Scryfall) e non funziona dentro Claude.
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

## Sincronizzazione (Dropbox e Google Drive)
In *Dati → Sincronizzazione* colleghi uno o entrambi i servizi. L'app salva **un solo file** (`coglio-sync.json`) nella sua cartella riservata
(Dropbox: *Apps/…*; Drive: cartella dati nascosta dell'app) e non vede nient'altro. Le modifiche fatte su due dispositivi si fondono,
le cancellazioni viaggiano (con una finestra di 90 giorni) e puoi tenere la sincronizzazione automatica. Si sincronizzano archivio, mazzi
e le impostazioni *terre base* e *immagini*; **tema e Designer restano sul dispositivo**. Il file non contiene le chiavi di accesso.

Serve una chiave dell'app, da creare una volta sola (gratis). Si può mettere in `web/sync-config.js` prima di costruire l'app,
oppure incollare in *Dati → Sincronizzazione → Prima configurazione* su ogni dispositivo (resta solo lì).

**Dropbox** (funziona ovunque, anche nel browser)
1. Vai su <https://www.dropbox.com/developers/apps> → *Create app* → *Scoped access* → **App folder**.
2. Scheda *Permissions*: spunta `files.content.read` e `files.content.write` e salva.
3. Copia la **App key** (non serve il secret). In app: *Collega Dropbox* → autorizza → incolla il codice che Dropbox mostra.

**Google Drive** (solo app Windows e Android: dal browser Google blocca la richiesta)
1. Su <https://console.cloud.google.com> crea un progetto e abilita **Google Drive API**; configura la schermata di consenso (tipo *Esterno*, aggiungi il tuo indirizzo tra gli utenti di prova).
2. *Credenziali → Crea credenziali → ID client OAuth* → tipo **TV e dispositivi con input limitato**.
3. Copia **ID client** e **Segreto client**. In app: *Collega Google Drive* → apri l'indirizzo mostrato e digita il codice.

Nota: la sincronizzazione è stata verificata con servizi simulati; al primo collegamento reale controlla che mazzi e archivio siano quelli giusti.

## Struttura
```
web/        l'app (HTML, CSS, JS senza dipendenze) = PWA
            core.js (archivio) · pdf.js (motore PDF) · proxy.js (Scryfall e immagini) · search.js (ricerca e sintassi Scryfall) · cards.js (dati e prezzi delle carte) · community.js + community-ui.js + community-config.js (Codighel ID) · sync.js + sync-config.js (Dropbox e Google Drive) · builder.js (schermata Stampa) · cardrender.js + designer.js (Designer) · app.js
electron/   wrapper Windows
capacitor/  wrapper Android/iOS
tools/      test (community-test.js, community-sql-test.js, community-smoke.js e shared-smoke.js per il Codighel ID e i tavoli condivisi, test.js, pdf-test.js, proxy-test.js, update-test.js, status-test.js, ui-smoke.js, builder-smoke.js, img-smoke.js, update-smoke.js, status-smoke.js, designer-test.js, design-core-test.js), build.py, make_icons.py
dist/       coglio-proxy-archive.html = pagina unica
```
Tutti i dati restano sul dispositivo (IndexedDB del browser). Nessun account, nessun server, salvo le funzioni community facoltative (vedi «Community»; lo schema del server e' in `supabase/schema.sql`).

## Note
- `pdf-test.js` e `proxy-test.js` girano con solo Node (il primo, se ci sono `python3` con Pillow, `pdfinfo`, `qpdf` e `pdftoppm`, controlla anche i PDF con strumenti esterni e confronta i pixel); `update-test.js` (scarico dell'aggiornamento con rete simulata) e `status-test.js` (stati dei mazzi e riuso delle carte) girano con solo Node; `ui-smoke.js`, `builder-smoke.js`, `img-smoke.js`, `update-smoke.js` e `status-smoke.js` usano jsdom (`node tools/builder-smoke.js <percorso-di-jsdom>`).
- `search-test.js`, `cards-test.js`, `bracket-test.js` e `sync-test.js` girano con solo Node (ricerca Scryfall, dati/prezzi, sincronizzazione con Dropbox e Drive simulati da `fake-clouds.js`); `feat-smoke.js`, `deck-smoke.js` (pagina del mazzo), `mpc-test.js` e `mpc-smoke.js` (stampe MPC Fill), `analysis-test.js` e `analysis-smoke.js` (Analisi del piscio), `pescher-test.js` e `pescher-smoke.js` (The Pescher), `edit-smoke.js` (aggiungi/togli carte, sideboard, export), `bracket-smoke.js` (report del bracket) e `sync-smoke.js` provano l'interfaccia in Chromium.
- `designer-test.js` usa Chromium (Playwright): `node tools/designer-test.js`.
- `test.js`, `ui-smoke.js` e `img-smoke.js` leggono alcune liste di mazzi da `tools/fixtures/`, che non sono nel repository: servono liste tue per provarli.
- Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast. Immagini e dati delle carte: [Scryfall](https://scryfall.com). Magic: The Gathering è un marchio di Wizards of the Coast.

## Community (Codighel ID)

Il pannello **Dati > Codighel ID** dà a ognuno un nome utente unico tra amici, **senza email né password**, con un artwork di una carta (da Scryfall) come immagine. Serve un piccolo server: Supabase, gratis (500 MB di database, 50.000 utenti attivi al mese; i progetti gratuiti si **mettono in pausa dopo 1 settimana senza uso** e si riattivano dalla dashboard, e non hanno backup automatici). Finche' `web/community-config.js` e' vuoto il pannello dice che le funzioni non sono ancora attive e l'app funziona come prima.

**Attivarlo (una volta sola):**
1. Su [supabase.com](https://supabase.com) crea un progetto gratuito.
2. Apri **SQL Editor**, incolla tutto `supabase/schema.sql` e premi **Run** (si puo' rilanciare senza danni).
3. L'indirizzo del progetto e' `https://<project id>.supabase.co`; in **Settings > API Keys** copia la chiave **publishable** (`sb_publishable_…`; va bene anche la vecchia `anon` in «Legacy API keys»). Scrivili in `web/community-config.js` (`url` e `key`): sono pubblici per natura. La chiave **secret** (`sb_secret_…`) NON va mai messa nell'app.
4. Ricostruisci (`python3 tools/build.py`) e pubblica.

**Come funziona.** Il codice di recupero (20 caratteri, 100 bit di casualita', alfabeto senza I, L, O, U) si genera sul dispositivo (`crypto.getRandomValues`); al server arriva solo per dimostrare chi sei e li' ne resta l'impronta SHA-256. La tabella `cpa_profiles` e' chiusa a tutti (RLS senza policy, nessun permesso all'`anon`): tutto passa dalle funzioni `cpa_*` (`handle_free`, `profile`, `register`, `login`, `set_avatar`, `rename`, `delete`, e per gli amici `friend_request`, `friend_respond`, `friend_remove`, `friend_list`), che controllano il codice e accettano come immagine solo indirizzi `https://cards.scryfall.io/...`. Gli ID sono 3-20 caratteri `[A-Za-z0-9_.-]`, unici senza badare alle maiuscole, con qualche nome riservato (admin, botto, ...). Chi perde il codice perde il profilo: non c'e' recupero.

**Amici.** La tabella `cpa_friends` ha una riga per coppia (indice unico su `least(a,b), greatest(a,b)`): chi ha chiesto, chi ha ricevuto, `pending` o `accepted`. L'amicizia scatta quando l'altro accetta, o subito se si sono chiesti a vicenda; si possono avere al massimo 30 richieste in attesa e 100 amici; cambiare ID non rompe le amicizie, eliminare il profilo le porta via (`on delete cascade`). Il **link di condivisione** e' `https://imHuHo.github.io/coglio-proxy-archive/#amico=<ID>` (`C.friendLink` / `C.parseFriendHash`): all'avvio `community-ui.js` lo legge, pulisce l'indirizzo, porta in Dati e apre l'invito; chi non ha un ID lo crea e la richiesta parte da sola. Si apre nel browser (non direttamente nelle app per Windows e Android: servirebbe un dominio proprio per i link universali). Dopo aver aggiornato l'app va **rilanciato `supabase/schema.sql`** nel SQL Editor (e' idempotente) per creare la tabella e le funzioni degli amici. Il profilo (ID e codice) sta in `localStorage` (`cpa:community:v1`) e **non** entra nei backup ne' nella sincronizzazione.

**Tavoli condivisi.** Un tavolo del Pescher con amici seduti vive sul server: `cpa_tables` (proprietario, nome, posti come JSON: ospiti per nome, amici per id), `cpa_table_members` (chi lo vede) e `cpa_games` (le partite, ripulite dal server: al massimo 500 per tavolo, 20 tavoli per proprietario). Al tavolo si siedono solo amici del proprietario (chi e' gia' seduto resta anche se l'amicizia finisce); i nomi dei posti vengono sempre dall'ID di oggi, quindi chi cambia ID si vede col nuovo nome anche nelle partite vecchie. Tutti i membri registrano ed eliminano partite; solo il proprietario modifica o elimina il tavolo; gli altri possono lasciarlo (`cpa_table_leave`, il posto diventa un nome libero). Sul dispositivo (`pescher-ui.js`) restano una copia dei tavoli e delle partite (`cpa:pescher:shared:v1`) e la coda delle partite non ancora inviate (`cpa:pescher:outbox:v1`): la classifica li somma, l'app riprova a ogni aggiornamento. Si aggiorna aprendo il Pescher (al massimo ogni minuto) o con il tasto «Aggiorna»; niente tempo reale. Dopo l'aggiornamento va **rilanciato `supabase/schema.sql`** (e' idempotente).

`web/community.js` e' logica pura (`CPACommunity`: controlli sugli ID, codice, ricerca artwork `unique=art`, client delle funzioni con `fetch` iniettabile); `web/community-ui.js` disegna solo il pannello `#cm` e i suoi pop-up. Prove: `node tools/community-test.js` (logica), `node tools/community-sql-test.js <pglite>` (lo schema su un Postgres vero, chiamato come `anon`) e `node tools/community-smoke.js <pglite>` (Chromium contro lo stesso Postgres); `<pglite>` e' la cartella di `@electric-sql/pglite` (`npm i @electric-sql/pglite` in una cartella a parte).
