import type { Tire } from "@/src/api/tires";
import type { TireState } from "@/src/utils/axleMaps";
import { formatDateBR, formatInt, toISODate } from "@/src/utils/format";

type T = (source: string, vars?: Record<string, string | number>) => string;

export type TireReportInput = {
  t: T;
  header: string; // bloco com logo + nome da empresa (companyPdfHeaderHtml)
  tire: Tire;
  vehicleName: string;
  truckPlate: string;
  compositionPlates: string;
  positionLabel: string;
  kmRun: number | null;
  state: TireState;
  stateLabel: string;
};

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STATE_COLORS = {
  green: { fg: "#1E7B34", bg: "#E6F4EA" },
  yellow: { fg: "#9A6700", bg: "#FFF4D6" },
  red: { fg: "#B3261E", bg: "#FDE7E5" },
};
const NEUTRAL = { fg: "#4B5563", bg: "#F3F4F6" };

const CSS = `
  * { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; box-sizing: border-box; }
  body { color: #1F2328; font-size: 10.5pt; margin: 28px; line-height: 1.35; }
  .layout { width: 100%; border-collapse: collapse; border: 0; border-radius: 0; }
  .layout td { border: 0; padding: 0; background: none !important; vertical-align: bottom; }
  .title { font-size: 18pt; font-weight: 800; color: #E65C00; letter-spacing: .2px; }
  .subtitle { font-size: 10pt; color: #6B7280; margin-top: 2px; }
  .issued { font-size: 9pt; color: #6B7280; text-align: right; white-space: nowrap; }
  .stats { width: 100%; border-collapse: separate; border-spacing: 8px 0; margin: 16px -8px 4px; border: 0; }
  .stats td.stat { width: 33.3%; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; background: #fff !important; }
  .stat .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: .6px; color: #6B7280; }
  .stat .val { font-size: 15pt; font-weight: 800; margin-top: 3px; white-space: nowrap; }
  .badge { display: inline-block; font-size: 9pt; font-weight: 700; padding: 2px 9px; border-radius: 20px; margin-left: 6px; vertical-align: middle; }
  .section { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; color: #E65C00;
             border-bottom: 1px solid #F1C7A8; padding-bottom: 4px; margin: 18px 0 8px; }
  table.grid td { width: 50%; padding: 8px 12px; background: #fff !important; }
  table.grid td + td { border-left: 1px solid #F0F1F3; }
  table.grid tr:first-child td { border-top: 0; }
  .cell .lbl { font-size: 8pt; color: #6B7280; text-transform: uppercase; letter-spacing: .5px; }
  .cell .val { font-size: 10.5pt; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; font-size: 10pt; }
  th { background: #FFF3EA; color: #9A3D00; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .5px; text-align: left; padding: 8px 10px; }
  td { padding: 8px 10px; border-top: 1px solid #F0F1F3; vertical-align: top; }
  tr:nth-child(even) td { background: #FAFAFB; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.date { white-space: nowrap; width: 18%; }
  td.empty { color: #9CA3AF; text-align: center; padding: 14px; }
  .muted { color: #9CA3AF; }
  .footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #9CA3AF; text-align: center; }
`;

export function buildTireReportHtml(p: TireReportInput): string {
  const { t, tire } = p;
  const sc = (STATE_COLORS as Record<string, { fg: string; bg: string }>)[p.state] ?? NEUTRAL;
  const dash = `<span class="muted">—</span>`;
  const v = (s: string | null | undefined) => (s ? esc(s) : dash);

  const meas = [...(tire.measurements || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const measRows = meas.length
    ? meas
        .map(
          (m) => `<tr><td class="date">${esc(formatDateBR(m.date))}</td><td class="num"><b>${m.tread_mm}</b> mm</td><td>${v(m.notes)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="empty">${esc(t("Nenhuma medição registrada"))}</td></tr>`;

  const movs = [...(tire.movements || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const movRows = movs.length
    ? movs
        .map(
          (mv) =>
            `<tr><td class="date">${esc(formatDateBR(mv.date))}</td><td>${v(mv.from_position)} &nbsp;→&nbsp; ${v(mv.to_position)}</td><td class="num">${mv.km ? formatInt(mv.km) + " km" : dash}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="empty">${esc(t("Nenhuma mudança de posição"))}</td></tr>`;

  const cell = (label: string, value: string) =>
    `<td class="cell"><div class="lbl">${esc(t(label))}</div><div class="val">${value}</div></td>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
    ${p.header}
    <table class="layout"><tr>
      <td>
        <div class="title">${esc(t("Relatório Individual do Pneu"))}</div>
        <div class="subtitle">${esc(t("Pneu"))} ${esc(tire.number || "—")} · ${esc(tire.brand || "")}</div>
      </td>
      <td class="issued">${esc(t("Emitido em"))}<br/><b>${esc(formatDateBR(toISODate(new Date())))}</b></td>
    </tr></table>

    <table class="stats"><tr>
      <td class="stat">
        <div class="lbl">${esc(t("Profundidade do sulco"))}</div>
        <div class="val">${tire.current_tread_mm != null ? tire.current_tread_mm + " mm" : "—"}<span class="badge" style="color:${sc.fg};background:${sc.bg}">${esc(p.stateLabel)}</span></div>
      </td>
      <td class="stat">
        <div class="lbl">${esc(t("KM percorridos"))}</div>
        <div class="val">${p.kmRun != null ? formatInt(p.kmRun) + " km" : `<span class="muted" style="font-size:11pt">${esc(t("Indisponível"))}</span>`}</div>
      </td>
      <td class="stat">
        <div class="lbl">${esc(t("Data de instalação"))}</div>
        <div class="val">${tire.install_date ? esc(formatDateBR(tire.install_date)) : dash}</div>
      </td>
    </tr></table>

    <div class="section">${esc(t("Dados do pneu"))}</div>
    <table class="grid">
      <tr>${cell("Número do pneu", v(tire.number))}${cell("Marca", v(tire.brand))}</tr>
      <tr>${cell("Medida", v(tire.size))}${cell("Posição", v(p.positionLabel))}</tr>
      <tr>${cell("KM de instalação", tire.install_km ? formatInt(tire.install_km) + " km" : dash)}${cell("Observações", v(tire.notes))}</tr>
    </table>

    <div class="section">${esc(t("Veículo"))}</div>
    <table class="grid">
      <tr>${cell("Veículo", v(p.vehicleName))}${cell("Placa do veículo", v(p.truckPlate))}</tr>
      <tr>${cell("Placas das composições", v(p.compositionPlates))}<td class="cell"></td></tr>
    </table>

    <div class="section">${esc(t("Histórico de medições"))}</div>
    <table><thead><tr><th>${esc(t("Data"))}</th><th class="num" style="width:14%">${esc(t("Sulco"))}</th><th>${esc(t("Observações"))}</th></tr></thead><tbody>${measRows}</tbody></table>

    <div class="section">${esc(t("Mudanças de posição"))}</div>
    <table><thead><tr><th>${esc(t("Data"))}</th><th>${esc(t("Movimentação"))}</th><th class="num" style="width:18%">KM</th></tr></thead><tbody>${movRows}</tbody></table>

    <div class="footer">${esc(t("Relatório Individual do Pneu"))} · ${esc(t("Pneu"))} ${esc(tire.number || "—")}</div>
  </body></html>`;
}
