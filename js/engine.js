// Motore di gioco dei Soggettoni: regole pure, nessun accesso a DOM o rete.
// Ogni funzione che cambia lo stato lo fa in modo deterministico a partire dal seed,
// così l'host può ricalcolare e i client possono verificare.

export const STAT_MIN = 0;
export const STAT_MAX = 6;

export const ATTACCO = ['forza', 'agilita', 'intelligenza'];
export const DIFESA  = ['incazzamento', 'arrapamento', 'ubriachezza'];

// Forza sfida Incazzamento, Agilità sfida Arrapamento, Intelligenza sfida Ubriachezza.
export const COPPIE = [
  ['forza', 'incazzamento'],
  ['agilita', 'arrapamento'],
  ['intelligenza', 'ubriachezza'],
];

export const ETICHETTE = {
  forza: 'Forza', agilita: 'Agilità', intelligenza: 'Intelligenza',
  incazzamento: 'Incazzamento', arrapamento: 'Arrapamento', ubriachezza: 'Ubriachezza',
};

export const REGOLE = {
  // Tutte le carte si dividono equamente fra chi gioca: 201 soggettoni e 30 accessori.
  // A 0 il valore viene calcolato dividendo il mazzo per il numero di giocatori.
  soggettoniPerGiocatore: 0,
  accessoriPerGiocatore: 0,
  manoIniziale: 4,
  manoMax: 7,
  pescaPerTurno: 1,
  accessoriPerTurno: 1,       // quante carte accessorio si possono equipaggiare per turno
  maxAccessoriPerSoggettone: 0, // quante ne può portare addosso un soggettone (0 = illimitate)
  luoghiPerTurno: 1,          // quante carte luogo si possono giocare per turno
  attacchiPerTurno: 1,
  attaccoAlPrimoTurno: false, // il giocatore che apre non può attaccare al primo giro
  puoAttaccareAppenaSchierato: true,
  confrontiPerVincere: 2,     // almeno 2 valori su 3 superiori
  // Nessuno arriva a due confronti vinti: entrambi i soggettoni vanno al camposanto
  // dei rispettivi proprietari e i due giocatori ne scoprono un altro.
  esitoParita: 'camposanto',  // 'camposanto' | 'nessuno' | 'entrambi' | 'attaccante'
  clampValori: true,          // i valori restano fra 0 e 6 come sulle barre delle carte
  riciclaCamposanto: true,    // finito il mazzo accessori si rimescola il camposanto
};

/* ------------------------------------------------------------------ */
/* Generatore casuale deterministico                                   */
/* ------------------------------------------------------------------ */

export function creaRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mescola(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function codiceStanza(rng) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente I O 0 1
  let s = '';
  for (let i = 0; i < 5; i++) s += alfabeto[Math.floor(rng() * alfabeto.length)];
  return s;
}

/* ------------------------------------------------------------------ */
/* Catalogo                                                            */
/* ------------------------------------------------------------------ */

export function creaCatalogo(soggettoni, accessori) {
  const perId = new Map();
  soggettoni.forEach(c => perId.set(c.id, c));
  accessori.forEach(c => perId.set(c.id, c));
  return {
    soggettoni, accessori, perId,
    carta: id => perId.get(id),
  };
}

/* ------------------------------------------------------------------ */
/* Valori effettivi di un soggettone in campo                          */
/* ------------------------------------------------------------------ */

const clamp = v => Math.max(STAT_MIN, Math.min(STAT_MAX, v));

/**
 * Calcola i sei valori effettivi di un soggettone schierato, tenendo conto
 * della carta luogo in campo (che vale per tutti) e degli accessori equipaggiati.
 * Ritorna anche il dettaglio delle variazioni, per mostrarlo nell'interfaccia.
 */
