import JsBarcode from "jsbarcode";
import { getDefaultTemplate, loadTemplatesFromDb, type LabelTemplate } from "@/lib/labelTemplates";

const MM_TO_PX = 3.7795275591;

interface PrintableLabelItem {
  product_name?: string | null;
  product_code?: string | null;
  barcode?: string | null;
  price?: string | null;
  price_de?: string | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getVerticalJustify(value?: "top" | "center" | "bottom") {
  if (value === "center") return "center";
  if (value === "bottom") return "flex-end";
  return "flex-start";
}

function buildBarcodeSvg(value: string, widthMm: number, heightMm: number) {
  if (!value.trim()) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      background: "transparent",
      width: 2,
      height: Math.max(20, Math.round(heightMm * MM_TO_PX)),
    });
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = `${widthMm}mm`;
    svg.style.height = `${heightMm}mm`;
    svg.style.display = "block";
    return svg.outerHTML;
  } catch {
    return "";
  }
}

export async function loadDefaultPrintTemplate() {
  const base = {
    ...getDefaultTemplate(),
    id: "default-40x25-1col",
    name: "40×25mm 1 Coluna",
    labelWidth: 40,
    labelHeight: 25,
    columns: 1,
  };
  try {
    const templates = await loadTemplatesFromDb();
    const found = templates.find((t) => t.id === "default-40x25-1col");
    return found
      ? { ...found, id: "default-40x25-1col", name: "40×25mm 1 Coluna", labelWidth: 40, labelHeight: 25, columns: 1 }
      : base;
  } catch {
    return base;
  }
}

