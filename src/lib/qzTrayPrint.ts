import qz from "qz-tray";
import { setupQzSecurity } from "./qzTraySign";

let connected = false;
let selectedPrinter: string | null = null;
let connectPromise: Promise<void> | null = null;
let defaultPrinterName: string | null = null;
let securitySetup = false;

const QZ_CONNECT_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => { window.clearTimeout(timeoutId); resolve(value); })
      .catch((error) => { window.clearTimeout(timeoutId); reject(error); });
  });
}

function normalizeQzError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout/i.test(message)) return new Error("QZ Tray não respondeu. Abra o QZ Tray no PC e aceite o aviso de segurança/localhost se aparecer.");
  if (/refused|failed to fetch|closed|network|websocket/i.test(message)) return new Error("Não consegui falar com o QZ Tray no seu computador. Verifique se ele está aberto e não foi bloqueado pelo antivírus/firewall.");
  if (/certificate|signature|trust|verify|unsigned/i.test(message)) return new Error("O QZ Tray rejeitou a assinatura ou o certificado deste domínio. Reconecte para regenerar a assinatura e depois autorize marcando 'Lembrar esta decisão'.");
  return new Error(message || "Falha ao conectar com o QZ Tray.");
}

export async function connectQz(): Promise<void> {
  if (qz.websocket.isActive()) { connected = true; return; }
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      if (!securitySetup) {
        setupQzSecurity();
        securitySetup = true;
      }
      await withTimeout(qz.websocket.connect({ retries: 0, delay: 0 }), QZ_CONNECT_TIMEOUT_MS, "QZ Tray connection timeout");
      connected = qz.websocket.isActive();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (qz.websocket.isActive() || /already exists|open connection/i.test(message)) { connected = true; return; }
      connected = false;
      throw normalizeQzError(error);
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}

export async function getDefaultPrinterName(): Promise<string | null> {
  try {
    const name = await qz.printers.getDefault();
    defaultPrinterName = name || null;
    return defaultPrinterName;
  } catch {
    return null;
  }
}

export async function findPrinter(name?: string): Promise<string> {
  // Fast path: reuse cached printer when it matches the requested name (or no name was given)
  if (selectedPrinter) {
    if (!name || selectedPrinter.toLowerCase().includes(name.toLowerCase())) {
      return selectedPrinter;
    }
  }

  const printers = (await qz.printers.find()) as string[];
  if (!printers || printers.length === 0) throw new Error("Nenhuma impressora encontrada pelo QZ Tray.");

  if (name) {
    const match = printers.find((p) => p.toLowerCase().includes(name.toLowerCase()));
    if (match) { selectedPrinter = match; return match; }
  }

  // Try OS default
  try {
    const def = await qz.printers.getDefault();
    if (def) { selectedPrinter = def; defaultPrinterName = def; return def; }
  } catch {}

  selectedPrinter = printers[0];
  return selectedPrinter;
}

export function setPreferredPrinter(name: string | null) {
  if (selectedPrinter !== name) cachedConfig = null;
  selectedPrinter = name;
}
export function getSelectedPrinter(): string | null { return selectedPrinter; }
export function getDefaultPrinter(): string | null { return defaultPrinterName; }

export async function listPrinters(): Promise<string[]> {
  await connectQz();
  return (await qz.printers.find()) as string[];
}

// Cache the QZ config — recreating it per print causes extra signing/serialization work.
let cachedConfig: { printer: string; width: number; height: number; config: any } | null = null;

function getOrCreateConfig(printer: string, pageWidthMm: number, pageHeightMm: number) {
  if (
    cachedConfig &&
    cachedConfig.printer === printer &&
    cachedConfig.width === pageWidthMm &&
    cachedConfig.height === pageHeightMm
  ) {
    return cachedConfig.config;
  }

  const config = qz.configs.create(printer, {
    size: { width: pageWidthMm, height: pageHeightMm },
    units: "mm",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    rasterize: true,
    scaleContent: true,
    copies: 1,
    altFontRendering: true,
    colorType: "grayscale",
    interpolation: "nearest-neighbor",
  });

  cachedConfig = { printer, width: pageWidthMm, height: pageHeightMm, config };
  return config;
}

export async function silentPrintHtml(
  htmlContent: string,
  pageWidthMm: number,
  pageHeightMm: number,
  printerName?: string,
  copies: number = 1,
): Promise<void> {
  await connectQz();
  const printer = await findPrinter(printerName);
  const config = getOrCreateConfig(printer, pageWidthMm, pageHeightMm);

  const safeCopies = Math.max(1, Math.floor(copies));
  const item = {
    type: "pixel" as const,
    format: "html" as const,
    flavor: "plain",
    data: htmlContent,
  };

  // Send all copies in a single QZ.print call so the spooler can batch them
  const payload = safeCopies === 1 ? [item] : Array.from({ length: safeCopies }, () => item);
  await qz.print(config, payload);
}

export function buildLabelHtml(
  printAreaElement: HTMLElement,
  pageWidthMm: number,
  pageHeightMm: number
): string {
  const clone = printAreaElement.cloneNode(true) as HTMLElement;
  clone.style.display = "block";
  clone.style.position = "static";
  clone.style.left = "auto";
  const styles = Array.from(document.styleSheets)
    .map((sheet) => { try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; } })
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
${styles}
@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; padding: 0; }
html, body { margin: 0; padding: 0; width: ${pageWidthMm}mm; height: ${pageHeightMm}mm; overflow: hidden; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.print-area { display: block !important; width: ${pageWidthMm}mm !important; height: ${pageHeightMm}mm !important; overflow: hidden !important; }
.label-row { width: ${pageWidthMm}mm !important; height: ${pageHeightMm}mm !important; overflow: hidden !important; page-break-after: always; break-after: page; }
.label-row:last-child { page-break-after: avoid; break-after: avoid; }
.label-cell { overflow: hidden !important; }
</style></head><body>${clone.outerHTML}</body></html>`;
}

export function isQzAvailable(): boolean {
  return connected && qz.websocket.isActive();
}

export async function disconnectQz(): Promise<void> {
  connectPromise = null;
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
  connected = false;
  selectedPrinter = null;
  defaultPrinterName = null;
}


