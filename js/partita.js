// Stato della partita e transizioni. Tutto deterministico: stesso stato + stessa
// azione = stesso risultato, così l'host può fare da arbitro senza ambiguità.

import {
  REGOLE, STAT_MIN, STAT_MAX, ETICHETTE,
  creaRng, mescola, valoriEffettivi, ignoranzaEffettiva, risolviScontro, risolviScontroMultiplo,
} from './engine.js';

export const MODALITA = {
  '1v1':   { giocatori: 2, squadre: [0, 1],       nome: 'Uno contro uno' },
  '1v1v1': { giocatori: 3, squadre: [0, 1, 2],    nome: 'Tutti contro tutti' },
  '2v2':   { giocatori: 4, squadre: [0, 1, 0, 1], nome: 'Due contro due' },
};

/* ------------------------------------------------------------------ */
/* Creazione della partita                                             */
/* ------------------------------------------------------------------ */

export function nuovaPartita({ modalita, giocatori, seed, catalogo, regole = REGOLE }) {
  const mod = MODALITA[modalita];
  if (!mod) throw new Error(`Modalità sconosciuta: ${modalita}`);
  if (giocatori.length !== mod.giocatori) {
    throw new Error(`${mod.nome} richiede ${mod.giocatori} giocatori, ne sono arrivati ${giocatori.length}`);
  }

  const rng = creaRng(seed);
  const n = mod.giocatori;

  // Tutte le carte si dividono equamente: ognuno riceve la sua parte dei 201
  // soggettoni e dei 30 accessori. Quel che avanza resta fuori dalla partita.
  const perSogg = regole.soggettoniPerGiocatore || Math.floor(catalogo.soggettoni.length / n);
  const perAcc  = regole.accessoriPerGiocatore  || Math.floor(catalogo.accessori.length / n);
  const idsSogg = mescola(catalogo.soggettoni.map(c => c.id), rng);
  const idsAcc  = mescola(catalogo.accessori.map(c => c.id), rng);

  const squadre = [...new Set(mod.squadre)];
  const stato = {
    versione: 2,
    modalita,
    seed,
    rngSeq: 0,
    regole: { ...regole, soggettoniPerGiocatore: perSogg, accessoriPerGiocatore: perAcc },
    turno: 0,
    giro: 1,
    fase: 'in_corso',
    luogo: null,                        // { uid, cardId, proprietario }
    vittorie: Object.fromEntries(squadre.map(sq => [sq, []])),  // mazzo vittoria per squadra
    vincitori: null,
    log: [],
    giocatori: giocatori.map((g, i) => ({
      id: g.id,
      nome: g.nome,
      squadra: mod.squadre[i],
      mazzoSogg: idsSogg.slice(i * perSogg, (i + 1) * perSogg),
      mazzoAcc: idsAcc.slice(i * perAcc, (i + 1) * perAcc).map((id, k) => ({ uid: `${i}-${k}-${id}`, cardId: id })),
      mano: [],
      campo: null,                      // { cardId, accessori:[{uid,cardId}], azzerati:[] }
      camposanto: [],
      vivo: true,
      online: true,
      contatori: { accessori: 0, luoghi: 0, attacchi: 0 },
    })),
  };

  for (const g of stato.giocatori) {
    for (let k = 0; k < regole.manoIniziale; k++) pescaAccessorio(stato, g);
  }
  scriviLog(stato, `Partita avviata: ${mod.nome}.`);
  iniziaTurno(stato, catalogo);
  return stato;
}

/* ------------------------------------------------------------------ */
/* Utilità interne                                                     */
/* ------------------------------------------------------------------ */

function scriviLog(stato, testo, dati = null) {
  stato.log.push({ n: stato.log.length + 1, giro: stato.giro, testo, dati });
  if (stato.log.length > 400) stato.log.splice(0, stato.log.length - 400);
}

function pescaAccessorio(stato, g) {
  if (g.mano.length >= stato.regole.manoMax) return null;
  // Mazzo accessori esaurito: si rimescola il camposanto e si continua,
  // così i valori in campo possono sempre cambiare e nessuno scontro resta bloccato.
  if (!g.mazzoAcc.length && stato.regole.riciclaCamposanto) {
    const accessori = g.camposanto.filter(c => c.uid);       // i soggettoni caduti restano lì
    if (accessori.length) {
      stato.rngSeq = (stato.rngSeq || 0) + 1;
      g.mazzoAcc = mescola(accessori, creaRng(stato.seed + 31 * stato.rngSeq));
      g.camposanto = g.camposanto.filter(c => !c.uid);
      scriviLog(stato, `${g.nome} rimescola gli accessori del camposanto nel proprio mazzo.`);
    }
  }
  if (!g.mazzoAcc.length) return null;
  const c = g.mazzoAcc.shift();
  g.mano.push(c);
  return c;
}

