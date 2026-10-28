// ZIP minimale "stored" (senza compressione) per i file .circus (spec §10). L'audio è già compresso o si
// comprime poco, quindi non vale la pena; in cambio si scrive e si legge un blocco alla volta, senza tenere in
// memoria i file interi. Solo nomi ASCII e file sotto i 4 GB (niente ZIP64).

export interface ZipSource {
  size: number;
  read(offset: number, length: number): Uint8Array;
}

export interface ZipSink {
  write(bytes: Uint8Array): void;
}

export interface ZipEntry {
  name: string;
  /** Inizio dei dati dell'entry nel file ZIP. */
  dataOffset: number;
  size: number;
  crc: number;
}

const CHUNK = 1 << 20;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crcUpdate(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function ascii(name: string): Uint8Array {
  const out = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c > 0x7e || c < 0x20) throw new Error(`non-ASCII name in ZIP: ${name}`);
    out[i] = c;
  }
  return out;
}

class Bytes {
  private b: Uint8Array;
  private v: DataView;
  private p = 0;
  constructor(size: number) {
    this.b = new Uint8Array(size);
    this.v = new DataView(this.b.buffer);
  }
  u16(x: number) { this.v.setUint16(this.p, x, true); this.p += 2; return this; }
  u32(x: number) { this.v.setUint32(this.p, x >>> 0, true); this.p += 4; return this; }
  raw(x: Uint8Array) { this.b.set(x, this.p); this.p += x.length; return this; }
  get bytes() { return this.b; }
}

/** Scrive uno ZIP con le entry date, nell'ordine. Ogni sorgente viene letta due volte: CRC, poi copia. */
export function writeZip(sink: ZipSink, entries: { name: string; source: ZipSource }[]) {
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, source } of entries) {
    const nameBytes = ascii(name);
    let crc = 0;
    for (let o = 0; o < source.size; o += CHUNK) crc = crcUpdate(crc, source.read(o, Math.min(CHUNK, source.size - o)));
    const local = new Bytes(30 + nameBytes.length)
      .u32(0x04034b50).u16(20).u16(0).u16(0).u16(0).u16(0x21) // firma, versione, flag, metodo 0, ora, data (1980-01-01)
      .u32(crc).u32(source.size).u32(source.size).u16(nameBytes.length).u16(0).raw(nameBytes);
    sink.write(local.bytes);
    for (let o = 0; o < source.size; o += CHUNK) sink.write(source.read(o, Math.min(CHUNK, source.size - o)));
    central.push(
      new Bytes(46 + nameBytes.length)
        .u32(0x02014b50).u16(20).u16(20).u16(0).u16(0).u16(0).u16(0x21)
        .u32(crc).u32(source.size).u32(source.size).u16(nameBytes.length).u16(0).u16(0).u16(0).u16(0).u32(0)
        .u32(offset).raw(nameBytes).bytes,
    );
    offset += local.bytes.length + source.size;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  central.forEach((c) => sink.write(c));
  sink.write(
    new Bytes(22).u32(0x06054b50).u16(0).u16(0).u16(entries.length).u16(entries.length)
      .u32(centralSize).u32(offset).u16(0).bytes,
  );
}

/** Legge l'indice (central directory) di uno ZIP. */
export function readZipIndex(src: ZipSource): ZipEntry[] {
  const tailLen = Math.min(src.size, 22 + 0xffff);
  const tail = src.read(src.size - tailLen, tailLen);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a valid .circus file');
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  const cd = src.read(cdOffset, cdSize);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('corrupted ZIP index');
    const method = cv.getUint16(p + 10, true);
    const crc = cv.getUint32(p + 16, true);
    const size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const localOffset = cv.getUint32(p + 42, true);
    const name = String.fromCharCode(...cd.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`unsupported compressed entry: ${name}`);
    const lh = src.read(localOffset, 30);
    const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
    const dataOffset = localOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    entries.push({ name, dataOffset, size, crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Copia i dati di un'entry nel sink, controllando il CRC. */
export function extractEntry(src: ZipSource, entry: ZipEntry, sink: ZipSink) {
  let crc = 0;
  for (let o = 0; o < entry.size; o += CHUNK) {
    const chunk = src.read(entry.dataOffset + o, Math.min(CHUNK, entry.size - o));
    crc = crcUpdate(crc, chunk);
    sink.write(chunk);
  }
  if (crc !== entry.crc) throw new Error(`corrupted file: ${entry.name}`);
}
