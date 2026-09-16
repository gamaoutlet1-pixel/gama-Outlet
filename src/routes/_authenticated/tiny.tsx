import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Loader2, AlertCircle, Send, X } from "lucide-react";
import {
  getTinyApiKey,
  saveTinyApiKey,
  enviarProdutoTiny,
} from "@/lib/tiny.functions";

export const Route = createFileRoute("/_authenticated/tiny")({
  component: TinyPage,
  head: () => ({ meta: [{ title: "Tiny ERP — Painel ML" }] }),
});

const moeda = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ProdutoEcom = {
  id: string;
  codigo_ml: string | null;
  descricao: string;
  nome_etiqueta: string | null;
  preco_venda: number;
  tiny_status: string | null;
  tiny_id: string | null;
};

function TinyPage() {
  const qc = useQueryClient();
  const fetchKey = useServerFn(getTinyApiKey);
  const saveKey = useServerFn(saveTinyApiKey);
  const sendProd = useServerFn(enviarProdutoTiny);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [nomeFilter, setNomeFilter] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "enviado">("todos");
  const PAGE_SIZE = 50;

  const keyQuery = useQuery({
    queryKey: ["tiny-api-key"],
    queryFn: () => fetchKey(),
  });

  useEffect(() => {
    if (keyQuery.data?.apiKey) setApiKeyInput(keyQuery.data.apiKey);
  }, [keyQuery.data?.apiKey]);

  useEffect(() => {
    setPage(0);
  }, [nomeFilter, skuFilter, statusFilter]);

  const produtosQuery = useQuery({
    queryKey: ["tiny-produtos", page, nomeFilter, skuFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("id, codigo_ml, descricao, nome_etiqueta, preco_venda, tiny_status, tiny_id", { count: "exact" })
        .or("destino.eq.E-commerce,destino.eq.Todos os canais")
        .order("descricao", { ascending: true });

      if (nomeFilter.trim()) {
        q = q.ilike("descricao", `%${nomeFilter.trim()}%`);
      }
      if (skuFilter.trim()) {
        q = q.ilike("codigo_ml", `%${skuFilter.trim()}%`);
      }
      if (statusFilter === "enviado") {
        q = q.eq("tiny_status", "enviado");
      } else if (statusFilter === "pendente") {
        q = q.or("tiny_status.is.null,tiny_status.neq.enviado");
      }

      const { data, error, count } = await q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { produtos: (data ?? []) as ProdutoEcom[], total: count ?? 0 };
    },
  });

  const saveMut = useMutation({
    mutationFn: () => saveKey({ data: { apiKey: apiKeyInput.trim() } }),
    onSuccess: () => {
      toast.success("API Key salva.");
      qc.invalidateQueries({ queryKey: ["tiny-api-key"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const handleSend = async (produtoId: string) => {
    setSendingIds((prev) => new Set(prev).add(produtoId));
    try {
      await sendProd({ data: { produtoId } });
      toast.success("Produto enviado ao Tiny.");
      qc.invalidateQueries({ queryKey: ["tiny-produtos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar ao Tiny.");
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(produtoId);
        return next;
      });
    }
  };

  const hasKey = !!keyQuery.data?.apiKey;
  const produtos = produtosQuery.data?.produtos ?? [];
  const total = produtosQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Tiny ERP</h1>
        <p className="text-muted-foreground text-sm">
          Configure sua API Key e envie produtos do E-commerce ao Tiny.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração Tiny ERP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">API Key</label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Cole sua API Key do Tiny"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Ocultar" : "Mostrar"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !apiKeyInput.trim()}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasKey && !keyQuery.isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Configure a API Key do Tiny para enviar produtos.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Produtos E-commerce</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input
                placeholder="Buscar por nome"
                value={nomeFilter}
                onChange={(e) => setNomeFilter(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 block">SKU</label>
              <Input
                placeholder="Buscar por SKU"
                value={skuFilter}
                onChange={(e) => setSkuFilter(e.target.value)}
              />
            </div>
            <div className="w-[160px]">
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as "todos" | "pendente" | "enviado")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNomeFilter("");
                  setSkuFilter("");
                  setStatusFilter("todos");
                }}
                disabled={nomeFilter === "" && skuFilter === "" && statusFilter === "todos"}
              >
                <X className="h-4 w-4 mr-1" />
                Limpar filtros
              </Button>
            </div>
          </div>

          {produtosQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum produto com destino "E-commerce".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Preço de Venda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((p) => {
                  const nome = p.nome_etiqueta?.trim() || p.descricao;
                  const enviado = p.tiny_status === "enviado";
                  const sending = sendingIds.has(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[400px] truncate" title={nome}>
                        {nome}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.codigo_ml ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {moeda(Number(p.preco_venda))}
                      </TableCell>
                      <TableCell>
                        {enviado ? (
                          <Badge className="bg-green-600 hover:bg-green-600 text-white">
                            Enviado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={enviado ? "outline" : "default"}
                          onClick={() => handleSend(p.id)}
                          disabled={!hasKey || sending}
                        >
                          {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {enviado ? "Reenviar" : "Enviar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {produtos.length > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0 || produtosQuery.isLoading}
              >
                ← Anterior
              </Button>
              <span className="text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= totalPages || produtosQuery.isLoading}
              >
                Próxima →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
