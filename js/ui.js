// Rendering del tavolo. Nessuna regola qui dentro: riceve lo stato e lo disegna.

import { ETICHETTE, STAT_MAX, valoriEffettivi, ignoranzaEffettiva } from './engine.js';
import { azioniPossibili, mazzoVittoria, MODALITA } from './partita.js';

const $ = s => document.querySelector(s);
const cre = (tag, cls, testo) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (testo != null) e.textContent = testo;
  return e;
};

export const PERCORSO_CARTE = 'assets/cards/';

/* ------------------------------- carte -------------------------------- */

export function elCarta(carta, dim = 'piccola', opzioni = {}) {
  const d = cre('div', `carta ${dim}` + (opzioni.classi ? ' ' + opzioni.classi : ''));
  const img = cre('img');
  img.src = PERCORSO_CARTE + carta.file;
  img.alt = carta.nome;
  img.loading = 'lazy';
  d.append(img);
  d.title = carta.nome;
  d.dataset.cardId = carta.id;
  if (opzioni.suClick) d.addEventListener('click', opzioni.suClick);
  return d;
}

export function elDorso(testo, dim = 'piccola', conteggio = null, vuoto = false) {
  const invo = cre('div', 'pila');
  const d = cre('div', `carta ${dim} dorso` + (vuoto ? ' vuoto' : ''), testo);
  d.classList.remove('carta');
  d.classList.add('carta', dim, 'dorso');
  if (vuoto) d.classList.add('vuoto');
  invo.append(d);
  if (conteggio != null) invo.append(cre('span', 'conteggio', String(conteggio)));
  return invo;
}

/* ------------------------------- valori ------------------------------- */

export function elValori(valori, base, chiavi, classe = '') {
  const g = cre('div', 'valori ' + classe);
  for (const k of chiavi) {
    const v = valori[k], b = base ? base[k] : v;
    const box = cre('div', 'valore');
    const nome = cre('div', 'nome');
    nome.append(cre('span', null, ETICHETTE[k]));
    const diff = v - b;
    if (diff) {
      const dsp = cre('span', 'delta ' + (diff > 0 ? 'su' : 'giu'), (diff > 0 ? '+' : '') + diff);
      nome.append(dsp);
    }
    box.append(nome);
    const barra = cre('div', 'barra-valore');
    for (let i = 0; i < 5; i++) {
      const t = cre('span', 'tacca');
      if (v >= STAT_MAX) t.classList.add('massima');
      else if (i < v) t.classList.add('piena');
      barra.append(t);
    }
    box.append(barra);
    g.append(box);
  }
  return g;
}

/* ------------------------------ lente --------------------------------- */

export function apriLente(carta, catalogo) {
  const l = $('#lente');
  $('#lente-img').src = PERCORSO_CARTE + carta.file;
  $('#lente-img').alt = carta.nome;
  const t = $('#lente-testo');
  t.textContent = carta.testo || carta.abilita || '';
  l.classList.remove('nascosto');
}
export function chiudiLente() { $('#lente').classList.add('nascosto'); }

export function apriFoglio(titolo, nodo) {
  const c = $('#foglio-contenuto');
  c.replaceChildren();
  if (titolo) c.append(cre('h3', null, titolo));
  c.append(nodo);
  $('#foglio').classList.remove('nascosto');
}
export function chiudiFoglio() { $('#foglio').classList.add('nascosto'); }

/* ------------------------------ avversari ------------------------------ */

const CLASSI_SQUADRA = ['a', 'b', 'c', 'd'];

