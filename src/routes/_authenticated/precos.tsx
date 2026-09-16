import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { GradeBadge } from "@/components/grade-badge";
import { Loader2, Printer, Search, Plug, CheckCircle2, XCircle } from "lucide-react";
import {
  connectQz,
  silentPrintHtml,
  listPrinters,
  getDefaultPrinterName,
  setPreferredPrinter,
  getSelectedPrinter,
  isQzAvailable,
} from "@/lib/qzTrayPrint";
import { buildTemplatePrintHtml, loadDefaultPrintTemplate } from "@/lib/labelPrintHtml";
import {
  getActiveTemplateId,
  setActiveTemplateId,
  loadTemplatesFromDb,
  getDefaultTemplate,
  type LabelTemplate,
} from "@/lib/labelTemplates";

export const Route = createFileRoute("/_authenticated/precos")({
  component: PrecosPage,
  head: () => ({ meta: [{ title: "Gestão de Preços — Painel ML" }] }),
});

const TODOS = "__todos";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Produto = {
  id: string;
  lote_id: string;
  codigo_ml: string | null;
  codigo_rz: string | null;
  descricao: string;
  grade: string | null;
  valor_unit: number;
  quantidade: number;
  porcentagem_custo: number;
  sku: string | null;
  nome_etiqueta: string | null;
  preco_venda: number;
  destino: string | null;
};

function calcCustoUnit(p: Produto) {
  return Number(p.valor_unit) * (Number(p.porcentagem_custo) / 100);
}

function calcMargem(precoVenda: number, custoUnit: number) {
  if (precoVenda <= 0) return 0;
  return ((precoVenda - custoUnit) / precoVenda) * 100;
}

