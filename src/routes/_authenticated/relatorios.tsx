import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FileDown, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios — Painel ML" }] }),
});

const GRADES = ["A", "B", "C", "D", "E", "F", "UN"] as const;

const moeda = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PreviewRow = {
  codigo_ml: string | null;
  descricao: string;
  grade: string | null;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
  porcentagem_custo: number;
  categoria: string | null;
  codigo_rz: string | null;
  lote_id: string;
  lotes: { numero: string | null } | null;
};

function applyFilters(
  q: ReturnType<typeof supabase.from>,
  filtroLote: string,
  filtroCategoria: string,
  filtroRz: string,
  filtroGrade: string,
) {
  let query = q as any;
  if (filtroLote !== "__todos") query = query.eq("lote_id", filtroLote);
  if (filtroCategoria !== "__todas") query = query.eq("categoria", filtroCategoria);
  if (filtroRz.trim()) query = query.ilike("codigo_rz", `%${filtroRz.trim()}%`);
  if (filtroGrade !== "__todos") {
    if (filtroGrade === "UN") query = query.or("grade.eq.U,grade.eq.UN");
    else query = query.eq("grade", filtroGrade);
  }
  return query;
}

function escapeCsv(value: string) {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function RelatoriosPage() {
  const [filtroLote, setFiltroLote] = useState("__todos");
  const [filtroCategoria, setFiltroCategoria] = useState("__todas");
  const [filtroRz, setFiltroRz] = useState("");
  const [filtroRzDebounced, setFiltroRzDebounced] = useState("");
  const [filtroGrade, setFiltroGrade] = useState("__todos");
  const [exportando, setExportando] = useState<"csv" | "pdf" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFiltroRzDebounced(filtroRz), 400);
    return () => clearTimeout(t);
  }, [filtroRz]);

  const lotesQuery = useQuery({
    queryKey: ["relatorio-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("id, numero, nome_arquivo")
        .order("importado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoriasQuery = useQuery({
    queryKey: ["relatorio-categorias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("categoria");
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: { categoria: string | null }) => {
        if (r.categoria && r.categoria.trim()) set.add(r.categoria);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
  });

  const previewQuery = useQuery({
    queryKey: [
      "relatorio-preview",
      filtroLote,
      filtroCategoria,
      filtroRzDebounced,
      filtroGrade,
    ],
    queryFn: async () => {
      let q: any = supabase
        .from("produtos")
        .select(
          "codigo_ml, descricao, grade, quantidade, valor_unit, valor_total, porcentagem_custo, categoria, codigo_rz, lote_id, lotes(numero)",
          { count: "exact" },
        )
        .order("descricao", { ascending: true })
        .limit(50);
      q = applyFilters(q, filtroLote, filtroCategoria, filtroRzDebounced, filtroGrade);
      const { data, count, error } = await q;
      if (error) throw error;
      return { data: (data ?? []) as PreviewRow[], total: count ?? 0 };
    },
  });

  const fetchAll = async (): Promise<PreviewRow[]> => {
    let q: any = supabase
      .from("produtos")
      .select(
        "codigo_ml, descricao, grade, quantidade, valor_unit, valor_total, porcentagem_custo, categoria, codigo_rz, lote_id, lotes(numero)",
      )
      .order("descricao", { ascending: true });
    q = applyFilters(q, filtroLote, filtroCategoria, filtroRzDebounced, filtroGrade);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PreviewRow[];
  };

  const activeFiltersText = () => {
    const parts: string[] = [];
    if (filtroLote !== "__todos") {
      const l = lotesQuery.data?.find((x) => x.id === filtroLote);
      parts.push(`Lote: ${l?.numero ?? filtroLote}`);
    }
    if (filtroCategoria !== "__todas") parts.push(`Categoria: ${filtroCategoria}`);
    if (filtroRzDebounced.trim()) parts.push(`Código RZ: ${filtroRzDebounced.trim()}`);
    if (filtroGrade !== "__todos") parts.push(`Grade: ${filtroGrade}`);
    return parts.length ? parts.join(" | ") : "Sem filtros";
  };

  const exportCsv = async () => {
    setExportando("csv");
    try {
      const rows = await fetchAll();
      const header = [
        "Lote",
        "Código RZ",
        "Código ML",
        "Descrição",
        "Grade",
        "Quantidade",
        "Valor Unitário",
        "Valor Total",
        "Custo Unitário",
        "Categoria",
      ];
      const val = (v: any) => (v === null || v === undefined ? "" : String(v));
      const lines = [header.map(escapeCsv).join(";")];
      for (const r of rows) {
        const custo = Number(r.valor_unit ?? 0) * (Number(r.porcentagem_custo ?? 0) / 100);
        lines.push(
          [
            val(r.lotes?.numero),
            val(r.codigo_rz),
            val(r.codigo_ml),
            val(r.descricao),
            val(r.grade),
            val(r.quantidade ?? 0),
            val(Number(r.valor_unit ?? 0).toFixed(2)),
            val(Number(r.valor_total ?? 0).toFixed(2)),
            val(custo.toFixed(2)),
            val(r.categoria),
          ]
            .map(escapeCsv)
            .join(";"),
        );
      }
      const csv = lines.join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV exportado: ${rows.length} linhas`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar CSV");
    } finally {
      setExportando(null);
    }
  };

  const exportPdf = async () => {
    setExportando("pdf");
    try {
      const rows = await fetchAll();
      const dateStr = new Date().toLocaleString("pt-BR");
      const filtersStr = activeFiltersText();
      const body = rows
        .map((r) => {
          const custo = Number(r.valor_unit ?? 0) * (Number(r.porcentagem_custo ?? 0) / 100);
          const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `<tr>
            <td>${esc(r.lotes?.numero ?? "")}</td>
            <td>${esc(r.codigo_rz ?? "")}</td>
            <td>${esc(r.codigo_ml ?? "")}</td>
            <td>${esc(r.descricao ?? "")}</td>
            <td>${esc(r.grade ?? "")}</td>
            <td style="text-align:right">${r.quantidade ?? 0}</td>
            <td style="text-align:right">${moeda(Number(r.valor_unit ?? 0))}</td>
            <td style="text-align:right">${moeda(Number(r.valor_total ?? 0))}</td>
            <td style="text-align:right">${moeda(custo)}</td>
            <td>${esc(r.categoria ?? "")}</td>
          </tr>`;
        })
        .join("");

      const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Relatório de Produtos</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #444; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style></head><body>
  <h1>Relatório de Produtos</h1>
  <div class="meta">Exportado em: ${dateStr} &nbsp;|&nbsp; Filtros: ${filtersStr} &nbsp;|&nbsp; Total: ${rows.length}</div>
  <table>
    <thead>
      <tr>
        <th>Lote</th><th>Código RZ</th><th>Código ML</th><th>Descrição</th><th>Grade</th>
        <th>Qtd</th><th>Valor Unit.</th><th>Valor Total</th><th>Custo Unit.</th><th>Categoria</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Não foi possível abrir a janela de impressão. Permita pop-ups.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      toast.success(`PDF gerado: ${rows.length} linhas`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar PDF");
    } finally {
      setExportando(null);
    }
  };

  const preview = previewQuery.data;
  const busy = exportando !== null;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Exporte os dados do catálogo com filtros aplicados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Lote</Label>
              <Select value={filtroLote} onValueChange={setFiltroLote}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos os lotes</SelectItem>
                  {lotesQuery.data?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.numero}
                      {l.nome_arquivo ? ` — ${l.nome_arquivo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas">Todas as categorias</SelectItem>
                  {categoriasQuery.data?.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Código RZ (Palete)</Label>
              <Input
                value={filtroRz}
                onChange={(e) => setFiltroRz(e.target.value)}
                placeholder="Buscar por RZ..."
              />
            </div>

            <div className="space-y-1">
              <Label>Grade</Label>
              <Select value={filtroGrade} onValueChange={setFiltroGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todas as grades</SelectItem>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={busy || previewQuery.isLoading}
              className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
            >
              {exportando === "csv" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              onClick={exportPdf}
              disabled={busy || previewQuery.isLoading}
              className="border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              {exportando === "pdf" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {previewQuery.isLoading
              ? "Carregando..."
              : `${preview?.total ?? 0} produtos encontrados`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previewQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : previewQuery.isError ? (
            <div className="text-sm text-destructive">
              Erro ao carregar: {(previewQuery.error as Error).message}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Código RZ</TableHead>
                    <TableHead>Código ML</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor Unit.</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-right">Custo Unit.</TableHead>
                    <TableHead>Categoria</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(preview?.data ?? []).map((r, i) => {
                    const custo =
                      Number(r.valor_unit ?? 0) * (Number(r.porcentagem_custo ?? 0) / 100);
                    return (
                      <TableRow key={`${r.codigo_ml ?? "x"}-${i}`}>
                        <TableCell>{r.lotes?.numero ?? "—"}</TableCell>
                        <TableCell>{r.codigo_rz ?? "—"}</TableCell>
                        <TableCell>{r.codigo_ml ?? "—"}</TableCell>
                        <TableCell className="max-w-[320px] truncate">{r.descricao}</TableCell>
                        <TableCell>{r.grade ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.quantidade ?? 0}</TableCell>
                        <TableCell className="text-right">{moeda(Number(r.valor_unit ?? 0))}</TableCell>
                        <TableCell className="text-right">{moeda(Number(r.valor_total ?? 0))}</TableCell>
                        <TableCell className="text-right">{moeda(custo)}</TableCell>
                        <TableCell>{r.categoria ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(preview?.data.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                        Nenhum produto encontrado com os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