export function valoriEffettivi(campo, luogo, catalogo, regole = REGOLE) {
  const base = catalogo.carta(campo.cardId);
  const valori = {
    forza: base.att.forza,
    agilita: base.att.agilita,
    intelligenza: base.att.intelligenza,
    incazzamento: base.dif.incazzamento,
    arrapamento: base.dif.arrapamento,
    ubriachezza: base.dif.ubriachezza,
  };
  const partenza = { ...valori };
  const fonti = [];

  // 1. Carta luogo: vale per tutti i soggettoni in campo, anche nemici.
  if (luogo) {
    const cl = catalogo.carta(luogo.cardId);
    const applicabile = cl.speciale?.kind === 'solo_vastesi' ? base.vastese !== false : true;
    if (applicabile) {
      if (cl.speciale?.kind === 'max_all_for' && cl.speciale.nomi.includes(base.nome)) {
        for (const k of Object.keys(valori)) valori[k] = STAT_MAX;
        fonti.push({ da: cl.nome, tipo: 'luogo', nota: 'porta al massimo tutti i valori' });
      } else {
        for (const k of Object.keys(valori)) valori[k] += (cl.mod?.[k] || 0);
        fonti.push({ da: cl.nome, tipo: 'luogo', mod: cl.mod });
      }
    }
  }

  // 2. Accessori equipaggiati, nell'ordine in cui sono stati giocati.
  for (const acc of campo.accessori) {
    const c = catalogo.carta(acc.cardId);
    if (c.tipo === 'abilita') {
      for (const [k, v] of Object.entries(c.mod)) valori[k] += v;
      fonti.push({ da: c.nome, tipo: 'abilita', mod: c.mod });
    } else if (c.tipo === 'aumentazione') {
      valori[c.stat] = STAT_MAX;
      fonti.push({ da: c.nome, tipo: 'aumentazione', nota: `${ETICHETTE[c.stat]} al massimo` });
    }
  }

  // 3. Diminuzioni subite (carte D7-D12 giocate contro di lui in questo scontro o già subite).
  for (const stat of campo.azzerati || []) {
    valori[stat] = STAT_MIN;
    fonti.push({ da: 'Drastica diminuzione', tipo: 'diminuzione', nota: `${ETICHETTE[stat]} al minimo` });
  }

  if (regole.clampValori) for (const k of Object.keys(valori)) valori[k] = clamp(valori[k]);

  const delta = {};
  for (const k of Object.keys(valori)) delta[k] = valori[k] - partenza[k];
  return { valori, base: partenza, delta, fonti };
}

/**
 * Ignoranza effettiva: base più le carte bonus equipaggiate. Non incide
 * ancora sullo scontro, ma la mostriamo e la teniamo pronta.
 */
export function ignoranzaEffettiva(campo, catalogo) {
  const base = catalogo.carta(campo.cardId);
  if (base.ignoranzaInfinita) return { valore: Infinity, infinita: true };
  let v = base.ignoranza || 0;
  for (const acc of campo.accessori) {
    const c = catalogo.carta(acc.cardId);
    if (c.tipo === 'ignoranza') v += c.punti;
  }
  return { valore: Math.min(100, v), infinita: false };
}

/* ------------------------------------------------------------------ */
/* Risoluzione dello scontro                                           */
/* ------------------------------------------------------------------ */

/**
 * Confronta i tre valori d'attacco dell'attaccante con i tre di difesa del
 * difensore, accoppiati secondo COPPIE. Vince chi supera l'avversario in
 * almeno `confrontiPerVincere` confronti.
 */
export function risolviScontro(valoriAtt, valoriDif, regole = REGOLE) {
  const confronti = COPPIE.map(([a, d]) => {
    const va = valoriAtt[a], vd = valoriDif[d];
    return { attacco: a, difesa: d, valoreAtt: va, valoreDif: vd,
             esito: va > vd ? 'attaccante' : vd > va ? 'difensore' : 'pari' };
  });
  const puntiAtt = confronti.filter(c => c.esito === 'attaccante').length;
  const puntiDif = confronti.filter(c => c.esito === 'difensore').length;

  let esito;
  if (puntiAtt >= regole.confrontiPerVincere) esito = 'difensore_sconfitto';
  else if (puntiDif >= regole.confrontiPerVincere) esito = 'attaccante_sconfitto';
  else if (regole.esitoParita === 'camposanto') esito = 'pareggio';
  else if (regole.esitoParita === 'entrambi') esito = 'entrambi_sconfitti';
  else if (regole.esitoParita === 'attaccante') esito = 'attaccante_sconfitto';
  else esito = 'nessuno_sconfitto';

  return { confronti, puntiAtt, puntiDif, esito };
}

/**
 * Scontro a più di due: in 1v1v1 i valori di tutti si confrontano nello stesso
 * momento. Ogni soggettone in campo viene messo contro ogni altro con la stessa
 * regola dei due confronti su tre, e tutti gli esiti si calcolano sui valori
 * com'erano prima dello scontro, non uno dopo l'altro.
 */
export function risolviScontroMultiplo(partecipanti, regole = REGOLE) {
  const coppie = [];
  for (const a of partecipanti) {
    for (const d of partecipanti) {
      if (a.idx === d.idx) continue;
      const r = risolviScontro(a.valori, d.valori, regole);
      coppie.push({ attaccante: a.idx, difensore: d.idx, ...r });
    }
  }
  // Chi batte chi: A batte D se supera D in almeno due confronti su tre.
  const battutiDa = new Map(partecipanti.map(p => [p.idx, []]));
  for (const c of coppie) {
    if (c.puntiAtt >= regole.confrontiPerVincere) battutiDa.get(c.difensore).push(c.attaccante);
  }
  const sconfitti = [...battutiDa.entries()]
    .filter(([, chi]) => chi.length > 0)
    .map(([idx, chi]) => ({ idx, battutoDa: chi }));
  return { coppie, sconfitti, nessunSconfitto: sconfitti.length === 0 };
}