export function buildTemplatePrintHtml(item: PrintableLabelItem, template: LabelTemplate) {
  const priceText = item.price?.trim()
    ? item.price.startsWith("R$")
      ? item.price
      : `R$ ${item.price}`
    : template.priceText || "";
  const productText = item.product_name || template.productText || "";
  const codeText = item.product_code || template.codeText || "";
  const barcodeText = item.barcode || item.product_code || template.barcodeText || "";
  const barcodeSvg = buildBarcodeSvg(barcodeText, template.barcodeWidth, template.barcodeHeight);

  const block = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fs: number,
    align: string,
    va: "top" | "center" | "bottom",
    bold: boolean,
    lines: number,
    oy: number,
  ) =>
    `<div style="position:absolute;left:${x}mm;top:${y + (oy || 0)}mm;width:${w}mm;height:${h}mm;display:flex;justify-content:${getVerticalJustify(va)};align-items:${align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"};font-size:${fs}pt;font-weight:${bold ? "700" : "400"};line-height:${(h / (lines || 1)).toFixed(2)}mm;overflow:hidden;"><span style="display:-webkit-box;-webkit-line-clamp:${lines || 1};-webkit-box-orient:vertical;overflow:hidden;text-align:${align};width:100%;">${escapeHtml(text)}</span></div>`;

  if (template.hasPromoPrice) {
    const priceDeRaw = item.price_de?.trim() || template.priceDeText || "";
    const priceDeText = priceDeRaw
      ? priceDeRaw.startsWith("R$")
        ? priceDeRaw
        : `R$ ${priceDeRaw}`
      : "";
    const dePos = template.priceDePos ?? { x: 15, y: 14 };
    const deWidth = template.priceDeWidth ?? 10;
    const deHeight = template.priceDeHeight ?? 7;
    const deFont = template.fontSizePriceDe ?? 5;
    const labelFont = Math.max(4, deFont - 1);
    const porFontSize = priceText.length > 8
      ? Math.max(7, template.fontSizePrice - 3)
      : priceText.length > 6
      ? Math.max(8, template.fontSizePrice - 2)
      : template.fontSizePrice;

    const deBlock = priceDeText
      ? `<div style="position:absolute;left:${dePos.x}mm;top:${dePos.y}mm;width:${deWidth}mm;height:${deHeight}mm;border:1px solid #000;padding:0.5mm;overflow:hidden;">
    <div style="font-size:${labelFont}pt;line-height:1.1;">DE</div>
    <div style="font-size:${deFont}pt;line-height:1.1;text-decoration:line-through;">${escapeHtml(priceDeText)}</div>
  </div>`
      : "";

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {
  size: ${template.labelHeight}mm ${template.labelWidth}mm;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: ${template.labelHeight}mm;
  height: ${template.labelWidth}mm;
}
* { box-sizing: border-box; }
.label-sheet {
  position: absolute;
  left: 0;
  top: -${template.labelWidth}mm;
  width: ${template.labelHeight}mm;
  height: ${template.labelWidth}mm;
  overflow: hidden;
  font-family: Arial, sans-serif;
  background: #fff;
  color: #000;
  transform: rotate(90deg);
  transform-origin: top left;
}
</style>
</head>
<body>
<div class="label-sheet">
  ${block(productText, template.productPos.x, template.productPos.y, template.productMaxWidth, template.productMaxHeight, template.fontSizeProduct, template.productAlign || "left", template.productVerticalAlign || "top", !!template.productBold, template.productMaxLines || 1, template.productOffsetY || 0)}
  ${deBlock}
  <div style="position:absolute;left:${template.pricePos.x}mm;top:${template.pricePos.y}mm;width:${template.priceWidth}mm;height:${template.priceHeight}mm;background:#000;color:#fff;padding:0.5mm;overflow:hidden;">
    <div style="font-size:${labelFont}pt;line-height:1.1;">POR</div>
    <div style="font-size:${porFontSize}pt;font-weight:700;line-height:1.15;">${escapeHtml(priceText)}</div>
  </div>
  <div style="position:absolute;left:${template.barcodePos.x}mm;top:${template.barcodePos.y}mm;width:${template.barcodeWidth}mm;height:${template.barcodeHeight}mm;overflow:hidden;">${barcodeSvg}</div>
  ${block(codeText, template.codePos.x, template.codePos.y, template.codeWidth, template.codeHeight, template.fontSizeCode, template.codeAlign || "center", template.codeVerticalAlign || "top", !!template.codeBold, template.codeMaxLines || 1, template.codeOffsetY || 0)}
</div>
</body>
</html>
`;
  }


  const cols = template.columns === 2 ? 2 : 1;
  const pageWidth = template.labelWidth * cols;

  const labelInner = `
<div class="barcode-box">${barcodeSvg}</div>
${block(productText, template.productPos.x, template.productPos.y, template.productMaxWidth, template.productMaxHeight, template.fontSizeProduct, template.productAlign || "left", template.productVerticalAlign || "top", !!template.productBold, template.productMaxLines || 1, template.productOffsetY || 0)}
${block(priceText, template.pricePos.x, template.pricePos.y, template.priceWidth, template.priceHeight, template.fontSizePrice, template.priceAlign || "left", template.priceVerticalAlign || "bottom", !!template.priceBold, template.priceMaxLines || 1, template.priceOffsetY || 0)}
${block(codeText, template.codePos.x, template.codePos.y, template.codeWidth, template.codeHeight, template.fontSizeCode, template.codeAlign || "right", template.codeVerticalAlign || "bottom", !!template.codeBold, template.codeMaxLines || 1, template.codeOffsetY || 0)}
`;

  const sheets = Array.from({ length: cols })
    .map(() => `<div class="label-sheet">${labelInner}</div>`)
    .join("");

  const body =
    cols === 2
      ? `<div class="label-row">${sheets}</div>`
      : sheets;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page{
  size:${pageWidth}mm ${template.labelHeight}mm;
  margin:0;
}

html,body{
  margin:0;
  padding:0;
  width:${pageWidth}mm;
  height:${template.labelHeight}mm;
}

*{
  box-sizing:border-box;
}

.label-row{
  display:flex;
  flex-direction:row;
  width:${pageWidth}mm;
  height:${template.labelHeight}mm;
}

.label-sheet{
  position:relative;
  width:${template.labelWidth}mm;
  height:${template.labelHeight}mm;
  overflow:hidden;
  font-family:Arial,sans-serif;
  flex:0 0 ${template.labelWidth}mm;
}
.barcode-box{
  position:absolute;
  left:${template.barcodePos.x}mm;
  top:${template.barcodePos.y}mm;
  width:${template.barcodeWidth}mm;
  height:${template.barcodeHeight}mm;
  }
  
</style>
</head>

<body>
${body}
</body>
</html>

`;
}
