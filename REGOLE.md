# Regole implementate

Queste sono le regole che il codice applica davvero. Stanno tutte in un unico posto,
`REGOLE` in `js/engine.js`: cambiare un numero lì cambia il gioco, senza toccare altro.

## Preparazione

Le 201 carte soggettone e le 30 carte accessorio si dividono in parti uguali fra chi gioca.

| Giocatori | Soggettoni a testa | Accessori a testa |
|---|---|---|
| 2 | 100 | 15 |
| 3 | 67 | 10 |
| 4 | 50 | 7 |

Quel che avanza resta fuori dalla partita. Ognuno parte con 4 carte accessorio in mano
(al massimo se ne tengono 7).

## Il turno

1. Se non hai un soggettone in campo, ne scopri uno dal tuo mazzo.
2. Peschi una carta accessorio.
3. Puoi equipaggiare un accessorio al tuo soggettone.
4. Puoi giocare una carta luogo.
5. Puoi attaccare una volta.
6. Passi il turno.

Al primo giro non si attacca: serve a schierarsi.

## I valori

Ogni soggettone ha sei valori, ognuno su una barra da cinque tacche:

- **tutte grigie** — valore 0, il minimo
- **da una a cinque tacche rosse** — valore da 1 a 5
- **tutte e cinque dorate** — valore 6, il massimo

I tre valori in alto (Forza, Agilità, Intelligenza) sono l'attacco.
I tre in basso (Incazzamento, Arrapamento, Ubriachezza) sono la difesa.
Ignoranza e rarità sono sulla carta ma non incidono sullo scontro.

## Lo scontro

I valori si confrontano a coppie:

    Forza         contro  Incazzamento
    Agilità       contro  Arrapamento
    Intelligenza  contro  Ubriachezza

Chi supera l'avversario in **almeno due confronti su tre** lo sconfigge.
Se non ci arriva nessuno dei due, i soggettoni si annullano: vanno tutti e due al camposanto
dei rispettivi proprietari, che ne scoprono subito un altro.

**In tre** non si sceglie il bersaglio: i valori di tutti i soggettoni in campo si confrontano
nello stesso momento. Ogni coppia viene valutata sui valori di partenza e tutti gli esiti si
applicano insieme; ogni soggettone superato da un altro cade. Se non cade nessuno, si annullano tutti.

## Dove finiscono le carte

- Il soggettone sconfitto va nel **mazzo vittoria** di chi lo ha battuto.
  In due contro due il mazzo vittoria è **uno solo per squadra**.
- Gli accessori che aveva addosso vanno nel **camposanto** del suo proprietario.
- La carta luogo sostituita va nel camposanto di chi l'aveva giocata.
- Quando il mazzo delle carte accessorio finisce, si rimescolano gli accessori del camposanto.
  I soggettoni caduti restano dove sono.

## La carta luogo

In campo ce n'è **una sola** e vale per **tutti** i soggettoni, anche per quelli nemici.
Chi ne gioca una nuova manda la precedente al camposanto del suo proprietario.

Alcuni luoghi portano al massimo tutti i valori di un soggettone preciso (per esempio la
Gelateria da Costantino con "Costantino"). Altri valgono solo per i soggetti vastesi.

## Le carte accessorio

| Tipo | Che cosa fa |
|---|---|
| Abilità decisamente speciale | Aumenta due valori del soggettone a cui è equipaggiata |
| Decisa aumentazione | Porta al massimo un valore del proprio soggettone; se è già al massimo non fa nulla |
| Drastica diminuzione | Porta al minimo un valore del soggettone che stai attaccando; vale per quello scontro |
| Bonus ignoranza | Aggiunge da 10 a 40 punti ignoranza; non si può usare se al soggetto ne mancano di meno per arrivare a 100 |
| Luogo | Vedi sopra |

## Come si vince

Si va avanti finché un giocatore resta senza soggettoni: né in campo, né nel mazzo.
Vince l'ultima squadra rimasta in piedi.

## Quanto dura

Simulando partite complete con giocatori automatici: 83–176 turni totali,
in media poco più di 150. In due sono circa 75 turni a testa.

## Punti ancora aperti

Cose che il codice decide in un modo ragionevole ma su cui manca una parola definitiva:

- **Attacchi per turno**: uno solo. E un soggettone appena schierato può attaccare subito.
- **Accessori per turno**: uno solo, senza limite a quanti può portarne addosso un soggettone.
- **Scontro a tre**: se due giocatori battono lo stesso soggettone nello stesso momento,
  la carta va a chi ha dichiarato lo scontro.
- **Valori oltre il massimo**: i bonus non portano mai un valore sopra 6 o sotto 0,
  come le barre delle carte vere.
