# Novo modelo "40×40mm Promocional DE/POR"

Adiciona um quarto modelo de etiqueta com layout rotacionado (paisagem) exibindo dois preços: o preço original ("DE", riscado) e o preço promocional ("POR", destacado).

## O que muda para o usuário

- Novo modelo **40×40mm Promocional DE/POR** na lista de modelos, disponível tanto no **Gerador de Etiquetas** quanto no diálogo de edição da **Gestão de Preços**.
- Layout rotacionado: código de barras vertical à direita, nome do produto à esquerda, e no centro os blocos "DE" (riscado) e "POR" (negrito, maior).
- No **Gerador de Etiquetas**, ao escolher esse modelo aparece um campo extra **"Preço DE (original)"**, e o preview mostra os dois preços.
- Na **Gestão de Preços**, nenhum campo novo: o preço "DE" vem automaticamente do `valor_unit` do produto e o "POR" do `preco_venda`.

## Detalhes técnicos

### 1. `src/lib/labelTemplates.ts`
- Ampliar `LabelTemplate` com campos opcionais: `hasPromoPrice`, `priceDeText`, `priceDePos`, `priceDeWidth`, `priceDeHeight`, `fontSizePriceDe`.
- Adicionar em `getDefaultTemplates()` o template `default-40x40-promo` com exatamente as dimensões, posições, fontes e alinhamentos da especificação (barcode 8×38mm em x:26; nome x:1 largura 14mm, 5 linhas; POR em x:15,y:22; DE em x:15,y:14; código em x:35).
- Nenhuma outra função alterada; `loadTemplatesFromDb` continua sobrepondo defaults com registros do banco.

### 2. `src/lib/labelPrintHtml.ts`
- Adicionar `price_de?: string | null` a `PrintableLabelItem`.
- Em `buildTemplatePrintHtml`, quando `template.hasPromoPrice === true`:
  - `@page size: ${labelHeight}mm ${labelWidth}mm` e `html,body` com essas dimensões (página em paisagem).
  - `.label-sheet` com `transform: rotate(90deg); transform-origin: top left; position:absolute; left:0; top:-${labelWidth}mm;` e tamanho `labelHeight × labelWidth`.
  - Bloco "DE": rótulo pequeno "DE" + valor com `text-decoration: line-through`, usando `priceDePos/priceDeWidth/priceDeHeight/fontSizePriceDe`; omitido quando não há `price_de`.
  - Bloco "POR": rótulo pequeno "POR" acima do preço principal em negrito (`fontSizePrice`).
- Templates sem `hasPromoPrice` mantêm exatamente o HTML atual (1 e 2 colunas inalterados).

### 3. `src/routes/_authenticated/etiqueta-avulsa.tsx`
- Novo estado `precoDe` (string).
- Campo "Preço DE (original)" renderizado apenas quando `template.hasPromoPrice`, logo abaixo do campo Preço.
- Ao imprimir, passar `price_de: precoDe.trim() ? BRL(Number(precoDe.replace(",", "."))) : null` para `buildTemplatePrintHtml`.
- `LabelPreview` ganha um ramo para `hasPromoPrice`: renderiza a célula em proporção paisagem com barcode vertical, nome à esquerda e blocos DE (riscado) / POR, e o texto de dimensões passa a mostrar `${labelHeight}×${labelWidth}mm (promocional)`.
- Validação de impressão permanece a mesma (o "DE" é opcional).

### 4. `src/routes/_authenticated/precos.tsx`
- No `EditDialog`, na chamada existente de `buildTemplatePrintHtml`, incluir `price_de: produto?.valor_unit ? moeda(Number(produto.valor_unit)) : null`.
- Sem novos campos de UI; a impressão fora do diálogo permanece inalterada.

### Diretrizes seguidas
- TypeScript estrito, componentes funcionais, TanStack Query já existente para carregar templates, feedback via `sonner`, UI em português e código em inglês.
- Sem mudanças em banco, RLS ou lógica de negócio.