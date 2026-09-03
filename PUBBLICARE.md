# Come metterlo online

Il progetto è già un repository git con un commit pronto. Serve solo mandarlo su GitHub
e accendere le Pages.

## 1. Crea il repository vuoto

Vai su <https://github.com/new>, chiamalo `soggettoni`, lascialo **senza** README,
senza .gitignore e senza licenza (qui c'è già tutto).

## 2. Mandalo su GitHub

Apri un terminale nella cartella `soggettoni` e incolla queste tre righe,
mettendo il tuo nome utente GitHub al posto di `TUONOME`:

    git remote add origin https://github.com/TUONOME/soggettoni.git
    git branch -M main
    git push -u origin main

Se git chiede nome e password, la password è un **token**: lo crei in un minuto su
<https://github.com/settings/tokens> (Generate new token · classic, spunta `repo`).

## 3. Accendi le Pages

Sul repository: **Settings › Pages**, alla voce *Source* scegli **Deploy from a branch**,
ramo `main`, cartella `/ (root)`, e salva.

Dopo un paio di minuti il gioco è a questo indirizzo:

    https://TUONOME.github.io/soggettoni/

## 4. Giocate

Uno apre il link, mette il nome, preme **Crea partita** e sceglie in quanti siete.
Passa il codice di cinque lettere agli altri, che aprono lo stesso link e premono
**Entra con un codice**. Quando la stanza è piena, chi l'ha aperta preme **Inizia**.

C'è anche un pulsante per provarla da soli sullo stesso schermo, senza rete.

## Se qualcuno non riesce a collegarsi

I browser si parlano direttamente, senza passare da un nostro server. Su certe reti
molto chiuse (uffici, scuole, alcuni hotspot) il collegamento diretto viene bloccato:
in quel caso funziona quasi sempre passando alla rete del telefono.
