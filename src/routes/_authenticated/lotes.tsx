import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { excluirLote } from "@/lib/produtos.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/lotes")({
  component: LotesPage,
  head: () => ({ meta: [{ title: "Lotes — Painel ML" }] }),
});

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function LotesPage() {
  const qc = useQueryClient();
  const remover = useServerFn(excluirLote);
  const [excluindo, setExcluindo] = useState<{ id: string; numero: string } | null>(
    null,
  );

  const { data: lotes = [], isLoading } = useQuery({
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

  const m = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => {
      toast.success("Lote excluído");
      setExcluindo(null);
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lotes</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de planilhas importadas
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Lote</th>
                  <th className="text-left px-4 py-3">Arquivo</th>
                  <th className="text-left px-4 py-3">Importado em</th>
                  <th className="text-right px-4 py-3">Produtos</th>
                  <th className="text-right px-4 py-3">Unidades</th>
                  <th className="text-right px-4 py-3">Valor Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : lotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      Nenhum lote importado ainda.
                    </td>
                  </tr>
                ) : (
                  lotes.map((l) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="px-4 py-3 font-medium">Lote {l.numero}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {l.nome_arquivo ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(l.importado_em).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right">{l.total_produtos}</td>
                      <td className="px-4 py-3 text-right">{l.total_unidades}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {moeda(Number(l.valor_total))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setExcluindo({ id: l.id, numero: l.numero })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lote {excluindo?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os produtos deste lote serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluindo && m.mutate(excluindo.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
