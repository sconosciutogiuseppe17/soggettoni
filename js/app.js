// Collante fra rete, motore e interfaccia.

import { creaCatalogo, creaRng, codiceStanza, ETICHETTE } from './engine.js';
import { nuovaPartita, applica, azioniPossibili, MODALITA } from './partita.js';
import { Rete, descriviErrore } from './net.js';
import * as UI from './ui.js';
const { $, cre } = UI;

const app = {
  catalogo: null,
  rete: null,
  stato: null,
  ioIdx: -1,          // indice del mio posto al tavolo
  modalita: '1v1',
  locale: false,      // partita a passaggio di dispositivo, senza rete
  selezione: new Set(),
  mirando: false,
};

/* --------------------------- avvio ------------------------------------ */

async function avvia() {
  try {
    const [s, a] = await Promise.all([
      fetch('data/soggettoni.json').then(r => r.json()),
      fetch('data/accessori.json').then(r => r.json()),
    ]);
    app.catalogo = creaCatalogo(s, a);
  } catch (e) {
    erroreIngresso("Non riesco a caricare le carte. Se hai aperto il file direttamente, serve un server: apri il sito da GitHub Pages.");
    return;
  }
  collegaIngresso();
  const codicePassato = new URLSearchParams(location.search).get('stanza');
  if (codicePassato) {
    mostraPannello('entra');
    $('#in-codice').value = codicePassato.toUpperCase().slice(0, 5);
  }
  $('#in-nome').value = localStorage.getItem('soggettoni-nome') || '';
}

function schermata(id) {
  for (const s of document.querySelectorAll('.schermata')) s.classList.toggle('attiva', s.id === id);
}
function mostraPannello(quale) {
  for (const p of ['scelta', 'crea', 'entra']) $('#pannello-' + p).classList.toggle('nascosto', p !== quale);
}
function erroreIngresso(t) { $('#errore-ingresso').textContent = t || ''; }

function nomeScelto() {
  const n = $('#in-nome').value.trim().slice(0, 20);
  if (!n) { erroreIngresso('Scrivi il tuo nome, se no gli altri non sanno chi sei.'); $('#in-nome').focus(); return null; }
  localStorage.setItem('soggettoni-nome', n);
  erroreIngresso('');
  return n;
}

/* --------------------------- ingresso --------------------------------- */

function collegaIngresso() {
  $('#btn-vai-crea').onclick = () => { if (nomeScelto()) mostraPannello('crea'); };
  $('#btn-vai-entra').onclick = () => { if (nomeScelto()) mostraPannello('entra'); };
  for (const b of document.querySelectorAll('.indietro')) b.onclick = () => { mostraPannello('scelta'); erroreIngresso(''); };

  for (const b of document.querySelectorAll('.scelta-modalita')) {
    b.onclick = () => {
      for (const x of document.querySelectorAll('.scelta-modalita')) x.classList.remove('selezionata');
      b.classList.add('selezionata');
      app.modalita = b.dataset.modalita;
    };
  }

  $('#btn-crea').onclick = creaStanza;
  $('#btn-entra').onclick = entraStanza;
  $('#btn-locale').onclick = partitaLocale;
  $('#in-codice').addEventListener('keydown', e => { if (e.key === 'Enter') entraStanza(); });
  $('#in-nome').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-vai-crea').click(); });

  $('#lente').onclick = UI.chiudiLente;
  $('#foglio').onclick = e => { if (e.target.id === 'foglio' || e.target.hasAttribute('data-chiudi-foglio')) UI.chiudiFoglio(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { UI.chiudiLente(); UI.chiudiFoglio(); } });

  $('#btn-regole').onclick = mostraRegole;
  $('#btn-registro').onclick = mostraRegistro;
}

