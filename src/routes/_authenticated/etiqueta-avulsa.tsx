import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plug, CheckCircle2, XCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabelBarcode } from "@/components/LabelBarcode";
import {
  getDefaultTemplate,
  getActiveTemplateId,
  setActiveTemplateId,
  loadTemplatesFromDb,
  type LabelTemplate,
} from "@/lib/labelTemplates";
import { buildTemplatePrintHtml } from "@/lib/labelPrintHtml";
import {
  connectQz,
  silentPrintHtml,
  listPrinters,
  getDefaultPrinterName,
  setPreferredPrinter,
  getSelectedPrinter,
  isQzAvailable,
} from "@/lib/qzTrayPrint";

export const Route = createFileRoute("/_authenticated/etiqueta-avulsa")({
  component: EtiquetaAvulsaPage,
});

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function EtiquetaAvulsaPage() {
  const [nome, setNome] = useState("");
  const [sku, setSku] = useState("");
  const [grade, setGrade] = useState("");
  const [preco, setPreco] = useState("");
  const [copies, setCopies] = useState(1);

  const [qzReady, setQzReady] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>(() => getActiveTemplateId());
  const [precoDe, setPrecoDe] = useState("");
  const [printing, setPrinting] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["label-templates"],
    queryFn: loadTemplatesFromDb,
  });

  useEffect(() => {
    if (templatesQuery.error) {
      toast.error("Falha ao carregar modelos de etiqueta");
    }
  }, [templatesQuery.error]);

  const templates: LabelTemplate[] = templatesQuery.data ?? [];
  const template: LabelTemplate = templates.find((t) => t.id === templateId) ?? getDefaultTemplate();

  useEffect(() => {
    if (isQzAvailable()) {
      setQzReady(true);
      void refreshPrinters();
    }
  }, []);

  async function refreshPrinters() {
    try {
      const list = await listPrinters();
      setPrinters(list);
      const current = getSelectedPrinter();
      if (current && list.includes(current)) {
        setPrinter(current);
      } else {
        const def = await getDefaultPrinterName();
        const chosen = def && list.includes(def) ? def : list[0] || "";
        setPrinter(chosen);
        setPreferredPrinter(chosen || null);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async function handleConnectQz() {
    setQzConnecting(true);
    try {
      await connectQz();
      setQzReady(true);
      await refreshPrinters();
      toast.success("QZ Tray conectado");
    } catch (e) {
      setQzReady(false);
      toast.error(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setQzConnecting(false);
    }
  }

  const precoNum = Number(preco.replace(",", "."));
  const canPrint =
    qzReady &&
    !!template &&
    nome.trim().length > 0 &&
    nome.length <= 120 &&
    preco.trim().length > 0 &&
    !Number.isNaN(precoNum);

  async function handlePrint() {
    if (!canPrint) return;
    setPrinting(true);
    try {
      const precoDeNum = Number(precoDe.replace(",", "."));
      const html = buildTemplatePrintHtml(
        {
          product_name: nome,
          barcode: sku,
          price: BRL(precoNum),
          price_de: template.hasPromoPrice && precoDe.trim() && !Number.isNaN(precoDeNum) ? BRL(precoDeNum) : null,
          product_code: grade,
        },
        template,
      );
      const qty = Math.min(50, Math.max(1, Math.floor(copies)));
      await silentPrintHtml(
        html,
        template.hasPromoPrice ? template.labelHeight : template.labelWidth,
        template.hasPromoPrice ? template.labelWidth : template.labelHeight,
        printer || undefined,
        qty,
      );
      toast.success(`Enviado ${qty} etiqueta(s) para impressão`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao imprimir");
    } finally {
      setPrinting(false);
    }
  }

  const previewScale = 3;
  const previewPrice = preco.trim() ? (Number.isNaN(precoNum) ? preco : BRL(precoNum)) : "";
  const precoDeNumPreview = Number(precoDe.replace(",", "."));
  const previewPriceDe = precoDe.trim() ? (Number.isNaN(precoDeNumPreview) ? precoDe : BRL(precoDeNumPreview)) : "";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerador de Etiquetas</h1>
        <p className="text-muted-foreground text-sm">Crie e imprima etiquetas avulsas sem salvar no banco</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da Etiqueta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Modelo de Etiqueta</Label>
              <Select
                value={templateId}
                onValueChange={(v) => {
                  setTemplateId(v);
                  setActiveTemplateId(v);
                }}
                disabled={templatesQuery.isLoading || templates.length === 0}
              >
                <SelectTrigger id="template">
                  {templatesQuery.isLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando modelos...
                    </span>
                  ) : (
                    <SelectValue placeholder="Selecione um modelo" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="nome">Nome</Label>
                <span className={`text-xs ${nome.length > 120 ? "text-destructive" : "text-muted-foreground"}`}>
                  {nome.length}/120
                </span>
              </div>
              <Textarea
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value.slice(0, 120))}
                maxLength={120}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU / Código</Label>
                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
                {(() => {
                  const skuHasInvalidChars = /[À-ÖØ-öø-ÿÇç]/.test(sku);
                  return skuHasInvalidChars ? (
                    <p className="text-xs text-destructive mt-1">
                      ⚠️ SKU contém acentos ou Ç — o código de barras não será gerado corretamente. Use apenas letras
                      sem acento e números.
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">Grade</Label>
                <Input id="grade" value={grade} onChange={(e) => setGrade(e.target.value.slice(0, 10))} />
                <span className="text-xs text-muted-foreground text-right block">{grade.length}/10</span>
                {(() => {
                  const gradeHasInvalidChars = /[À-ÖØ-öø-ÿÇç]/.test(grade);
                  return gradeHasInvalidChars ? (
                    <p className="text-xs text-destructive mt-1">
                      ⚠️ Grade contém acentos ou Ç — não será impressa corretamente.
                    </p>
                  ) : null;
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="preco">Preço</Label>
                <Input
                  id="preco"
                  inputMode="decimal"
                  value={preco}
                  onChange={(e) => {
                    const val = e.target.value;
                    const beforeDecimal = val.split(",")[0]?.replace(/[^0-9]/g, "") ?? "";
                    if (beforeDecimal.length <= 5) setPreco(val);
                  }}
                  onBlur={() => {
                    const n = Number(preco.replace(",", "."));
                    if (!Number.isNaN(n) && preco.trim()) setPreco(n.toFixed(2));
                  }}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="copies">Quantidade de cópias</Label>
                <Input
                  id="copies"
                  type="number"
                  min={1}
                  max={50}
                  value={copies}
                  onChange={(e) => setCopies(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
            </div>

            {template.hasPromoPrice && (
              <div className="space-y-2">
                <Label htmlFor="preco-de">Preço DE (original)</Label>
                <Input
                  id="preco-de"
                  inputMode="decimal"
                  value={precoDe}
                  onChange={(e) => {
                    const val = e.target.value;
                    const beforeDecimal = val.split(",")[0]?.replace(/[^0-9]/g, "") ?? "";
                    if (beforeDecimal.length <= 5) setPrecoDe(val);
                  }}
                  onBlur={() => {
                    const n = Number(precoDe.replace(",", "."));
                    if (!Number.isNaN(n) && precoDe.trim()) setPrecoDe(n.toFixed(2));
                  }}
                  placeholder="0,00"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 bg-muted/30">
              <Button size="sm" variant="outline" onClick={handleConnectQz} disabled={qzConnecting}>
                {qzConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                {qzReady ? "Reconectar" : "Conectar"} QZ Tray
              </Button>
              <div className="flex items-center gap-1 text-sm">
                {qzReady ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-700">Conectado</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Desconectado</span>
                  </>
                )}
              </div>
              <div className="ml-auto min-w-[200px]">
                <Select
                  value={printer}
                  onValueChange={(v) => {
                    setPrinter(v);
                    setPreferredPrinter(v);
                  }}
                  disabled={!qzReady || printers.length === 0}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Selecionar impressora" />
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

            <Button onClick={handlePrint} disabled={!canPrint || printing} className="w-full">
              {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              Imprimir Etiqueta
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center p-4 bg-muted/30 rounded-md">
              <LabelPreview
                template={template}
                nome={nome}
                sku={sku}
                grade={grade}
                preco={previewPrice}
                precoDe={previewPriceDe}
                scale={previewScale}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {template.hasPromoPrice
                ? `${template.labelHeight}×${template.labelWidth}mm (promocional) · escala ${previewScale}x`
                : template.columns === 2
                  ? `${template.labelWidth * 2}×${template.labelHeight}mm (2 colunas) · escala ${previewScale}x`
                  : `${template.labelWidth}×${template.labelHeight}mm · escala ${previewScale}x`}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LabelPreview({
  template,
  nome,
  sku,
  grade,
  preco,
  precoDe = "",
  scale,
}: {
  template: ReturnType<typeof getDefaultTemplate>;
  nome: string;
  sku: string;
  grade: string;
  preco: string;
  precoDe?: string;
  scale: number;
}) {
  const mm = (n: number) => `${n * scale}mm`;
  const va = (v?: "top" | "center" | "bottom") =>
    v === "center" ? "center" : v === "bottom" ? "flex-end" : "flex-start";
  const ha = (a?: "left" | "center" | "right") =>
    a === "center" ? "center" : a === "right" ? "flex-end" : "flex-start";

  const block = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fs: number,
    align: "left" | "center" | "right" | undefined,
    vAlign: "top" | "center" | "bottom" | undefined,
    bold: boolean | undefined,
    lines: number,
    oy: number,
  ) => (
    <div
      style={{
        position: "absolute",
        left: mm(x),
        top: mm(y + (oy || 0)),
        width: mm(w),
        height: mm(h),
        display: "flex",
        justifyContent: va(vAlign),
        alignItems: ha(align),
        fontSize: `${fs * scale}pt`,
        fontWeight: bold ? 700 : 400,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "-webkit-box",
          WebkitLineClamp: lines || 1,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textAlign: align || "left",
          width: "100%",
          lineHeight: 1.1,
        }}
      >
        {text}
      </span>
    </div>
  );

  if (template.hasPromoPrice) {
    return (
      <div
        style={{
          position: "relative",
          width: mm(template.labelHeight),
          height: mm(template.labelWidth),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: mm(template.labelHeight),
            height: mm(template.labelWidth),
            background: "#fff",
            color: "#000",
            fontFamily: "Arial, sans-serif",
            border: "1px dashed hsl(var(--border))",
            overflow: "hidden",
            transform: "rotate(90deg)",
            transformOrigin: "center center",
          }}
        >
          {block(
            nome || template.productText || "",
            template.productPos.x,
            template.productPos.y,
            template.productMaxWidth,
            template.productMaxHeight,
            template.fontSizeProduct,
            template.productAlign,
            template.productVerticalAlign,
            template.productBold,
            template.productMaxLines || 1,
            template.productOffsetY || 0,
          )}

          {(precoDe || template.priceDeText) && (
            <div
              style={{
                position: "absolute",
                left: mm(template.priceDePos?.x ?? 15),
                top: mm(template.priceDePos?.y ?? 14),
                width: mm(template.priceDeWidth ?? 10),
                height: mm(template.priceDeHeight ?? 7),
                border: "1px solid #000",
                padding: mm(0.5),
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: `${Math.max(4, (template.fontSizePriceDe ?? 5) - 1) * scale}pt`, fontWeight: 700 }}>
                DE
              </div>
              <div
                style={{
                  fontSize: `${(template.fontSizePriceDe ?? 5) * scale}pt`,
                  textDecoration: "line-through",
                  color: "#555",
                }}
              >
                {precoDe || template.priceDeText || "R$0,00"}
              </div>
            </div>
          )}

          <div
            style={{
              position: "absolute",
              left: mm(template.pricePos.x),
              top: mm(template.pricePos.y),
              width: mm(template.priceWidth),
              height: mm(template.priceHeight),
              background: "#000",
              color: "#fff",
              padding: mm(0.5),
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: `${Math.max(4, (template.fontSizePriceDe ?? 5) - 1) * scale}pt`, fontWeight: 700 }}>
              POR
            </div>
            <div
              style={{
                fontSize: `${template.fontSizePrice * scale}pt`,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {preco || template.priceText || "R$0,00"}
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: mm(template.barcodePos.x),
              top: mm(template.barcodePos.y),
              width: mm(template.barcodeWidth),
              height: mm(template.barcodeHeight),
              overflow: "hidden",
            }}
          >
            <LabelBarcode
              value={sku || template.barcodeText || ""}
              width={template.barcodeWidth * scale}
              height={template.barcodeHeight * scale}
            />
          </div>

          {block(
            grade || template.codeText || "",
            template.codePos.x,
            template.codePos.y,
            template.codeWidth,
            template.codeHeight,
            template.fontSizeCode,
            template.codeAlign,
            template.codeVerticalAlign,
            template.codeBold,
            template.codeMaxLines || 1,
            template.codeOffsetY || 0,
          )}
        </div>
      </div>
    );
  }

  if (template.columns === 2) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: mm(template.labelWidth * 2),
          height: mm(template.labelHeight),
          background: "#fff",
          border: "1px dashed hsl(var(--border))",
          overflow: "hidden",
          fontFamily: "Arial, sans-serif",
          color: "#000",
        }}
      >
        {[0, 1].map((col) => (
          <div
            key={col}
            style={{
              position: "relative",
              width: mm(template.labelWidth),
              height: mm(template.labelHeight),
              borderRight: col === 0 ? "1px dashed #ccc" : "none",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: mm(template.barcodePos.x),
                top: mm(template.barcodePos.y),
                width: mm(template.barcodeWidth),
                height: mm(template.barcodeHeight),
                overflow: "hidden",
              }}
            >
              <LabelBarcode
                value={sku || template.barcodeText || ""}
                width={template.barcodeWidth * scale}
                height={template.barcodeHeight * scale}
              />
            </div>
            {block(
              nome || template.productText || "",
              template.productPos.x,
              template.productPos.y,
              template.productMaxWidth,
              template.productMaxHeight,
              template.fontSizeProduct,
              template.productAlign,
              template.productVerticalAlign,
              template.productBold,
              template.productMaxLines || 1,
              template.productOffsetY || 0,
            )}
            {block(
              preco || template.priceText || "",
              template.pricePos.x,
              template.pricePos.y,
              template.priceWidth,
              template.priceHeight,
              template.fontSizePrice,
              template.priceAlign,
              template.priceVerticalAlign,
              template.priceBold,
              template.priceMaxLines || 1,
              template.priceOffsetY || 0,
            )}
            {block(
              grade || template.codeText || "",
              template.codePos.x,
              template.codePos.y,
              template.codeWidth,
              template.codeHeight,
              template.fontSizeCode,
              template.codeAlign,
              template.codeVerticalAlign,
              template.codeBold,
              template.codeMaxLines || 1,
              template.codeOffsetY || 0,
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: mm(template.labelWidth),
        height: mm(template.labelHeight),
        background: "#fff",
        color: "#000",
        fontFamily: "Arial, sans-serif",
        border: "1px dashed hsl(var(--border))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: mm(template.barcodePos.x),
          top: mm(template.barcodePos.y),
          width: mm(template.barcodeWidth),
          height: mm(template.barcodeHeight),
          overflow: "hidden",
        }}
      >
        <LabelBarcode
          value={sku || template.barcodeText || ""}
          width={template.barcodeWidth * scale}
          height={template.barcodeHeight * scale}
        />
      </div>
      {block(
        nome || template.productText || "",
        template.productPos.x,
        template.productPos.y,
        template.productMaxWidth,
        template.productMaxHeight,
        template.fontSizeProduct,
        template.productAlign,
        template.productVerticalAlign,
        template.productBold,
        template.productMaxLines || 1,
        template.productOffsetY || 0,
      )}
      {block(
        preco || template.priceText || "",
        template.pricePos.x,
        template.pricePos.y,
        template.priceWidth,
        template.priceHeight,
        template.fontSizePrice,
        template.priceAlign,
        template.priceVerticalAlign,
        template.priceBold,
        template.priceMaxLines || 1,
        template.priceOffsetY || 0,
      )}
      {block(
        grade || template.codeText || "",
        template.codePos.x,
        template.codePos.y,
        template.codeWidth,
        template.codeHeight,
        template.fontSizeCode,
        template.codeAlign,
        template.codeVerticalAlign,
        template.codeBold,
        template.codeMaxLines || 1,
        template.codeOffsetY || 0,
      )}
    </div>
  );
}