function avversari(stato, idx) {
  const mio = stato.giocatori[idx];
  return stato.giocatori
    .map((g, i) => ({ g, i }))
    .filter(({ g, i }) => i !== idx && g.vivo && g.squadra !== mio.squadra);
}

function squadreVive(stato) {
  return [...new Set(stato.giocatori.filter(g => g.vivo).map(g => g.squadra))];
}

/** Mazzo vittoria: in 2v2 è uno solo per squadra, condiviso fra i due compagni. */
export function mazzoVittoria(stato, idx) {
  return stato.vittorie[stato.giocatori[idx].squadra] || [];
}

/** Il soggettone perde: va nel camposanto del proprietario, non al nemico. */
function alCamposanto(stato, idx, catalogo, motivo) {
  const p = stato.giocatori[idx];
  if (!p.campo) return;
  const nome = catalogo.carta(p.campo.cardId).nome;
  p.camposanto.push({ cardId: p.campo.cardId });
  for (const acc of p.campo.accessori) p.camposanto.push(acc);
  p.campo = null;
  scriviLog(stato, `${nome} va al camposanto di ${p.nome}${motivo ? ' ' + motivo : ''}.`);
  rischiera(stato, idx, catalogo);
}

function rischiera(stato, idx, catalogo) {
  const p = stato.giocatori[idx];
  if (p.campo || !p.mazzoSogg.length) return;
  const cardId = p.mazzoSogg.shift();
  p.campo = { cardId, accessori: [], azzerati: [], schieratoAlGiro: stato.giro };
  scriviLog(stato, `${p.nome} scopre ${catalogo.carta(cardId).nome}.`);
}

function haAncoraSoggettoni(g) {
  return !!g.campo || g.mazzoSogg.length > 0;
}

function verificaEliminazioni(stato) {
  for (const g of stato.giocatori) {
    if (g.vivo && !haAncoraSoggettoni(g)) {
      g.vivo = false;
      scriviLog(stato, `${g.nome} è rimasto senza soggettoni ed esce dalla partita.`);
    }
  }
  const vive = squadreVive(stato);
  if (vive.length <= 1) {
    stato.fase = 'finita';
    stato.vincitori = stato.giocatori
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.squadra === vive[0])
      .map(({ i }) => i);
    const nomi = stato.vincitori.map(i => stato.giocatori[i].nome).join(' e ');
    scriviLog(stato, `Partita finita. ${nomi ? `Vince ${nomi}.` : 'Nessun vincitore.'}`);
  }
}

/* ------------------------------------------------------------------ */
/* Turni                                                               */
/* ------------------------------------------------------------------ */

function iniziaTurno(stato, catalogo, profondita = 0) {
  if (stato.fase !== 'in_corso') return;
  if (profondita > stato.giocatori.length + 1) return;   // nessuno può più giocare

  const g = stato.giocatori[stato.turno];
  if (!g.vivo) { prossimoTurno(stato, catalogo, profondita + 1); return; }

  g.contatori = { accessori: 0, luoghi: 0, attacchi: 0 };

  // Se non ha un soggettone in campo, scopre il primo del proprio mazzo.
  if (!g.campo && g.mazzoSogg.length) {
    const cardId = g.mazzoSogg.shift();
    g.campo = { cardId, accessori: [], azzerati: [], schieratoAlGiro: stato.giro };
    scriviLog(stato, `${g.nome} schiera ${catalogo.carta(cardId).nome}.`);
  }

  for (let k = 0; k < stato.regole.pescaPerTurno; k++) pescaAccessorio(stato, g);
  verificaEliminazioni(stato);

  // Chi tocca potrebbe essere appena uscito dalla partita: si passa oltre.
  if (stato.fase === 'in_corso' && !stato.giocatori[stato.turno].vivo) {
    prossimoTurno(stato, catalogo, profondita + 1);
  }
}

function prossimoTurno(stato, catalogo, profondita = 0) {
  if (stato.fase !== 'in_corso') return;
  stato.turno = (stato.turno + 1) % stato.giocatori.length;
  if (stato.turno === 0) stato.giro++;
  iniziaTurno(stato, catalogo, profondita);
}

