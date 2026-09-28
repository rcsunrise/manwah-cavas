import { TextLayer } from '../../src/types/detailCompositionSchema';

export interface TextLayoutAnalysis {
  fits: boolean;
  computedFontSize: number;
  wrappedLines: string[];
  overflowed: boolean;
  overflowReason?: string;
}

/**
 * Calculates line wrapping and text boundary fitting for Chinese / CJK characters.
 * Standard CJK character width is roughly equal to fontSize, while ASCII is ~0.55 * fontSize.
 */
export function calculateTextLayout(layer: TextLayer): TextLayoutAnalysis {
  const textContent = layer.text || (layer as any).content || "";
  const { width = 1940, height = 200, maxLines = 3, overflow = 'shrink' } = layer;
  let fontSize = layer.fontSize || 48;
  const minFontSize = Math.max(14, Math.round(fontSize * 0.5));

  function getCharWidth(char: string, currentFontSize: number): number {
    // Check CJK / Fullwidth ranges
    const code = char.charCodeAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0xff00 && code <= 0xffef) || // Fullwidth Form
      (code >= 0x3000 && code <= 0x303f)    // CJK Punctuation
    ) {
      return currentFontSize * 1.05;
    }
    return currentFontSize * 0.58;
  }

  function wrapText(txt: string, maxW: number, curFontSize: number): string[] {
    const lines: string[] = [];
    let currentLine = "";
    let currentLineWidth = 0;

    for (let i = 0; i < txt.length; i++) {
      const char = txt[i];
      if (char === '\n') {
        lines.push(currentLine);
        currentLine = "";
        currentLineWidth = 0;
        continue;
      }

      const w = getCharWidth(char, curFontSize);
      if (currentLineWidth + w > maxW && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
        currentLineWidth = w;
      } else {
        currentLine += char;
        currentLineWidth += w;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  // Auto-shrink font size loop
  const lineHeight = layer.lineHeight || 1.3;
  let lines = wrapText(textContent, width - 20, fontSize);
  let totalHeight = lines.length * (fontSize * lineHeight);

  if (overflow === "shrink") {
    while ((lines.length > maxLines || totalHeight > height) && fontSize > minFontSize) {
      fontSize -= 2;
      lines = wrapText(textContent, width - 20, fontSize);
      totalHeight = lines.length * (fontSize * lineHeight);
    }
  }

  const overflowed = lines.length > maxLines || totalHeight > height;
  let fits = !overflowed;

  if (overflowed && (overflow === "ellipsis" || overflow === "truncate")) {
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      if (overflow === "ellipsis") {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.length > 2 ? last.slice(0, -2) + "..." : "...";
      }
    }
    fits = true; // Handled via truncation/ellipsis
  }

  return {
    fits,
    computedFontSize: fontSize,
    wrappedLines: lines,
    overflowed,
    overflowReason: overflowed ? `Text exceeds ${maxLines} lines or height ${height}px` : undefined
  };
}

/**
 * Generates SVG text overlay elements for high-resolution 2100 x 2800 canvas composition.
 */
export function generateSvgTextOverlay(layers: TextLayer[], canvasWidth = 2100, canvasHeight = 2800): string {
  const textSvgs: string[] = [];

  for (const layer of layers) {
    const layout = calculateTextLayout(layer);
    const { computedFontSize, wrappedLines } = layout;
    const lineHeightPx = computedFontSize * layer.lineHeight;

    let textAnchor = "start";
    let xOffset = layer.x;
    if (layer.textAlign === "center") {
      textAnchor = "middle";
      xOffset = layer.x + layer.width / 2;
    } else if (layer.textAlign === "right") {
      textAnchor = "end";
      xOffset = layer.x + layer.width;
    }

    const tspanElements = wrappedLines.map((lineText, idx) => {
      const yPos = layer.y + computedFontSize + idx * lineHeightPx + (layer.verticalAlign === 'middle' ? (layer.height - (wrappedLines.length * lineHeightPx)) / 2 : 0);
      const safeText = lineText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<tspan x="${xOffset}" y="${yPos}">${safeText}</tspan>`;
    }).join('\n');

    const fallbackFonts = Array.isArray(layer.fallbackFonts) ? layer.fallbackFonts : ["Noto Sans SC", "Microsoft YaHei", "sans-serif"];
    const fontStyle = `
      font-family: '${layer.fontFamily || "PingFang SC"}', ${fallbackFonts.map(f => `'${f}'`).join(', ')};
      font-size: ${computedFontSize}px;
      font-weight: ${layer.fontWeight || 700};
      fill: ${layer.color || "#2C2A29"};
      opacity: ${layer.opacity ?? 1};
      letter-spacing: ${layer.letterSpacing || 0}px;
    `;

    // Render container card background badge if defined
    let bgRectSvg = '';
    const containerStyle = (layer as any).containerStyle;
    if (containerStyle && containerStyle.backgroundColor) {
      const rx = containerStyle.borderRadius || 12;
      const stroke = containerStyle.border ? `stroke="${containerStyle.border.replace(/.*?#/, '#').split(' ')[0]}" stroke-width="2"` : '';
      bgRectSvg = `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${rx}" ry="${rx}" fill="${containerStyle.backgroundColor}" ${stroke} />`;
    }

    textSvgs.push(`
      <g id="text-layer-${layer.id}">
        ${bgRectSvg}
        <text text-anchor="${textAnchor}" style="${fontStyle}">
          ${tspanElements}
        </text>
      </g>
    `);
  }

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&amp;display=swap');
        </style>
      </defs>
      ${textSvgs.join('\n')}
    </svg>
  `;
}
