import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTinyApiKey = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "tiny_api_key")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { apiKey: (data?.valor ?? null) as string | null };
});

export const saveTinyApiKey = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ apiKey: z.string().min(1).max(512) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("configuracoes")
      .upsert(
        { chave: "tiny_api_key", valor: data.apiKey, updated_at: new Date().toISOString() },
        { onConflict: "chave" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type TinyResp = {
  retorno?: {
    status?: string;
    status_processamento?: string;
    registros?: Array<{
      registro?: {
        id?: string | number;
        erros?: Array<{ erro?: string }>;
      };
    }>;
    erros?: Array<{ erro?: string }>;
  };
};

function extractTinyError(json: TinyResp): string {
  const reg = json.retorno?.registros?.[0]?.registro;
  const regErr = reg?.erros?.[0]?.erro;
  if (regErr) return regErr;
  const globalErr = json.retorno?.erros?.[0]?.erro;
  if (globalErr) return globalErr;
  return "Erro desconhecido retornado pelo Tiny.";
}

export const enviarProdutoTiny = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ produtoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from("configuracoes")
      .select("valor")
      .eq("chave", "tiny_api_key")
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    const apiKey = cfg?.valor;
    if (!apiKey) throw new Error("API Key do Tiny não configurada.");

    const { data: produto, error: prodErr } = await supabaseAdmin
      .from("produtos")
      .select("id, codigo_ml, descricao, nome_etiqueta, preco_venda")
      .eq("id", data.produtoId)
      .single();
    if (prodErr || !produto) throw new Error(prodErr?.message ?? "Produto não encontrado.");

    const nome = (produto.nome_etiqueta?.trim() || produto.descricao || "").slice(0, 120);
    const codigo = produto.codigo_ml ?? "";
    if (!nome) throw new Error("Produto sem nome.");
    if (!codigo) throw new Error("Produto sem Código ML (SKU).");

    // Tiny espera vírgula como separador decimal
    const precoBR = Number(produto.preco_venda ?? 0).toFixed(2).replace(".", ",");

    const produtoPayload = {
      produtos: [
        {
          produto: {
            sequencia: 1,
            nome,
            codigo,
            unidade: "Pç",
            preco: precoBR,
            tipo: "P",
            situacao: "A",
            origem: "0",
          },
        },
      ],
    };

    const body = new URLSearchParams();
    body.set("token", apiKey);
    body.set("formato", "JSON");
    body.set("produto", JSON.stringify(produtoPayload));

    const res = await fetch("https://api.tiny.com.br/api2/produto.incluir.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const text = await res.text();
    let json: TinyResp;
    try {
      json = JSON.parse(text) as TinyResp;
    } catch {
      throw new Error(`Resposta inválida do Tiny: ${text.slice(0, 200)}`);
    }

    if (json.retorno?.status !== "OK") {
      throw new Error(extractTinyError(json));
    }

    // Success — Tiny v2 does not return the product ID on success
    const { error: updErr } = await supabaseAdmin
      .from("produtos")
      .update({ tiny_status: "enviado", tiny_id: null })
      .eq("id", data.produtoId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, tinyId: null };
  });
