import * as XLSX from "xlsx";

export type LinhaProduto = {
  codigo_ml: string | null;
  codigo_rz: string | null;
  descricao: string;
  valor_unit: number;
  quantidade: number;
  valor_total: number;
  grade: string | null;
  categoria: string | null;
  subcategoria: string | null;
};

export type ResultadoParse = {
  linhas: LinhaProduto[];
  total_produtos: number;
  total_unidades: number;
  valor_total: number;
  cabecalhoEncontrado: boolean;
};

function norm(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MAPA_ALIASES: Record<string, keyof LinhaProduto> = {
  // ml
  "codigo ml": "codigo_ml",
  "cod ml": "codigo_ml",
  "ml": "codigo_ml",
  // rz
  "codigo rz": "codigo_rz",
  "cod rz": "codigo_rz",
  "rz": "codigo_rz",
  // descricao
  "descricao do item": "descricao",
  "descricao": "descricao",
  "produto": "descricao",
  "item": "descricao",
  "nome": "descricao",
  // valor_unit
  "valor unit": "valor_unit",
  "valor unit.": "valor_unit",
  "valor unitario": "valor_unit",
  "vl unit": "valor_unit",
  "preco": "valor_unit",
  "preco unit": "valor_unit",
  // valor_total
  "valor total": "valor_total",
  "total": "valor_total",
  "vl total": "valor_total",
  // grade
  "condicao (grade)": "grade",
  "condicao\n(grade)": "grade",
  "condicao": "grade",
  "grade": "grade",
  // categoria
  "categoria": "categoria",
  // subcategoria
  "subcategoria": "subcategoria",
  // qtd
  "qtd": "quantidade",
  "quantidade": "quantidade",
  "qtde": "quantidade",
  "qte": "quantidade",
};

function parseNumero(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  s = s.replace(/[R$\s]/g, "");
  // Se tem vírgula como decimal (formato BR)
  if (s.includes(",")) {
    // se tiver . e , (ex 1.000,50)
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseTexto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function extrairNumeroLote(texto: string): string | null {
  const m = texto.match(/lote\s*[-_]?\s*(\d+)/i);
  return m ? m[1] : null;
}

export async function parsePlanilha(file: File): Promise<ResultadoParse> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  
  // Tenta encontrar uma sheet válida
  let matriz: unknown[][] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    if (data.length > 0) {
      matriz = data;
      break;
    }
  }

  if (matriz.length === 0) {
    return { linhas: [], total_produtos: 0, total_unidades: 0, valor_total: 0, cabecalhoEncontrado: false };
  }

  // Escanear as primeiras 50 linhas para encontrar o cabeçalho
  let headerRowIndex = -1;
  let maxMatches = 0;
  let colMap: Record<number, keyof LinhaProduto> = {};

  const scanLimit = Math.min(50, matriz.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = matriz[i];
    if (!Array.isArray(row)) continue;
    
    let matches = 0;
    const currentMap: Record<number, keyof LinhaProduto> = {};
    
    for (let c = 0; c < row.length; c++) {
      const cellText = norm(row[c]);
      if (MAPA_ALIASES[cellText]) {
        matches++;
        currentMap[c] = MAPA_ALIASES[cellText];
      }
    }

    if (matches > maxMatches) {
      maxMatches = matches;
      headerRowIndex = i;
      colMap = currentMap;
    }
  }

  // Se não achou pelo menos a descrição e mais algo, consideramos falha na detecção
  const hasDescricao = Object.values(colMap).includes("descricao");
  if (!hasDescricao) {
    return { linhas: [], total_produtos: 0, total_unidades: 0, valor_total: 0, cabecalhoEncontrado: false };
  }

  const linhasConvertidas: LinhaProduto[] = [];
  
  // Processar as linhas de dados (após o cabeçalho)
  for (let i = headerRowIndex + 1; i < matriz.length; i++) {
    const row = matriz[i];
    if (!Array.isArray(row)) continue;

    const item: Partial<LinhaProduto> = {};
    let temDado = false;

    for (const [colIdx, field] of Object.entries(colMap)) {
      const value = row[Number(colIdx)];
      if (value !== "" && value != null) temDado = true;
      
      if (field === "valor_unit" || field === "valor_total" || field === "quantidade") {
        (item[field] as number) = parseNumero(value);
      } else {
        (item[field] as string | null) = parseTexto(value);
      }
    }

    if (!temDado || !item.descricao) continue;

    const quantidade = item.quantidade && item.quantidade > 0 ? item.quantidade : 1;
    const valor_unit = item.valor_unit ?? 0;
    let valor_total = item.valor_total ?? 0;
    
    // Fallback: se não veio valor_total, ou se veio 0 e temos valor_unit
    if (!valor_total && valor_unit) {
      valor_total = valor_unit * quantidade;
    }

    linhasConvertidas.push({
      codigo_ml: item.codigo_ml ?? null,
      codigo_rz: item.codigo_rz ?? null,
      descricao: item.descricao,
      valor_unit,
      quantidade,
      valor_total,
      grade:
        item.grade == null || String(item.grade).trim() === ""
          ? "UN"
          : String(item.grade).trim().toUpperCase(),
      categoria: item.categoria ?? null,
      subcategoria: item.subcategoria ?? null,
    });
  }

  const total_produtos = linhasConvertidas.length;
  const total_unidades = linhasConvertidas.reduce((s, p) => s + p.quantidade, 0);
  const valor_total = linhasConvertidas.reduce((s, p) => s + p.valor_total, 0);

  return {
    linhas: linhasConvertidas,
    total_produtos,
    total_unidades,
    valor_total,
    cabecalhoEncontrado: true
  };
}