/* ------------------------------------------------------------------ */
/* Azioni legali                                                       */
/* ------------------------------------------------------------------ */

export function azioniPossibili(stato, idx, catalogo) {
  const g = stato.giocatori[idx];
  const suo = stato.turno === idx && stato.fase === 'in_corso' && g.vivo;
  if (!suo) return { turnoMio: false };
  const r = stato.regole;
  const primoGiro = stato.giro === 1 && !r.attaccoAlPrimoTurno;
  const appenaSchierato = g.campo && g.campo.schieratoAlGiro === stato.giro && !r.puoAttaccareAppenaSchierato;

  return {
    turnoMio: true,
    puoEquipaggiare: g.contatori.accessori < r.accessoriPerTurno && !!g.campo
      && (!r.maxAccessoriPerSoggettone || g.campo.accessori.length < r.maxAccessoriPerSoggettone),
    puoGiocareLuogo: g.contatori.luoghi < r.luoghiPerTurno,
    puoAttaccare: !!g.campo && g.contatori.attacchi < r.attacchiPerTurno
                  && !primoGiro && !appenaSchierato && avversari(stato, idx).length > 0,
    scontroGenerale: stato.modalita === '1v1v1',
    bersagli: avversari(stato, idx).filter(({ g: a }) => !!a.campo).map(({ i }) => i),
    motivoNoAttacco: !g.campo ? 'Non hai un soggettone in campo'
      : primoGiro ? 'Al primo giro non si attacca'
      : appenaSchierato ? 'Il soggettone è appena stato schierato'
      : g.contatori.attacchi >= r.attacchiPerTurno ? 'Hai già attaccato in questo turno'
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Applicazione di un'azione                                           */
/* ------------------------------------------------------------------ */

/**
 * Applica un'azione e, se chi la compie esce dalla partita mentre la compie
 * (per esempio perde l'ultimo soggettone attaccando), passa subito il turno:
 * altrimenti il tavolo resterebbe fermo su un giocatore che non può più giocare.
 */
export function applica(stato, idx, azione, catalogo) {
  const esito = eseguiAzione(stato, idx, azione, catalogo);
  if (esito.ok && stato.fase === 'in_corso' && !stato.giocatori[stato.turno].vivo) {
    prossimoTurno(stato, catalogo);
  }
  return esito;
}

function eseguiAzione(stato, idx, azione, catalogo) {
  if (stato.fase !== 'in_corso') return { ok: false, errore: 'La partita è finita' };
  if (stato.turno !== idx) return { ok: false, errore: 'Non è il tuo turno' };
  const g = stato.giocatori[idx];
  if (!g.vivo) return { ok: false, errore: 'Sei fuori dalla partita' };
  const r = stato.regole;

  switch (azione.t) {

    case 'EQUIPAGGIA': {
      if (!g.campo) return { ok: false, errore: 'Non hai un soggettone in campo' };
      if (g.contatori.accessori >= r.accessoriPerTurno)
        return { ok: false, errore: 'Hai già equipaggiato in questo turno' };
      if (r.maxAccessoriPerSoggettone && g.campo.accessori.length >= r.maxAccessoriPerSoggettone)
        return { ok: false, errore: `Un soggettone porta al massimo ${r.maxAccessoriPerSoggettone} accessori` };
      const k = g.mano.findIndex(c => c.uid === azione.uid);
      if (k < 0) return { ok: false, errore: 'Carta non in mano' };
      const carta = catalogo.carta(g.mano[k].cardId);
      if (carta.tipo === 'luogo') return { ok: false, errore: 'La carta luogo si gioca in campo, non si equipaggia' };
      if (carta.tipo === 'diminuzione') return { ok: false, errore: 'La diminuzione si gioca attaccando' };
      if (carta.tipo === 'ignoranza') {
        const ign = ignoranzaEffettiva(g.campo, catalogo);
        if (!ign.infinita && ign.valore + carta.punti > 100)
          return { ok: false, errore: `A ${catalogo.carta(g.campo.cardId).nome} mancano meno di ${carta.punti} punti per arrivare a 100` };
      }
      const [carta0] = g.mano.splice(k, 1);
      g.campo.accessori.push(carta0);
      g.contatori.accessori++;
      scriviLog(stato, `${g.nome} equipaggia ${carta.nome} a ${catalogo.carta(g.campo.cardId).nome}.`);
      return { ok: true };
    }

    case 'GIOCA_LUOGO': {
      if (g.contatori.luoghi >= r.luoghiPerTurno)
        return { ok: false, errore: 'Hai già giocato una carta luogo in questo turno' };
      const k = g.mano.findIndex(c => c.uid === azione.uid);
      if (k < 0) return { ok: false, errore: 'Carta non in mano' };
      const carta = catalogo.carta(g.mano[k].cardId);
      if (carta.tipo !== 'luogo') return { ok: false, errore: 'Non è una carta luogo' };
      // Il luogo precedente va al camposanto del suo proprietario.
      if (stato.luogo) {
        const prec = stato.giocatori[stato.luogo.proprietario];
        prec.camposanto.push({ uid: stato.luogo.uid, cardId: stato.luogo.cardId });
        scriviLog(stato, `${catalogo.carta(stato.luogo.cardId).nome} va al camposanto di ${prec.nome}.`);
      }
      const [carta0] = g.mano.splice(k, 1);
      stato.luogo = { uid: carta0.uid, cardId: carta0.cardId, proprietario: idx };
      g.contatori.luoghi++;
      scriviLog(stato, `${g.nome} porta tutti a ${carta.nome}.`);
      return { ok: true };
    }

    case 'ATTACCA': {
      const az = azioniPossibili(stato, idx, catalogo);
      if (!az.puoAttaccare) return { ok: false, errore: az.motivoNoAttacco || 'Non puoi attaccare' };

      // Carte "drastica diminuzione" giocate a supporto dell'attacco.
      // In 1v1v1 colpiscono il bersaglio indicato, negli altri casi il difensore.
      const usate = [];
      const bersaglioDim = azione.bersaglio ?? az.bersagli[0];
      const perDim = stato.giocatori[bersaglioDim];
      for (const uid of (azione.diminuzioni || [])) {
        const k = g.mano.findIndex(c => c.uid === uid);
        if (k < 0) continue;
        const carta = catalogo.carta(g.mano[k].cardId);
        if (carta.tipo !== 'diminuzione') continue;
        const [c0] = g.mano.splice(k, 1);
        usate.push({ carta, c0 });
        if (perDim?.campo && !perDim.campo.azzerati.includes(carta.stat)) perDim.campo.azzerati.push(carta.stat);
      }
      for (const { carta, c0 } of usate) {
        scriviLog(stato, `${g.nome} gioca ${carta.nome}: ${ETICHETTE[carta.stat]} di `
          + `${perDim?.campo ? catalogo.carta(perDim.campo.cardId).nome : 'nessuno'} al minimo.`);
        g.camposanto.push(c0);
      }

      const esitoAzione = az.scontroGenerale
        ? scontroGenerale(stato, idx, catalogo)
        : scontroSingolo(stato, idx, azione.bersaglio, catalogo);
      if (!esitoAzione.ok) return esitoAzione;

      for (const p of stato.giocatori) if (p.campo) p.campo.azzerati = [];
      g.contatori.attacchi++;
      verificaEliminazioni(stato);
      return { ok: true };
    }

    case 'PASSA': {
      scriviLog(stato, `${g.nome} passa il turno.`);
      prossimoTurno(stato, catalogo);
      return { ok: true };
    }

    case 'SCARTA': {
      const k = g.mano.findIndex(c => c.uid === azione.uid);
      if (k < 0) return { ok: false, errore: 'Carta non in mano' };
      const [c0] = g.mano.splice(k, 1);
      g.camposanto.push(c0);
      scriviLog(stato, `${g.nome} scarta ${catalogo.carta(c0.cardId).nome}.`);
      return { ok: true };
    }

    default:
      return { ok: false, errore: `Azione sconosciuta: ${azione.t}` };
  }
}

/** Scontro fra due: l'attaccante sceglie chi colpire. */
function scontroSingolo(stato, idx, bersaglio, catalogo) {
  const g = stato.giocatori[idx];
  const d = stato.giocatori[bersaglio];
  if (!d || !d.vivo || d.squadra === g.squadra) return { ok: false, errore: 'Bersaglio non valido' };
  if (!d.campo) return { ok: false, errore: `${d.nome} non ha un soggettone in campo` };

  const va = valoriEffettivi(g.campo, stato.luogo, catalogo, stato.regole);
  const vd = valoriEffettivi(d.campo, stato.luogo, catalogo, stato.regole);
  const esito = risolviScontro(va.valori, vd.valori, stato.regole);

  const nomeA = catalogo.carta(g.campo.cardId).nome;
  const nomeD = catalogo.carta(d.campo.cardId).nome;
  scriviLog(stato, `${nomeA} attacca ${nomeD} — ${riepilogo(esito.confronti)}`,
    { esito, va: va.valori, vd: vd.valori });

  if (esito.esito === 'difensore_sconfitto' || esito.esito === 'entrambi_sconfitti') sconfiggi(stato, bersaglio, idx, catalogo);
  if (esito.esito === 'attaccante_sconfitto' || esito.esito === 'entrambi_sconfitti') sconfiggi(stato, idx, bersaglio, catalogo);
  if (esito.esito === 'pareggio') {
    scriviLog(stato, 'Nessuno dei due arriva a due confronti vinti: si annullano a vicenda.');
    alCamposanto(stato, bersaglio, catalogo, 'dopo lo scontro pari');
    alCamposanto(stato, idx, catalogo, 'dopo lo scontro pari');
  }
  if (esito.esito === 'nessuno_sconfitto') scriviLog(stato, 'Nessuno dei due la spunta: restano entrambi in campo.');
  return { ok: true };
}

/**
 * Scontro generale (1v1v1): i valori di tutti i soggettoni in campo si
 * confrontano nello stesso momento. Gli esiti si calcolano tutti sui valori
 * di partenza, poi si applicano insieme.
 */
function scontroGenerale(stato, idx, catalogo) {
  const inCampo = stato.giocatori
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => g.vivo && g.campo)
    .map(({ g, i }) => ({ idx: i, ...valoriEffettivi(g.campo, stato.luogo, catalogo, stato.regole) }));

  if (inCampo.length < 2) return { ok: false, errore: 'Non c\'è nessun altro soggettone in campo' };

  const nomi = i => catalogo.carta(stato.giocatori[i].campo.cardId).nome;
  const esito = risolviScontroMultiplo(inCampo, stato.regole);
  scriviLog(stato, `Scontro generale fra ${inCampo.map(p => nomi(p.idx)).join(', ')}.`, { esito });
  for (const c of esito.coppie) {
    if (c.puntiAtt >= stato.regole.confrontiPerVincere) {
      scriviLog(stato, `${nomi(c.attaccante)} supera ${nomi(c.difensore)} — ${riepilogo(c.confronti)}`);
    }
  }

  if (esito.nessunSconfitto) {
    scriviLog(stato, 'Nessuno arriva a due confronti vinti: tutti i soggettoni in campo si annullano.');
    for (const p of [...inCampo].reverse()) alCamposanto(stato, p.idx, catalogo, 'dopo lo scontro pari');
    return { ok: true };
  }

  // Prima si stabilisce chi cade e a chi va, poi si applica tutto insieme.
  const cadute = esito.sconfitti.map(s => ({
    perdente: s.idx,
    vincitore: s.battutoDa.includes(idx) ? idx : s.battutoDa[0],
  }));
  for (const { perdente, vincitore } of cadute) sconfiggi(stato, perdente, vincitore, catalogo);
  return { ok: true };
}

function riepilogo(confronti) {
  return confronti
    .map(c => `${ETICHETTE[c.attacco]} ${c.valoreAtt} vs ${ETICHETTE[c.difesa]} ${c.valoreDif}`)
    .join(' · ');
}

/**
 * Il soggettone di `perdente` viene sconfitto: la carta va nel mazzo vittoria di
 * `vincitore`, gli accessori che aveva addosso al camposanto del proprietario.
 */
function sconfiggi(stato, perdente, vincitore, catalogo) {
  const p = stato.giocatori[perdente];
  const v = stato.giocatori[vincitore];
  if (!p.campo) return;
  const nome = catalogo.carta(p.campo.cardId).nome;
  stato.vittorie[v.squadra].push({ cardId: p.campo.cardId, da: perdente, a: vincitore });
  for (const acc of p.campo.accessori) p.camposanto.push(acc);
  const n = p.campo.accessori.length;
  p.campo = null;
  const dove = stato.modalita === '2v2' ? `nel mazzo vittoria della squadra di ${v.nome}` : `nel mazzo vittoria di ${v.nome}`;
  scriviLog(stato, `${nome} è sconfitto: va ${dove}`
    + (n ? `, i suoi ${n === 1 ? 'accessorio va' : `${n} accessori vanno`} al camposanto di ${p.nome}.` : '.'));
  rischiera(stato, perdente, catalogo);
}

export { valoriEffettivi, ignoranzaEffettiva, risolviScontro };
