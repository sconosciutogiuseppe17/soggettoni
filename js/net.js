// Rete peer-to-peer con PeerJS, host autoritativo.
// Chi crea la stanza tiene lo stato vero della partita: gli altri gli mandano le
// mosse e ricevono indietro lo stato aggiornato. Nessun server nostro.

const PREFISSO = 'soggettoni-v1-';

// Server STUN pubblici: servono ai due browser per scoprire il proprio indirizzo
// pubblico e parlarsi direttamente. Ne mettiamo più d'uno perché ogni tanto
// qualcuno non risponde.
const CONFIGURAZIONE = {
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
    sdpSemantics: 'unified-plan',
  },
};

export class Rete {
  constructor(callback = {}) {
    this.cb = callback;                 // { onLobby, onStato, onErrore, onConnessione }
    this.peer = null;
    this.codice = null;
    this.sonoHost = false;
    this.io = null;                     // { id, nome }
    this.connessioni = new Map();       // host: idGiocatore -> DataConnection
    this.versoHost = null;              // client: DataConnection
    this.lobby = null;                  // { codice, modalita, giocatori: [{id,nome,online,host}] }
    this.gestoreAzione = null;          // host: (idGiocatore, azione) => void
  }

  /* ---------------- creazione peer ---------------- */

  #nuovoPeer(id) {
    return new Promise((risolvi, rifiuta) => {
      if (typeof Peer === 'undefined') {
        rifiuta(new Error("La libreria di rete non si è caricata. Controlla la connessione e ricarica la pagina."));
        return;
      }
      const p = id ? new Peer(id, CONFIGURAZIONE) : new Peer(CONFIGURAZIONE);
      const timeout = setTimeout(() => rifiuta(new Error('Il server di collegamento non risponde. Riprova fra poco.')), 20000);
      p.on('open', () => { clearTimeout(timeout); risolvi(p); });
      p.on('error', e => {
        clearTimeout(timeout);
        if (e.type === 'unavailable-id') rifiuta(new Error('Questo codice stanza è già in uso. Creane un altro.'));
        else if (e.type === 'peer-unavailable') rifiuta(new Error('Nessuna stanza con questo codice. Controlla le lettere.'));
        else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
          rifiuta(new Error('Il servizio che mette in contatto i browser non risponde. Riprova fra un minuto; se sei su una rete aziendale o scolastica, prova con la rete del telefono.'));
        }
        else rifiuta(e);
      });
    });
  }

  /* ---------------- host ---------------- */

  async creaStanza({ codice, nome, modalita, postiTotali }) {
    this.peer = await this.#nuovoPeer(PREFISSO + codice);
    this.codice = codice;
    this.sonoHost = true;
    this.io = { id: 'g0', nome };
    this.lobby = {
      codice, modalita, postiTotali,
      giocatori: [{ id: 'g0', nome, online: true, host: true }],
    };

    this.peer.on('connection', conn => {
      conn.on('data', msg => this.#hostRiceve(conn, msg));
      conn.on('close', () => {
        const id = conn.metadata?.idGiocatore || [...this.connessioni.entries()].find(([, c]) => c === conn)?.[0];
        if (!id) return;
        this.connessioni.delete(id);
        const g = this.lobby.giocatori.find(x => x.id === id);
        if (g) { g.online = false; this.#diffondiLobby(); }
        this.cb.onConnessione?.({ id, online: false });
      });
    });

    this.peer.on('error', e => {
      if (e.type !== 'peer-unavailable') this.cb.onErrore?.(descriviErrore(e));
    });

    this.cb.onLobby?.(this.lobby);
    return codice;
  }

  #hostRiceve(conn, msg) {
    if (msg?.t === 'ciao') {
      const nome = String(msg.nome || 'Senza nome').slice(0, 20);
      // Rientro in partita: stesso nome, posto già assegnato.
      let g = this.lobby.giocatori.find(x => x.nome.toLowerCase() === nome.toLowerCase());
      if (!g) {
        if (this.lobby.giocatori.length >= this.lobby.postiTotali) {
          conn.send({ t: 'errore', msg: 'La stanza è al completo.' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        if (this.partitaAvviata) {
          conn.send({ t: 'errore', msg: 'La partita è già cominciata.' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        g = { id: 'g' + this.lobby.giocatori.length, nome, online: true, host: false };
        this.lobby.giocatori.push(g);
      }
      g.online = true;
      conn.metadata = { idGiocatore: g.id };
      this.connessioni.set(g.id, conn);
      conn.send({ t: 'benvenuto', idGiocatore: g.id, lobby: this.lobby });
      this.#diffondiLobby();
      this.cb.onConnessione?.({ id: g.id, nome, online: true });
      if (this.statoCorrente) conn.send({ t: 'stato', stato: this.statoCorrente });
      return;
    }

    if (msg?.t === 'azione') {
      const id = conn.metadata?.idGiocatore;
      if (!id) return;
      this.gestoreAzione?.(id, msg.azione, esito => {
        if (esito && !esito.ok) conn.send({ t: 'errore', msg: esito.errore });
      });
      return;
    }
  }

  #diffondiLobby() {
    this.cb.onLobby?.(this.lobby);
    this.#aTutti({ t: 'lobby', lobby: this.lobby });
  }

  #aTutti(msg) {
    for (const conn of this.connessioni.values()) {
      if (conn.open) { try { conn.send(msg); } catch (_) { /* ignora */ } }
    }
  }

  /** Host: pubblica lo stato aggiornato a tutti. */
  diffondiStato(stato) {
    this.statoCorrente = stato;
    this.partitaAvviata = true;
    this.#aTutti({ t: 'stato', stato });
    this.cb.onStato?.(stato);
  }

  /* ---------------- client ---------------- */

  async entra({ codice, nome }) {
    this.peer = await this.#nuovoPeer(null);
    this.codice = codice;
    this.sonoHost = false;

    const conn = this.peer.connect(PREFISSO + codice, { reliable: true });
    this.versoHost = conn;

    await new Promise((risolvi, rifiuta) => {
      const timeout = setTimeout(() => rifiuta(new Error('Nessuna risposta dalla stanza. Il codice è giusto e la partita è aperta?')), 20000);
      conn.on('open', () => { clearTimeout(timeout); risolvi(); });
      this.peer.on('error', e => { clearTimeout(timeout); rifiuta(e); });
    });

    conn.on('data', msg => {
      if (msg?.t === 'benvenuto') { this.io = { id: msg.idGiocatore, nome }; this.lobby = msg.lobby; this.cb.onLobby?.(msg.lobby); }
      else if (msg?.t === 'lobby') { this.lobby = msg.lobby; this.cb.onLobby?.(msg.lobby); }
      else if (msg?.t === 'stato') { this.cb.onStato?.(msg.stato); }
      else if (msg?.t === 'errore') { this.cb.onErrore?.(msg.msg); }
    });

    conn.on('close', () => this.cb.onErrore?.('Collegamento con la stanza interrotto. Ricarica la pagina per rientrare.'));

    conn.send({ t: 'ciao', nome });
    return true;
  }

  /** Client: manda una mossa all'host. Host: la esegue direttamente. */
  inviaAzione(azione) {
    if (this.sonoHost) { this.gestoreAzione?.(this.io.id, azione, () => {}); return; }
    if (this.versoHost?.open) this.versoHost.send({ t: 'azione', azione });
    else this.cb.onErrore?.('Non sei collegato alla stanza.');
  }

  chiudi() {
    try { this.peer?.destroy(); } catch (_) { /* ignora */ }
  }
}

export function descriviErrore(e) {
  const t = e?.type || '';
  if (t === 'peer-unavailable') return 'Nessuna stanza con questo codice.';
  if (t === 'unavailable-id')   return 'Codice stanza già occupato.';
  if (t === 'network')          return 'Problema di rete: il server di collegamento non risponde.';
  if (t === 'browser-incompatible') return 'Questo browser non supporta il collegamento diretto. Prova con Chrome, Firefox o Safari aggiornati.';
  if (t === 'webrtc')           return 'La connessione diretta non è riuscita. Su reti molto chiuse può servire un altro Wi-Fi o la rete del telefono.';
  return e?.message || 'Errore di rete.';
}
