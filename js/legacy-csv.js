// 「我が家マネー - シート1.csv」専用パーサ
// 列: 年, 月, 預貯金, ソフトバンク, 株, 保険, ドル保険, ドル保険換算, 6, マネオ, 投信, 外国株, 小規模企業共済, 支払予定, ...

// 列名 → 想定する account_type のマッピング
// 「6」は不明なのでユーザーが選べるようデフォルト 'other' とする
const COLUMN_DEFAULTS = {
  '預貯金':       { type: 'bank',          label: '預貯金' },
  'ソフトバンク': { type: 'jp_stock',      label: 'ソフトバンク' },
  '株':           { type: 'jp_stock',      label: '日本株' },
  '保険':         { type: 'insurance',     label: '保険' },
  'ドル保険換算': { type: 'insurance',     label: 'ドル保険(円換算)' },
  '6':            { type: 'other',         label: '不明な列「6」' },
  'マネオ':       { type: 'other',         label: 'マネオ' },
  '投信':         { type: 'mutual_fund',   label: '投信' },
  '外国株':       { type: 'foreign_stock', label: '外国株' },
  '小規模企業共済': { type: 'pension',     label: '小規模企業共済' },
};

// パーサ
export function parseLegacyCsv(text) {
  // BOM除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) throw new Error('CSVが空です');

  const header = parseCsvLine(lines[0]);
  // 列インデックスを特定
  const colIndex = {};
  for (const [colName, info] of Object.entries(COLUMN_DEFAULTS)) {
    const idx = header.findIndex(h => h.trim() === colName);
    if (idx >= 0) colIndex[colName] = idx;
  }

  // 「合計」列(構成比%行を判定するため)
  const totalColIdx = header.findIndex(h => h.trim() === '合計');
  // 月列のインデックス
  const monthIdx = 1; // 年(0), 月(1)

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const yearRaw = (cells[0] ?? '').trim();
    const monthRaw = (cells[1] ?? '').trim();

    const year = parseInt(yearRaw, 10);
    if (!year || year < 2000 || year > 2100) continue;

    // 「6月」をパース、「6月%」「月%」(=構成比行) と「12月末」「12月年末」(=年末重複行) はスキップ
    const monthMatch = monthRaw.match(/^\s*(\d{1,2})月/);
    if (!monthMatch) continue;
    if (monthRaw.includes('%') || monthRaw.includes('％')) continue;
    if (monthRaw.includes('末')) continue; // 通常の12月行と重複するため
    const month = parseInt(monthMatch[1], 10);
    if (month < 1 || month > 12) continue;

    // 構成比%行の検出: 「合計」列が異常に小さい(<1000)場合は%行(2023年以降は%表記がないため)
    if (totalColIdx >= 0) {
      const totalRaw = (cells[totalColIdx] ?? '').trim();
      const totalNum = parseFloat(totalRaw.replace(/,/g, ''));
      if (!isNaN(totalNum) && totalNum > 0 && totalNum < 1000) continue;
    }

    // 月末日 (snapshot_date)
    const lastDay = new Date(year, month, 0); // month は 1-12 なので Date(year, month, 0) で前月末=対象月末
    const snapshotDate = `${year}-${String(month).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;

    const record = { year, month, snapshotDate, columns: {} };
    for (const [colName, idx] of Object.entries(colIndex)) {
      const raw = (cells[idx] ?? '').trim();
      if (!raw) continue;
      const num = parseFloat(raw.replace(/,/g, ''));
      if (isNaN(num)) continue;
      record.columns[colName] = Math.round(num);
    }
    records.push(record);
  }

  // ユーザーに見せる「列マッピング候補」(その列が実際にデータを持っていたかどうかも判定)
  const detectedColumns = [];
  for (const [colName, info] of Object.entries(COLUMN_DEFAULTS)) {
    if (!(colName in colIndex)) continue;
    const hasData = records.some(r => colName in r.columns);
    if (!hasData) continue;
    detectedColumns.push({
      sourceColumn: colName,
      defaultName: info.label,
      defaultType: info.type,
    });
  }

  return { records, detectedColumns };
}

// シンプルなCSV1行パーサ (ダブルクオート対応)
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === ',') { result.push(cur); cur = ''; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}
