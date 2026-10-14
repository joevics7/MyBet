// Minimal schema-less protobuf wire-format reader.
//
// Betpawa answers in protobuf (`application/x-protobuf`, e.g.
// com.betpawa.sportsbook.bff.dto.BookingCodeEventPriceListProto) and publishes no .proto file,
// so we read the raw wire format: a message is a list of (field number, value) pairs.
// Numbers above 2^53 lose precision (fine for ids and epoch milliseconds).

export type PbValue =
  | { wire: 0; num: number } // varint
  | { wire: 1; num: number } // 64-bit, read as a double
  | { wire: 5; num: number } // 32-bit, read as a float
  | { wire: 2; bytes: Uint8Array }; // length-delimited: string, bytes, or nested message

export interface PbField {
  field: number;
  value: PbValue;
}

function readVarint(buf: Uint8Array, pos: number): [number, number] | null {
  let result = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos + i >= buf.length) return null;
    const b = buf[pos + i];
    result += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return [result, pos + i + 1];
    mul *= 128;
  }
  return null;
}

// Returns null if the bytes are not a well-formed message (so callers can tell a nested
// message from a plain string).
export function parseMessage(buf: Uint8Array): PbField[] | null {
  const fields: PbField[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    if (!tag) return null;
    pos = tag[1];
    const field = Math.floor(tag[0] / 8);
    const wire = tag[0] % 8;
    if (field < 1) return null;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) return null;
      pos = v[1];
      fields.push({ field, value: { wire: 0, num: v[0] } });
    } else if (wire === 1) {
      if (pos + 8 > buf.length) return null;
      fields.push({ field, value: { wire: 1, num: view.getFloat64(pos, true) } });
      pos += 8;
    } else if (wire === 5) {
      if (pos + 4 > buf.length) return null;
      fields.push({ field, value: { wire: 5, num: view.getFloat32(pos, true) } });
      pos += 4;
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len || len[1] + len[0] > buf.length) return null;
      fields.push({ field, value: { wire: 2, bytes: buf.subarray(len[1], len[1] + len[0]) } });
      pos = len[1] + len[0];
    } else {
      return null; // groups (3/4) and unknown wire types: not used by modern protobuf
    }
  }
  return fields;
}

export function asString(bytes: Uint8Array): string | null {
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /^[\x20-\x7e\u00a0-\uffff]*$/.test(s) ? s : null; // printable only
  } catch {
    return null;
  }
}

// Readable tree for logs: nested messages are expanded, printable bytes shown as strings.
// Used to learn the shape of an unfamiliar response from the server logs.
export function describe(buf: Uint8Array, depth = 0, maxDepth = 6): unknown {
  const fields = parseMessage(buf);
  if (!fields || fields.length === 0 || depth > maxDepth) return asString(buf) ?? `<${buf.length} bytes>`;
  const out: Record<string, unknown[]> = {};
  for (const f of fields) {
    const v = f.value;
    const shown = v.wire === 2 ? (asString(v.bytes) !== null && v.bytes.length > 0 && !looksNested(v.bytes) ? asString(v.bytes) : describe(v.bytes, depth + 1, maxDepth)) : v.num;
    (out[String(f.field)] ??= []).push(shown);
  }
  return out;
}

function looksNested(bytes: Uint8Array): boolean {
  const f = parseMessage(bytes);
  // A short printable string can parse as a message by accident; only call it nested when it is
  // clearly structured (more than one field, or a field holding a longer payload).
  return !!f && f.length > 1 && asString(bytes) === null;
}
