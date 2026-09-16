import { memo, useEffect, useRef } from "react";

import JsBarcode from "jsbarcode";

interface LabelBarcodeProps {

  value: string;

  width: number;

  height: number;

  scale?: number;

  className?: string;

}

export const LabelBarcode = memo(function LabelBarcode({ value, width, height, scale = 1, className }: LabelBarcodeProps) {

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {

    if (!svgRef.current || !value.trim()) return;

    try {

      const pxWidth = Math.max(80, width * 3.78 * scale);

      const pxHeight = Math.max(20, height * 3.78 * scale);

      JsBarcode(svgRef.current, value, { format: "CODE128", displayValue: false, margin: 0, background: "transparent", width: 2, height: pxHeight });

      svgRef.current.setAttribute("preserveAspectRatio", "none");

      svgRef.current.style.width = `${width}mm`;

      svgRef.current.style.height = `${height}mm`;

      svgRef.current.style.display = "block";

    } catch { svgRef.current.innerHTML = ""; }

  }, [height, scale, value, width]);

  if (!value.trim()) return null;

  return <svg ref={svgRef} className={className} style={{ width: `${width}mm`, height: `${height}mm`, display: "block" }} />;

});
