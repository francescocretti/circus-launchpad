# Circus Launchpad — Specifiche di prodotto

> **Stato:** v0.3 — specifiche approvate il 2026-10-27; **M0 superato** (§15.1), **M1 completato** (§15.2), **M2 completato** (§15.3), **M3 completato** (§15.4), **M4 completato** (§15.5), **M5 completato** (§15.6): **v1.0.0 rilasciata** il 2026-10-28. **M6 completato** (§15.7): **v1.1.0** con la sync su Google Drive. **v1.1.1**: un buffer decodificato per sample, condiviso tra i pad (§8).
> **Fonte di verità.** Questo documento raccoglie tutte le decisioni prese in fase di definizione. Chi
> riprende il lavoro (persona o agente) parte da qui: se il codice e questo documento divergono, si chiede
> all'utente quale dei due aggiornare — non si "corregge" in silenzio né l'uno né l'altro.
> Le decisioni sono numerate (`D-xx`) nel [registro](#18-registro-delle-decisioni); i punti ancora aperti
> sono in [§16](#16-punti-aperti).

Prototipo visivo interattivo (PLAY + EDIT, misure Pixel 7a): <https://claude.ai/artifact/VFX3Q98Mt4jpeGek8XE4xR>
— privato dell'utente; il riferimento per l'aspetto è quello, il riferimento per il comportamento è
questo documento (dove differiscono, vince il documento: vedi §5.4).

---

## 1. Visione

Circus Launchpad è un **sample launcher per uso dal vivo** su Android: 12 pad grandi, ciascuno caricato
con un file audio dalla memoria del telefono, da lanciare durante un concerto. Estetica da campionatore
/ drum machine anni 80–90 (riferimento: Roland TR-808, tema scuro), sobria e leggibile sul palco.

**Non è** una DAW, un sequencer o un campionatore musicale: niente tempo, BPM, quantizzazione, pitch,
effetti, registrazione.

## 2. Contesto d'uso

- **Band strumentale dal vivo**, più concerti. Scaletta di ~15 brani.
- I campioni sono **ambienti, parlati, testi, speakeraggi, suoni registrati**: si lanciano soprattutto
  **tra un brano e l'altro**, in un paio di casi **durante** un brano.
- **Nessun sync al metronomo** (D-01), ma serve **precisione di lancio**: il suono parte nell'istante del
  tocco.
- Fino a **2 campioni in contemporanea** nel caso reale; massimo **12 campioni** per concerto (D-04).
- Il telefono sta su un **supporto a centro palco**, in **orizzontale**; lo usa chi della band è più
  vicino nel momento giusto → l'interfaccia deve essere comprensibile **anche da chi non l'ha
  configurata**, leggibile a ~1 m con luce scarsa.
- Distribuzione: **APK installato a mano** sui telefoni della band e di pochi amici. Niente Play Store
  per ora (D-24).

## 3. Requisiti non funzionali

| ID | Requisito | Obiettivo |
|----|-----------|-----------|
| NF-1 | Latenza tocco → suono (uscita cablata, Pixel 7a) | **≤ 30 ms**, obiettivo 20 ms. Da misurare nel test tecnico (§15, M0). |
| NF-2 | Affidabilità | Nessun crash, nessuna interruzione audio durante un concerto di 2 h con schermo sempre acceso. |
| NF-3 | Polifonia | Tutti i 12 pad possono suonare insieme (caso reale: 2). |
| NF-4 | Multi-touch | Due pad toccati con due dita **nello stesso istante** partono entrambi (vedi §14.4: in React Native non è scontato). |
| NF-5 | Loop | **Senza stacchi** (sample-accurate), anche in reverse. |
| NF-6 | Persistenza | Alla riapertura l'app ritrova esattamente set e pad come erano. Il file originale può sparire: l'app ne ha una copia. |
| NF-7 | Piattaforma | **Android 12+ (API 31)**, arm64. Dispositivo di riferimento: **Pixel 7a** (6,1", 1080×2400, ~915×412 dp in orizzontale). iOS fuori scope. |
| NF-8 | Offline | Funziona senza rete. Nessun account, nessuna telemetria. |

## 4. Interfaccia — struttura generale

### 4.1 Orientamento e schermo

- **Solo orizzontale**, orientamento **bloccato** (D-06): l'app non ruota mai, anche se il supporto si inclina.
- **Schermo intero immersivo**: barre di sistema nascoste (D-17).
- **Schermo sempre acceso** finché l'app è in primo piano (keep-awake) (D-17).
- **Margine morto** di ~24 dp sui lati sinistro e destro (zona dei gesti di sistema e del foro della
  fotocamera) e ~14 dp in basso: lì non ci sono elementi toccabili (D-17).

### 4.2 Layout PLAY (schermata principale)

```
┌──────────────────────────────────────────────────────────────────┐
│ ▮▮▮▮ CIRCUS LAUNCHPAD   SET TOUR 2026     2 VOCI  ● USB-C  EDIT  ■ STOP │  ← barra 34 dp
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│  │   01    │ │   02    │ │   03    │ │   04    │                 │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│  │   05    │ │   06    │ │   07    │ │   08    │                 │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│  │   09    │ │   10    │ │   11    │ │   12    │                 │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

- **Griglia fissa 4×3 = 12 pad**, sempre tutta visibile, nessun banco o pagina (D-04, D-05).
- Numerazione 01–12 da sinistra a destra, dall'alto in basso.
- Spaziatura tra pad **12 dp**; padding griglia 12 dp sopra, 24 dp ai lati, 14 dp sotto.
- Su Pixel 7a ogni pad misura ~207×109 dp ≈ **3,2 × 1,7 cm** (D-07).
- **Barra superiore sottile (34 dp)**, unica zona di servizio (D-12). Contenuto, da sinistra:
  1. Marchio: 4 quadratini (rosso, arancio, giallo, crema) + `CIRCUS` (bold) `LAUNCHPAD` (regular).
  2. `SET` + nome del set attivo (es. `TOUR 2026`) — per verificare a colpo d'occhio che sia quello giusto.
  3. (spazio flessibile)
  4. Numero di voci attive (`0 VOCI`, `1 VOCE`, `2 VOCI`).
  5. Indicatore uscita audio (§11): pallino + `USB-C` / `CAVO` / `ALTOPARLANTE` / `BLUETOOTH`.
  6. Pulsante `EDIT` (entra in modalità EDIT, §7).
  7. Pulsante `■ STOP` (ferma tutto, §6).

### 4.3 Il pad — anatomia

```
┌──────────────────────────────────────┐
│ 02  [∞ LOOP] [◂ REV]              ●  │  ← numero, badge modalità, badge reverse, LED
│                                      │
│ PIOGGIA                              │  ← etichetta grande
│ pioggia_finale_v3_MIX.wav     -0:37  │  ← nome file piccolo, tempo
│▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← barra di avanzamento (4 dp)
└──────────────────────────────────────┘
```

- **Numero** del pad (`01`–`12`), monospazio, nel colore del pad a riposo.
- **Badge modalità**: `1 SHOT` oppure `∞ LOOP`. **Badge** `◂ REV` se il pad è in reverse (D-10).
- **LED** (pallino 8 dp) in alto a destra: spento a riposo, **rosso acceso con alone** in riproduzione
  (citazione dell'808).
- **Etichetta** personalizzata, grande (≈27 sp, condensato bold, maiuscolo, max 16 caratteri, ellissi
  se non entra). Se assente, mostra il nome del file (D-13).
- **Nome del file** piccolo (10 sp, monospazio), con estensione
  (aiuta a riconoscere la versione), con ellissi a destra se non entra.
- **Tempo** (15 sp, monospazio, cifre tabellari) — vedi §4.4.
- **Barra di avanzamento** in fondo al pad, 4 dp. Per i pad in reverse **scorre da destra a sinistra**.

### 4.4 Stati del pad

| Stato | Sfondo | Testo | Tempo | Barra | LED |
|-------|--------|-------|-------|-------|-----|
| **Vuoto** | trasparente, bordo tratteggiato 1,5 dp `#3d3833` | `EMPTY` + "carica in EDIT", grigio `#8a8278` | — | — | — (pallino del colore del pad al 60%) |
| **A riposo** | colore del pad al 20% su `#1c1a18` | crema `#efe6d6`, numero nel colore del pad | durata totale `1:24` | nascosta | spento |
| **In riproduzione (one shot)** | colore pieno + bordo 2 dp e alone del colore | scuro `#17130f` | **tempo rimanente** `-0:37` | si riempie | rosso acceso |
| **In riproduzione (loop)** | come sopra | scuro | `∞ ×3` (ripetizione corrente) | posizione nel ciclo | rosso acceso |
| **In dissolvenza** | dal colore pieno verso il riposo, proporzionale al fade | scuro → crema | **`FADING OUT…`** | si svuota | **rosso lampeggiante** (~2 Hz: 250 ms acceso / 250 ms spento) |
| **Pressione lunga in corso** | overlay scuro `■ STOP` + barra rossa che si riempie in 0,7 s | | | | |
| **Ritocco ignorato** | overlay per 1,4 s: `TIENI PREMUTO PER FERMARE` | | | | |

(D-14, D-27)

Il fade-out deve essere riconoscibile **con la coda dell'occhio**: il LED lampeggiante è il segnale principale, la scritta lo conferma (D-27).

Variante alternativa "band" (pad grigio `#24211e` con striscia colorata di 6 dp in alto) disponibile nel
prototipo; **scelta: variante "tinted"** (quella in tabella) (D-21).

### 4.5 Tipografia e misure di leggibilità

- Etichette: **Barlow Condensed** 700. Dati (numeri, file, tempi, barra): **IBM Plex Mono** 400–600.
  Entrambi Google Fonts, inclusi nell'APK (via `@expo-google-fonts/*`), nessun download a runtime.
- Contrasto minimo 4,5:1 per tutti i testi.

## 5. Comportamento dei pad

### 5.1 Impostazioni per pad (tutte modificabili solo in EDIT)

| Impostazione | Valori | Default |
|--------------|--------|---------|
| **Modalità** | `ONE SHOT` · `LOOP` | `ONE SHOT` |
| **Direzione** | `AVANTI` · `REV` | `AVANTI` |
| **Al ritocco** (pad già in riproduzione) | `STOP` · `RIPARTE` · `IGNORA` | `STOP` se Loop, `IGNORA` se One shot |
| **Fade in** | `OFF` · 1 · 3 · 5 · 7 s | OFF |
| **Fade out** (allo stop) | `OFF` · 1 · 3 · 5 · 7 s | **1 s** |
| **Normalizza** | on/off | on |
| **Correzione volume** | −12…+12 dB, passo 0,5 dB | 0 dB |
| **Etichetta** | testo, max 16 caratteri, maiuscolo | vuota (→ nome file) |

(D-08, D-09, D-10, D-11, D-15)

- Modalità e direzione sono **indipendenti**: il **loop in reverse** è supportato.
- Il default "al ritocco" si applica quando si cambia modalità **solo se l'utente non l'ha mai modificato**
  su quel pad.
- La modalità **Gate** (suona finché tieni premuto) è stata citata e **non** è in scope v1.

### 5.2 Riproduzione

- **One shot**: suona dall'inizio alla fine, poi si ferma da solo.
- **Loop**: riparte dall'inizio senza stacchi finché non viene fermato. Loop sull'intero file (nessun punto
  di loop impostabile in v1).
- **Reverse**: il file suona al contrario. Si ottiene invertendo i campioni **una volta, al caricamento**
  (non in tempo reale). È un'impostazione **fissa** del pad, non un comando dal vivo (D-10): per avere lo
  stesso suono dritto e rovescio si carica su due pad.
- **Micro-fade anti-click**: ogni avvio e ogni stop hanno comunque una rampa minima di **5 ms** (avvio) e
  **20 ms** (stop) anche con fade impostati a 0, per evitare click. Non è configurabile.
- **Polifonia**: ogni pad è una voce indipendente; più pad suonano insieme. Un pad non può suonare due
  volte sovrapposto a sé stesso (al massimo una voce per pad).

### 5.3 Interazioni dal vivo (modalità PLAY)

| Gesto | Pad fermo | Pad in riproduzione | Pad in dissolvenza |
|-------|-----------|---------------------|--------------------|
| **Tocco** | **parte** | azione "al ritocco": `STOP` → fade out · `RIPARTE` → riparte da capo · `IGNORA` → nessun effetto audio, mostra `TIENI PREMUTO PER FERMARE` | **riparte** da capo (fade interrotto) |
| **Pressione lunga 0,7 s** | (come tocco: parte al contatto) | **stop con il suo fade out**, in qualunque modalità | nessun effetto |
| Pad vuoto | nessun effetto in PLAY | — | — |

(D-09)

- Durante la pressione lunga su un pad in riproduzione, dopo 120 ms compare l'overlay `■ STOP` con la
  barra che si riempie: chi tiene premuto vede cosa sta per succedere. Rilasciando prima di 0,7 s si annulla.
- Nessun menu contestuale, nessun doppio tocco, nessuno swipe in PLAY.

### 5.3.1 Feedback aptico (D-28)

- **Un colpo secco e breve**, sempre uguale, **a ogni tocco su un pad carico** in PLAY (partenza, ritocco
  qualunque sia l'azione, inizio della pressione lunga) e **quando scatta ■ STOP**. Non vibrano i pad vuoti, gli
  altri pulsanti della barra e la modalità EDIT.
- Intensità: effetto di sistema `LONG_PRESS` (il "click pesante"). `KEYBOARD_TAP` e `VIRTUAL_KEY`, provati su Pixel 7a, erano troppo leggeri.
  Nota: questi effetti seguono l'impostazione di sistema "Feedback al tocco": se è disattivata, non vibra.
- Serve a confermare che **il tocco è stato registrato** anche quando sul palco non si sente il campione.
- **Prima il suono, poi la vibrazione**: la chiamata aptica parte dopo il trigger audio e non deve mai ritardarlo.
- Solo impulsi brevi (tipo "tick" di tastiera): niente vibrazioni lunghe che si trasmettono al supporto.
- **Interruttore generale** `VIBRAZIONE` in EDIT, **attivo di default**. È un'impostazione dell'app, non del set,
  e si salva in `state.json`.
- Implementazione: `expo-haptics` (`performAndroidHapticsAsync`), in `src/haptics.ts`.

### 5.4 Tempistica del tocco (decisione tecnica, D-20)

Per la precisione di lancio **un pad fermo parte al contatto del dito** (touch down), non al rilascio.
Con il pad in riproduzione, la logica è:

- `STOP` e `IGNORA`: l'azione avviene al contatto. La pressione lunga esiste comunque per fermare i pad `IGNORA`.
- `RIPARTE`: l'azione avviene **al rilascio**, se questo arriva prima di 0,7 s. Se avvenisse al contatto,
  chi tiene premuto per fermare un pad `RIPARTE` sentirebbe prima una ripartenza di 0,7 s e poi lo stop.
  Il costo è un ritardo pari alla durata del tocco (~80–150 ms), e riguarda solo il ritocco dei pad `RIPARTE`.

> ⚠️ Il prototipo visivo avvia i suoni **al rilascio** per semplicità. Nell'app vale questa sezione.

## 6. Ferma tutto (STOP)

- Pulsante `■ STOP` piccolo nella barra superiore, a destra (D-12, D-16).
- Si attiva **tenendolo premuto 0,3 s**, con un riempimento rosso che mostra l'avanzamento. Un tocco
  rapido non fa nulla.
- Ferma **tutte** le voci con un fade **rapido di 20 ms**, ignorando i fade out dei singoli pad (D-11).
- È **attivo solo se c'è almeno una voce attiva**; altrimenti è grigio e non reagisce.
- Il tempo di attivazione (0,3 s) è volutamente più breve della pressione lunga sul pad (0,7 s).

## 7. Modalità EDIT

### 7.1 Ingresso e uscita

- Si entra con `EDIT` nella barra (un tocco), si esce con `FINE ✓`.
- **Entrare in EDIT non ferma l'audio**: si può modificare mentre qualcosa suona (utile in sala prove).
  Le modifiche a un pad in riproduzione si applicano **dal lancio successivo**, tranne volume e
  normalizzazione che si applicano subito.
- In EDIT tutto lo schermo ha un **bordo ambra 2 dp** (`#f2a437`) e la barra mostra un badge `EDIT` ambra:
  non si può confondere con PLAY.
- In EDIT i pad **non si suonano**: si selezionano.

### 7.2 Layout EDIT (D-29)

- **Barra**: badge `EDIT` · pulsante `SET NOME ▾` (apre la **finestra SET**, D-31) · `VIBRAZIONE ON/OFF` · (spazio) ·
  `FINE ✓`.
- **Griglia**: la stessa di PLAY, a grandezza reale (così si vede la disposizione vera dei pad), con i bordi ambra.
  Tocco su un pad = si apre la **finestra del pad**.
- **Finestra del pad** (modale sopra la griglia, bordo ambra; stile del pannello provvisorio di M2, approvato
  dall'utente). Si chiude con **`CONFERMA`** (pulsante a contorno ambra, sfondo trasparente: non deve sembrare un
  badge), con il tasto Indietro o toccando fuori. Contenuto:
  1. Intestazione: tacca del colore, `PAD 02`, **campo etichetta**, pulsanti `CARICA` · `▶ ASCOLTA` · `SVUOTA` ·
     `CONFERMA`.
  2. Riga file: `nome_file.ext · durata · frequenza di campionamento · mono/stereo`.
  3. Controlli segmentati: `MODALITÀ` (ONE SHOT/LOOP) · `DIREZIONE` (AVANTI/◂ REV) · `AL RITOCCO` (STOP/RIPARTE/IGNORA).
  4. Controlli segmentati `FADE IN` e `FADE OUT`: `OFF` · `1 s` · `3 s` · `5 s` · `7 s` (D-30).
  5. Riquadro `VOLUME`: loudness misurata (`−24,1 LUFS`), guadagno di normalizzazione (`+6,1 dB`),
     eventuale avviso `limitato dal picco (−2,3 dB)`, interruttore `NORMALIZZA`, cursore `CORREZIONE`
     ±12 dB, riga riassuntiva "Obiettivo −18 LUFS · tetto −1 dBTP · totale applicato +X dB".
- **ASCOLTA** suona il pad con le impostazioni correnti (secondo tocco = stop). **SVUOTA** chiede conferma.
- Funzioni di EDIT ancora da disegnare: scambio/spostamento di pad, rinomina/duplica/elimina set (§16).

## 8. Caricamento dei sample

- `CARICA` apre il **selettore di file di sistema** (Storage Access Framework, `expo-document-picker`),
  filtrato sui tipi audio. Nessun permesso di accesso allo storage richiesto.
- Formati: **WAV, MP3, M4A/AAC, FLAC, OGG**. Altri formati → messaggio d'errore chiaro.
- Il file viene **copiato nella memoria privata dell'app** (D-18): il pad continua a funzionare se l'originale
  viene spostato o cancellato. Le copie identiche (stesso hash) sono condivise tra pad e set.
- Al caricamento, con indicatore di avanzamento:
  1. copia; 2. decodifica completa in PCM float32 alla frequenza del dispositivo; 3. misura loudness e
  true peak (§9); 4. salvataggio dei metadati (durata, canali, frequenza, LUFS, picco).
- **Memoria**: i sample vengono decodificati interamente in RAM (serve per reverse e bassa latenza). A
  48 kHz stereo float32 sono ~23 MB al minuto. Un sample usato da più pad si decodifica **una volta** e i pad
  condividono il buffer (anche quello invertito): la libreria copia comunque il buffer in ogni voce che parte,
  quindi i pad restano indipendenti. Limiti v1 (D-19, da confermare: §16):
  - avviso oltre **5 minuti** per file;
  - avviso se il totale del set supera **300 MB** decodificati.
- I sample del set attivo vengono decodificati all'avvio dell'app e al cambio di set: l'app mostra
  `CARICAMENTO… 7/10` e i pad diventano suonabili man mano che sono pronti.
- Se un file non si decodifica più (corrotto o mancante), il pad mostra `ERRORE` e il nome del file, senza
  bloccare gli altri.

## 9. Normalizzazione del volume

Approvata come descritta (D-15). Obiettivo: campioni da fonti diverse a un livello percepito uniforme;
il bilanciamento artistico con la band resta al cursore di correzione e al mixer.

- **Misura**: loudness integrata secondo **ITU-R BS.1770-4 / EBU R128**:
  - K-weighting (pre-filtro shelving + filtro passa-alto RLB, due biquad; coefficienti calcolati per la
    frequenza del file);
  - energia media su blocchi da **400 ms** con sovrapposizione del 75%, somma dei canali con pesi 1,0;
  - **gating** assoluto −70 LUFS e relativo −10 LU.
- **Campioni brevi (< 1 s)**: si usa il valore **momentary massimo** (finestra 400 ms) invece dell'integrato.
- **Obiettivo: −18 LUFS** integrati.
- **Tetto: −1 dBTP** (true peak con sovracampionamento 4×). Se il guadagno necessario lo supera, il
  guadagno viene **ridotto** fino a rispettarlo e in EDIT compare `limitato dal picco (−x dB)`.
  **Nessun limiter e nessuna compressione**: il segnale non viene mai alterato, solo scalato.
- **Non distruttiva**: il file non viene modificato. Si salva un guadagno in dB per pad.
- Guadagno finale applicato = `normalizzazione (se attiva) + correzione manuale`, applicato da un GainNode.
- In PLAY i volumi sono **bloccati**.
- Calcolo una sola volta al caricamento. La performance in JS su file lunghi va verificata in M0; se è
  troppo lenta si sposta il calcolo in un worklet o in codice nativo.

## 10. Set, salvataggio, esportazione

- **Salvataggio automatico** di ogni modifica (D-22).
- **Set multipli** con nome (es. `TOUR 2026`, `ACUSTICO`): ogni set ha 12 slot (D-22).
  - Si crea, rinomina, duplica, elimina e cambia **solo in EDIT**.
  - Il nome del set attivo è sempre visibile nella barra in PLAY.
  - Alla riapertura l'app carica l'ultimo set usato.
- **Esporta/Importa** (D-22): un set diventa **un unico file** `.circus` (archivio ZIP) che contiene
  `set.json` (impostazioni, versione dello schema) e `samples/` (i file audio originali). Si condivide con il
  menu di condivisione di Android (Drive, Telegram, e-mail…). L'importazione crea un nuovo set, senza
  sovrascrivere quelli esistenti. Scopo: telefono di riserva, passaggio tra compagni di band, backup.
- Lo schema dati è versionato (`schemaVersion`) per poter migrare in futuro.

### 10.1 Modello dati (bozza)

```ts
type PadMode = 'oneshot' | 'loop';
type Retrigger = 'stop' | 'restart' | 'ignore';

interface SampleRef {
  id: string;            // hash SHA-256 del contenuto
  fileName: string;      // nome originale, con estensione
  durationSec: number;
  sampleRate: number;
  channels: number;
  loudnessLufs: number;  // integrata (o momentary max se < 1 s)
  truePeakDbtp: number;
}

interface PadConfig {
  slot: number;          // 1–12
  sample: SampleRef | null;
  label: string;         // '' → mostra fileName
  mode: PadMode;
  reverse: boolean;
  retrigger: Retrigger;
  retriggerTouched: boolean; // l'utente l'ha cambiato a mano (§5.1)
  fadeInSec: number;
  fadeOutSec: number;
  normalize: boolean;
  trimDb: number;
}

interface PadSet {
  schemaVersion: 1;
  id: string;
  name: string;
  pads: PadConfig[];     // sempre 12
  updatedAt: string;     // ISO 8601
}
```

### 10.2 Sync su Google Drive (D-36, M6)

Design concordato con l'utente il 2026-10-28, non ancora implementato.

- **Scopo**: backup dei set e **gli stessi set su più telefoni**, tutti con un solo account Google (quello
  dell'utente). Condividere i set tra account diversi (compagni di band) è fuori scope: resta l'export `.circus`.
- **Dove**: cartella **visibile** `Circus Launchpad Backup` nel Drive dell'utente, con `Sets/` e `Samples/`.
  Scope OAuth `drive.file`: l'app vede solo i file che ha creato lei. Nomi leggibili (`Sets/DEMO SHOW.json`,
  `Samples/kick loop · a1b2c3.wav`, con le prime cifre dell'hash), ma i file si riconoscono dall'ID salvato nelle
  `appProperties` di Drive (id del set, hash del sample): rinominarli o spostarli dentro la cartella non rompe la sync.
- **Quando**: all'apertura dell'app, all'uscita da EDIT (`DONE ✓`) e con `SYNC NOW`. **Mai in PLAY**, a parte la
  sync di apertura. Di default **solo in Wi-Fi**; l'interruttore `USE MOBILE DATA` (spento di default) permette i dati
  mobili. La regola vale anche per `SYNC NOW`: sui dati mobili con l'interruttore su OFF il pulsante mostra
  `WAITING FOR WI-FI` e la sync parte da sola quando torna il Wi-Fi.
- **Ordine**: prima i JSON dei set (leggeri), poi i sample mancanti. Un pad il cui sample non è ancora arrivato
  mostra `LOADING…`.
- **Rilevare i cambi**: ogni set ha un hash del contenuto (tutto tranne `updatedAt`), che su Drive sta nelle
  `appProperties` del file. Il telefono ricorda l'hash di ogni set all'ultima sync riuscita (la "base"), in un file
  di stato della sync separato da `state.json`. Cambiato = hash diverso dalla base.
  - cambiato solo sul telefono → si carica; cambiato solo su Drive → si scarica;
  - cambiato da tutte e due le parti → **conflitto**: la versione di Drive sostituisce quella locale e la versione
    locale diventa un set nuovo `… (CONFLICT)`, che sale su Drive. Non si perde mai niente.
- **Cancellazioni**: si propagano. Cancellare un set sul telefono lo manda nel **cestino di Drive** (recuperabile
  per 30 giorni) alla sync successiva: un set che manca sul telefono ma è nella base è stato cancellato qui. Un file
  `.json` cestinato a mano su Drive cancella il set dai telefoni. Cancellato da una parte e modificato dall'altra →
  vince la modifica. Un sample si cestina da Drive solo quando nessun set lo usa più.
  - Se manca **l'intera cartella** (cancellata o cestinata), non si cancella niente sui telefoni: la cartella si
    ricrea e si ricarica tutto, come una prima sync.
- **Prima sync di un telefono**: unione. Sale tutto quello che c'è sul telefono, scende tutto quello che c'è su
  Drive. Un set con lo stesso nome ma id diverso resta doppio: quello del telefono prende il suffisso del modello,
  es. `SET 1 (PIXEL 7A)`. Il set vuoto iniziale mai toccato (nessun sample, nessuna etichetta) non sale e, se
  Drive porta altri set, sparisce dal telefono: è vuoto, non si perde niente.
- **Set attivo cambiato altrove**: i set non attivi si aggiornano subito. Quello attivo si aggiorna:
  - all'apertura dell'app, se l'aggiornamento arriva entro pochi secondi, prima che i pad diventino suonabili;
  - altrimenti appena si entra in EDIT, con un breve `SET UPDATED` (nessuna conferma richiesta).
  In PLAY i pad non cambiano mai.
- **UI**:
  - in EDIT, pulsante `⟳ SYNC` nella barra tra `CHECKLIST` e `HAPTICS`: frecce ferme a riposo, che girano durante
    la sync, rosse se l'ultima sync è fallita (finché una sync successiva non riesce);
  - in PLAY nessun pulsante: durante la sync di apertura solo le frecce piccole che girano accanto al nome del set;
  - **finestra SYNC**: account Google (`SIGN IN` / `SIGN OUT`), `LAST SYNC 14:32` oppure il motivo dell'errore,
    `SYNC NOW`, interruttore `USE MOBILE DATA` (come `NORMALIZE`, senza descrizione).
- **Configurazione Google, a cura dell'utente** (come per il keystore: è il suo account): progetto su Google
  Cloud Console con Drive API, schermata di consenso OAuth **"In production"** (in "Testing" il login scade ogni
  7 giorni; con il solo `drive.file` non serve la verifica di Google), client OAuth Android per il package
  `io.github.francescocretti.circuslaunchpad` con lo SHA-1 del keystore di release (si legge dall'APK con
  `apksigner verify --print-certs`, senza password) e un secondo client per la build di debug.

## 11. Uscita audio

Ancora da decidere con il tecnico audio (§16). Raccomandazione: **uscita cablata**, cioè adattatore USB-C →
jack con DAC e una DI box, oppure una piccola interfaccia audio USB-C. **Da evitare il Bluetooth** (150–300 ms di
latenza, cadute di connessione). L'altoparlante del telefono è escluso (D-02, D-03).

L'app:
- mostra nella barra l'**uscita attuale** (`USB-C`, `CAVO`, `ALTOPARLANTE`, `BLUETOOTH`), con pallino verde
  per le uscite cablate, ambra per l'altoparlante e rosso per il Bluetooth;
- se l'uscita è **Bluetooth**, mostra un **avviso** persistente nella barra ("latenza alta");
- se l'uscita **cambia durante l'uso** (es. si stacca il cavo), lo segnala in modo evidente. **Non ferma** l'audio;
- fonte dati: **modulo nativo locale** (Expo module in Kotlin, `modules/`) con `AudioManager.getDevices` +
  `AudioDeviceCallback`; su API 33+ `getAudioDevicesForAttributes(USAGE_MEDIA)` per l'uscita effettiva, sotto
  API 33 euristica di priorità (USB > cablata > Bluetooth > altoparlante). `react-native-audio-api` **non basta**:
  su Android `currentOutputs` è sempre vuoto e `routeChange` non viene emesso (verificato in M0, D-25).

## 12. Protezioni dal vivo

- In PLAY il gesto/tasto **Indietro è ignorato** (D-17).
- Immersive mode, keep-awake, orientamento bloccato (§4.1).
- **Interruzioni**: notifiche e altre app non devono abbassare o fermare l'audio. Per una chiamata in arrivo
  Android impone le sue regole, per cui la checklist da palco raccomanda **modalità aereo + Non disturbare**.
  Il comportamento dell'audio focus va verificato in M0.
- **Checklist da palco**, da mostrare in app (schermata informativa in EDIT) e nel README:
  1. modalità aereo e Non disturbare attivi; 2. batteria carica o alimentatore collegato; 3. volume di sistema
  al massimo, regolazione dal mixer; 4. uscita cablata indicata in barra; 5. **Blocco app** di Android
  (*App pinning*) attivo; 6. set corretto in barra; 7. prova di tutti i pad in soundcheck.

## 13. Design system

Riferimento estetico: **Roland TR-808, tema scuro**, ispirato ma non copiato (D-21). Sobrio: i colori
servono a riconoscere i pad, non a decorare.

### 13.1 Colori di base

| Token | Valore | Uso |
|-------|--------|-----|
| `chassis` | `#121110` | sfondo app |
| `panel` | `#1d1b19` | barra superiore, campi |
| `panelBorder` | `#2e2a27` | bordi della barra |
| `line` | `#3d3833` | bordi controlli, pad vuoti |
| `text` | `#efe6d6` | testo principale (crema) |
| `textMuted` | `#a89f92` | etichette secondarie |
| `textDisabled` | `#8a8278` | pad vuoti |
| `ink` | `#17130f` | testo su pad acceso |
| `padRestBase` | `#1c1a18` | base per lo sfondo dei pad a riposo |
| `led` | `#ff3b2f` | LED di riproduzione |
| `danger` | `#ff6a5c` | STOP, barra della pressione lunga |
| `edit` | `#f2a437` | accento della modalità EDIT |
| `ok` | `#9fd18b` | uscita cablata |

### 13.2 Colori fissi dei 12 pad

Scala calda dal rosso al crema, legata alla **posizione** del pad (non configurabile, D-21):

| Pad | Colore | Pad | Colore | Pad | Colore |
|-----|--------|-----|--------|-----|--------|
| 01 | `#D9382C` | 05 | `#F2A437` | 09 | `#EEE5C6` |
| 02 | `#E2552F` | 06 | `#F3BE3E` | 10 | `#CDBF9F` |
| 03 | `#EA7030` | 07 | `#EFD25A` | 11 | `#B0A08A` |
| 04 | `#EF8A33` | 08 | `#E8DC8E` | 12 | `#93857A` |

Sfondo a riposo = `mix(padRestBase, colore, 20%)`. In riproduzione = colore pieno.

### 13.3 Forme

- Raggio pad 6 dp; ombra interna in basso (`inset 0 -3dp`, nero 35%) a riposo, per l'effetto "tasto di plastica".
- Pad acceso: bordo 2 dp del colore e alone esterno 22 dp al 40%.
- Icone solo testuali o geometriche (`■`, `◂`, `∞`), nessuna emoji.

## 14. Architettura tecnica

### 14.1 Stack (D-23)

- **React Native 0.88 + Expo SDK 58** (TypeScript strict), Continuous Native Generation: `android/` si genera
  e non si modifica a mano, le personalizzazioni passano da config plugin.
- **Audio: `react-native-audio-api` 0.13.x** (Software Mansion), che usa Oboe/AAudio su Android. Serve una build
  nativa: **non funziona in Expo Go**.
  - Plugin configurato **senza foreground service** e senza permessi extra (l'app suona solo in primo piano).
- Moduli Expo: `expo-document-picker` (selezione file), `expo-file-system` (copia, storage privato),
  `expo-keep-awake`, `expo-screen-orientation`, `expo-build-properties`. Da aggiungere in seguito:
  `expo-haptics` (§5.3.1), `expo-navigation-bar` o equivalente per l'immersive mode, `@expo-google-fonts/barlow-condensed` e
  `@expo-google-fonts/ibm-plex-mono`, `expo-sharing` (esportazione), una libreria ZIP (da scegliere).
- Niente Expo Router: l'app ha una sola schermata con due modalità (PLAY/EDIT) più eventuali modali.
  (L'`AGENTS.md` generato dal template parla di Expo Router: qui non si applica.)

### 14.2 Motore audio

- **Un solo `AudioContext`** per tutta la vita dell'app, alla frequenza preferita del dispositivo.
- Per ogni pad: `AudioBuffer` decodificato (già invertito se `reverse`; condiviso tra i pad con lo stesso sample,
  §8), più un `GainNode` di pad (normalizzazione
  + correzione) collegato alla destinazione.
- Per ogni lancio: un nuovo `AudioBufferSourceNode` (i source node sono usa-e-getta) → un `GainNode` di voce
  (inviluppo di fade) → GainNode di pad → destinazione. `loop = true` per i loop.
- Fade con `gain.setValueAtTime` + `linearRampToValueAtTime` sul clock audio (`currentTime`), non con timer JS.
  Stop = rampa a 0, poi `source.stop(t + fade)`.
- Reverse: `createBuffer` + `getChannelData(...).reverse()` per ogni canale, una volta, al caricamento.
- La libreria copia il buffer in ogni voce che parte: costa latenza e RAM con i file lunghi (P-10).
- Lo stato di riproduzione (avanzamento, tempo rimanente) si calcola in UI da `currentTime` e dall'istante di
  avvio: niente polling nativo. `onEnded` serve a riportare il pad a riposo.
- Il motore audio è un modulo TypeScript separato dalla UI (`src/audio/`), con un'API del tipo
  `trigger(slot)`, `stop(slot, {fast})`, `stopAll()`, `load(slot, file)`, così si può testare e, se servisse,
  sostituire.

### 14.3 Persistenza

- `documentDirectory/samples/<sha256>.<ext>`: copie dei file audio.
- `documentDirectory/sets/<setId>.json`: un file per set. `documentDirectory/state.json`: ultimo set attivo.
- Scrittura atomica (scrivi su temporaneo + rinomina) per non corrompere i set in caso di chiusura brusca.

### 14.4 Input touch (rischio, da verificare in M0)

Il sistema di "responder" di React Native gestisce **un solo tocco attivo alla volta** tra componenti diversi:
due `Pressable` toccati insieme non partono entrambi in modo affidabile. Soluzioni candidate:
1. **Una sola superficie touch** per tutta la griglia: `onTouchStart`/`onTouchEnd` con
   `nativeEvent.changedTouches` e hit-test sulle coordinate dei pad. Nessuna dipendenza, ed è la più diretta.
2. `react-native-gesture-handler` con gesti simultanei.

M0 deve dimostrare che due pad toccati insieme partono entrambi.

### 14.5 Build e distribuzione

- `npm run apk` → `expo prebuild -p android` + `./gradlew assembleRelease`; APK chiamato
  **`circus-launchpad-release.apk`** (plugin `withApkName`).
- Firma: plugin `withReleaseSigning`, che legge `CIRCUS_KEYSTORE_FILE`, `CIRCUS_KEYSTORE_PASSWORD`, `CIRCUS_KEY_ALIAS`,
  `CIRCUS_KEY_PASSWORD` da `~/.gradle/gradle.properties`. Senza queste proprietà usa il keystore di debug.
  **Il keystore di release va creato una volta e conservato** (perderlo impedisce gli aggiornamenti senza
  disinstallare): è un passo da fare con l'utente prima del primo APK distribuito. **Non riusare** il keystore di Tessere.
- Package Android: `io.github.francescocretti.circuslaunchpad`.
- Distribuzione (D-33): **release su GitHub nel repository pubblico** (reso pubblico il 2026-10-28) (tag `vX.Y.Z`, titolo "Circus
  Launchpad X.Y.Z", note in italiano, APK allegato). La band scarica l'APK **dalla pagina Releases**: il README linka direttamente
  `releases/latest/download/circus-launchpad-release.apk`. Istruzioni di installazione (origini sconosciute, Play
  Protect) nel README.
- Keystore di release creato dall'utente il 2026-10-28: `~/.android/keystores/circus-launchpad-release.jks`, alias `circus`,
  certificato SHA-256 `F5:C8:96:91:…:E8:C5:94:4B`. **Da conservare con la password** (backup dell'utente). Il
  passaggio dalla firma di debug a quella di release richiede **una disinstallazione** sui telefoni che avevano le
  build di prova: prima conviene esportare i set.

## 15. Piano di sviluppo

| Fase | Contenuto | Criterio di uscita |
|------|-----------|--------------------|
| **M0 — Test tecnico** | App minimale su Pixel 7a: carica un file dal telefono; one shot, loop, reverse, loop in reverse; fade in/out sul clock audio; 2 pad in multi-touch simultaneo; misura della latenza; misura dei tempi di decodifica e di calcolo LUFS su un file da 3–5 min; lettura dell'uscita audio e dell'evento di cambio uscita. | Tutto funziona sul 7a e la latenza rispetta NF-1. Altrimenti si valuta il piano B (modulo nativo Kotlin su Oboe). |
| M1 — Motore audio | `src/audio/`: voci, fade, reverse, gain, loudness (BS.1770) con test unitari sul calcolo LUFS (file di riferimento EBU). | Test verdi; LUFS entro ±0,1 LU dai file di riferimento EBU. |
| M2 — PLAY | Griglia, pad con tutti gli stati, barra, STOP, pressione lunga, feedback aptico, immersive, keep-awake, gestione del tasto Indietro. | Comportamento come §4–§6 sul dispositivo. |
| M3 — EDIT + caricamento | Pannello del pad, caricamento con copia e analisi, persistenza. | §7–§9. |
| M4 — Set ed esportazione | Set multipli, `.circus` import/export. | §10. |
| M5 — Rifinitura e release | Icona, font, checklist da palco, indicatore uscita, keystore, prima release. | APK installato sui telefoni della band. |
| M6 — Sync su Drive | Login Google, sync dei set e dei sample su Drive (§10.2, D-36), release 1.1.0. | §10.2 verificato su due telefoni con lo stesso account (§15.7). |

**Misura della latenza (M0)**: un pad con un click secco, il telefono collegato via cavo a una cassa, e un
secondo telefono che filma in slow motion (240 fps ≈ 4 ms per fotogramma) il dito e un microfono, oppure
che registra contemporaneamente il "tap" fisico e il click in uscita. Si contano fotogrammi o campioni tra il
contatto e il suono. Su 10 prove si riportano media e massimo.

### 15.1 Risultati M0 (2026-10-27, Pixel 7a, build release)

- **Percorso audio**: AAudio **MMAP esclusivo**, 48 kHz float, burst 48 frame (1 ms), offset HW 3 ms
  (`dumpsys media.aaudio`). Latenza percepita dall'utente: "eccellente". Misura strumentale facoltativa.
- **Formati**: WAV 24 bit, MP3, M4A/AAC, FLAC, OGG Vorbis → tutti decodificati e riprodotti.
- **Loop** senza stacchi (sinusoide di 2 s esatti, anche in reverse). **Reverse**, **fade in/out**, **stop**: ok.
- **Multi-touch**: un'unica superficie con `onTouchStart` + `changedTouches` + hit-test → due pad nello stesso
  istante partono sempre (soluzione 1 di §14.4, adottata: D-26).
- **Tempi su file WAV stereo 4:53**: decodifica 246 ms · reverse 345 ms · LUFS 2744 ms (JS/Hermes). Accettabile
  una tantum con barra di avanzamento; ottimizzazione nativa solo se servirà.
- **LUFS**: l'implementazione JS coincide con `ffmpeg ebur128` entro 0,05 LU su 6 file (−11,9 su device).
- **Uscita audio**: `getDevicesInfo().currentOutputs` sempre vuoto su Android → modulo nativo (§11, D-25).
- Il codice del test è in `App.tsx` e `src/audio/` (engine e loudness sono la base di M1). `App.tsx` verrà
  sostituito in M2.

### 15.2 Stato M1 (2026-10-27)

- `src/audio/voice.ts`: primitive (contesto unico, voce con inviluppo, stop che può solo accorciare un fade in corso,
  reverse, click di test).
- `src/audio/engine.ts`: `PadEngine` con 12 slot: `setBuffer`, `configure` (volume subito, il resto dal lancio
  successivo), `start` (un retrigger chiude la voce precedente con lo stop rapido), `stop(n, {fast})`, `stopAll`,
  `snapshot(n)` per la UI (fase, posizione, ripetizione, avanzamento del fade), `subscribe`.
- `src/audio/gain.ts`: normalizzazione −18 LUFS / −1 dBTP, correzione ±12 dB a passi di 0,5.
- `src/audio/loudness.ts`: BS.1770 con gating e momentary, più **true peak 4×** (sinc finestrato a 48 coefficienti,
  calcolato solo attorno ai campioni sopra −6 dB dal picco). Coincide con `ffmpeg ebur128=peak=true` entro 0,1 dB sui
  file di M0. Costo: +40% rispetto alla sola loudness, quindi circa 4 s su Pixel 7a per un file stereo di 5 min.
- `src/audio/sample.ts`: decodifica e analisi.
- Test: `npm test` (runner integrato di Node, nessuna dipendenza): 15 casi sul modello di EBU Tech 3341 (sinusoidi a
  −23/−33 dBFS, gating relativo e assoluto, file brevi, silenzio, true peak) più il calcolo del guadagno.
- Non ancora verificati sul dispositivo: `PadEngine` (si verifica con M2, che lo usa).

### 15.3 Stato M2 (2026-10-27)

- Schermata PLAY provata dall'utente su Pixel 7a: stati dei pad, LED, fade-out lampeggiante, IGNORA/RIPARTE/STOP,
  pressione lunga, ■ STOP, multi-touch, spazi morti, tasto Indietro, schermo intero, keep-awake: tutto ok.
- Correzioni dopo la prova: fade out di default 1 s; vibrazione `LONG_PRESS` anche su ■ STOP; pulsante `CONFERMA`.
- `src/edit/DevPadSheet.tsx` è il **pannello provvisorio** per caricare i pad: M3 lo sostituisce con la finestra
  del pad di §7.2. Nessuna persistenza: chiudendo l'app i pad si svuotano.
- Indicatore dell'uscita audio non ancora presente (arriva con il modulo nativo, M5).

### 15.4 Stato M3 (2026-10-27)

- `src/edit/PadSheet.tsx`: finestra del pad (§7.2) con etichetta, CARICA/SOSTITUISCI, ASCOLTA/FERMA, SVUOTA con
  conferma ("SICURO?" per 3 s), CONFERMA; modalità, direzione, ritocco; fade a valori predefiniti (D-30); VOLUME con
  LUFS, normalizzazione, "limitato dal picco", interruttore, cursore di correzione (`src/edit/Slider.tsx`) e totale;
  avvisi di memoria (§8).
- `src/model/storage.ts`: copia dei sample in `documenti/samples/<sha256>.<ext>`, set in `documenti/sets/<id>.json`
  e stato in `documenti/state.json`, con scrittura atomica (tmp + rinomina con sovrascrittura).
- `src/model/usePadSet.ts`: carica l'ultimo set all'avvio (`CARICAMENTO… n/N` in barra, un pad alla volta),
  salvataggio automatico raggruppato in 300 ms, vibrazione ON/OFF salvata. Un file mancante segna il pad `ERRORE`.
- Un solo set, "SET 1": set multipli, rinomina ed esportazione arrivano in M4.
- Nota di distribuzione: Play Protect chiede conferma all'installazione dell'APK (firma di debug, fuori store).
  Da spiegare nelle istruzioni per la band (M5).

### 15.5 Stato M4 (2026-10-27)

- **Finestra SET** (D-31, `src/edit/SetSheet.tsx`): elenco dei set con numero di pad e memoria; un tocco rende attivo
  un set (stop rapido dell'audio, poi `CARICAMENTO… n/N`); nella riga del set attivo ci sono il nome modificabile,
  `DUPLICA`, `ESPORTA` ed `ELIMINA` (con conferma, disattivato se è l'unico set); in fondo `+ NUOVO SET` e
  `IMPORTA DA FILE…`.
- **File `.circus`**: ZIP senza compressione scritto e letto a blocchi da 1 MB (`src/model/zip.ts`, nessuna dipendenza),
  con controllo CRC; contiene `set.json` e `samples/<sha256>.<ext>`. Si apre anche con `unzip` (c'è un test).
  L'importazione crea sempre un set nuovo, con il suffisso "(IMPORTATO)" se il nome è già usato.
- All'avvio e dopo l'eliminazione di un set si cancellano le copie dei sample non più usate e i file temporanei.
- Provato dall'utente su Pixel 7a: tutto ok.

### 15.6 Stato M5 (completato il 2026-10-28)

- **Uscita audio**: modulo nativo locale `modules/audio-output` (Kotlin, `AudioDeviceCallback` e
  `getAudioDevicesForAttributes` su API 33+), hook `src/play/useAudioOutput.ts`, indicatore in barra: verde per
  USB-C e cavo, ambra per l'altoparlante, rosso per `BLUETOOTH · HIGH LATENCY`; un cambio si evidenzia per 6 s
  (`OUTPUT → …`). Verificato su device dall'utente con altoparlante, adattatore USB-C e Bluetooth.
- **Icona** (D-32), **checklist da palco** in app (EDIT → `CHECKLIST`) e nel README, istruzioni di installazione.
- **Versione 1.0.0** (versionCode 1), APK firmato con il keystore di release creato dall'utente (verificato con
  `apksigner`).
- Interfaccia e README in inglese (D-34); README come guida d'uso con screenshot.
- Stream audio sempre attivo e watchdog del clock (D-35), verificati dall'utente anche collegando l'adattatore
  prima del primo pad.
- Release GitHub `v1.0.0` con l'APK allegato, repo reso pubblico (D-33).

### 15.7 Piano M6 — Sync su Drive (completato il 2026-10-28)

1. **Configurazione e login.** L'utente crea progetto, consenso OAuth e client Android (§10.2). Si sceglie la
   libreria di login verificando la documentazione di Expo SDK 58 (candidate: Google Sign-In nativo con config
   plugin, oppure `expo-auth-session`) e il tipo di rete con `expo-network`. Uscita: login e logout funzionanti sul
   7a, cartella `Circus Launchpad Backup` creata su Drive.
   - **Fatto il 2026-10-28.** Libreria `react-native-nitro-google-signin` (Credential Manager + AuthorizationClient;
     la versione gratuita di `@react-native-google-signin` usa il vecchio SDK deprecato). Il suo config plugin serve
     solo a iOS e senza `iosUrlScheme` va in errore, quindi non è in `app.json`: su Android basta l'autolinking. Nel
     codice c'è solo l'ID del client Web (`src/sync/auth.ts`). Consenso OAuth in produzione (in "Testing" il
     permesso Drive dava 403 `access_denied`). Finestra SYNC con il solo account, pulsante `SYNC` in EDIT con
     l'icona a due frecce in SVG (`react-native-svg`). Verificato dall'utente: login, login che resta dopo il
     riavvio, logout, cartella con `Sets/` e `Samples/` creata una sola volta.
2. **Logica di sync pura** (`src/sync/`): dato lo stato locale, lo stato di Drive e l'ultima sync, calcola il piano
   (carica, scarica, conflitto, cestina, unione della prima sync, cartella mancante). Nessun accesso a rete o
   disco, così si prova con `npm test`: un test per ogni caso di §10.2.
   - **Fatto il 2026-10-28.** `src/sync/plan.ts`: `planSets` (azioni upload, download, conflict, deleteLocal,
     trashRemote, record, forget), `planSamples`, `setHash` (cyrb53 su JSON con chiavi ordinate). 21 test in
     `src/sync/__tests__/plan.test.ts`. Se la cartella su Drive è sparita, il chiamante passa una base vuota.
3. **Client Drive**: Drive API v3 con `fetch` (elenco con `appProperties`, upload resumable per i sample,
   download a blocchi su disco, cestino), più il file di stato della sync.
   - **Fatto il 2026-10-28.** `src/sync/drive.ts` (elenco per `appProperties`, JSON dei set in multipart, sample con
     upload resumable che parte dal disco con `File.upload`, download con `File.downloadFileAsync` e verifica dello
     SHA-256 prima di accettare il file, cestino), `src/sync/run.ts` (esegue il piano e salva la base dopo ogni
     azione; se una cartella su Drive è stata ricreata la base si azzera), stato in `documenti/sync.json`.
     Il set vuoto iniziale ha lo stesso id (`default`) su ogni telefono: davanti a quello di Drive lascia il posto
     senza conflitto. Finestra SYNC con `LAST SYNC` e `SYNC NOW`; per ora la sync non tocca il set attivo.
     Verificato dall'utente sul 7a: primo upload di set e sample, seconda sync senza doppioni, set nuovo che sale,
     cestinato su Drive → sparisce dal telefono, ripristinato → torna (download), cancellato sul telefono → cestino.
4. **UI e momenti di sync**: pulsante `⟳ SYNC` e finestra SYNC, frecce in PLAY all'apertura, regola del Wi-Fi,
   aggiornamento rimandato del set attivo con `SET UPDATED`, `LOADING…` sui pad senza sample.
   - **Fatto il 2026-10-28.** Sync all'apertura (`request()` da `App.tsx`), all'uscita da EDIT (`DONE ✓` e tasto
     Indietro) e con `SYNC NOW`; con la rete non permessa resta in attesa (`WAITING FOR WI-FI` / `OFFLINE · WAITING`)
     e parte da sola. Il set attivo si sostituisce solo in EDIT o nei primi 5 s dall'apertura prima di suonare;
     altrimenti si rimanda e si riprova entrando in EDIT. Prima della sync si salvano le modifiche in sospeso; quando
     la sync sostituisce il set attivo, il salvataggio in sospeso si scarta. I sample che arrivano caricano solo i
     pad in attesa (`LOADING…`), senza fermare gli altri; a sync finita i mancanti vanno in `ERROR`. Frecce piccole
     accanto al nome del set in PLAY durante la sync, `SET UPDATED` per 3 s, frecce rosse fino alla sync riuscita
     successiva, finestra SET che si aggiorna da sola. Verificato dall'utente sul 7a: apertura, uscita da EDIT, solo
     Wi-Fi e attesa, dati mobili, ripristino dopo "Cancella dati" (set e sample tornano da Drive).
5. **Prova su due telefoni** con lo stesso account: backup e ripristino dopo una reinstallazione, modifica da una
   parte sola, conflitto, cancellazione in tutte e due le direzioni, prima sync con set già presenti, set attivo
   cambiato altrove, solo Wi-Fi. Poi README (sezione Sync, in inglese) e release `v1.1.0`.
   - **Prova su due telefoni rimandata** per scelta dell'utente (nessun secondo telefono disponibile, rischio
     accettato: se emerge un problema si corregge con una patch). Verificati solo su un telefono: tutti i casi
     tranne conflitto, modifica che arriva da un altro telefono, set attivo cambiato altrove e prima sync con
     suffisso del modello, coperti però dai test di `plan.test.ts`.
   - README con la sezione "Sync with Google Drive" (`docs/screenshots/sync.png`), le istruzioni Google per chi
     compila dal sorgente ed `edit.png` rifatto con il pulsante `SYNC`. Release **`v1.1.0`** (versionCode 2).

## 16. Punti aperti

| # | Questione | Default attuale |
|---|-----------|-----------------|
| P-1 | Uscita audio (cavo, interfaccia USB, mono/stereo, livello): da decidere con il tecnico audio. | Raccomandato cavo USB-C → jack + DI. |
| P-2 | Durata tipica e massima dei sample (non ancora detta). | Avviso oltre 5 min per file e oltre 300 MB totali (§8). |
| P-3 | Telefoni della band oltre al Pixel 7a ("o simili"). | Android 12+, layout in dp che si adatta. |
| P-4 | EDIT: spostare o scambiare i pad. | Non ancora richiesto. |
| P-5 | ~~Libreria ZIP~~: risolto con un writer/reader ZIP interno (M4). | — |
| P-6 | ~~Distribuzione~~: release su GitHub con l'APK allegato, da cui la band lo scarica (D-33). | — |
| P-7 | ~~Icona~~: marchio a 4 barrette (D-32), generata da `scripts/make-icons.sh`. | — |
| P-8 | Marchio "Launchpad" (Novation): nessun problema per un APK privato, da rivalutare se si pubblica su uno store. | — |
| P-9 | Sync su Drive non ancora provata su due telefoni (§15.7): conflitto, modifica da un altro telefono, set attivo cambiato altrove, prima sync con suffisso del modello. | Da fare appena c'è un secondo telefono; eventuali problemi → patch 1.1.x. |
| P-10 | **Copia del buffer a ogni tocco.** `react-native-audio-api` 0.13.6 copia l'intero buffer quando gli si assegna una voce (`source.buffer = …`, `AudioBufferSourceNodeHostObject.cpp:178`, ramo senza `pitchCorrection`), sul thread JS e prima che il pad parta. Misurato sul Pixel 7a (2026-10-29, 6 tocchi per pad): 24 s stereo (9,5 MB) → 12–18 ms; 4:53 stereo (113 MB) → 82–93 ms; il primo tocco dopo l'avvio fino a 32 e 112 ms. Supera NF-1 (≤ 30 ms) già con sample di 20–30 s; un secondo pad toccato insieme aspetta la copia del primo; il micro-fade d'avvio di 5 ms risulta già passato (`now` è preso prima della copia), quindi possibili click; la RAM di un pad che suona raddoppia. Con one shot di pochi secondi l'effetto è di pochi ms. | Lasciato così per ora (scelta dell'utente). Patch futura consigliata: `patch-package` su quella riga (`copiedBuffer = buffer;` invece della copia), sicura perché l'app non modifica mai un buffer dopo averlo creato; da ricontrollare a ogni aggiornamento della libreria. Alternativa scartata: preparare la voce in anticipo (RAM doppia fissa e thread JS comunque bloccato dopo ogni tocco). |

## 17. Fuori scope (v1)

Sync al tempo/BPM/quantizzazione (la sync su Drive invece c'è: §10.2) · modalità Gate · punti di loop o di trim impostabili · pitch e time-stretch · effetti ·
registrazione dal microfono · MIDI · controllo da un secondo dispositivo · iOS · Play Store · banchi/pagine
oltre i 12 pad · colori dei pad personalizzabili · comando reverse dal vivo.

## 18. Registro delle decisioni

| ID | Decisione |
|----|-----------|
| D-00 | Il nome dell'app è **Circus Launchpad** (vincolo dell'utente). |
| D-01 | Uso dal vivo con una band strumentale. Nessun sync al tempo, ma serve precisione di lancio. |
| D-02 | Uscita audio da definire con il tecnico. Altoparlante del telefono escluso. |
| D-03 | L'app mostra l'uscita audio attuale e avvisa se è Bluetooth. |
| D-04 | Massimo 12 campioni, griglia unica senza banchi. |
| D-05 | Polifonia: più pad insieme (caso reale: 2). |
| D-06 | Orizzontale, griglia 4×3, orientamento bloccato. |
| D-07 | Dispositivo di riferimento Pixel 7a. Requisito Android 12+. |
| D-08 | Modalità One shot/Loop e direzione Avanti/Reverse sono indipendenti (il loop in reverse esiste). |
| D-09 | "Al ritocco" scelto per pad (Stop/Riparte/Ignora): default Stop per i loop, Ignora per i one shot. Pressione lunga = stop su qualunque pad. |
| D-10 | Reverse come impostazione fissa del pad, scelta in EDIT. Non è un comando dal vivo. |
| D-11 | Fade out per pad (default **1 s**; era 3 s, cambiato dopo la prova di M2). Fade in per pad (default 0 s). STOP sempre rapido, ignora i fade. |
| D-12 | Niente colonna laterale: una barra superiore sottile con nome, set, uscita, EDIT e STOP. |
| D-13 | Sul pad: etichetta personalizzata grande e nome del file piccolo. |
| D-14 | Tempo: durata a riposo, rimanente in riproduzione, `∞ ×n` in loop. Più barra di avanzamento. |
| D-15 | Normalizzazione EBU R128 a −18 LUFS, tetto −1 dBTP, senza limiter, non distruttiva, con correzione ±12 dB e interruttore per pad. |
| D-16 | STOP piccolo in barra, attivato tenendolo premuto 0,3 s. |
| D-17 | Protezioni dal vivo: immersive, keep-awake, tasto Indietro ignorato in PLAY, margini morti ai bordi, checklist da palco. |
| D-18 | I file caricati vengono copiati nella memoria privata dell'app. |
| D-19 | Sample decodificati interamente in RAM. Limiti di avviso in §8 (da confermare: P-2). |
| D-20 | Un pad fermo parte al contatto del dito. Il ritocco `RIPARTE` agisce al rilascio (§5.4). *Decisione tecnica presa durante la stesura, da confermare con l'utente.* |
| D-21 | Estetica TR-808 scura, pad "tinted" a riposo, 12 colori fissi per posizione. Font Barlow Condensed + IBM Plex Mono. |
| D-22 | Salvataggio automatico, set multipli (cambiabili solo in EDIT), esportazione/importazione `.circus`. |
| D-23 | Stack: React Native + Expo, `react-native-audio-api`. Il test tecnico M0 viene prima di tutto il resto. |
| D-24 | Distribuzione via APK, niente Play Store per ora. |
| D-25 | L'indicatore dell'uscita audio usa un modulo nativo locale in Kotlin, perché la libreria audio su Android non espone l'uscita attuale. |
| D-27 | Dissolvenza ben visibile: LED che lampeggia a circa 2 Hz più la scritta `FADING OUT…` al posto del tempo, oltre al colore che si spegne. Niente conto alla rovescia, niente righe diagonali. |
| D-28 | Feedback aptico: un colpo secco uguale a ogni tocco su un pad carico in PLAY e allo scatto di STOP. Intensità `LONG_PRESS`. Interruttore generale in EDIT, attivo di default. |
| D-29 | EDIT: la griglia resta a grandezza reale e un tocco su un pad apre una finestra con le sue impostazioni (non la mini-griglia con pannello fisso del prototipo). |
| D-30 | Fade in/out a valori predefiniti OFF/1/3/5/7 s, scelti con un tocco: i − e + erano scomodi; slider e scorrimento sulla casella sono stati scartati (impreciso il primo, gesto nascosto il secondo). Lo 0 si legge `OFF`, non con un bordo rosso: il rosso significa stop o errore. |
| D-31 | I set si gestiscono in una finestra SET aperta dal nome del set nella barra di EDIT; le azioni valgono per il set attivo. |
| D-32 | Icona: le 4 barrette del marchio (rosso, arancio, giallo, crema) su fondo carbone; icona adattiva e monocromatica. |
| D-33 | Distribuzione: release su GitHub con l'APK allegato; la band lo scarica dalla pagina Releases (link diretto nel README). |
| D-34 | Interfaccia tutta in inglese (prima era mista). Le etichette italiane citate nelle sezioni precedenti corrispondono a: CARICA/SOSTITUISCI → LOAD/REPLACE, ASCOLTA → PREVIEW, SVUOTA → CLEAR, CONFERMA → CONFIRM, MODALITÀ → MODE, DIREZIONE AVANTI → DIRECTION FWD, AL RITOCCO RIPARTE/IGNORA → ON RETRIGGER RESTART/IGNORE, NORMALIZZA → NORMALIZE, CORREZIONE → TRIM, VIBRAZIONE → HAPTICS, FINE → DONE, VOCI → VOICES, CAVO → WIRED, ALTOPARLANTE → SPEAKER, TIENI PREMUTO PER FERMARE → HOLD TO STOP, DUPLICA/ESPORTA/ELIMINA → DUPLICATE/EXPORT/DELETE, NUOVO SET → NEW SET, IMPORTA DA FILE → IMPORT FROM FILE, CHECKLIST DA PALCO → STAGE CHECKLIST. Numeri con il punto decimale. Anche il README (pubblico) è in inglese, come guida d'uso con screenshot in `docs/screenshots/`. Commenti nel codice, spec e AGENTS restano in italiano. |
| D-35 | Lo stream audio parte all'apertura dell'app e resta sempre attivo, anche senza pad in riproduzione. La libreria si riprende da sola da una disconnessione (cambio di uscita, app congelata in background, stream esclusivo preso da un'altra app) solo se lo stream sta girando: uno stream aperto ma mai avviato restava muto per sempre (bug trovato il 2026-10-28 dopo il selettore di file). In più un watchdog ricrea il contesto se il clock audio resta fermo per 2 s; le voci in corso si perdono, i buffer restano. |
| D-36 | Sync dei set su Google Drive (§10.2): backup e stessi set su più telefoni con un solo account; cartella visibile `Circus Launchpad Backup`, scope `drive.file`, file riconosciuti dall'ID e non dal nome. Si sincronizza all'apertura, all'uscita da EDIT e con `SYNC NOW`, mai in PLAY; solo Wi-Fi di default. Conflitto → si tengono entrambe le versioni (`… (CONFLICT)`); cancellazioni propagate con il cestino di Drive; prima sync per unione; il set attivo cambiato altrove si aggiorna solo fuori da PLAY. Pulsante `⟳ SYNC` in EDIT con le frecce che girano durante la sync, finestra SYNC separata dalla finestra SET. |
| D-26 | Input con un'unica superficie touch e hit-test (niente Pressable per i pad, niente gesture-handler). |
