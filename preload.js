const { contextBridge } = require('electron');
const XLSX = require('xlsx');

contextBridge.exposeInMainWorld('gamaDesktop', {
  platform: process.platform,
  version: require('./package.json').version
});

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').trim().replace(/R\$|%/gi, '').trim();
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s.replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function findColumn(headers, aliases) {
  const normalizedHeaders = headers.map(normalize);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalize(alias));
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (aliases.some(alias => normalizedHeaders[i].includes(normalize(alias)))) return i;
  }
  return -1;
}

async function prepareSpreadsheet(file) {
  if (!file) return;
  const extension = String(file.name || '').toLowerCase().split('.').pop();
  if (!['xlsx', 'xls', 'csv'].includes(extension)) throw new Error('Formato não suportado.');

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não possui nenhuma aba.');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false });
  if (!rows.length) throw new Error('A planilha está vazia.');

  const headers = rows[0].map(v => String(v ?? '').trim());
  const col = {
    ml: findColumn(headers, ['Código ML', 'Cod ML', 'Código Mercado Livre', 'SKU ML', 'ML']),
    name: findColumn(headers, ['Descrição', 'Descrição / Produto / Item', 'Produto', 'Item', 'Nome']),
    qty: findColumn(headers, ['Quantidade', 'Qtd', 'Qtde', 'Unidades', 'Quantidade de unidades']),
    grade: findColumn(headers, ['Condição', 'Condição / Grade', 'Grade', 'Classificação']),
    subcategory: findColumn(headers, ['Subcategoria', 'Sub categoria']),
    rz: findColumn(headers, ['Código RZ', 'Cod RZ', 'RZ', 'SKU RZ']),
    price: findColumn(headers, ['Valor Unit.', 'Valor Unit', 'Preço', 'Preço unitário', 'Valor de venda']),
    category: findColumn(headers, ['Categoria', 'Departamento']),
    cost: findColumn(headers, ['Custo', 'Custo Unit.', 'Custo unitário', 'Valor de custo'])
  };

  if (col.name < 0 && col.ml < 0 && col.rz < 0) throw new Error('Não encontrei as colunas de produto, Código ML ou Código RZ.');

  const baseName = String(file.name || '').replace(/\.[^.]+$/, '');
  const lotMatch = baseName.match(/\d+/);
  const lot = lotMatch ? lotMatch[0] : baseName;

  const imported = rows.slice(1)
    .filter(row => row.some(v => String(v ?? '').trim() !== ''))
    .map((row, index) => ({
      rz: col.rz >= 0 ? String(row[col.rz] ?? '').trim() : '',
      ml: col.ml >= 0 ? String(row[col.ml] ?? '').trim() : '',
      name: col.name >= 0 ? String(row[col.name] ?? '').trim() : `Importado ${index + 1}`,
      qty: col.qty >= 0 ? parseNumber(row[col.qty]) : 0,
      price: col.price >= 0 ? parseNumber(row[col.price]) : 0,
      cost: col.cost >= 0 ? parseNumber(row[col.cost]) : 0,
      grade: col.grade >= 0 ? String(row[col.grade] ?? '').trim() || 'UN' : 'UN',
      category: col.category >= 0 ? String(row[col.category] ?? '').trim() : (col.subcategory >= 0 ? String(row[col.subcategory] ?? '').trim() : ''),
      batch: lot
    }))
    .filter(p => p.name || p.ml || p.rz);

  if (!imported.length) throw new Error('Nenhuma linha de produto válida foi encontrada.');

  localStorage.setItem('gama_outlet_pending_import', JSON.stringify({
    fileName: file.name,
    lot,
    count: imported.length,
    products: imported
  }));

  window.dispatchEvent(new CustomEvent('gama-spreadsheet-ready'));
}

window.addEventListener('DOMContentLoaded', () => {
  const handleFile = file => {
    if (!file) return;
    prepareSpreadsheet(file).catch(error => {
      console.error('[Gama Outlet] Falha ao ler planilha:', error);
      window.alert(`Não foi possível ler a planilha.\n\n${error?.message || error}`);
    });
  };

  document.addEventListener('change', event => {
    const target = event.target;
    if (!target || target.id !== 'fileInput') return;
    const file = target.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleFile(file);
  }, true);

  document.addEventListener('drop', event => {
    const target = event.target;
    if (!target?.closest?.('#dropzone')) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleFile(file);
  }, true);
});
