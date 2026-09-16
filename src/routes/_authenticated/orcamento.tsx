import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/orcamento")({
  component: OrcamentoPage,
  head: () => ({ meta: [{ title: "Orçamento — Painel ML" }] }),
});

type OrcamentoItem = {
  id: string;
  codigo_ml: string;
  descricao: string;
  grade: string | null;
  quantidade: number;
  preco_unit: number;
  valor_unit: number;
  custo_unit: number;
};

type ProdutoBusca = {
  id: string;
  codigo_ml: string | null;
  descricao: string;
  preco_venda: number | null;
  valor_unit: number | null;
  porcentagem_custo: number | null;
  grade: string | null;
};

const moeda = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function OrcamentoPage() {
  const dataOrcamento = new Date().toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const [vendedor, setVendedor] = useState("");
  const [cliente, setCliente] = useState("");
  const [itemManual, setItemManual] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [manualPreco, setManualPreco] = useState("");
  const [itens, setItens] = useState<OrcamentoItem[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [exportando, setExportando] = useState<"pdf" | "excel" | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<"percentual" | "fixo">("percentual");
  const [descontoValor, setDescontoValor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const buscaQuery = useQuery({
    queryKey: ["orcamento-busca", buscaDebounced],
    enabled: buscaDebounced.length >= 2,
    queryFn: async () => {
      const term = buscaDebounced.replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("produtos")
        .select("id, codigo_ml, descricao, preco_venda, valor_unit, porcentagem_custo, grade")
        .or(`codigo_ml.ilike.%${term}%,descricao.ilike.%${term}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ProdutoBusca[];
    },
  });

  const addItem = (p: ProdutoBusca) => {
    if (!p.codigo_ml) {
      toast.error("Produto sem código ML");
      return;
    }
    const valorUnit = Number(p.valor_unit ?? 0);
    const custoUnit = valorUnit * (Number(p.porcentagem_custo ?? 0) / 100);
    setItens((prev) => {
      const idx = prev.findIndex((i) => i.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          id: p.id,
          codigo_ml: p.codigo_ml!,
          descricao: p.descricao,
          grade: p.grade ?? null,
          quantidade: 1,
          preco_unit: Number(p.preco_venda ?? 0),
          valor_unit: valorUnit,
          custo_unit: custoUnit,
        },
      ];
    });
    setBusca("");
    setBuscaDebounced("");
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const results = buscaQuery.data ?? [];
    const term = busca.trim().toLowerCase();
    if (!term) return;
    const exact = results.find((r) => (r.codigo_ml ?? "").toLowerCase() === term);
    if (exact) {
      addItem(exact);
      return;
    }
    if (results.length === 1) {
      addItem(results[0]);
      return;
    }
    toast.info("Refine a busca ou clique em um resultado");
  };

  const updateItem = (id: string, patch: Partial<OrcamentoItem>) => {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    setItens((prev) => prev.filter((i) => i.id !== id));
  };

  const totalGeral = useMemo(
    () => itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0),
    [itens],
  );

  const descontoNum = Number(descontoValor) || 0;
  const descontoCalculado =
    descontoTipo === "percentual"
      ? totalGeral * (descontoNum / 100)
      : Math.min(descontoNum, totalGeral);
  const totalComDesconto = totalGeral - descontoCalculado;

  const exportExcel = () => {
    setExportando("excel");
    try {
      const header = ["Código ML", "Descrição", "Quantidade", "Preço Unit.", "Total"];
      const rows = itens.map((i) => [
        i.codigo_ml,
        i.descricao,
        i.quantidade,
        Number(i.preco_unit.toFixed(2)),
        Number((i.quantidade * i.preco_unit).toFixed(2)),
      ]);
      if (descontoCalculado > 0) {
        rows.push(["", "Subtotal", "", "", Number(totalGeral.toFixed(2))]);
        rows.push(["", `Desconto (${descontoTipo === "percentual" ? descontoNum + "%" : "fixo"})`, "", "", -Number(descontoCalculado.toFixed(2))]);
      }
      const totalsRow = ["", "TOTAL GERAL", "", "", Number(totalComDesconto.toFixed(2))];
      const meta: any[][] = [];
      meta.push(["Data:", new Date().toLocaleString("pt-BR")]);
      if (vendedor) meta.push(["Vendedor:", vendedor]);
      if (cliente) meta.push(["Cliente:", cliente]);
      meta.push([]);
      const aoa = [...meta, header, ...rows, totalsRow];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
      XLSX.writeFile(wb, `orcamento-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel exportado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar Excel");
    } finally {
      setExportando(null);
    }
  };

  const exportPdf = () => {
    setExportando("pdf");
    try {
      const dateStr = new Date().toLocaleString("pt-BR");
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const body = itens
        .map(
          (i) => `<tr>
          <td>${esc(i.codigo_ml)}</td>
          <td>${esc(i.grade ?? "—")}</td>
          <td>${esc(i.descricao)}</td>
          <td style="text-align:right">${i.quantidade}</td>
          <td style="text-align:right">${moeda(i.preco_unit)}</td>
          <td style="text-align:right">${moeda(i.quantidade * i.preco_unit)}</td>
        </tr>`,
        )
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Orçamento</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 16px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #444; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  tfoot td { font-weight: bold; background: #fafafa; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
</style></head><body>
  <h1>Orçamento</h1>
  <div class="meta">Data: ${dateStr}${vendedor ? ` &nbsp;|&nbsp; Vendedor: ${esc(vendedor)}` : ""}${cliente ? ` &nbsp;|&nbsp; Cliente: ${esc(cliente)}` : ""} &nbsp;|&nbsp; Itens: ${itens.length}</div>
  <table>
    <thead>
      <tr><th>Código ML</th><th>Grade</th><th>Descrição</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th></tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr><td colspan="5" style="text-align:right">Subtotal</td><td style="text-align:right">${moeda(totalGeral)}</td></tr>
      ${descontoCalculado > 0 ? `<tr><td colspan="5" style="text-align:right">Desconto (${descontoTipo === "percentual" ? descontoNum + "%" : "fixo"})</td><td style="text-align:right">- ${moeda(descontoCalculado)}</td></tr>` : ""}
      <tr><td colspan="5" style="text-align:right">Total Geral</td><td style="text-align:right">${moeda(totalComDesconto)}</td></tr>
    </tfoot>
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
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar PDF");
    } finally {
      setExportando(null);
    }
  };

  const limpar = () => {
    if (itens.length === 0) return;
    if (confirm("Limpar todos os itens do orçamento?")) {
      setItens([]);
      setVendedor("");
      setCliente("");
      setDescontoValor("");
      setDescontoTipo("percentual");
    }
  };

  const busy = exportando !== null;
  const results = buscaQuery.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Monte um orçamento bipando ou buscando produtos.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-3 items-end">
          <div className="text-sm text-muted-foreground">Data: {dataOrcamento}</div>
          <div className="space-y-1.5">
            <Label htmlFor="vendedor">Vendedor</Label>
            <Input
              id="vendedor"
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              placeholder="Nome do vendedor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente">Cliente</Label>
            <Input
              id="cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Input
              ref={inputRef}
              autoFocus
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Bipe o código de barras ou busque por nome/código ML..."
              className="text-base"
            />
            {dropdownOpen && buscaDebounced.length >= 2 && (
              <div className="absolute z-40 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-auto">
                {buscaQuery.isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addItem(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex flex-col gap-0.5 border-b border-border last:border-0"
                    >
                      <span className="text-sm font-medium">{p.codigo_ml ?? "—"}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {p.descricao}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setItemManual((v) => !v)}>
              + Item manual
            </Button>
          </div>

          {itemManual && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                placeholder="Descrição do item"
                className="flex-1 min-w-[200px]"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={manualPreco}
                onChange={(e) => setManualPreco(e.target.value)}
                placeholder="Preço"
                className="w-32"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!manualDesc.trim()) {
                    toast.error("Informe a descrição");
                    return;
                  }
                  const preco = Number(manualPreco) || 0;
                  setItens((prev) => [
                    ...prev,
                    {
                      id: `manual-${Date.now()}`,
                      codigo_ml: "—",
                      descricao: manualDesc.trim(),
                      grade: null,
                      quantidade: 1,
                      preco_unit: preco,
                      valor_unit: 0,
                      custo_unit: 0,
                    },
                  ]);
                  setManualDesc("");
                  setManualPreco("");
                  setItemManual(false);
                  toast.success("Item adicionado");
                }}
              >
                Adicionar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setItemManual(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Itens do Orçamento</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={itens.length === 0 || busy}
              className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
            >
              {exportando === "excel" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={itens.length === 0 || busy}
              className="border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              {exportando === "pdf" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Exportar PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={limpar} disabled={itens.length === 0}>
              Limpar orçamento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum produto adicionado. Bipe ou busque um produto acima.
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Código ML</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="w-32">Preço Unit. (R$)</TableHead>
                    <TableHead className="w-32 screen-only">Vlr. Unit.</TableHead>
                    <TableHead className="w-32 screen-only">Custo Unit.</TableHead>
                    <TableHead className="text-right w-32">Total</TableHead>
                    <TableHead className="w-16">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i, idx) => (
                    <TableRow key={i.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{i.codigo_ml}</TableCell>
                      <TableCell className="text-xs">{i.grade ?? "—"}</TableCell>
                      <TableCell className="max-w-[380px] truncate">{i.descricao}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={i.quantidade}
                          onChange={(e) =>
                            updateItem(i.id, {
                              quantidade: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-8 w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={i.preco_unit}
                          onChange={(e) =>
                            updateItem(i.id, { preco_unit: Number(e.target.value) || 0 })
                          }
                          className="h-8 w-28"
                        />
                      </TableCell>
                      <TableCell className="screen-only">{moeda(i.valor_unit)}</TableCell>
                      <TableCell className="screen-only">{moeda(i.custo_unit)}</TableCell>
                      <TableCell className="text-right">
                        {moeda(i.quantidade * i.preco_unit)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeItem(i.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={10}>
                      <div className="flex items-center justify-end gap-3 pr-1">
                        <span className="text-sm text-muted-foreground">Desconto:</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={descontoTipo === "percentual" ? "default" : "outline"}
                            onClick={() => setDescontoTipo("percentual")}
                            className="h-8 px-3"
                          >
                            %
                          </Button>
                          <Button
                            size="sm"
                            variant={descontoTipo === "fixo" ? "default" : "outline"}
                            onClick={() => setDescontoTipo("fixo")}
                            className="h-8 px-3"
                          >
                            R$
                          </Button>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={descontoValor}
                          onChange={(e) => setDescontoValor(e.target.value)}
                          placeholder={descontoTipo === "percentual" ? "0" : "0,00"}
                          className="h-8 w-28"
                        />
                        {descontoCalculado > 0 && (
                          <span className="text-sm text-red-500">- {moeda(descontoCalculado)}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} className="text-right text-sm text-muted-foreground">
                      Subtotal:
                    </TableCell>
                    <TableCell className="text-right">{moeda(totalGeral)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {descontoCalculado > 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-right text-sm text-red-500">
                        Desconto ({descontoTipo === "percentual" ? `${descontoNum}%` : "fixo"}):
                      </TableCell>
                      <TableCell className="text-right text-red-500">
                        - {moeda(descontoCalculado)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={8} className="text-right font-semibold">
                      Total Geral:
                    </TableCell>
                    <TableCell className="text-right font-bold">{moeda(totalComDesconto)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
