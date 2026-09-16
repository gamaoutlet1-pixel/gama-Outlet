import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Package,
  Layers,
  DollarSign,
  Boxes,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Dashboard — Painel ML" }],
  }),
});

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CORES_GRADE: Record<string, string> = {
  A: "hsl(160 70% 55%)",
  B: "hsl(250 70% 65%)",
  C: "hsl(90 70% 60%)",
  D: "hsl(50 80% 60%)",
  E: "hsl(20 80% 60%)",
  F: "hsl(25 80% 55%)",
  UN: "hsl(250 5% 55%)",
};

function DashboardPage() {
  const [filtroLote, setFiltroLote] = useState<string>("__todos");
  const [filtroGrade, setFiltroGrade] = useState<string>("__todos");

  const lotesQuery = useQuery({
    queryKey: ["dashboard-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes")
        .select("*")
        .order("importado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const kpisQuery = useQuery({
    queryKey: ["dashboard-kpis", filtroLote, filtroGrade],
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("quantidade, valor_total, valor_unit, porcentagem_custo");
      if (filtroLote !== "__todos") q = q.eq("lote_id", filtroLote);
      if (filtroGrade !== "__todos") {
        if (filtroGrade === "UN") {
          q = q.or("grade.eq.U,grade.eq.UN");
        } else {
          q = q.eq("grade", filtroGrade);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const chartsQuery = useQuery({
    queryKey: ["dashboard-charts", filtroLote, filtroGrade],
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("grade, categoria, valor_total");
      if (filtroLote !== "__todos") q = q.eq("lote_id", filtroLote);
      if (filtroGrade !== "__todos") {
        if (filtroGrade === "UN") {
          q = q.or("grade.eq.U,grade.eq.UN");
        } else {
          q = q.eq("grade", filtroGrade);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading =
    lotesQuery.isLoading || kpisQuery.isLoading || chartsQuery.isLoading;

  const lotes = lotesQuery.data ?? [];
  const kpiRows = kpisQuery.data ?? [];
  const chartRows = chartsQuery.data ?? [];

  const totalProdutos = kpiRows.length;
  const totalUnidades = kpiRows.reduce((s, p) => s + (p.quantidade ?? 0), 0);
  const valorTotal = kpiRows.reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
  const custoTotal = kpiRows.reduce(
    (s, p) =>
      s +
      Number(p.valor_unit ?? 0) *
        Number(p.quantidade ?? 0) *
        (Number(p.porcentagem_custo ?? 0) / 100),
    0,
  );
  const margemBruta = valorTotal - custoTotal;
  const margemPct = valorTotal > 0 ? (margemBruta / valorTotal) * 100 : 0;
  const totalLotes = lotes.length;

  const porGrade = Object.entries(
    chartRows.reduce<Record<string, number>>((acc, p) => {
      const g = (p.grade ?? "UN").toUpperCase();
      const norm = g === "U" ? "UN" : g;
      acc[norm] = (acc[norm] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const porCategoria = Object.entries(
    chartRows.reduce<Record<string, number>>((acc, p) => {
      const c = p.categoria ?? "Sem categoria";
      acc[c] = (acc[c] ?? 0) + Number(p.valor_total ?? 0);
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do estoque e dos lotes importados
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <div className="w-full sm:w-64">
          <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
            Filtrar por lote
          </label>
          <Select value={filtroLote} onValueChange={setFiltroLote}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os lotes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todos os lotes</SelectItem>
              {lotes.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  Lote {l.numero}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
            Filtrar por grade
          </label>
          <Select value={filtroGrade} onValueChange={setFiltroGrade}>
            <SelectTrigger>
              <SelectValue placeholder="Todas as grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todas as grades</SelectItem>
              {["A", "B", "C", "D", "E", "F", "UN"].map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard icon={Boxes} label="Lotes" value={String(totalLotes)} />
        <KpiCard icon={Package} label="Produtos únicos" value={String(totalProdutos)} />
        <KpiCard icon={Layers} label="Unidades" value={String(totalUnidades)} />
        <KpiCard icon={DollarSign} label="Valor total" value={moeda(valorTotal)} />
        <KpiCard icon={TrendingDown} label="Custo total" value={moeda(custoTotal)} />
        <KpiCard
          icon={TrendingUp}
          label="Margem bruta estimada"
          value={`${moeda(margemBruta)} (${margemPct.toFixed(1)}%)`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Produtos por Grade</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {porGrade.length === 0 ? (
              <Vazio loading={isLoading} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porGrade}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label
                  >
                    {porGrade.map((e) => (
                      <Cell key={e.name} fill={CORES_GRADE[e.name] ?? CORES_GRADE.UN} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valor por Categoria (top 8)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {porCategoria.length === 0 ? (
              <Vazio loading={isLoading} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porCategoria}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" hide />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => [ moeda(v), "Valor"]}
                    contentStyle={{ backgroundColor: "#1a1f2e", border: "1px solid #00BCD4" }}
                    labelStyle={{ color: "#ffffff", fontWeight: 600 }}
                    itemStyle={{ color: "#00E676" }}
                  />
                  <Bar dataKey="value" fill="#00BCD4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lotes recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {lotes.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhum lote importado ainda.{" "}
              <Link to="/catalogo" className="text-primary underline">
                Importar agora
              </Link>
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
                    <th className="text-right py-2 px-2">Unidades</th>
                    <th className="text-right py-2 px-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.slice(0, 10).map((l) => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="py-2 px-2 font-medium">Lote {l.numero}</td>
                      <td className="py-2 px-2 text-muted-foreground">{l.nome_arquivo}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {new Date(l.importado_em).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 px-2 text-right">{l.total_produtos}</td>
                      <td className="py-2 px-2 text-right">{l.total_unidades}</td>
                      <td className="py-2 px-2 text-right">{moeda(Number(l.valor_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">
            {label}
          </div>
          <div className="text-xl font-bold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Vazio({ loading }: { loading: boolean }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      {loading ? "Carregando..." : "Sem dados ainda"}
    </div>
  );
}