async function creaStanza() {
  const nome = nomeScelto(); if (!nome) return;
  const codice = codiceStanza(creaRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
  $('#btn-crea').disabled = true;
  erroreIngresso('Sto aprendo la stanza…');
  app.rete = nuovaRete();
  try {
    await app.rete.creaStanza({ codice, nome, modalita: app.modalita, postiTotali: MODALITA[app.modalita].giocatori });
    app.ioIdx = 0;
    erroreIngresso('');
    schermata('schermata-lobby');
    $('#btn-inizia').onclick = iniziaPartita;
    $('#btn-copia').onclick = () => copiaInvito(codice);
  } catch (e) {
    erroreIngresso(descriviErrore(e));
  } finally {
    $('#btn-crea').disabled = false;
  }
}

async function entraStanza() {
  const nome = nomeScelto(); if (!nome) return;
  const codice = $('#in-codice').value.trim().toUpperCase();
  if (codice.length !== 5) { erroreIngresso('Il codice è di cinque caratteri.'); return; }
  $('#btn-entra').disabled = true;
  erroreIngresso('Mi collego alla stanza…');
  app.rete = nuovaRete();
  try {
    await app.rete.entra({ codice, nome });
    erroreIngresso('');
    schermata('schermata-lobby');
    $('#btn-inizia').classList.add('nascosto');
    $('#btn-copia').onclick = () => copiaInvito(codice);
  } catch (e) {
    erroreIngresso(descriviErrore(e));
  } finally {
    $('#btn-entra').disabled = false;
  }
}

function copiaInvito(codice) {
  const url = location.href.split('?')[0] + '?stanza=' + codice;
  navigator.clipboard?.writeText(url).then(
    () => { $('#btn-copia').textContent = 'Link copiato'; setTimeout(() => $('#btn-copia').textContent = "Copia il link d'invito", 1800); },
    () => prompt('Copia questo link:', url),
  );
}

function nuovaRete() {
  const r = new Rete({
    onLobby: disegnaLobby,
    onStato: st => { app.stato = st; if (app.ioIdx < 0) app.ioIdx = indiceMio(st); vaiAlTavolo(); },
    onErrore: msg => {
      if ($('#schermata-tavolo').classList.contains('attiva')) UI.messaggio(`<strong>${escapa(msg)}</strong>`);
      else erroreIngresso(msg);
    },
  });
  r.gestoreAzione = (idGiocatore, azione, rispondi) => {
    const i = app.stato?.giocatori.findIndex(g => g.id === idGiocatore);
    if (i == null || i < 0) return;
    const esito = applica(app.stato, i, azione, app.catalogo);
    rispondi?.(esito);
    if (esito.ok) r.diffondiStato(app.stato);
  };
  return r;
}

function indiceMio(stato) {
  const mioId = app.rete?.io?.id;
  return stato.giocatori.findIndex(g => g.id === mioId);
}

function disegnaLobby(lobby) {
  $('#codice-stanza').textContent = lobby.codice;
  const ul = $('#lista-lobby');
  ul.replaceChildren();
  for (const g of lobby.giocatori) {
    const li = cre('li');
    li.append(cre('span', 'pallino' + (g.online ? '' : ' spento')));
    li.append(cre('span', null, g.nome));
    li.append(cre('span', 'ruolo', g.host ? 'apre la stanza' : 'in attesa'));
    ul.append(li);
  }
  for (let k = lobby.giocatori.length; k < lobby.postiTotali; k++) {
    const li = cre('li');
    li.append(cre('span', 'pallino vuoto'));
    li.append(cre('span', null, 'posto libero'));
    ul.append(li);
  }
  const pieno = lobby.giocatori.length === lobby.postiTotali;
  const btn = $('#btn-inizia');
  if (app.rete?.sonoHost) {
    btn.disabled = !pieno;
    const mancano = lobby.postiTotali - lobby.giocatori.length;
    $('#attesa-lobby').textContent = pieno
      ? 'Ci siete tutti.'
      : mancano === 1 ? 'Manca un giocatore.' : `Mancano ${mancano} giocatori.`;
  } else {
    btn.classList.add('nascosto');
    $('#attesa-lobby').textContent = pieno
      ? 'Si comincia appena chi ha aperto la stanza preme il pulsante.'
      : 'Aspettiamo gli altri…';
  }
}

function iniziaPartita() {
  const lobby = app.rete.lobby;
  const stato = nuovaPartita({
    modalita: lobby.modalita,
    giocatori: lobby.giocatori.map(g => ({ id: g.id, nome: g.nome })),
    seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
    catalogo: app.catalogo,
  });
  app.stato = stato;
  app.ioIdx = indiceMio(stato);
  app.rete.diffondiStato(stato);
  vaiAlTavolo();
}

/* ------------------------ partita locale ------------------------------- */

function partitaLocale() {
  const nome = nomeScelto(); if (!nome) return;
  app.locale = true;
  const n = MODALITA[app.modalita].giocatori;
  const nomi = [nome, 'Tonino', 'Arnaldo', 'Bozzelli'].slice(0, n);
  app.stato = nuovaPartita({
    modalita: app.modalita,
    giocatori: nomi.map((x, i) => ({ id: 'g' + i, nome: x })),
    seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
    catalogo: app.catalogo,
  });
  app.ioIdx = app.stato.turno;
  vaiAlTavolo();
}

/* ---------------------------- tavolo ----------------------------------- */

function vaiAlTavolo() {
  schermata('schermata-tavolo');
  ridisegna();
}

function agisci(azione) {
  if (app.locale) {
    const esito = applica(app.stato, app.ioIdx, azione, app.catalogo);
    if (!esito.ok) { UI.messaggio(`<strong>${escapa(esito.errore)}</strong>`); return; }
    app.ioIdx = app.stato.turno;          // a passaggio di dispositivo tocca sempre a chi sta davanti
  } else {
    app.rete.inviaAzione(azione);
  }
  app.selezione.clear();
  app.mirando = false;
  ridisegna();
}

const handlers = {
  selezione: app.selezione,
  selezionaCarta(c) {
    const carta = app.catalogo.carta(c.cardId);
    if (app.selezione.has(c.uid)) app.selezione.delete(c.uid);
    else {
      if (carta.tipo !== 'diminuzione') app.selezione.clear();
      app.selezione.add(c.uid);
    }
    ridisegna();
  },
  bersagliabile(i) {
    if (!app.mirando) return false;
    const az = azioniPossibili(app.stato, app.ioIdx, app.catalogo);
    return az.bersagli.includes(i);
  },
  scegliBersaglio(i) {
    const dim = [...app.selezione].filter(uid => {
      const c = app.stato.giocatori[app.ioIdx].mano.find(x => x.uid === uid);
      return c && app.catalogo.carta(c.cardId).tipo === 'diminuzione';
    });
    agisci({ t: 'ATTACCA', bersaglio: i, diminuzioni: dim });
  },
  mostraDettaglio(i) {
    const g = app.stato.giocatori[i];
    if (g.campo) UI.apriLente(app.catalogo.carta(g.campo.cardId), app.catalogo);
  },
  mostraPila(titolo, cardIds) {
    const box = cre('div', 'riga-accessori');
    if (!cardIds.length) box.append(cre('p', null, 'Ancora niente qui dentro.'));
    for (const id of cardIds) {
      const c = app.catalogo.carta(id);
      box.append(UI.elCarta(c, 'piccola', { suClick: () => UI.apriLente(c, app.catalogo) }));
    }
    UI.apriFoglio(`${titolo} — ${cardIds.length} carte`, box);
  },
};

function ridisegna() {
  if (!app.stato) return;
  handlers.selezione = app.selezione;
  UI.disegna(app.stato, app.ioIdx, app.catalogo, handlers);
  disegnaAzioni();
  disegnaMessaggio();
}

function disegnaAzioni() {
  const box = $('#azioni');
  box.replaceChildren();
  const st = app.stato;
  if (st.fase === 'finita') {
    const nomi = (st.vincitori || []).map(i => st.giocatori[i].nome).join(' e ');
    const b = cre('button', 'bottone', 'Rivedi il registro');
    b.onclick = mostraRegistro;
    box.append(cre('span', 'nota', nomi ? `Vince ${nomi}.` : 'Partita conclusa.'), b);
    return;
  }

  const az = azioniPossibili(st, app.ioIdx, app.catalogo);
  const g = st.giocatori[app.ioIdx];

  if (!az.turnoMio) {
    box.append(cre('span', 'nota', app.locale
      ? 'Passa il dispositivo al giocatore di turno.'
      : `Aspetta: sta giocando ${st.giocatori[st.turno].nome}.`));
    return;
  }

  const selezionate = [...app.selezione]
    .map(uid => g.mano.find(c => c.uid === uid)).filter(Boolean);
  const prima = selezionate[0];
  const cartaPrima = prima && app.catalogo.carta(prima.cardId);

  if (app.mirando) {
    box.append(cre('span', 'nota', az.scontroGenerale
      ? 'Scegli su chi far scendere la diminuzione, poi parte lo scontro generale.'
      : 'Scegli chi attaccare toccando il suo soggettone.'));
    const ann = cre('button', 'bottone fantasma', 'Annulla');
    ann.onclick = () => { app.mirando = false; ridisegna(); };
    box.append(ann);
    return;
  }

  if (cartaPrima) {
    if (cartaPrima.tipo === 'luogo' && az.puoGiocareLuogo) {
      const b = cre('button', 'bottone', `Porta tutti a ${cartaPrima.nome}`);
      b.onclick = () => agisci({ t: 'GIOCA_LUOGO', uid: prima.uid });
      box.append(b);
    }
    if (['abilita', 'aumentazione', 'ignoranza'].includes(cartaPrima.tipo) && az.puoEquipaggiare) {
      const b = cre('button', 'bottone', 'Equipaggia al soggettone');
      b.onclick = () => agisci({ t: 'EQUIPAGGIA', uid: prima.uid });
      box.append(b);
    }
    if (cartaPrima.tipo === 'diminuzione') {
      box.append(cre('span', 'nota', 'Le drastiche diminuzioni si usano attaccando: tienile selezionate e premi il pulsante dello scontro.'));
    }
    const s = cre('button', 'bottone fantasma minuto', 'Scarta');
    s.onclick = () => agisci({ t: 'SCARTA', uid: prima.uid });
    box.append(s);
  }

  const diminuzioniScelte = selezionate.filter(c => app.catalogo.carta(c.cardId).tipo === 'diminuzione');
  const att = cre('button', 'bottone', az.scontroGenerale ? 'Scontro generale' : 'Attacca');
  att.disabled = !az.puoAttaccare || !az.bersagli.length;
  att.onclick = () => {
    // A tre i valori si confrontano tutti insieme: non c'è un bersaglio da scegliere,
    // serve solo per decidere su chi far scendere una drastica diminuzione.
    if (az.scontroGenerale && !diminuzioniScelte.length) agisci({ t: 'ATTACCA' });
    else { app.mirando = true; ridisegna(); }
  };
  box.append(att);

  const passa = cre('button', 'bottone fantasma', 'Passa il turno');
  passa.onclick = () => agisci({ t: 'PASSA' });
  box.append(passa);

  if (!az.puoAttaccare && az.motivoNoAttacco) box.append(cre('span', 'nota', az.motivoNoAttacco + '.'));
  else if (az.puoAttaccare && !az.bersagli.length) box.append(cre('span', 'nota', 'Nessun avversario ha un soggettone da attaccare.'));
}

function disegnaMessaggio() {
  const st = app.stato;
  if (st.fase === 'finita') {
    const nomi = (st.vincitori || []).map(i => st.giocatori[i].nome).join(' e ');
    UI.messaggio(`<strong>Partita finita.</strong> ${nomi ? 'Vince ' + escapa(nomi) + '.' : ''}`);
    return;
  }
  const ultimi = st.log.slice(-3).reverse();
  UI.messaggio(ultimi.map((l, i) => i === 0 ? `<strong>${escapa(l.testo)}</strong>` : escapa(l.testo)).join('<br>'));
}

/* ---------------------------- fogli ------------------------------------ */

function mostraRegistro() {
  const ul = cre('ul', 'registro');
  for (const l of app.stato.log) {
    const li = cre('li', l.dati ? 'rilievo' : '', l.testo);
    ul.append(li);
  }
  UI.apriFoglio('Registro della partita', ul);
}

function mostraRegole() {
  const d = cre('div');
  d.innerHTML = `
  <h4>Lo scopo</h4>
  <p>Si vince quando gli avversari restano senza soggettoni: né in campo, né nel mazzo.</p>
  <h4>Il turno</h4>
  <p>All'inizio del tuo turno, se non hai un soggettone in campo ne scopri uno dal mazzo e peschi
  una carta accessorio. Poi puoi equipaggiare un accessorio, giocare una carta luogo e attaccare una volta.</p>
  <h4>Lo scontro</h4>
  <p>I tre valori in alto del tuo soggettone sono l'attacco, i tre in basso la difesa.
  Si confrontano a coppie: Forza contro Incazzamento, Agilità contro Arrapamento,
  Intelligenza contro Ubriachezza. Chi supera l'avversario in almeno due confronti su tre lo sconfigge.
  Se non ci arriva nessuno dei due, i due soggettoni si annullano: vanno tutti e due al camposanto
  dei rispettivi proprietari, che ne scoprono un altro.</p>
  <p>In tre non si sceglie il bersaglio: i valori di tutti i soggettoni in campo si confrontano
  nello stesso momento, e ogni soggettone superato da un altro cade.</p>
  <h4>Che fine fanno le carte</h4>
  <p>Il soggettone sconfitto va nel <em>mazzo vittoria</em> di chi lo ha battuto — in due contro due
  il mazzo vittoria è uno solo per squadra. Gli accessori che portava addosso vanno nel
  <em>camposanto</em> del suo proprietario. Chi perde il soggettone ne scopre subito un altro, se ne ha.</p>
  <h4>I mazzi</h4>
  <p>Le 201 carte soggettone e le 30 carte accessorio si dividono in parti uguali fra chi gioca:
  in due tocca a testa metà mazzo, in tre un terzo, in quattro un quarto.</p>
  <h4>La carta luogo</h4>
  <p>In campo ce n'è una sola e vale per tutti, anche per i nemici. Quando qualcuno ne gioca una nuova,
  la precedente va nel camposanto di chi l'aveva giocata.</p>
  <h4>I valori</h4>
  <p>Vanno da 0 (tutte le tacche grigie) a 6 (tutte dorate: il massimo). Le <em>decise aumentazioni</em>
  portano un valore al massimo, le <em>drastiche diminuzioni</em> portano al minimo un valore
  del soggettone che stai attaccando.</p>`;
  UI.apriFoglio('Regole', d);
}

function escapa(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

avvia();
