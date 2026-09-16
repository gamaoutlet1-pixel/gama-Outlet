import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const linhaSchema = z.object({
  codigo_ml: z.string().nullable(),
  codigo_rz: z.string().nullable(),
  descricao: z.string().min(1),
  valor_unit: z.number(),
  quantidade: z.number(),
  valor_total: z.number(),
  grade: z.string().nullable(),
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable(),
});

export const importarLote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        numero: z.string().min(1),
        nome_arquivo: z.string().nullable(),
        produtos: z.array(linhaSchema).min(1),
        substituir: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Se substituir = true e já existe lote com o mesmo número, apaga
    if (data.substituir) {
      await supabaseAdmin.from("lotes").delete().eq("numero", data.numero);
    }

    const total_unidades = data.produtos.reduce((s, p) => s + p.quantidade, 0);
    const valor_total = data.produtos.reduce((s, p) => s + p.valor_total, 0);

    const { data: lote, error: err1 } = await supabaseAdmin
      .from("lotes")
      .insert({
        numero: data.numero,
        nome_arquivo: data.nome_arquivo,
        total_produtos: data.produtos.length,
        total_unidades,
        valor_total,
      })
      .select()
      .single();
    if (err1 || !lote) throw new Error(err1?.message ?? "Falha ao criar lote");

    const linhas = data.produtos.map((p) => ({
      ...p,
      grade: p.grade ? p.grade.trim().toUpperCase() : null,
      lote_id: lote.id,
    }));
    // Insere em batches de 500
    for (let i = 0; i < linhas.length; i += 500) {
      const batch = linhas.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("produtos").insert(batch);
      if (error) throw new Error(error.message);
    }
    return { lote_id: lote.id, total: data.produtos.length };
  });

export const verificarLoteExiste = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ numero: z.string() }).parse(i))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("lotes")
      .select("id")
      .eq("numero", data.numero)
      .maybeSingle();
    return { existe: !!row };
  });

export const atualizarProduto = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        descricao: z.string().min(1),
        codigo_ml: z.string().nullable(),
        codigo_rz: z.string().nullable(),
        valor_unit: z.number(),
        quantidade: z.number().int().min(1),
        grade: z.string().nullable(),
        categoria: z.string().nullable(),
        subcategoria: z.string().nullable(),
        porcentagem_custo: z.number().min(0).max(100),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const valor_total = data.valor_unit * data.quantidade;
    const grade = data.grade ? data.grade.trim().toUpperCase() : null;
    const { error } = await supabaseAdmin
      .from("produtos")
      .update({
        descricao: data.descricao,
        codigo_ml: data.codigo_ml,
        codigo_rz: data.codigo_rz,
        valor_unit: data.valor_unit,
        quantidade: data.quantidade,
        valor_total,
        grade,
        categoria: data.categoria,
        subcategoria: data.subcategoria,
        porcentagem_custo: data.porcentagem_custo,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recalcularLoteDoProduto(data.id);
    return { ok: true };
  });

export const excluirProduto = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: prod } = await supabaseAdmin
      .from("produtos")
      .select("lote_id")
      .eq("id", data.id)
      .single();
    const { error } = await supabaseAdmin.from("produtos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (prod?.lote_id) await recalcularLote(prod.lote_id);
    return { ok: true };
  });

export const excluirLote = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("lotes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function recalcularLoteDoProduto(produtoId: string) {
  const { data: prod } = await supabaseAdmin
    .from("produtos")
    .select("lote_id")
    .eq("id", produtoId)
    .single();
  if (prod?.lote_id) await recalcularLote(prod.lote_id);
}

async function recalcularLote(loteId: string) {
  // Paginar para evitar o limite de 1000 linhas do Supabase
  const pageSize = 1000;
  let from = 0;
  let total_produtos = 0;
  let total_unidades = 0;
  let valor_total = 0;
  while (true) {
    const { data: prods, error } = await supabaseAdmin
      .from("produtos")
      .select("quantidade, valor_total")
      .eq("lote_id", loteId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!prods || prods.length === 0) break;
    total_produtos += prods.length;
    total_unidades += prods.reduce((s, p) => s + (p.quantidade ?? 0), 0);
    valor_total += prods.reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
    if (prods.length < pageSize) break;
    from += pageSize;
  }
  await supabaseAdmin
    .from("lotes")
    .update({ total_produtos, total_unidades, valor_total })
    .eq("id", loteId);
}
