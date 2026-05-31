/**
 * build-data.ts  — Streaming XLSX parser → cube.json, dimensions.json, vendors.json, facts.parquet
 *
 * Approach:
 *  1. Use unzipper.Open.file() for random-access zip entry access (no full decompression)
 *  2. SAX-stream sharedStrings.xml into a flat string[]
 *  3. SAX-stream sheet1.xml (FY2022) then sheet2.xml (FY2023) row-by-row
 *  4. Aggregate into cube cells; top-50 vendor heaps per agency; vendor map; stream facts to NDJSON
 *  5. Write JSON outputs; write facts.parquet via DuckDB COPY
 *  6. Build-time assertions
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as unzipper from 'unzipper';
import saxLib from 'sax';
// sax is CJS; grab the parser function from the default export
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sax = saxLib as any;
import { DuckDBInstance } from '@duckdb/node-api';
import { calMonth, fyOfFMonth, cleanStr, canonicalize } from './transform.js';
import type { Cube, CubeCell, Dimensions, DimItem } from '../contracts/index.js';

// Local vendor map type (not yet in contracts)
interface VendorRecord { vendorId: string; display: string; aliases: string[]; }
type VendorMap = Record<string, VendorRecord>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.resolve(__dirname, '../../Vendor-Payments_2021-23.xlsx');
const OUT_DIR = path.resolve(__dirname, '../public/data');
const TMP_NDJSON = path.resolve(__dirname, '../public/data/facts_tmp.ndjson');

// ── helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Read a zip entry stream into a string */
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

// ── SAX parse sharedStrings.xml ────────────────────────────────────────────

async function parseSharedStrings(xmlText: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const strings: string[] = [];
    let current = '';
    let inT = false;

    const parser = sax.parser(true, { trim: false });

    parser.onopentag = (node) => {
      if (node.name === 'si') current = '';
      if (node.name === 't') { inT = true; }
    };
    parser.onclosetag = (name) => {
      if (name === 't') inT = false;
      if (name === 'si') strings.push(current);
    };
    parser.ontext = (text) => {
      if (inT) current += text;
    };
    parser.onerror = reject;
    parser.onend = () => resolve(strings);
    parser.write(xmlText).close();
  });
}

// ── Min-heap for top-N vendors ─────────────────────────────────────────────

interface VendorAgg { vendorId: string; net: number; gross: number; rawName: string; }

class TopNHeap {
  private heap: VendorAgg[] = [];
  private map = new Map<string, VendorAgg>();
  constructor(private n: number) {}

  push(id: string, rawName: string, amount: number) {
    const existing = this.map.get(id);
    if (existing) {
      existing.net += amount;
      if (amount > 0) existing.gross += amount;
    } else {
      const entry: VendorAgg = { vendorId: id, net: amount, gross: amount > 0 ? amount : 0, rawName };
      this.map.set(id, entry);
      this.heap.push(entry);
    }
  }

  top(): VendorAgg[] {
    return [...this.map.values()]
      .sort((a, b) => b.net - a.net)
      .slice(0, this.n);
  }
}

// ── SAX-stream a worksheet ─────────────────────────────────────────────────

interface FactRow {
  agency: string;
  category: string;
  subcategory: string;
  vendorId: string;
  vendorRawName: string; // cleaned raw name before canonicalize, for display tracking
  fy: 2022 | 2023;
  month: number;
  amount: number;
}

