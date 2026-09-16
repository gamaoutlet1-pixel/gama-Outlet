import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  component: MovimentacoesPage,
  head: () => ({ meta: [{ title: "Movimentações — Painel ML" }] }),
});

const moeda = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Movimentacao = {
  id: string;
  produto_id: string | null;
  lote_id: string | null;
  codigo_ml: string | null;
  destino: string | null;
  preco_venda: number | null;
  created_at: string;
  lotes: { numero: string | null } | null;
};

const DESTINOS = ["Loja Física", "E-commerce", "Todos os canais", "Triagem"] as const;

function MovimentacoesPage() {
  const [filtro, setFiltro] = useState<string>("__all__");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setPage(0);
  }, [filtro, dataInicio, dataFim]);

  const query = useQuery({
    queryKey: ["movimentacoes", filtro, dataInicio, dataFim, page],
    queryFn: async () => {
      let q = supabase
        .from("movimentacoes" as any)
        .select("*, lotes(numero)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (filtro !== "__all__") q = q.eq("destino", filtro);
      if (dataInicio) q = q.gte("created_at", new Date(dataInicio).toISOString());
      if (dataFim) {
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        q = q.lte("created_at", fim.toISOString());
      }
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as unknown as Movimentacao[], total: count ?? 0 };
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Movimentações</h1>
        <p className="text-muted-foreground text-sm">
          Histórico de mudanças de destino dos produtos.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Registros</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-36"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              placeholder="Data início"
            />
            <span className="text-muted-foreground text-xs">até</span>
            <Input
              type="date"
              className="w-36"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              placeholder="Data fim"
            />
            {(dataInicio || dataFim) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDataInicio("");
                  setDataFim("");
                }}
              >
                Limpar
              </Button>
            )}
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os destinos</SelectItem>
                {DESTINOS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <p className="text-sm text-destructive py-6 text-center">
              Erro ao carregar movimentações.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma movimentação encontrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Código ML</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Preço de Venda</TableHead>
                  <TableHead>Data/Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.lotes?.numero ? `Lote ${m.lotes.numero}` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.codigo_ml ?? "—"}
                    </TableCell>
                    <TableCell>{m.destino ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {moeda(Number(m.preco_venda ?? 0))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(m.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0 || query.isLoading}
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
                disabled={page + 1 >= totalPages || query.isLoading}
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
