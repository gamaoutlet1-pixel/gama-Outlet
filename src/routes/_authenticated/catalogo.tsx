import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import {
  atualizarProduto,
  excluirProduto,
} from "@/lib/produtos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradeBadge } from "@/components/grade-badge";
import { Trash2, Search, Pencil, Info, Copy, ArrowUp, ArrowDown, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const catalogoSearch = z.object({
  lote: fallback(z.string(), "__todos").default("__todos"),
});

export const Route = createFileRoute("/_authenticated/catalogo")({
  component: CatalogoPage,
  validateSearch: zodValidator(catalogoSearch),
  head: () => ({ meta: [{ title: "Catálogo de Produtos — Painel ML" }] }),
});

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const GRADES = ["A", "B", "C", "D", "E", "F", "UN"] as const;

type Produto = {
  id: string;
  lote_id: string;
  codigo_ml: string | null;
  codigo_rz: string | null;
  descricao: string;
  valor_unit: number;
  quantidade: number;
  valor_total: number;
  grade: string | null;
  categoria: string | null;
  subcategoria: string | null;
  porcentagem_custo: number;
};

function CatalogoPage() {
  const qc = useQueryClient();
  const atualizar = useServerFn(atualizarProduto);
  const remover = useServerFn(excluirProduto);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("__todas");
  const [filtroGrade, setFiltroGrade] = useState<string>("todos");
  const [filtroRz, setFiltroRz] = useState("");
  const [filtroRzDebounced, setFiltroRzDebounced] = useState("");
  const { lote: filtroLote } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalogo" });
  const setFiltroLote = (value: string) =>
    navigate({ search: (prev: { lote: string }) => ({ ...prev, lote: value }), replace: true });
  const [editando, setEditando] = useState<Produto | null>(null);
  const [excluindo, setExcluindo] = useState<Produto | null>(null);
  const [detalhes, setDetalhes] = useState<Produto | null>(null);
  const [custoPct, setCustoPct] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [sortField, setSortField] = useState<"valor_total" | "valor_unit">("valor_total");
  const [sortAsc, setSortAsc] = useState(false);
  const [novoProdutoOpen, setNovoProdutoOpen] = useState(false);

  function toggleSort(field: "valor_total" | "valor_unit") {
    if (sortField === field) setSortAsc((v) => !v);
    else { setSortField(field); setSortAsc(false); }
  }

  // Debounce search input -> busca (400ms)
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 400);
    return () => clearTimeout(t);
  }, [buscaInput]);

  // Debounce RZ input -> filtroRzDebounced (400ms)
  useEffect(() => {
    const t = setTimeout(() => setFiltroRzDebounced(filtroRz), 400);
    return () => clearTimeout(t);
  }, [filtroRz]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [busca, filtroCategoria, filtroGrade, filtroLote, filtroRzDebounced, sortField, sortAsc]);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .order("importado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const applyFilters = <T extends { eq: Function; or: Function }>(q: T): T => {
    let qq: any = q;
    if (filtroLote !== "__todos") qq = qq.eq("lote_id", filtroLote);
    if (busca.trim()) {
      const term = busca.trim().replace(/[%,()]/g, "");
      qq = qq.or(`descricao.ilike.%${term}%,codigo_ml.ilike.%${term}%`);
    }
    if (filtroRzDebounced.trim()) {
      const rzTerm = filtroRzDebounced.trim().replace(/[%,()]/g, "");
      qq = qq.ilike("codigo_rz", `%${rzTerm}%`);
    }
    if (filtroCategoria !== "__todas") qq = qq.eq("categoria", filtroCategoria);
    if (filtroGrade !== "todos") {
      if (filtroGrade === "UN") {
        qq = qq.or("grade.eq.U,grade.eq.UN");
      } else {
        qq = qq.eq("grade", filtroGrade);
      }
    }
    return qq as T;
  };

  const { data: produtosData, isLoading, isError, error: produtosError } = useQuery({
    queryKey: ["produtos", filtroLote, busca, filtroCategoria, filtroGrade, filtroRzDebounced, sortField, sortAsc, page],
    queryFn: async () => {
      let q = supabase.from("produtos").select("*", { count: "exact" });
      q = applyFilters(q);
      q = q
        .order(sortField, { ascending: sortAsc })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, count, error } = await q;
      if (error) throw error;
      return { produtos: (data ?? []) as Produto[], total: count ?? 0 };
    },
  });

  const produtos = produtosData?.produtos ?? [];
  const total = produtosData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias", filtroLote],
    queryFn: async () => {
      let q = supabase.from("produtos").select("categoria");
      if (filtroLote !== "__todos") q = q.eq("lote_id", filtroLote);
      const { data, error } = await q;
      if (error) throw error;
      return [
        ...new Set(
          (data ?? [])
            .map((p: { categoria: string | null }) => p.categoria)
            .filter((c): c is string => !!c),
        ),
      ].sort();
    },
  });

  const { data: totaisRows = [] } = useQuery({
    queryKey: ["produtos-totais", filtroLote, busca, filtroCategoria, filtroGrade, filtroRzDebounced],
    queryFn: async () => {
      let q = supabase.from("produtos").select("quantidade, valor_total, grade");
      q = applyFilters(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { quantidade: number; valor_total: number; grade: string | null }[];
    },
  });

  const totais = useMemo(() => {
    const unidades = totaisRows.reduce((s, p) => s + Number(p.quantidade), 0);
    const valor = totaisRows.reduce((s, p) => s + Number(p.valor_total), 0);
    const porGrade = totaisRows.reduce<Record<string, number>>((acc, p) => {
      const g = (p.grade ?? "UN").toUpperCase();
      const normalizedG = (g === "U") ? "UN" : g;
      acc[normalizedG] = (acc[normalizedG] ?? 0) + 1;
      return acc;
    }, {});
    return { unidades, valor, porGrade };
  }, [totaisRows]);

  const invalidateProdutos = () => {
    qc.invalidateQueries({ queryKey: ["produtos"] });
    qc.invalidateQueries({ queryKey: ["produtos-totais"] });
    qc.invalidateQueries({ queryKey: ["produtos-custo-base"] });
    qc.invalidateQueries({ queryKey: ["categorias"] });
  };

  const mAtualizar = useMutation({
    mutationFn: (v: NonNullable<Parameters<typeof atualizar>[0]>["data"]) =>
      atualizar({ data: v }),
    onSuccess: () => {
      toast.success("Produto atualizado");
      setEditando(null);
      invalidateProdutos();
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const mExcluir = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => {
      toast.success("Produto excluído");
      setExcluindo(null);
      invalidateProdutos();
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const pctNum = parseFloat(custoPct.replace(",", ".")) || 0;
  const loteSelecionado = filtroLote !== "__todos";

  const { data: custoBase = [] } = useQuery({
    queryKey: ["produtos-custo-base", filtroLote],
    queryFn: async () => {
      if (!loteSelecionado) return [];
      const { data, error } = await supabase
        .from("produtos")
        .select("valor_unit, quantidade")
        .eq("lote_id", filtroLote);
      if (error) throw error;
      return (data ?? []) as { valor_unit: number; quantidade: number }[];
    },
    enabled: loteSelecionado,
  });

  const custoEstimado = useMemo(() => {
    if (!loteSelecionado) return 0;
    return custoBase.reduce(
      (s, p) => s + Number(p.valor_unit) * Number(p.quantidade) * (pctNum / 100),
      0,
    );
  }, [custoBase, pctNum, loteSelecionado]);

  const mAplicarCusto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("produtos")
        .update({ porcentagem_custo: pctNum })
        .eq("lote_id", filtroLote);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custo aplicado ao lote");
      invalidateProdutos();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const mExcluirSelecionados = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("produtos").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} produto(s) excluído(s)`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      invalidateProdutos();
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const visibleIds = produtos.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Catálogo de Produtos</h1>
        <p className="text-sm text-muted-foreground">
          Visualize os produtos por condição (Grade)
        </p>
      </div>

      <div>
        <Button onClick={() => setNovoProdutoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroLote} onValueChange={setFiltroLote}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar lote" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos os lotes</SelectItem>
            {lotes.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                Lote {l.numero} ({l.total_produtos})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Info className="h-4 w-4" />
              Legenda Grade
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2 text-sm">
              {GRADES.map((g) => (
                <div key={g} className="flex items-center gap-2">
                  <GradeBadge grade={g} />
                  <span className="text-muted-foreground">
                    {g === "A" && "Novo / Excelente"}
                    {g === "B" && "Bom estado"}
                    {g === "C" && "Usado"}
                    {g === "D" && "Com avarias leves"}
                    {g === "E" && "Avarias"}
                    {g === "F" && "Sucata / peça"}
                    {g === "UN" && "Sem classificação"}
                  </span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-6">
          <Bloco label="PRODUTOS ÚNICOS" valor={String(total)} />
          <Bloco label="TOTAL DE UNIDADES" valor={String(totais.unidades)} />
          <Bloco label="VALOR TOTAL" valor={moeda(totais.valor)} />
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {GRADES.filter((g) => g !== "UN").map((g) => {
              const count = totais.porGrade[g] ?? 0;
              if (!count) return null;
              return (
                <div
                  key={g}
                  className="flex items-center gap-1 bg-secondary px-2 py-1 rounded text-xs"
                >
                  <GradeBadge grade={g} />
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          placeholder="Buscar por produto, Código ML ou Código RZ..."
          className="pl-9"
        />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 w-48"
          placeholder="Filtrar por Cód. RZ..."
          value={filtroRz}
          onChange={(e) => setFiltroRz(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Grade:</span>
          <button
            onClick={() => setFiltroGrade("todos")}
            className={`px-3 py-1 rounded text-sm ${
              filtroGrade === "todos"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground"
            }`}
          >
            Todos
          </button>
          {GRADES.map((g) => (
            <button
              key={g}
              onClick={() => setFiltroGrade(g)}
              className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${
                filtroGrade === g ? "ring-2 ring-primary" : ""
              } bg-secondary`}
            >
              <GradeBadge grade={g} />
              {g === "UN" && <span className="ml-0.5">U/UN</span>}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="text-sm font-semibold">Definir custo do lote</div>
            <div className="text-xs text-muted-foreground">
              {loteSelecionado
                ? "Aplica a porcentagem de custo a todos os produtos do lote selecionado."
                : "Selecione um lote específico para aplicar o custo."}
            </div>
          </div>
          <div>
            <Label className="text-xs">Porcentagem (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={custoPct}
              onChange={(e) => setCustoPct(e.target.value)}
              disabled={!loteSelecionado}
              className="w-32"
            />
          </div>
          <div className="text-sm">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
              Custo total estimado
            </div>
            <div className="text-lg font-bold">{moeda(custoEstimado)}</div>
          </div>
          <Button
            disabled={!loteSelecionado || mAplicarCusto.isPending || pctNum < 0}
            onClick={() => mAplicarCusto.mutate()}
            className="ml-auto"
          >
            {mAplicarCusto.isPending ? "Aplicando..." : "Aplicar ao lote"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <div className="font-semibold">Catálogo de Produtos</div>
            <div className="text-xs text-muted-foreground inline-block bg-secondary px-2 py-0.5 rounded mt-1">
              {produtos.length} de {total} item(ns)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="text-left px-3 py-2">Código RZ</th>
                  <th className="text-left px-3 py-2">Código ML</th>
                  <th className="text-left px-3 py-2">Produto</th>
                  <th className="text-right px-3 py-2">Qtd</th>
                  <th
                    className="text-right px-3 py-2 cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("valor_unit")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Valor Unit.
                      {sortField === "valor_unit" && (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                  <th className="text-right px-3 py-2">Custo</th>
                  <th
                    className="text-right px-3 py-2 cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("valor_total")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Custo Total
                      {sortField === "valor_total" && (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                  <th className="text-center px-3 py-2">Grade</th>
                  <th className="text-left px-3 py-2">Categoria</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : produtos.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-muted-foreground">
                      Nenhum produto.{" "}
                      <Link to="/importar" className="text-primary underline">
                        Importar uma planilha
                      </Link>{" "}
                      para começar.
                    </td>
                  </tr>
                ) : (
                  produtos.map((p) => {
                    const custoUnit =
                      Number(p.valor_unit) * (Number(p.porcentagem_custo ?? 0) / 100);
                    const custoTotal = custoUnit * p.quantidade;
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/40 hover:bg-accent/30 cursor-pointer"
                        onClick={() => setDetalhes(p)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectOne(p.id)}
                            aria-label="Selecionar produto"
                          />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{p.codigo_rz}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <div className="flex items-center">
                            {p.codigo_ml}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 ml-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(p.codigo_ml ?? "");
                                toast.success("Código ML copiado!");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-2 max-w-md truncate" title={p.descricao}>
                          <div className="flex items-center">
                            {p.descricao}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 ml-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(p.descricao ?? "");
                                toast.success("Descrição copiada!");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{p.quantidade}</td>
                        <td className="px-3 py-2 text-right">{moeda(Number(p.valor_unit))}</td>
                        <td className="px-3 py-2 text-right">{moeda(custoUnit)}</td>
                        <td className="px-3 py-2 text-right font-medium">{moeda(custoTotal)}</td>
                        <td className="px-3 py-2 text-center">
                          <GradeBadge grade={p.grade} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{p.categoria}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); setEditando(p); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); setExcluindo(p); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Anterior
            </Button>
            <div className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima →
            </Button>
          </div>
        </CardContent>
      </Card>

      {isError && (
        <div className="text-sm text-destructive">
          Erro ao carregar produtos: {produtosError instanceof Error ? produtosError.message : "erro desconhecido"}
        </div>
      )}

      <EditarProdutoDialog
        produto={editando}
        onClose={() => setEditando(null)}
        onSave={(v) => mAtualizar.mutate(v)}
        saving={mAtualizar.isPending}
      />

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.descricao}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluindo && mExcluir.mutate(excluindo.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produtos selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir {selectedIds.size} produto(s) permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                mExcluirSelecionados.mutate(Array.from(selectedIds))
              }
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detalhes} onOpenChange={(o) => !o && setDetalhes(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do produto</DialogTitle>
            <div className="flex items-start gap-1">
              <DialogDescription>{detalhes?.descricao}</DialogDescription>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 mt-1"
                onClick={() => {
                  navigator.clipboard.writeText(detalhes?.descricao ?? "");
                  toast.success("Descrição copiada!");
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </DialogHeader>
          {detalhes && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Quantidade</div>
                  <div className="font-medium">{detalhes.quantidade}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Código ML</div>
                  <div className="font-medium flex items-center gap-1">
                    {detalhes.codigo_ml}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        navigator.clipboard.writeText(detalhes.codigo_ml ?? "");
                        toast.success("Código ML copiado!");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Código RZ</div>
                  <div className="font-medium">{detalhes.codigo_rz ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Categoria</div>
                  <div className="font-medium">{detalhes.categoria ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Subcategoria</div>
                  <div className="font-medium">{detalhes.subcategoria ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Grade</div>
                  <div className="font-medium"><GradeBadge grade={detalhes.grade} /></div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Custo (%)</div>
                  <div className="font-medium">{Number(detalhes.porcentagem_custo ?? 0).toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Valor Unitário</div>
                  <div className="font-medium">{moeda(Number(detalhes.valor_unit))}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Valor Total</div>
                  <div className="font-medium">{moeda(Number(detalhes.valor_total))}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Custo unitário</div>
                  <div className="font-medium">
                    {moeda(Number(detalhes.valor_unit) * (Number(detalhes.porcentagem_custo ?? 0) / 100))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Custo Total</div>
                  <div className="font-medium">
                    {moeda(Number(detalhes.valor_unit) * detalhes.quantidade * (Number(detalhes.porcentagem_custo ?? 0) / 100))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalhes(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NovoProdutoDialog
        open={novoProdutoOpen}
        onClose={() => setNovoProdutoOpen(false)}
        lotes={lotes}
        categorias={categorias}
        onSuccess={invalidateProdutos}
      />
    </div>
  );
}

function Bloco({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-2xl font-bold">{valor}</div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
        {label}
      </div>
    </div>
  );
}

function EditarProdutoDialog({
  produto,
  onClose,
  onSave,
  saving,
}: {
  produto: Produto | null;
  onClose: () => void;
  onSave: (v: {
    id: string;
    descricao: string;
    codigo_ml: string | null;
    codigo_rz: string | null;
    valor_unit: number;
    quantidade: number;
    grade: string | null;
    categoria: string | null;
    subcategoria: string | null;
    porcentagem_custo: number;
  }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Produto | null>(produto);
  // sincroniza quando muda
  if (produto && (!form || form.id !== produto.id)) setForm(produto);

  if (!produto || !form) return null;

  return (
    <Dialog open={!!produto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div>
            <Label>Código RZ</Label>
            <Input
              value={form.codigo_rz ?? ""}
              onChange={(e) =>
                setForm({ ...form, codigo_rz: e.target.value || null })
              }
            />
          </div>
          <div>
            <Label>Código ML</Label>
            <Input
              value={form.codigo_ml ?? ""}
              onChange={(e) =>
                setForm({ ...form, codigo_ml: e.target.value.toUpperCase() || null })
              }
            />
          </div>
          <div>
            <Label>Valor Unit.</Label>
            <Input
              type="number"
              step="0.01"
              value={form.valor_unit}
              onChange={(e) =>
                setForm({ ...form, valor_unit: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              value={form.quantidade}
              onChange={(e) =>
                setForm({ ...form, quantidade: parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div>
            <Label>Grade</Label>
            <Select
              value={form.grade ?? "UN"}
              onValueChange={(v) => setForm({ ...form, grade: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Input
              value={form.categoria ?? ""}
              onChange={(e) =>
                setForm({ ...form, categoria: e.target.value || null })
              }
            />
          </div>
          <div className="col-span-2">
            <Label>Subcategoria</Label>
            <Input
              value={form.subcategoria ?? ""}
              onChange={(e) =>
                setForm({ ...form, subcategoria: e.target.value || null })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                id: form.id,
                descricao: form.descricao,
                codigo_ml: form.codigo_ml,
                codigo_rz: form.codigo_rz,
                valor_unit: Number(form.valor_unit),
                quantidade: Number(form.quantidade),
                grade: form.grade,
                categoria: form.categoria,
                subcategoria: form.subcategoria,
                porcentagem_custo: Number(form.porcentagem_custo ?? 0),
              })
            }
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoProdutoDialog({
  open,
  onClose,
  lotes,
  categorias,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  lotes: { id: string; numero: string }[];
  categorias: string[];
  onSuccess: () => void;
}) {
  const initialForm = {
    lote_id: "",
    codigo_rz: "",
    codigo_ml: "",
    descricao: "",
    quantidade: 1,
    valor_unit: 0,
    grade: "UN",
    custo_unit: 0,
    categoria: "__none",
  };
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave() {
    if (!form.lote_id) {
      toast.error("Selecione um lote.");
      return;
    }
    if (!form.descricao.trim()) {
      toast.error("Informe a descrição do produto.");
      return;
    }
    if (form.quantidade < 1) {
      toast.error("Quantidade deve ser pelo menos 1.");
      return;
    }
    if (form.valor_unit <= 0) {
      toast.error("Informe o valor unitário.");
      return;
    }

    const custoPct =
      form.valor_unit > 0 ? (form.custo_unit / form.valor_unit) * 100 : 0;

    setSaving(true);

    let loteIdFinal = form.lote_id;
    if (form.lote_id === "__indefinido") {
      const { data: loteExist } = await supabase
        .from("lotes")
        .select("id")
        .eq("numero", "INDEFINIDO")
        .maybeSingle();
      if (loteExist) {
        loteIdFinal = loteExist.id;
      } else {
        const { data: novoLote, error: loteErr } = await supabase
          .from("lotes")
          .insert({ numero: "INDEFINIDO", nome_arquivo: "Indefinido" })
          .select("id")
          .single();
        if (loteErr || !novoLote) {
          setSaving(false);
          toast.error(loteErr?.message ?? "Erro ao criar Lote Indefinido.");
          return;
        }
        loteIdFinal = novoLote.id;
      }
    }

    const { error } = await supabase.from("produtos").insert({
      lote_id: loteIdFinal,
      codigo_rz: form.codigo_rz || null,
      codigo_ml: form.codigo_ml || null,
      descricao: form.descricao,
      quantidade: form.quantidade,
      valor_unit: form.valor_unit,
      valor_total: form.valor_unit * form.quantidade,
      grade: form.grade,
      porcentagem_custo: custoPct,
      categoria:
        form.categoria === "__none" || !form.categoria ? null : form.categoria,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Produto criado com sucesso!");
      onSuccess();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Produto</DialogTitle>
          <DialogDescription>
            Cadastre um produto manualmente em um lote existente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Lote *</Label>
            <Select
              value={form.lote_id}
              onValueChange={(v) => setForm({ ...form, lote_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um lote" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__indefinido">Lote Indefinido</SelectItem>
                {lotes.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    Lote {l.numero}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Código RZ</Label>
            <Input
              value={form.codigo_rz}
              onChange={(e) =>
                setForm({ ...form, codigo_rz: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Código ML</Label>
            <Input
              value={form.codigo_ml}
              onChange={(e) =>
                setForm({
                  ...form,
                  codigo_ml: e.target.value.toUpperCase(),
                })
              }
            />
          </div>
          <div className="col-span-2">
            <Label>Produto / Descrição *</Label>
            <Input
              value={form.descricao}
              onChange={(e) =>
                setForm({ ...form, descricao: e.target.value.slice(0, 120) })
              }
              maxLength={120}
            />
            <span className="text-xs text-muted-foreground text-right block">
              {form.descricao.length}/120
            </span>
          </div>
          <div>
            <Label>Quantidade *</Label>
            <Input
              type="number"
              min={1}
              value={form.quantidade}
              onChange={(e) =>
                setForm({ ...form, quantidade: parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div>
            <Label>Valor Unitário *</Label>
            <Input
              type="number"
              step="0.01"
              value={form.valor_unit}
              onChange={(e) =>
                setForm({
                  ...form,
                  valor_unit: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
          <div>
            <Label>Grade</Label>
            <Select
              value={form.grade}
              onValueChange={(v) => setForm({ ...form, grade: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Custo Unitário</Label>
            <Input
              type="number"
              step="0.01"
              value={form.custo_unit}
              onChange={(e) =>
                setForm({
                  ...form,
                  custo_unit: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="col-span-2">
            <Label>Categoria</Label>
            <Select
              value={form.categoria}
              onValueChange={(v) => setForm({ ...form, categoria: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem categoria</SelectItem>
                <SelectItem value="Produtos Diversos">Produtos Diversos</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
