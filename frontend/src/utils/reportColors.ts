// Cores dos relatórios (PDF) seguindo a cor escolhida em Configurações.
//
// Os relatórios foram desenhados em laranja (#E65C00 e tons derivados). Em vez
// de mexer em cada relatório, trocamos esses tons pela cor de destaque do app
// no momento de gerar o PDF/imprimir. Com a cor padrão, nada muda.

import { DEFAULT_ACCENT, getAccentColor, luminance, normalizeHex } from "@/src/theme";

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// Tons laranja usados nos relatórios → função que gera o tom equivalente da nova cor.
const ORANGE_TONES: [string, (main: string) => string][] = [
  ["#E65C00", (m) => m], // títulos, linhas, destaques
  ["#FF8A3D", (m) => mix(m, "#FFFFFF", 0.3)], // valor em destaque sobre fundo escuro
  ["#9A3D00", (m) => mix(m, "#000000", 0.35)], // texto do cabeçalho das tabelas
  ["#F1C7A8", (m) => mix(m, "#FFFFFF", 0.65)], // linha fina sob os títulos
  ["#FFE5D0", (m) => mix(m, "#FFFFFF", 0.85)], // fundo de etiquetas
  ["#FFF3EA", (m) => mix(m, "#FFFFFF", 0.92)], // fundo do cabeçalho das tabelas
];

/** Cor principal dos relatórios: a cor escolhida, escurecida se for clara demais para ler no papel branco. */
export function reportMainColor(): string {
  let main = normalizeHex(getAccentColor() || DEFAULT_ACCENT);
  for (let i = 0; i < 10 && luminance(main) > 0.22; i++) main = mix(main, "#000000", 0.12);
  return main;
}

/** Troca o laranja do HTML do relatório pela cor escolhida em Configurações. */
export function themeReportHtml(html: string): string {
  if (normalizeHex(getAccentColor() || DEFAULT_ACCENT) === normalizeHex(DEFAULT_ACCENT)) return html;
  const main = reportMainColor();
  let out = html;
  for (const [from, to] of ORANGE_TONES) {
    out = out.replace(new RegExp(from, "gi"), to(main));
  }
  return out;
}
