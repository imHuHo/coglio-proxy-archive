/* Novità per versione, dalla più recente. Si aggiorna a ogni update: la sezione «Codighel! che novità!» in Dati e l'avviso
   alla prima apertura dopo un aggiornamento leggono da qui. Ogni voce: { t: titolo breve, d: spiegazione }. */
window.CPA_CHANGELOG = [
  { v: '3.0.0', date: '30 ottobre 2026', title: 'Coglio Proxy Designer', items: [
    { t: 'Nuova sezione Designer', d: 'Crei proxy personalizzate direttamente nell\'app: carte tue da zero, token, carte con cornici speciali e alter di carte che esistono già. Anteprima in tempo reale mentre scrivi.' },
    { t: 'Cornici disegnate da noi', d: 'Classica, tutta arte, senza bordo, token, planeswalker e saga, in tutti i colori, con bordo nero, bianco, argento o oro e angoli arrotondati o quadrati. Mana, tap e simboli ibridi si scrivono tra graffe: {2}{U}{U}, {T}, {W/U}, {G/P}.' },
    { t: 'La tua arte', d: 'Carichi un\'immagine qualsiasi e la sposti e ingrandisci: col mouse trascini e usi la rotella sull\'arte, sul telefono ci sono i cursori. Le immagini si salvano ridotte, solo sul tuo dispositivo.' },
    { t: 'Alter di carte esistenti', d: 'Scrivi il nome di una carta e il Designer importa testo, costo, tipo e arte da Scryfall: poi cambi quello che vuoi. Serve internet.' },
    { t: 'Importa le tue cornici', d: 'Importi cornici PNG tue (con la zona dell\'arte trasparente) oppure un pacchetto di cornici .json: le usi al posto di quelle disegnate. Con «automatica» la cornice segue i colori della carta, e testi, barre e casella forza/costituzione si allineano a quella cornice. L\'app include già 44 cornici (M15, senza bordo, 8th Edition, Masterpiece, Planeswalker), i simboli di mana veri e i font: si caricano da soli al primo avvio e le trovi nel menu cornice. Un pacchetto tuo può portare altri simboli e font, e si tolgono con «Togli simboli e font». Le tue importazioni restano solo sul tuo dispositivo.' },
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