async function parseWorksheet(
  xmlText: string,
  sharedStrings: string[],
  onRow: (row: FactRow) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = sax.parser(true, { trim: false });

    let inRow = false;
    let colValues: (string | null)[] = new Array(11).fill(null); // A..K = 0..10
    let currentColIdx = -1;
    let currentIsShared = false;
    let currentText = '';
    let isHeader = true;  // skip row 1

    // Column index from cell reference e.g. "A2" -> 0, "K5" -> 10
    function colIndex(ref: string): number {
      // ref like "A2", "B2", ... "K2"
      const col = ref.match(/^([A-Z]+)/)?.[1] ?? '';
      let idx = 0;
      for (let i = 0; i < col.length; i++) {
        idx = idx * 26 + (col.charCodeAt(i) - 64);
      }
      return idx - 1; // 0-based
    }

    parser.onopentag = (node) => {
      if (node.name === 'row') {
        inRow = true;
        colValues = new Array(11).fill(null);
      } else if (node.name === 'c' && inRow) {
        const ref = (node.attributes as Record<string, string>)['r'] ?? '';
        currentColIdx = colIndex(ref);
        currentIsShared = (node.attributes as Record<string, string>)['t'] === 's';
        currentText = '';
      } else if (node.name === 'v' && inRow && currentColIdx >= 0) {
        currentText = '';
      }
    };

    parser.ontext = (text) => {
      if (inRow && currentColIdx >= 0) currentText += text;
    };

    parser.onclosetag = (name) => {
      if (name === 'v' && inRow && currentColIdx >= 0 && currentColIdx < 11) {
        if (currentIsShared) {
          const idx = parseInt(currentText, 10);
          colValues[currentColIdx] = sharedStrings[idx] ?? null;
        } else {
          colValues[currentColIdx] = currentText;
        }
      } else if (name === 'row' && inRow) {
        inRow = false;
        if (isHeader) { isHeader = false; return; }

        // A=0:Bien, B=1:FY, C=2:FMonth, D=3:AgyCd, E=4:Agency, F=5:ObjCd, G=6:Category, H=7:SubobjCd, I=8:SubCat, J=9:Vendor, K=10:Amount
        const fmStr = colValues[2];
        const agencyName = colValues[4];
        const category = colValues[6];
        const subcategory = colValues[8];
        const vendorRaw = colValues[9];
        const amountStr = colValues[10];

        if (fmStr == null || agencyName == null || category == null ||
            subcategory == null || vendorRaw == null || amountStr == null) return;

        const fm = parseInt(fmStr, 10);
        if (isNaN(fm) || fm < 1 || fm > 24) return;
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) return;

        const fy = fyOfFMonth(fm);
        const month = calMonth(fm);
        const agency = cleanStr(agencyName);
        const cat = cleanStr(category);
        const subcat = cleanStr(subcategory);
        const vendor = cleanStr(vendorRaw);
        const vendorId = canonicalize(vendor);

        onRow({ agency, category: cat, subcategory: subcat, vendorId, vendorRawName: vendor, fy, month, amount });
      }
    };

    parser.onerror = reject;
    parser.onend = resolve;
    parser.write(xmlText).close();
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);

  console.log('Opening XLSX...');
  const zip = await unzipper.Open.file(XLSX_PATH);

  // 1. Parse sharedStrings
  console.log('Parsing sharedStrings.xml...');
  const ssFile = zip.files.find(f => f.path === 'xl/sharedStrings.xml');
  if (!ssFile) throw new Error('sharedStrings.xml not found in zip');
  const ssXml = await streamToString(ssFile.stream());
  const sharedStrings = await parseSharedStrings(ssXml);
  console.log(`  Loaded ${sharedStrings.length} shared strings`);

  // 2. Load glosses
  const glossesPath = path.resolve(__dirname, './glosses.json');
  const glosses: { agency?: Record<string, string>; category?: Record<string, string> } =
    fs.existsSync(glossesPath) ? JSON.parse(fs.readFileSync(glossesPath, 'utf8')) : {};

  // 3. Aggregation structures
  type CubeKey = string; // agency|category|subcategory|month|fy
  const cubeCells = new Map<CubeKey, { net: number; gross: number; agency: string; category: string; subcategory: string; month: number; fy: 2022 | 2023 }>();
  const agenciesSet = new Map<string, string>(); // label -> id (label itself used as id)
  const categoriesSet = new Set<string>();
  const subcategoriesSet = new Set<string>();
  // Vendor aggregation: vendorId -> { net, gross, nameCounts: Map<rawName,count> }
  const vendorMap = new Map<string, { net: number; gross: number; names: Map<string, number> }>();
  // Per-agency top-50 vendor heaps
  const agencyVendorHeaps = new Map<string, TopNHeap>();
  // Totals
  let totalNet = 0;
  let totalGross = 0;
  const byFy: Record<number, { net: number; gross: number }> = { 2022: { net: 0, gross: 0 }, 2023: { net: 0, gross: 0 } };

  // Stats
  let totalRows = 0;
  let negativeCount = 0;
  let nanCount = 0;

  // FMonth validation
  let fmonthViolations = 0;

  // NDJSON facts writer
  const factsWriter = fs.createWriteStream(TMP_NDJSON, { encoding: 'utf8' });

  function processRow(row: FactRow) {
    totalRows++;

    // Validate FMonth alignment
    if (row.fy === 2022 && (row.month < 1 || row.month > 12)) fmonthViolations++;
    if (row.fy === 2023 && (row.month < 1 || row.month > 12)) fmonthViolations++;

    if (isNaN(row.amount)) { nanCount++; return; }
    if (row.amount < 0) negativeCount++;

    // Cube key
    const key = `${row.agency}|${row.category}|${row.subcategory}|${row.month}|${row.fy}`;
    const cell = cubeCells.get(key);
    if (cell) {
      cell.net += row.amount;
      if (row.amount > 0) cell.gross += row.amount;
    } else {
      cubeCells.set(key, {
        net: row.amount,
        gross: row.amount > 0 ? row.amount : 0,
        agency: row.agency,
        category: row.category,
        subcategory: row.subcategory,
        month: row.month,
        fy: row.fy,
      });
    }

    // Dimensions
    agenciesSet.set(row.agency, row.agency);
    categoriesSet.add(row.category);
    subcategoriesSet.add(row.subcategory);

    // Totals
    totalNet += row.amount;
    if (row.amount > 0) totalGross += row.amount;
    byFy[row.fy].net += row.amount;
    if (row.amount > 0) byFy[row.fy].gross += row.amount;

    // Vendor aggregation (track raw names for display/alias selection)
    const vEntry = vendorMap.get(row.vendorId);
    if (vEntry) {
      vEntry.net += row.amount;
      if (row.amount > 0) vEntry.gross += row.amount;
      vEntry.names.set(row.vendorRawName, (vEntry.names.get(row.vendorRawName) ?? 0) + 1);
    } else {
      const names = new Map<string, number>();
      names.set(row.vendorRawName, 1);
      vendorMap.set(row.vendorId, { net: row.amount, gross: row.amount > 0 ? row.amount : 0, names });
    }

    // Per-agency top-50 heap
    let heap = agencyVendorHeaps.get(row.agency);
    if (!heap) { heap = new TopNHeap(50); agencyVendorHeaps.set(row.agency, heap); }
    heap.push(row.vendorId, row.vendorRawName, row.amount);

    // Write fact to NDJSON (streaming, one row at a time)
    factsWriter.write(JSON.stringify({
      agency: row.agency,
      category: row.category,
      subcategory: row.subcategory,
      vendorId: row.vendorId,
      fy: row.fy,
      month: row.month,
      amount: row.amount,
    }) + '\n');
  }

  // 4. Parse sheet1 (FY2022)
  console.log('Parsing sheet1.xml (FY2022)...');
  const sheet1File = zip.files.find(f => f.path === 'xl/worksheets/sheet1.xml');
  if (!sheet1File) throw new Error('sheet1.xml not found');
  const sheet1Xml = await streamToString(sheet1File.stream());
  await parseWorksheet(sheet1Xml, sharedStrings, processRow);
  console.log(`  After sheet1: ${totalRows} rows`);

  // 5. Parse sheet2 (FY2023)
  console.log('Parsing sheet2.xml (FY2023)...');
  const sheet2File = zip.files.find(f => f.path === 'xl/worksheets/sheet2.xml');
  if (!sheet2File) throw new Error('sheet2.xml not found');
  const sheet2Xml = await streamToString(sheet2File.stream());
  await parseWorksheet(sheet2Xml, sharedStrings, processRow);
  console.log(`  After sheet2: ${totalRows} rows`);

  // Close NDJSON writer
  await new Promise<void>((resolve, reject) => {
    factsWriter.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });

  // ── Build-time assertions ──────────────────────────────────────────────

  const EXPECTED_ROWS = 935853;
  const ROW_TOLERANCE = 5;
  const EXPECTED_NEGATIVES = 1083;
  const NEG_TOLERANCE = 50;

  if (Math.abs(totalRows - EXPECTED_ROWS) > ROW_TOLERANCE) {
    throw new Error(`Row count assertion failed: got ${totalRows}, expected ${EXPECTED_ROWS} ± ${ROW_TOLERANCE}`);
  }
  if (Math.abs(negativeCount - EXPECTED_NEGATIVES) > NEG_TOLERANCE) {
    throw new Error(`Negative count assertion failed: got ${negativeCount}, expected ${EXPECTED_NEGATIVES} ± ${NEG_TOLERANCE}`);
  }
  if (nanCount > 0) {
    throw new Error(`NaN assertion failed: found ${nanCount} NaN amounts`);
  }
  if (fmonthViolations > 0) {
    throw new Error(`FMonth alignment violations: ${fmonthViolations}`);
  }

  // ── Write cube.json ────────────────────────────────────────────────────

  console.log('Building cube.json...');
  const cells: CubeCell[] = [];
  for (const [, c] of cubeCells) {
    cells.push({
      agency: c.agency,
      category: c.category,
      subcategory: c.subcategory,
      month: c.month,
      fy: c.fy,
      net: c.net,
      gross: c.gross,
    });
  }

  const vendorsByAgency: Record<string, { vendorId: string; name: string; net: number; gross: number }[]> = {};
  for (const [agency, heap] of agencyVendorHeaps) {
    vendorsByAgency[agency] = heap.top().map(v => {
      const vData = vendorMap.get(v.vendorId);
      // display = most common raw name
      const display = vData
        ? [...vData.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : v.rawName;
      return { vendorId: v.vendorId, name: display, net: v.net, gross: v.gross };
    });
  }

  const cube: Cube = {
    cells,
    vendorsByAgency,
    totals: {
      net: totalNet,
      gross: totalGross,
      byFy: {
        [2022]: byFy[2022],
        [2023]: byFy[2023],
      },
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'cube.json'), JSON.stringify(cube));
  console.log(`  cube.json: ${cells.length} cells`);

  // ── Write dimensions.json ──────────────────────────────────────────────

  console.log('Building dimensions.json...');

  const agencyGlosses = glosses.agency ?? {};
  const categoryGlosses = glosses.category ?? {};

  const agencies: DimItem[] = [...agenciesSet.keys()].sort().map(label => ({
    id: label,
    label,
    ...(agencyGlosses[label] ? { gloss: agencyGlosses[label] } : {}),
  }));

  const categories: DimItem[] = [...categoriesSet].sort().map(label => ({
    id: label,
    label,
    ...(categoryGlosses[label] ? { gloss: categoryGlosses[label] } : {}),
  }));

  const subcategories: DimItem[] = [...subcategoriesSet].sort().map(label => ({
    id: label,
    label,
  }));

  const dimensions: Dimensions = { agency: agencies, category: categories, subcategory: subcategories };
  fs.writeFileSync(path.join(OUT_DIR, 'dimensions.json'), JSON.stringify(dimensions));
  console.log(`  dimensions.json: ${agencies.length} agencies, ${categories.length} categories, ${subcategories.length} subcategories`);

  // ── Write vendors.json ─────────────────────────────────────────────────

  console.log('Building vendors.json...');
  const vendorOutput: VendorMap = {};
  for (const [vendorId, vData] of vendorMap) {
    // display = most common raw name; aliases = all lowercased raw variants
    const sortedNames = [...vData.names.entries()].sort((a, b) => b[1] - a[1]);
    const display = sortedNames[0][0];
    const aliases = sortedNames.map(([n]) => n.toLowerCase());
    vendorOutput[vendorId] = { vendorId, display, aliases };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'vendors.json'), JSON.stringify(vendorOutput));
  console.log(`  vendors.json: ${vendorMap.size} vendors`);

  // ── Write facts.parquet via DuckDB ─────────────────────────────────────

  console.log('Writing facts.parquet via DuckDB...');
  const parquetPath = path.join(OUT_DIR, 'facts.parquet');
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();

  const ndjsonPathEscaped = TMP_NDJSON.replace(/\\/g, '/');
  const parquetPathEscaped = parquetPath.replace(/\\/g, '/');

  await conn.run(`
    COPY (
      SELECT
        agency::VARCHAR AS agency,
        category::VARCHAR AS category,
        subcategory::VARCHAR AS subcategory,
        vendorId::VARCHAR AS vendorId,
        fy::INTEGER AS fy,
        month::INTEGER AS month,
        amount::DOUBLE AS amount
      FROM read_json_auto('${ndjsonPathEscaped}', format='newline_delimited')
    ) TO '${parquetPathEscaped}' (FORMAT PARQUET, COMPRESSION ZSTD)
  `);

  conn.closeSync();

  // Verify parquet exists and is non-empty
  const parquetStats = fs.statSync(parquetPath);
  if (parquetStats.size < 1000) {
    throw new Error(`facts.parquet is suspiciously small: ${parquetStats.size} bytes`);
  }

  // Clean up temp file
  fs.unlinkSync(TMP_NDJSON);
  console.log(`  facts.parquet: ${(parquetStats.size / 1024 / 1024).toFixed(1)} MB`);

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('\n=== BUILD SUMMARY ===');
  console.log(`  Rows:         ${totalRows.toLocaleString()}`);
  console.log(`  Negatives:    ${negativeCount.toLocaleString()}`);
  console.log(`  NaN amounts:  ${nanCount}`);
  console.log(`  Agencies:     ${agencies.length}`);
  console.log(`  Categories:   ${categories.length}`);
  console.log(`  Subcategories:${subcategories.length}`);
  console.log(`  Vendors:      ${vendorMap.size.toLocaleString()}`);
  console.log(`  Total Net:    $${(totalNet / 1e9).toFixed(2)}B`);
  console.log(`  Total Gross:  $${(totalGross / 1e9).toFixed(2)}B`);
  console.log(`  FY2022 Net:   $${(byFy[2022].net / 1e9).toFixed(2)}B`);
  console.log(`  FY2023 Net:   $${(byFy[2023].net / 1e9).toFixed(2)}B`);
  console.log('\nAll assertions PASSED. Build complete.');
}

main().catch(err => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});
