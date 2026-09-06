// Minimal WKB/EWKB hex -> GeoJSON reader for the polygon geometry PostgREST
// returns for PostGIS columns. Supports Point, LineString, Polygon and their
// Multi* / GeometryCollection wrappers.
export type GeoJson = number | number[] | number[][] | number[][][] | number[][][][];
export type WkbGeometry = { type: string; coordinates: GeoJson } | null;

class Reader {
  private view: DataView;
  private offset = 0;
  private little = true;

  constructor(hex: string) {
    const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    this.view = new DataView(bytes.buffer);
  }

  private u8() {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }
  private u32() {
    const v = this.view.getUint32(this.offset, this.little);
    this.offset += 4;
    return v;
  }
  private f64() {
    const v = this.view.getFloat64(this.offset, this.little);
    this.offset += 8;
    return v;
  }

  geometry(): { type: string; coordinates: GeoJson } | null {
    this.little = this.u8() === 1;
    const raw = this.u32();
    const hasZ = (raw & 0x80000000) !== 0 || Math.floor((raw % 4000) / 1000) === 1;
    const hasM = (raw & 0x40000000) !== 0;
    const hasSrid = (raw & 0x20000000) !== 0;
    const type = (raw & 0xffff) % 1000;
    if (hasSrid) this.u32();
    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    const point = (): number[] => {
      const coords: number[] = [];
      for (let i = 0; i < dims; i++) coords.push(this.f64());
      return coords.slice(0, 2);
    };
    const ring = (): number[][] => {
      const n = this.u32();
      const out: number[][] = [];
      for (let i = 0; i < n; i++) out.push(point());
      return out;
    };

    switch (type) {
      case 1:
        return { type: "Point", coordinates: point() };
      case 2:
        return { type: "LineString", coordinates: ring() };
      case 3: {
        const n = this.u32();
        const rings: number[][][] = [];
        for (let i = 0; i < n; i++) rings.push(ring());
        return { type: "Polygon", coordinates: rings };
      }
      case 4:
      case 5:
      case 6:
      case 7: {
        const n = this.u32();
        const parts: { type: string; coordinates: GeoJson }[] = [];
        for (let i = 0; i < n; i++) {
          const g = this.geometry();
          if (g) parts.push(g);
        }
        if (type === 7) return null;
        const wrapper = type === 4 ? "MultiPoint" : type === 5 ? "MultiLineString" : "MultiPolygon";
        return { type: wrapper, coordinates: parts.map((p) => p.coordinates) as GeoJson };
      }
      default:
        return null;
    }
  }
}

export function wkbHexToGeoJson(value: unknown): WkbGeometry {
  if (typeof value !== "string" || value.length < 10) return null;
  if (!/^(\\x)?[0-9a-fA-F]+$/.test(value)) return null;
  try {
    return new Reader(value).geometry();
  } catch {
    return null;
  }
}

// Builds an EWKT polygon literal Postgres casts straight into geometry(4326).
export function polygonToEwkt(ring: [number, number][]): string {
  const points = [...ring];
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error("A polygon needs at least three points.");
  if (first[0] !== last[0] || first[1] !== last[1]) points.push(first);
  const body = points.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `SRID=4326;POLYGON((${body}))`;
}