function elAvversario(stato, i, ioIdx, catalogo, h) {
  const g = stato.giocatori[i];
  const mio = stato.giocatori[ioIdx];
  const compagno = ioIdx >= 0 && g.squadra === mio.squadra && i !== ioIdx;
  const box = cre('div', 'avversario'
    + (stato.turno === i ? ' turno-suo' : '')
    + (g.vivo ? '' : ' fuori')
    + (compagno ? ' compagno' : ''));

  // Soggettone in campo
  if (g.campo) {
    const carta = catalogo.carta(g.campo.cardId);
    // Mentre si sceglie il bersaglio il tocco serve ad attaccare, non a ingrandire.
    const inMira = !!h.bersagliabile?.(i);
    const el = elCarta(carta, 'piccola', {
      classi: inMira ? 'giocabile' : '',
      suClick: () => (inMira ? h.scegliBersaglio(i) : h.mostraDettaglio(i)),
    });
    box.append(el);
  } else {
    box.append(elDorso(g.vivo ? 'Nessuno in campo' : 'Fuori', 'piccola', null, true));
  }

  const dati = cre('div', 'dati');
  const riga = cre('div', 'riga-nome');
  riga.append(cre('span', null, g.nome));
  if (stato.modalita === '2v2') riga.append(cre('span', 'squadra ' + CLASSI_SQUADRA[g.squadra], 'Squadra ' + (g.squadra + 1)));
  if (compagno) riga.append(cre('span', 'gettone', 'compagno'));
  if (!g.online) riga.append(cre('span', 'gettone pericolo', 'scollegato'));
  dati.append(riga);

  if (g.campo) {
    const carta = catalogo.carta(g.campo.cardId);
    const { valori, base } = valoriEffettivi(g.campo, stato.luogo, catalogo, stato.regole);
    dati.append(cre('div', 'titolo-campo', carta.nome));
    dati.append(elValori(valori, base, ['incazzamento', 'arrapamento', 'ubriachezza'], 'difesa'));
  }

  const cont = cre('div', 'contatori');
  cont.append(cre('span', 'gettone', `${g.mazzoSogg.length} soggettoni`));
  cont.append(cre('span', 'gettone', `${g.mano.length} in mano`));
  cont.append(cre('span', 'gettone vittoria', `${mazzoVittoria(stato, i).length} vittorie`));
  if (g.campo?.accessori.length) cont.append(cre('span', 'gettone', `${g.campo.accessori.length} accessori`));
  dati.append(cont);

  if (g.campo?.accessori.length) {
    const r = cre('div', 'riga-accessori');
    for (const a of g.campo.accessori) {
      r.append(elCarta(catalogo.carta(a.cardId), 'mini', { suClick: () => apriLente(catalogo.carta(a.cardId), catalogo) }));
    }
    dati.append(r);
  }

  box.append(dati);
  return box;
}

/* ---------------------------- plancia mia ------------------------------ */

function pilaConEtichetta(nome, dorso) {
  const p = cre('div', 'posto');
  p.append(cre('span', 'posto-nome', nome));
  const c = cre('div', 'contenuto');
  c.append(dorso);
  p.append(c);
  return p;
}

function elMiaPlancia(stato, ioIdx, catalogo, h) {
  const g = stato.giocatori[ioIdx];
  const wrap = cre('section', 'plancia mia');

  const vinti = mazzoVittoria(stato, ioIdx);
  const etichettaVittoria = stato.modalita === '2v2' ? 'Mazzo vittoria di squadra' : 'Mazzo vittoria';
  const vittoria = pilaConEtichetta(etichettaVittoria,
    elDorso(vinti.length ? 'Vinti' : 'Vuoto', 'piccola', vinti.length || null, !vinti.length));
  vittoria.addEventListener('click', () => h.mostraPila(etichettaVittoria, vinti.map(v => v.cardId)));

  const camposanto = pilaConEtichetta('Camposanto',
    elDorso(g.camposanto.length ? 'Scarti' : 'Vuoto', 'piccola', g.camposanto.length || null, !g.camposanto.length));
  camposanto.addEventListener('click', () => h.mostraPila('Camposanto', g.camposanto.map(v => v.cardId)));

  const mazzoS = pilaConEtichetta('Mazzo soggettoni',
    elDorso('Soggettone', 'piccola', g.mazzoSogg.length || null, !g.mazzoSogg.length));
  const mazzoA = pilaConEtichetta('Carte accessorio',
    elDorso('Accessorio', 'piccola', g.mazzoAcc.length || null, !g.mazzoAcc.length));

  const sx = cre('div', 'colonna sx'); sx.append(vittoria, camposanto);
  const dx = cre('div', 'colonna dx'); dx.append(mazzoS, mazzoA);

  // Campo
  const zona = cre('div', 'zona-campo');
  if (g.campo) {
    const carta = catalogo.carta(g.campo.cardId);
    const { valori, base } = valoriEffettivi(g.campo, stato.luogo, catalogo, stato.regole);
    const ign = ignoranzaEffettiva(g.campo, catalogo);
    zona.append(elCarta(carta, 'grande', { suClick: () => apriLente(carta, catalogo) }));
    zona.append(cre('div', 'titolo-campo', carta.nome));
    const gett = cre('div', 'contatori');
    gett.append(cre('span', 'gettone', carta.rarita));
    gett.append(cre('span', 'gettone', 'Ignoranza ' + (ign.infinita ? '∞' : ign.valore) + '/100'));
    zona.append(gett);
    zona.append(elValori(valori, base, ['forza', 'agilita', 'intelligenza']));
    zona.append(elValori(valori, base, ['incazzamento', 'arrapamento', 'ubriachezza'], 'difesa'));
    if (g.campo.accessori.length) {
      const r = cre('div', 'riga-accessori');
      for (const a of g.campo.accessori) {
        r.append(elCarta(catalogo.carta(a.cardId), 'mini', { suClick: () => apriLente(catalogo.carta(a.cardId), catalogo) }));
      }
      zona.append(r);
    }
  } else {
    zona.append(elDorso(g.vivo ? 'Nessuno in campo' : 'Fuori dalla partita', 'grande', null, true));
  }

  // Su schermo stretto le quattro pile stanno in fondo, in fila.
  const lati = cre('div', 'lati-mobile');
  lati.append(
    pilaConEtichetta('Vittoria', elDorso(String(vinti.length), 'mini', null, !vinti.length)),
    pilaConEtichetta('Soggettoni', elDorso(String(g.mazzoSogg.length), 'mini', null, !g.mazzoSogg.length)),
    pilaConEtichetta('Accessori', elDorso(String(g.mazzoAcc.length), 'mini', null, !g.mazzoAcc.length)),
    pilaConEtichetta('Camposanto', elDorso(String(g.camposanto.length), 'mini', null, !g.camposanto.length)),
  );

  wrap.append(sx, zona, dx, lati);
  return wrap;
}