function PrecosPage() {
  const qc = useQueryClient();
  const [filtroLote, setFiltroLote] = useState<string>(TODOS);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Produto | null>(null);
  const [qzReady, setQzReady] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState<string>("");
  const [template, setTemplate] = useState<LabelTemplate | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    loadDefaultPrintTemplate()
      .then(setTemplate)
      .catch(() => setTemplate(null));
  }, []);

  const refreshPrinters = async () => {
    try {
      const list = await listPrinters();
      setPrinters(list);
      const current = getSelectedPrinter();
      if (current && list.includes(current)) {
        setPrinter(current);
      } else {
        const def = await getDefaultPrinterName();
        const chosen = (def && list.includes(def) ? def : list[0]) || "";
        if (chosen) {
          setPrinter(chosen);
          setPreferredPrinter(chosen);
        }
      }
    } catch (e) {
      console.warn("listPrinters failed", e);
    }
  };

  const handleConnectQz = async () => {
    if (qzConnecting) return;
    setQzConnecting(true);
    try {
      await connectQz();
      setQzReady(true);
      await refreshPrinters();
      toast.success("QZ Tray conectado");
    } catch (e) {
      setQzReady(false);
      toast.error(e instanceof Error ? e.message : "Falha ao conectar no QZ Tray");
    } finally {
      setQzConnecting(false);
    }
  };

  useEffect(() => {
    if (isQzAvailable()) {
      setQzReady(true);
      refreshPrinters();
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lotes").select("*").order("importado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const searchKey = ["produtos-search", filtroLote, debouncedTerm] as const;

  const { data: produtos = [], isFetching } = useQuery({
    queryKey: searchKey,
    enabled: debouncedTerm.length > 0,
    queryFn: async () => {
      const t = debouncedTerm.replace(/[%,]/g, "");
      let q = (supabase.from("produtos") as any)
        .select(
          "id, lote_id, codigo_ml, codigo_rz, descricao, grade, valor_unit, quantidade, porcentagem_custo, sku, nome_etiqueta, preco_venda, destino",
        )
        .or(`codigo_ml.ilike.%${t}%,descricao.ilike.%${t}%,nome_etiqueta.ilike.%${t}%,codigo_rz.ilike.%${t}%`)
        .limit(50);
      if (filtroLote !== TODOS) q = q.eq("lote_id", filtroLote);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filtroLote, debouncedTerm]);

  const handleEnter = async () => {
    const t = term.trim();
    if (!t) return;
    setDebouncedTerm(t);
    try {
      const cleaned = t.replace(/[%,]/g, "");
      let q = (supabase.from("produtos") as any)
        .select(
          "id, lote_id, codigo_ml, codigo_rz, descricao, grade, valor_unit, quantidade, porcentagem_custo, sku, nome_etiqueta, preco_venda, destino",
        )
        .or(
          `codigo_ml.ilike.%${cleaned}%,descricao.ilike.%${cleaned}%,nome_etiqueta.ilike.%${cleaned}%,codigo_rz.ilike.%${cleaned}%`,
        )
        .limit(50);
      if (filtroLote !== TODOS) q = q.eq("lote_id", filtroLote);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Produto[];
      qc.setQueryData(searchKey, rows);
      if (rows.length === 0) {
        toast.error("Produto não encontrado");
      } else if (rows.length === 1) {
        setEditing(rows[0]);
        setTerm("");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na busca");
    }
  };

  const visibleIds = produtos.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const printOne = async (p: Produto) => {
    if (!template) throw new Error("Template de etiqueta não carregado");
    const nome = (p.nome_etiqueta ?? p.descricao ?? "").slice(0, 120);
    const precoNum = Number(p.preco_venda) || 0;
    if (precoNum <= 0) throw new Error("Produto sem preço de venda");
    const html = buildTemplatePrintHtml(
      {
        product_name: nome,
        barcode: p.sku ?? p.codigo_ml ?? "",
        price: moeda(precoNum),
        product_code: p.grade ?? "",
      },
      template,
    );
    await silentPrintHtml(html, template.labelWidth, template.labelHeight, printer || undefined, 1);
  };

  const handlePrintSelected = async () => {
    if (!qzReady) {
      try {
        await connectQz();
        setQzReady(true);
        await refreshPrinters();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "QZ Tray não conectado");
        return;
      }
    }
    const items = produtos.filter((p) => selectedIds.has(p.id));
    let ok = 0;
    let fail = 0;
    for (const p of items) {
      try {
        await printOne(p);
        ok++;
      } catch (e) {
        fail++;
        console.error("print failed", e);
      }
    }
    if (fail === 0) toast.success(`${ok} etiqueta(s) enviada(s) à impressora`);
    else toast.error(`${ok} ok, ${fail} falharam`);
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gestão de Preços</h1>
        <p className="text-sm text-muted-foreground">Bipe ou digite um código para localizar e editar o produto.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroLote} onValueChange={setFiltroLote}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Todos os lotes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os lotes</SelectItem>
            {lotes.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                Lote {l.numero}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleEnter();
              }
            }}
            placeholder="Bipe ou digite o Código ML..."
            className="pl-9 h-11 text-base"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Button size="sm" variant={qzReady ? "outline" : "default"} onClick={handleConnectQz} disabled={qzConnecting}>
          {qzConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
          {qzReady ? "Reconectar QZ Tray" : "Conectar QZ Tray"}
        </Button>
        <div className="flex items-center gap-1.5 text-sm">
          {qzReady ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-emerald-700">Conectado</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Desconectado</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Impressora:</span>
          <Select
            value={printer || undefined}
            onValueChange={(v) => {
              setPrinter(v);
              setPreferredPrinter(v);
            }}
            disabled={!qzReady || printers.length === 0}
          >
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue placeholder={qzReady ? "Selecione..." : "Conecte o QZ Tray"} />
            </SelectTrigger>
            <SelectContent>
              {printers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border bg-secondary px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <Button
            size="sm"
            onClick={handlePrintSelected}
            disabled={!qzReady}
            title={qzReady ? "" : "QZ Tray não conectado"}
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir selecionados
          </Button>
        </div>
      )}

      {debouncedTerm.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Use o campo de busca para localizar produtos.
          </CardContent>
        </Card>
      ) : produtos.length === 0 && !isFetching ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Nenhum produto encontrado para "{debouncedTerm}".
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="text-left px-3 py-2">Código ML</th>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-center px-3 py-2">Grade</th>
                    <th className="text-center px-3 py-2">QTD</th>
                    <th className="text-right px-3 py-2">Custo Unit.</th>
                    <th className="text-right px-3 py-2">Preço Venda</th>
                    <th className="text-right px-3 py-2">Margem %</th>
                    <th className="text-left px-3 py-2">Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p) => {
                    const custo = calcCustoUnit(p);
                    const preco = Number(p.preco_venda) || 0;
                    const margem = calcMargem(preco, custo);
                    const nome = p.nome_etiqueta ?? p.descricao ?? "";
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border hover:bg-muted/40 cursor-pointer"
                        onClick={() => setEditing(p)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleOne(p.id)} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{p.codigo_ml ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.sku ?? "—"}</td>
                        <td className="px-3 py-2 max-w-[320px] truncate" title={nome}>
                          {nome}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <GradeBadge grade={p.grade} />
                        </td>
                        <td className="px-3 py-2 text-center">{p.quantidade}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{moeda(custo)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{preco > 0 ? moeda(preco) : "—"}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            preco > 0 ? (margem >= 0 ? "text-emerald-600" : "text-red-600") : "text-muted-foreground"
                          }`}
                        >
                          {preco > 0 ? `${margem.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2">{p.destino ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <EditDialog
        produto={editing}
        qzReady={qzReady}
        printer={printer}
        template={template}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["produtos-search"] });
        }}
      />
    </div>
  );
}

