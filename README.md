# Soggettoni — gioco di carte online

Web app per giocare a **Soggettoni** con gli amici: 1v1 in due, 1v1v1 in tre, 2v2 in quattro.
Nessun server, nessun account: si crea una stanza, si passa il codice, si gioca.

## Come si gioca online

1. Uno apre il sito e preme **Crea partita**, sceglie la modalità e riceve un codice di 5 caratteri.
2. Gli altri aprono lo stesso sito, premono **Entra**, inseriscono il codice e il proprio nome.
3. Quando tutti sono in lobby, chi ha creato la stanza preme **Inizia**.

La connessione è diretta fra i browser (WebRTC tramite PeerJS): chi crea la partita fa da
arbitro e tiene lo stato autoritativo, gli altri gli mandano le mosse e ricevono lo stato aggiornato.

## Struttura

    index.html            pagina unica: ingresso, lobby e tavolo
    css/style.css         stile ripreso dal playmat
    js/engine.js          valori, scontro e tabella delle regole
    js/partita.js         stato della partita, turni, azioni
    js/net.js             rete P2P (PeerJS), host autoritativo
    js/ui.js              rendering di plancia, mano, registro
    js/app.js             collante fra rete, motore e interfaccia
    js/vendor/peerjs.min.js  PeerJS ospitato qui: nessuna dipendenza da CDN
    data/soggettoni.json  201 soggettoni con valori, nome, rarità, ignoranza
    data/accessori.json   30 carte accessorio (luogo, abilità, aumentazione, diminuzione, ignoranza)
    assets/cards/         le immagini delle 231 carte
    assets/img/           il playmat

I valori delle carte sono stati estratti dalle immagini leggendo le barre a cinque tacche:
grigio = 0 (minimo), da 1 a 5 tacche rosse, tutte e cinque dorate = 6 (massimo).

## Regole implementate

Il riassunto completo sta in [REGOLE.md](REGOLE.md). In breve: le carte si dividono in parti
uguali fra chi gioca, ognuno tiene in campo un soggettone alla volta, lo carica con gli accessori
e lo manda addosso agli avversari. Vince chi resta con dei soggettoni quando gli altri li hanno
finiti.

Tutti i numeri stanno in un solo oggetto, `REGOLE` in `js/engine.js`.

## Sviluppo

Sito statico, nessuna compilazione. Per provarlo in locale:

    python3 -m http.server 8080

e apri <http://localhost:8080>.
