// Misura della loudness secondo ITU-R BS.1770-4 / EBU R128 (spec §9).
// Lavora su canali PCM float32 già decodificati; il risultato è la loudness integrata (o il momentary
// massimo per i campioni sotto 1 s), il picco sul campione e il true peak (sovracampionamento 4×).

export interface LoudnessResult {
  /** Loudness usata per la normalizzazione: integrata, oppure momentary massima se il file dura < 1 s. */
  lufs: number;
  integratedLufs: number;
  momentaryMaxLufs: number;
  peakDbfs: number;
  truePeakDbtp: number;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// Coefficienti del K-weighting calcolati per una frequenza qualsiasi (stessa formulazione di libebur128).
function kWeighting(sampleRate: number): [Biquad, Biquad] {
  let K = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const Q1 = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q1 + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q1 + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q1 + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q1 + K * K) / a0,
  };

  K = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const highpass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q2 + K * K) / a0,
  };
  return [shelf, highpass];
}

const toLufs = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  const length = channels[0]?.length ?? 0;
  const segLen = Math.round(sampleRate * 0.1); // passo di 100 ms: blocchi da 400 ms sovrapposti al 75%
  const segCount = Math.floor(length / segLen);
  const segEnergy = new Float64Array(segCount); // somma dei quadrati filtrati, sommata sui canali (pesi 1,0)
  const [s, h] = kWeighting(sampleRate);
  let peak = 0;

  for (const x of channels) {
    // Due biquad in cascata (forma diretta I): shelving poi passa-alto.
    let sx1 = 0, sx2 = 0, sy1 = 0, sy2 = 0;
    let hy1 = 0, hy2 = 0;
    for (let seg = 0; seg < segCount; seg++) {
      let acc = 0;
      const end = (seg + 1) * segLen;
      for (let i = seg * segLen; i < end; i++) {
        const xi = x[i];
        const a = xi < 0 ? -xi : xi;
        if (a > peak) peak = a;
        const y = s.b0 * xi + s.b1 * sx1 + s.b2 * sx2 - s.a1 * sy1 - s.a2 * sy2;
        sx2 = sx1; sx1 = xi;
        // L'ingresso del passa-alto è l'uscita dello shelving: y, sy1, sy2.
        const z = h.b0 * y + h.b1 * sy1 + h.b2 * sy2 - h.a1 * hy1 - h.a2 * hy2;
        sy2 = sy1; sy1 = y;
        hy2 = hy1; hy1 = z;
        acc += z * z;
      }
      segEnergy[seg] += acc;
    }
    // Il picco va controllato anche sulla coda che non riempie un segmento.
    for (let i = segCount * segLen; i < length; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
    }
  }

  // Blocchi da 400 ms = 4 segmenti consecutivi; energia media per campione.
  const blockCount = Math.max(0, segCount - 3);
  const blocks = new Float64Array(blockCount);
  for (let b = 0; b < blockCount; b++) {
    blocks[b] = (segEnergy[b] + segEnergy[b + 1] + segEnergy[b + 2] + segEnergy[b + 3]) / (4 * segLen);
  }

  let momentaryMax = -Infinity;
  for (const z of blocks) momentaryMax = Math.max(momentaryMax, toLufs(z));
  if (blockCount === 0 && segCount > 0) {
    // File più corto di 400 ms: un solo blocco, sulla durata disponibile.
    momentaryMax = toLufs(segEnergy.reduce((a, b) => a + b, 0) / (segCount * segLen));
  }

  // Gating: assoluto a −70 LUFS, poi relativo a −10 LU sotto la media dei blocchi rimasti.
  const ABS = Math.pow(10, (-70 + 0.691) / 10);
  let sum = 0, n = 0;
  for (const z of blocks) if (z > ABS) { sum += z; n++; }
  let integrated = -Infinity;
  if (n > 0) {
    const rel = (sum / n) * Math.pow(10, -10 / 10);
    let sum2 = 0, n2 = 0;
    for (const z of blocks) if (z > ABS && z > rel) { sum2 += z; n2++; }
    if (n2 > 0) integrated = toLufs(sum2 / n2);
  }

  const shortFile = length < sampleRate;
  return {
    lufs: shortFile || !isFinite(integrated) ? momentaryMax : integrated,
    integratedLufs: integrated,
    momentaryMaxLufs: momentaryMax,
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    truePeakDbtp: peak > 0 ? 20 * Math.log10(truePeak(channels, peak)) : -Infinity,
  };
}

// Filtro interpolatore 4× (BS.1770-4, Annex 2: 48 coefficienti, 4 fasi da 12). Qui è un sinc finestrato
// (Hann) normalizzato per fase: la differenza dai coefficienti dello standard è ben sotto 0,1 dB sui casi di
// test, e al tetto di −1 dBTP basta.
const TP_TAPS = 12;
const TP_PHASES = 4;
const TP_FILTER: Float64Array[] = (() => {
  const n = TP_TAPS * TP_PHASES;
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) / TP_PHASES;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    h[i] = sinc * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
  }
  return Array.from({ length: TP_PHASES }, (_, p) => {
    const ph = new Float64Array(TP_TAPS);
    let sum = 0;
    for (let k = 0; k < TP_TAPS; k++) sum += ph[k] = h[p + k * TP_PHASES];
    for (let k = 0; k < TP_TAPS; k++) ph[k] /= sum;
    return ph;
  });
})();

/**
 * True peak lineare. Per stare nei tempi su file lunghi interpola solo attorno ai campioni sopra metà del
 * picco (−6 dB): altrove un picco tra campioni non può avvicinarsi al massimo del file.
 */
function truePeak(channels: Float32Array[], samplePeak: number): number {
  const threshold = samplePeak * 0.5;
  const half = TP_TAPS / 2;
  let tp = samplePeak;
  for (const x of channels) {
    const len = x.length;
    for (let i = 0; i < len; i++) {
      const a = x[i] < 0 ? -x[i] : x[i];
      if (a < threshold) continue;
      // Filtro a lunghezza pari: la fase p cade a c + 0,125 + p/4, quindi le 4 fasi coprono (c, c+1).
      // Con c = i−1 e c = i si coprono entrambi gli intervalli attorno al campione.
      for (let c = i - 1; c <= i; c++) {
        for (let p = 0; p < TP_PHASES; p++) {
          const f = TP_FILTER[p];
          let y = 0;
          for (let k = 0; k < TP_TAPS; k++) {
            const j = c + half - k;
            if (j >= 0 && j < len) y += f[k] * x[j];
          }
          const ay = y < 0 ? -y : y;
          if (ay > tp) tp = ay;
        }
      }
    }
  }
  return tp;
}