/* -------------------------------- mano --------------------------------- */

function elMano(stato, ioIdx, catalogo, h) {
  const g = stato.giocatori[ioIdx];
  const box = cre('div', 'mano');
  const az = azioniPossibili(stato, ioIdx, catalogo);
  for (const c of g.mano) {
    const carta = catalogo.carta(c.cardId);
    const giocabile = az.turnoMio && (
      (carta.tipo === 'luogo' && az.puoGiocareLuogo) ||
      (['abilita', 'aumentazione', 'ignoranza'].includes(carta.tipo) && az.puoEquipaggiare) ||
      (carta.tipo === 'diminuzione' && az.puoAttaccare)
    );
    const el = elCarta(carta, 'media', {
      classi: (giocabile ? 'giocabile ' : '') + (h.selezione.has(c.uid) ? 'selezionata' : ''),
      suClick: () => h.selezionaCarta(c),
    });
    el.dataset.uid = c.uid;
    box.append(el);
  }
  return box;
}

/* ----------------------------- disegno totale --------------------------- */

export function disegna(stato, ioIdx, catalogo, h) {
  // Avversari
  const avv = $('#avversari');
  avv.replaceChildren();
  const altri = stato.giocatori.map((_, i) => i).filter(i => i !== ioIdx);
  avv.className = 'avversari ' + (altri.length === 3 ? 'tre' : altri.length === 2 ? 'due' : '');
  for (const i of altri) avv.append(elAvversario(stato, i, ioIdx, catalogo, h));

  // Carta luogo condivisa
  const cl = $('#contenuto-luogo');
  cl.replaceChildren();
  if (stato.luogo) {
    const carta = catalogo.carta(stato.luogo.cardId);
    cl.append(elCarta(carta, 'piccola', { suClick: () => apriLente(carta, catalogo) }));
    const chi = stato.giocatori[stato.luogo.proprietario];
    cl.append(cre('div', 'gettone', `${carta.nome} — di ${chi.nome}`));
  } else {
    cl.append(elDorso('Nessun luogo', 'piccola', null, true));
  }

  // Plancia mia
  const vecchia = $('#mia-plancia');
  const nuova = elMiaPlancia(stato, ioIdx, catalogo, h);
  nuova.id = 'mia-plancia';
  vecchia.replaceWith(nuova);

  // Mano
  const manoVecchia = $('#mano');
  const manoNuova = elMano(stato, ioIdx, catalogo, h);
  manoNuova.id = 'mano';
  manoVecchia.replaceWith(manoNuova);

  // Barra del turno
  const g = stato.giocatori[stato.turno];
  const mod = MODALITA[stato.modalita];
  const io = stato.giocatori[ioIdx];
  $('#barra-turno').textContent = stato.fase === 'finita'
    ? 'Partita finita'
    : (stato.turno === ioIdx ? `Tocca a te, ${io?.nome ?? ''}` : `Tocca a ${g.nome}`)
      + ` · giro ${stato.giro} · ${mod.nome}`;
}

export function messaggio(html) { $('#messaggio-tavolo').innerHTML = html; }
export { cre, $ };
