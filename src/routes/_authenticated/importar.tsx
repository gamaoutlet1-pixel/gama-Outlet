import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { importarLote, verificarLoteExiste } from "@/lib/produtos.functions";
import { parsePlanilha, extrairNumeroLote, LinhaProduto, ResultadoParse } from "@/lib/parse-planilha";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/importar")({
  component: ImportarPage,
  head: () => ({ meta: [{ title: "Importar Planilha — Painel ML" }] }),
});

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ImportarPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const importar = useServerFn(importarLote);
  const verificar = useServerFn(verificarLoteExiste);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  // Etapa 2 state
  const [previewData, setPreviewData] = useState<{
    file: File;
    numero: string;
    resultado: ResultadoParse;
  } | null>(null);

  const [ultimoImport, setUltimoImport] = useState<{
    numero: string;
    total: number;
  } | null>(null);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .order("importado_em", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  async function handleFile(file: File) {
    try {
      setImportando(true);
      setUltimoImport(null);
      setPreviewData(null);

      const resultado = await parsePlanilha(file);
      
      if (!resultado.cabecalhoEncontrado) {
        toast.error("Não foi possível identificar as colunas (Descrição, Valores). Verifique a planilha.");
        return;
      }
      
      if (resultado.linhas.length === 0) {
        toast.error("Nenhum produto encontrado na planilha.");
        return;
      }

      let numero = extrairNumeroLote(file.name) || "";
      
      setPreviewData({
        file,
        numero,
        resultado,
      });

    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao processar arquivo localmente");
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmarImportacao() {
    if (!previewData) return;
    const { file, numero, resultado } = previewData;

    if (!numero.trim()) {
      toast.error("Informe o número do lote.");
      return;
    }

    try {
      setImportando(true);
      const { existe } = await verificar({ data: { numero } });
      let substituir = false;
      
      if (existe) {
        const ok = window.confirm(
          `Já existe um lote ${numero}. Deseja substituí-lo? Cancelar mantém o anterior e não importa.`,
        );
        if (!ok) return;
        substituir = true;
      }

      const r = await importar({
        data: {
          numero,
          nome_arquivo: file.name,
          produtos: resultado.linhas,
          substituir,
        },
      });

      toast.success(`${r.total} produto(s) importado(s) no lote ${numero}`);
      setUltimoImport({ numero, total: r.total });
      setPreviewData(null);
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Importar Planilha</h1>
        <p className="text-sm text-muted-foreground">
          Envie sua planilha de lote (Excel ou CSV) para adicionar os produtos ao catálogo
        </p>
      </div>

      {!previewData ? (
        // Etapa 1: Upload
        <Card>
          <CardContent className="p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => !importando && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/30"
              } ${importando ? "opacity-60 pointer-events-none" : ""}`}
            >
              <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center mb-4">
                <Upload className="h-7 w-7" />
              </div>
              <div className="text-lg font-medium mb-1">
                {importando
                  ? "Processando arquivo..."
                  : "Arraste a planilha aqui ou clique para selecionar"}
              </div>
              <p className="text-sm text-muted-foreground">
                Formatos aceitos: .xlsx, .xls, .csv
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Dica: nomeie o arquivo como{" "}
                <span className="font-mono text-foreground">Lote 1292.xlsx</span>{" "}
                para detectar o número automaticamente.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                disabled={importando}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4" />
                Selecionar arquivo
              </Button>
            </div>

            {ultimoImport && (
              <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-accent/30 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div className="text-sm">
                    <div className="font-medium">
                      Lote {ultimoImport.numero} importado
                    </div>
                    <div className="text-muted-foreground">
                      {ultimoImport.total} produto(s) adicionados
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate({ to: "/catalogo" })}>
                  Ver no catálogo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Etapa 2: Preview e Confirmação
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="bg-primary/5 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle>Revisão do Lote: {previewData.file.name}</CardTitle>
            </div>
            <CardDescription>
              Valide os totais extraídos antes de confirmar a importação
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="col-span-1 md:col-span-4">
                <Label htmlFor="loteNum">Número do Lote</Label>
                <Input
                  id="loteNum"
                  value={previewData.numero}
                  onChange={(e) =>
                    setPreviewData({ ...previewData, numero: e.target.value })
                  }
                  className="w-full max-w-[200px] font-bold text-lg h-10 mt-1"
                  placeholder="Ex: 1262"
                />
              </div>

              <div className="bg-secondary p-4 rounded-md border border-border">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Total de Produtos</div>
                <div className="text-2xl font-bold">{previewData.resultado.total_produtos}</div>
              </div>
              <div className="bg-secondary p-4 rounded-md border border-border">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Total de Unidades</div>
                <div className="text-2xl font-bold">{previewData.resultado.total_unidades}</div>
              </div>
              <div className="bg-secondary p-4 rounded-md border border-border md:col-span-2">
                <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Valor Total</div>
                <div className="text-2xl font-bold text-primary">{moeda(previewData.resultado.valor_total)}</div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Amostra dos Dados (Primeiras 3 linhas)</h3>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Descrição</th>
                      <th className="py-2 px-3">Qtd</th>
                      <th className="py-2 px-3">V. Unit</th>
                      <th className="py-2 px-3">V. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.resultado.linhas.slice(0, 3).map((l, i) => (
                      <tr key={i} className="bg-card">
                        <td className="py-2 px-3 text-muted-foreground">{l.codigo_rz || l.codigo_ml || "-"}</td>
                        <td className="py-2 px-3 font-medium truncate max-w-[200px]">{l.descricao}</td>
                        <td className="py-2 px-3">{l.quantidade}</td>
                        <td className="py-2 px-3">{moeda(l.valor_unit)}</td>
                        <td className="py-2 px-3">{moeda(l.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => setPreviewData(null)}
                disabled={importando}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarImportacao}
                disabled={importando || !previewData.numero.trim()}
                className="gap-2"
                size="lg"
              >
                {importando ? "Salvando..." : "Confirmar Importação"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!previewData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colunas esperadas</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>A planilha deve conter (nomes flexíveis):</p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                <li>• Código ML</li>
                <li>• Código RZ</li>
                <li>• Descrição / Produto / Item</li>
                <li>• Valor Unit. / Preço</li>
                <li>• Quantidade / Qtd</li>
                <li>• Valor Total</li>
                <li>• Condição (Grade)</li>
                <li>• Categoria</li>
                <li>• Subcategoria</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Últimos lotes importados</CardTitle>
              <Link to="/lotes" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            </CardHeader>
            <CardContent>
              {lotes.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 opacity-50" />
                  Nenhum lote importado ainda.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-2">Lote</th>
                        <th className="text-left py-2 px-2">Arquivo</th>
                        <th className="text-left py-2 px-2">Data</th>
                        <th className="text-right py-2 px-2">Produtos</th>
                        <th className="text-right py-2 px-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotes.map((l) => (
                        <tr key={l.id} className="border-b border-border/40">
                          <td className="py-2 px-2 font-medium">Lote {l.numero}</td>
                          <td className="py-2 px-2 text-muted-foreground">
                            {l.nome_arquivo ?? "—"}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">
                            {new Date(l.importado_em).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2 px-2 text-right">{l.total_produtos}</td>
                          <td className="py-2 px-2 text-right">
                            {moeda(Number(l.valor_total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
