// Geração de PDF a partir de HTML com página A4 de verdade.
//
// No Android o expo-print ignora o "@page { size: ... }" do HTML e, sem
// width/height, gera sempre em tamanho Carta (612 × 792 pt). Isso deixava
// colunas cortadas e o PDF fora do padrão A4 ao imprimir. Aqui o tamanho
// vai explícito: A4 retrato (595 × 842 pt) ou A4 paisagem.

import * as Print from "expo-print";

const A4_W = 595;
const A4_H = 842;

// Garante que nada passe da largura da página.
const FIT_CSS =
  "<style>img{max-width:100%}table{max-width:100%}th,td{overflow-wrap:anywhere;word-wrap:break-word}</style>";

function withFit(html: string): string {
  return html.includes("</head>") ? html.replace("</head>", `${FIT_CSS}</head>`) : FIT_CSS + html;
}

/** Converte o HTML em PDF A4. Paisagem quando pedido ou quando o HTML usa "@page { size: A4 landscape }". */
export async function htmlToPdf(html: string, opts?: { landscape?: boolean }): Promise<{ uri: string }> {
  const landscape = opts?.landscape ?? /@page\s*\{[^}]*size:\s*A4\s+landscape/i.test(html);
  const { uri } = await Print.printToFileAsync({
    html: withFit(html),
    width: landscape ? A4_H : A4_W,
    height: landscape ? A4_W : A4_H,
  });
  return { uri };
}