function EditDialog({
  produto,
  qzReady,
  printer,
  template,
  onClose,
  onSaved,
}: {
  produto: Produto | null;
  qzReady: boolean;
  printer: string;
  template: LabelTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sku, setSku] = useState("");
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [destino, setDestino] = useState<string>("");
  const [printQty, setPrintQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [templateId, setTemplateId] = useState<string>(() => getActiveTemplateId());

  const templatesQuery = useQuery({
    queryKey: ["label-templates"],
    queryFn: loadTemplatesFromDb,
  });

  useEffect(() => {
    if (templatesQuery.error) {
      toast.error("Falha ao carregar modelos de etiqueta");
    }
  }, [templatesQuery.error]);

  const availableTemplates: LabelTemplate[] = templatesQuery.data ?? [];
  const selectedTemplate: LabelTemplate =
    availableTemplates.find((t) => t.id === templateId) ?? template ?? getDefaultTemplate();

  useEffect(() => {
    if (!produto) return;
    setSku(produto.sku ?? produto.codigo_ml ?? "");
    setNome(produto.nome_etiqueta ?? produto.descricao ?? "");
    setPreco(produto.preco_venda != null && Number(produto.preco_venda) > 0 ? String(Number(produto.preco_venda)) : "");
    setDestino(produto.destino ?? "");
    setPrintQty(1);
    setApplyToAll(false);
  }, [produto]);

  const custo = useMemo(() => (produto ? calcCustoUnit(produto) : 0), [produto]);
  const precoNum = parseFloat(preco.replace(",", ".")) || 0;
  const margem = calcMargem(precoNum, custo);

  const handleSave = async () => {
    if (!produto) return;
    setSaving(true);
    try {
      const payload = {
        sku: sku.trim() === "" ? null : sku.trim(),
        nome_etiqueta: nome.slice(0, 120),
        preco_venda: precoNum,
        destino: destino === "" ? null : destino,
      };
      const { error } = await (supabase.from("produtos") as any).update(payload).eq("id", produto.id);
      if (error) throw error;
      if (applyToAll && produto.codigo_ml && precoNum > 0) {
        const { error: bulkErr } = await (supabase.from("produtos") as any)
          .update({ preco_venda: precoNum })
          .eq("codigo_ml", produto.codigo_ml);
        if (bulkErr) {
          toast.warning("Preço salvo para este produto, mas falhou ao aplicar aos demais.");
        } else {
          toast.success(`Preço aplicado a todos os produtos com SKU ${produto.codigo_ml}`);
        }
      }
      if (payload.destino) {
        const { error: movErr } = await (supabase.from("movimentacoes") as any).insert({
          produto_id: produto.id,
          lote_id: produto.lote_id,
          codigo_ml: produto.codigo_ml,
          destino: payload.destino,
          preco_venda: precoNum,
        });
        if (movErr) toast.warning("Produto salvo, mas falhou ao registrar movimentação.");
      }
      if (!applyToAll) toast.success("Produto salvo");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const canPrint = qzReady && !!selectedTemplate && precoNum > 0 && nome.length > 0 && nome.length <= 120;

  const handlePrintEtiqueta = async () => {
    if (!produto || !selectedTemplate) return;
    setPrinting(true);
    try {
      const html = buildTemplatePrintHtml(
        {
          product_name: nome.slice(0, 120),
          barcode: (sku || produto.codigo_ml || "").trim(),
          price: moeda(precoNum),
          price_de: selectedTemplate.hasPromoPrice && produto.valor_unit ? moeda(Number(produto.valor_unit)) : null,
          product_code: produto.grade ?? "",
        },
        selectedTemplate,
      );
      await silentPrintHtml(
        html,
        selectedTemplate.hasPromoPrice ? selectedTemplate.labelHeight : selectedTemplate.labelWidth,
        selectedTemplate.hasPromoPrice ? selectedTemplate.labelWidth : selectedTemplate.labelHeight,
        printer || undefined,
        printQty,
      );
      toast.success("Etiqueta enviada à impressora");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao imprimir");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog
      open={!!produto}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md w-full overflow-x-hidden overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
        </DialogHeader>
        {produto && (
          <div className="space-y-4 overflow-x-hidden">
            <div className="text-xs text-muted-foreground font-mono">Código ML: {produto.codigo_ml ?? "—"}</div>

            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Grade</Label>
              <div className="text-sm font-medium">{produto?.grade ?? "—"}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <div className="text-sm font-medium">{produto?.quantidade ?? "—"}</div>
              </div>
              <div className="space-y-1.5">
                <Label>Valor Unitário</Label>
                <div className="text-sm font-medium">
                  {produto?.valor_unit != null ? moeda(Number(produto.valor_unit)) : "—"}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome para etiqueta</Label>
              <Textarea
                id="nome"
                value={nome}
                maxLength={120}
                rows={3}
                onChange={(e) => setNome(e.target.value.slice(0, 120))}
              />
              <div className="text-[11px] text-muted-foreground text-right">{nome.length}/120</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="preco">Preço de Venda</Label>
                <Input
                  id="preco"
                  type="number"
                  step="0.01"
                  min="0"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destino">Destino</Label>
                <Select value={destino || undefined} onValueChange={setDestino}>
                  <SelectTrigger id="destino">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Loja Física">Loja Física</SelectItem>
                    <SelectItem value="E-commerce">E-commerce</SelectItem>
                    <SelectItem value="Todos os canais">Todos os canais</SelectItem>
                    <SelectItem value="Triagem">Triagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="printQty">Qtd. etiquetas</Label>
                <Input
                  id="printQty"
                  type="number"
                  min={1}
                  max={50}
                  value={printQty}
                  onChange={(e) => setPrintQty(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="applyToAll"
                checked={applyToAll}
                onCheckedChange={(v) => setApplyToAll(!!v)}
                disabled={!produto?.codigo_ml}
              />
              <label htmlFor="applyToAll" className="text-xs text-muted-foreground cursor-pointer select-none">
                Aplicar preço a todos os produtos com o mesmo SKU ({produto?.codigo_ml ?? "—"})
              </label>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-3">
              <span>Custo unit.: {moeda(custo)}</span>
              <span>
                Margem:{" "}
                <span
                  className={
                    precoNum > 0 ? (margem >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium") : ""
                  }
                >
                  {precoNum > 0 ? `${margem.toFixed(1)}%` : "—"}
                </span>
              </span>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 w-full">
          <div className="flex-shrink-0 w-[120px]">
            <Select
              value={templateId}
              onValueChange={(v) => {
                setTemplateId(v);
                setActiveTemplateId(v);
              }}
              disabled={templatesQuery.isLoading || availableTemplates.length === 0}
            >
              <SelectTrigger className="h-9" aria-label="Modelo de etiqueta">
                {templatesQuery.isLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Modelos...
                  </span>
                ) : (
                  <SelectValue placeholder="Modelo" />
                )}
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handlePrintEtiqueta}
            disabled={!canPrint || printing}
            title={
              !qzReady
                ? "Conecte o QZ Tray"
                : precoNum <= 0
                  ? "Defina o preço de venda"
                  : nome.length === 0
                    ? "Preencha o nome da etiqueta"
                    : ""
            }
          >
            {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            Imprimir etiqueta
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
