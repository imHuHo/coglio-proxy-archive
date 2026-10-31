/* Novità per versione, dalla più recente. Si aggiorna a ogni update: la sezione «Codighel! che novità!» in Dati e l'avviso
   alla prima apertura dopo un aggiornamento leggono da qui. Ogni voce: { t: titolo breve, d: spiegazione }. */
window.CPA_CHANGELOG = [
  { v: '3.3.1', date: '31 ottobre 2026', title: 'Carte più fedeli a Card Conjurer', items: [
    { t: 'Simboli del mana di Card Conjurer', d: 'I simboli (numeri, colori, ibridi, phyrexiani, neve, tap) sono quelli di Card Conjurer: numeri più grandi e pesanti, colori più scuri e ombra in basso a sinistra.' },
    { t: 'Font delle regole giusto', d: 'Il testo delle regole usava una versione più sottile di MPlantin: ora è quella di Card Conjurer, con lo stesso spessore.' },
    { t: 'Testo e simboli come sulle carte vere', d: 'Con le cornici importate titolo, tipo e regole hanno ora le stesse dimensioni e la stessa interlinea di Card Conjurer, quindi il testo va a capo negli stessi punti. I simboli del mana sono più grandi e il «2» (e gli altri numeri) si legge meglio, anche dentro il testo delle regole.' },
    { t: 'Corona leggendaria giusta per le bifronte', d: 'Le cornici Transform e Modali hanno la loro corona dedicata, con il posto per l\'icona di trasformazione, e la striscia di cornice sotto la corona non si vede più. Se hai già scaricato quei pacchetti, nel Catalogo cornici trovi il tasto «Aggiorna».' },
    { t: 'Info in basso come sulle carte stampate', d: 'Numero e rarità sopra, sigla del set e illustratore (con il pennello) sotto.' },
    { t: 'Catalogo cornici più simpatico', d: 'Il tasto ha ora una vetrina colorata.' },
  ] },
  { v: '3.3.0', date: '31 ottobre 2026', title: 'Bicolore e carte bifronte', items: [
    { t: 'Cornici e corone a due colori', d: 'Nel Designer puoi mescolare due colori nella cornice (e, con le cornici importate, anche nella corona): il secondo compare da destra con una sfumatura, come nei bicolori di Card Conjurer, anche sul riquadro di forza e costituzione. Le carte con costo ibrido, ad esempio {W/U}, lo prendono da sole.' },
    { t: 'Scegli come mescolare i colori', d: 'Con una carta a due colori scegli tra: normale (dorata), solo la corona a due colori, oppure cornice e corona a due colori. L\'ordine dei colori segue il costo di mana, e puoi sceglierli a mano.' },
    { t: 'Font delle carte vere', d: 'Titolo, tipo e forza/costituzione ora usano Beleren, il font dei titoli di Magic (prima era Relay); numero di collezione e artista usano Gotham, come sulle carte stampate. Il testo delle regole resta in MPlantin.' },
    { t: 'Tasto Trasforma', d: 'Ogni design può avere un retro: il tasto «Trasforma» nell\'editor gira la carta e ti fa modificare l\'altra faccia. Importando una carta bifronte da Scryfall (trasformabile o modale) il retro arriva già con testo, arte e cornice del retro. Nel Builder il retro si stampa come retro della carta.' },
    { t: 'Simbolo del set personalizzato', d: 'Nella scheda Aspetto puoi caricare un tuo simbolo o logo al posto di quello del set (accanto al tipo di carta). Si adatta da solo allo spazio e puoi colorarlo con la rarità, come i veri simboli di espansione.' },
    { t: 'Editor più pulito', d: 'La creazione delle carte è riorganizzata in quattro schede (Testo, Aspetto, Arte, Mazzo): meno cose a schermo, stesse funzioni. L\'anteprima resta sempre visibile, l\'importazione è una barra compatta e la lista delle stampe si apre solo quando serve.' },
  ] },
  { v: '3.2.1', date: '30 ottobre 2026', title: 'Token nel Builder', items: [
    { t: 'Token del mazzo', d: 'Nel Builder, spuntando «Aggiungi i token», i token collegati alle carte del mazzo compaiono in un elenco a parte, con anteprima, e finiscono nel PDF e nell\'anteprima. Senza doppioni: una copia ciascuno, ma cambi la quantità (0 = non stamparlo) o scegli un\'altra stampa. Valgono anche per le carte con un design del Designer.' },
  ] },
  { v: '3.1.0', date: '30 ottobre 2026', title: 'Catalogo cornici, cartelle e altro', items: [
    { t: 'Nuove cornici', d: 'Nyx (Theros), Terre M15, Neve (Kaldheim), Devoid (Zendikar) e Miracle: le trovi nel menu «Cornice importata», con scelta automatica sui colori.' },
    { t: 'Catalogo cornici', d: 'Nel Designer c\'è «Catalogo cornici»: 174 pacchetti con 1273 cornici estratte da Card Conjurer (borderless con testo trasparente, extended art, full art, Universes Beyond, showcase, promo, token, planeswalker, saghe, bifronte…). Le aggiungi con un tocco e si scaricano da internet solo quelle che scegli; poi le trovi nel menu «Cornice importata».' },
    { t: 'Planeswalker fedeli', d: 'Con le cornici planeswalker (Magic Set Editor e catalogo) le abilità hanno le fasce chiare e scure alternate, le icone vere di lealtà (+, −, 0) e la casella della lealtà come sulle carte vere; righe e icone seguono il numero di abilità (da 1 a 4) e le versioni «tall».' },
    { t: 'Cornici a colpo d\'occhio', d: 'Nell\'editor le cornici non sono più un menu di testo: c\'è una griglia di anteprime, una per stile, già nel colore della carta. Restano solo le versioni automatiche, che cambiano da sole quando cambi i colori.' },
    { t: 'Costo di mana a pulsanti', d: 'Tocchi bianco, blu, nero, rosso, verde o incolore per aggiungerli; accanto compaiono − e + per regolare quanti. I colori della carta seguono il costo. X, ibridi e phyrexiani si scrivono ancora a mano con «Scrivi il costo a mano».' },
    { t: 'Scegli la stampa', d: 'Quando parti da una carta esistente, scegli la stampa (il set) da una galleria di immagini: cambia arte, cornice, collezione, numero, rarità, artista e testo di flavour, e il testo della carta resta quello che hai scritto.' },
    { t: 'Cornice identica alla carta', d: 'Partendo da una carta (o cambiando stampa) il designer imposta la cornice vera di quella carta: epoca, extended art, borderless, showcase, planeswalker, saga, bifronte e così via, più corona leggendaria, stampo olografico e The List. Se la cornice non è scaricata te lo dice e ti chiede se vuoi scaricarla.' },
    { t: 'Cartelle nel Designer', d: 'Raggruppi i tuoi design in cartelle (per mazzo, per cube, per uso…): le crei, rinomini ed elimini dalla lista, e sposti ogni carta dal suo menu «Cartella». Eliminando una cartella i design restano, senza cartella.' },
    { t: 'Elimina dalla lista', d: 'Ogni design ha il pulsante «Elimina» direttamente nella lista, con una conferma, senza dover entrare nella modifica.' },
    { t: 'Un solo «Nuova carta»', d: 'Tolti «Nuovo token» e «Alter di una carta»: sono già dentro «Nuova carta» (cornice token, e «Parti da una carta esistente»).' },
    { t: 'Extra della cornice', d: 'Nell\'editor c\'è la sezione «Extra della cornice»: corona leggendaria (normale o fluttuante), corona interna (Nyx o Compagno), stampo olografico, forza/costituzione scura, pips dell\'identità di colore e il timbro «The List».' }
  ] },
  { v: '3.0.0', date: '30 ottobre 2026', title: 'Coglio Proxy Designer', items: [
    { t: 'Nuova sezione Designer', d: 'Crei proxy personalizzate direttamente nell\'app: carte tue da zero, token, carte con cornici speciali e alter di carte che esistono già. Anteprima in tempo reale mentre scrivi.' },
    { t: 'Cornici disegnate da noi', d: 'Classica, tutta arte, senza bordo, token, planeswalker e saga, in tutti i colori, con bordo nero, bianco, argento o oro e angoli arrotondati o quadrati. Mana, tap e simboli ibridi si scrivono tra graffe: {2}{U}{U}, {T}, {W/U}, {G/P}.' },
    { t: 'La tua arte', d: 'Carichi un\'immagine qualsiasi e la sposti e ingrandisci: col mouse trascini e usi la rotella sull\'arte, sul telefono ci sono i cursori. Le immagini si salvano ridotte, solo sul tuo dispositivo.' },
    { t: 'Alter di carte esistenti', d: 'Scrivi il nome di una carta e il Designer importa testo, costo, tipo e arte da Scryfall: poi cambi quello che vuoi. Serve internet.' },
    { t: 'Importa le tue cornici', d: 'Importi cornici PNG tue (con la zona dell\'arte trasparente) oppure un pacchetto di cornici .json: le usi al posto di quelle disegnate. Con «automatica» la cornice segue i colori della carta, e testi, barre e casella forza/costituzione si allineano a quella cornice. L\'app include già 44 cornici (M15, senza bordo, 8th Edition, Masterpiece, Planeswalker), i simboli di mana veri, i font e 28 filigrane (gilde, clan, draghi, Mirrodin, Phyrexia, simboli di mana: le scegli nell\'editor, sotto il testo): si caricano da soli al primo avvio e le trovi nel menu cornice. Un pacchetto tuo può portare altri simboli e font, e si tolgono con «Togli simboli e font». Le tue importazioni restano solo sul tuo dispositivo.' },
    { t: 'Nel mazzo', d: 'Un design lo aggiungi a un mazzo come carta nuova, oppure sostituisce una carta che c\'è già: resta col suo nome, ma nel PDF si stampa il tuo design. Nella lista del mazzo ogni carta ha il pulsante «Design» (e «Togli design»).' },
    { t: 'Nel PDF', d: 'Le carte con un design si stampano nella schermata Stampa con l\'immagine disegnata, ad angoli quadri e a 300 dpi, insieme alle altre. Se il design non è su quel dispositivo, la carta si stampa con l\'immagine di Scryfall.' },
    { t: 'Salva e porta con te', d: 'Ogni design si scarica come PNG o JPG e si esporta in un file .json (con l\'arte dentro) per passarlo a un altro dispositivo. I design vivono a parte rispetto al backup dei mazzi.' }
  ] },
  { v: '2.2.0', date: '30 ottobre 2026', title: 'Mazzi da stampare, CODIGHEL che si usa, stampe più grandi', items: [
    { t: 'Tre stati per i mazzi', d: 'Ogni mazzo ora è Attivo (montato, carte in uso), Non ancora stampato oppure Non attivo (smontato, carte libere). Lo scegli quando importi il mazzo e lo cambi quando vuoi dalla lista dei mazzi o dalla pagina del mazzo.' },
    { t: 'Non ancora stampato', d: 'Le carte di un mazzo che non hai ancora stampato non entrano nell\'archivio, non fanno scattare CODIGHEL e, se le togli con un upgrade, non finiscono tra le sciolte (non esistono ancora). Quando lo stampi lo passi ad Attivo e le carte entrano in archivio.' },
    { t: 'Mazzi non attivi = carte disponibili', d: 'Le carte dei mazzi non attivi risultano libere: le trovi come disponibili in archivio, nell\'avviso CODIGHEL e quando applichi un upgrade, proprio come le carte sciolte.' },
    { t: 'CODIGHEL! Adesso si può usare', d: 'Quando importi un mazzo e compare l\'avviso, spunta le carte che vuoi riusare: le tolgo da dove sono (sciolte o mazzo non attivo) e le metto già nel nuovo mazzo, così non le ristampi. Vale anche per la stessa carta in un\'altra stampa: nel mazzo resta la stampa che hai davvero.' },
    { t: 'Cambia stampa più grande', d: 'In Archivio, scegliendo la stampa di una carta, le immagini sono molto più grandi e nitide, con nome e anno della collezione.' },
    { t: 'Versione web su GitHub Pages', d: 'L\'app c\'è anche come sito, sempre aggiornato: in Dati il pulsante «Ricarica l\'app con l\'ultima versione» azzera la copia in cache senza toccare i tuoi dati.' },
    { t: 'Codighel! che novità!', d: 'Questa sezione: a ogni aggiornamento trovi qui tutte le novità spiegate, e alla prima apertura dopo l\'update compare un avviso.' }
  ] },
  { v: '2.1.0', date: '30 ottobre 2026', title: 'Verifica aggiornamenti', items: [
    { t: 'Verifica aggiornamenti', d: 'In Dati il pulsante controlla le versioni su GitHub. Su Windows scarica lo zip nella cartella Download con barra di avanzamento; su Android apre il download dell\'APK; sul web rimanda alla pagina della versione.' }
  ] },
  { v: '2.0.1', date: '30 ottobre 2026', title: 'Il Builder migliora', items: [
    { t: 'Anteprima in tempo reale', d: 'Il foglio del PDF si aggiorna subito quando cambi le impostazioni, senza dover scaricare. È disegnato con le stesse operazioni del PDF.' },
    { t: 'Angoli quadrati', d: 'Carte rettangolari senza lo stondamento classico (ingrandisce di circa il 3% e ritaglia).' },
    { t: 'Logo e nome in cima al foglio', d: 'Ogni foglio parte con il logo e il nome dell\'app.' },
    { t: 'Scelta della stampa in una finestra', d: 'Per cambiare stampa di una carta nel Builder si apre una finestra con le carte in grande.' },
    { t: 'Token', d: '«Gettoni» ora si chiama «token».' }
  ] },
  { v: '2.0.0', date: '30 ottobre 2026', title: 'Coglio Proxy Builder', items: [
    { t: 'PDF stampabile di proxy', d: 'Dal mazzo («Crea PDF») o da una lista incollata (scheda «Stampa») ottieni un PDF pronto da stampare, con le immagini di Scryfall, senza filigrana. Solo fronti (il retro vero solo per le carte double-faced), con guide di taglio, margini, segni di registro e fronte-retro configurabili.' }
  ] },
  { v: '1.x', date: 'prima della 2.0', title: 'Le basi', items: [
    { t: 'Archivio e CODIGHEL', d: 'Le carte si riconoscono per nome e per stampa: una stampa diversa conta come carta diversa. L\'avviso CODIGHEL ti dice quali carte hai già stampato, in quella esatta stampa o in un\'altra.' },
    { t: 'Immagini e bracket', d: 'Miniature delle carte da Scryfall (toccale per ingrandirle e cambiare stampa) e tasto «Verifica bracket» con il numero 2-4 in un box colorato accanto al titolo del mazzo.' }
  ] }
];
