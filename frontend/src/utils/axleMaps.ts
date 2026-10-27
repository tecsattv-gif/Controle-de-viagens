// Biblioteca de mapas de eixos (Controle de Pneus).
// Define layouts padrão por UNIDADE (cavalo, reboque, dolly). A composição de
// um veículo = cavalo + reboques + dolly. Posições de pneu são geradas a partir
// do layout (quantidade de eixos + se é rodado simples ou duplo).

export type AxleDef = { label: string; dual: boolean };

export type UnitLayout = {
  key: string;
  name: string;
  kind: "truck" | "trailer" | "dolly";
  axles: AxleDef[];
};

const d = (label: string): AxleDef => ({ label, dual: true });
const s = (label: string): AxleDef => ({ label, dual: false });

export const TRUCK_LAYOUTS: UnitLayout[] = [
  { key: "truck_4x2", name: "Caminhão 4x2", kind: "truck", axles: [s("Direcional"), d("Tração")] },
  { key: "truck_6x2", name: "Caminhão 6x2", kind: "truck", axles: [s("Direcional"), d("Tração"), d("Truck")] },
  { key: "truck_6x4", name: "Caminhão 6x4", kind: "truck", axles: [s("Direcional"), d("Tração"), d("Tração")] },
  { key: "truck_8x2", name: "Caminhão 8x2", kind: "truck", axles: [s("Direcional"), s("Direcional"), d("Tração"), d("Truck")] },
  { key: "truck_8x4", name: "Caminhão 8x4", kind: "truck", axles: [s("Direcional"), s("Direcional"), d("Tração"), d("Tração")] },
];

export const TRAILER_LAYOUTS: UnitLayout[] = [
  { key: "semi_2", name: "Semirreboque 2 eixos", kind: "trailer", axles: [d("Eixo 1"), d("Eixo 2")] },
  { key: "semi_3", name: "Semirreboque 3 eixos", kind: "trailer", axles: [d("Eixo 1"), d("Eixo 2"), d("Eixo 3")] },
  { key: "semi_4", name: "Semirreboque 4 eixos", kind: "trailer", axles: [d("Eixo 1"), d("Eixo 2"), d("Eixo 3"), d("Eixo 4")] },
  { key: "trailer_2s", name: "Reboque 2 eixos (simples)", kind: "trailer", axles: [s("Eixo 1"), s("Eixo 2")] },
];

export const DOLLY_LAYOUTS: UnitLayout[] = [
  { key: "dolly_1", name: "Dolly 1 eixo", kind: "dolly", axles: [d("Eixo")] },
  { key: "dolly_2", name: "Dolly 2 eixos", kind: "dolly", axles: [d("Eixo 1"), d("Eixo 2")] },
];

export const ALL_LAYOUTS: UnitLayout[] = [...TRUCK_LAYOUTS, ...TRAILER_LAYOUTS, ...DOLLY_LAYOUTS];

export function layoutByKey(key: string): UnitLayout | undefined {
  return ALL_LAYOUTS.find((l) => l.key === key);
}

export type ConfigUnit = { role: string; label: string; layout_key: string; axles?: { dual: boolean }[] };

// Layout personalizado (reboques): eixos definidos um a um (simples/duplo).
export const CUSTOM_LAYOUT = "custom";
export const MAX_CUSTOM_AXLES = 6;

export function unitAxleDefs(layoutKey: string, customAxles?: { dual: boolean }[]): AxleDef[] {
  if (layoutKey === CUSTOM_LAYOUT) {
    return (customAxles || []).map((a, i) => ({ label: `Eixo ${i + 1}`, dual: !!a.dual }));
  }
  return layoutByKey(layoutKey)?.axles ?? [];
}

export function tireCount(axles: { dual: boolean }[]): number {
  return axles.reduce((acc, a) => acc + (a.dual ? 4 : 2), 0);
}

export type TirePosition = {
  code: string;
  unitRole: string;
  unitLabel: string;
  axleIndex: number;
  axleLabel: string;
  side: "L" | "R";
  dual: boolean;
  dualPos?: "I" | "O";
};

function rolePrefix(role: string): string {
  if (role === "truck") return "C";
  if (role === "dolly") return "D";
  if (role.startsWith("trailer")) return "R" + role.replace("trailer", "");
  return role.toUpperCase();
}

// Posições (pneus) de uma unidade, da frente para trás, esquerda->direita.
export function unitPositions(
  role: string,
  layoutKey: string,
  label: string,
  customAxles?: { dual: boolean }[],
): TirePosition[] {
  const axles = unitAxleDefs(layoutKey, customAxles);
  if (axles.length === 0) return [];
  const pfx = rolePrefix(role);
  const out: TirePosition[] = [];
  axles.forEach((ax, idx) => {
    const axleIndex = idx + 1;
    (["L", "R"] as const).forEach((side) => {
      if (ax.dual) {
        (["O", "I"] as const).forEach((dp) => {
          out.push({
            code: `${pfx}-${axleIndex}${side}${dp}`,
            unitRole: role,
            unitLabel: label,
            axleIndex,
            axleLabel: ax.label,
            side,
            dual: true,
            dualPos: dp,
          });
        });
      } else {
        out.push({
          code: `${pfx}-${axleIndex}${side}`,
          unitRole: role,
          unitLabel: label,
          axleIndex,
          axleLabel: ax.label,
          side,
          dual: false,
        });
      }
    });
  });
  return out;
}

export function configPositions(units: ConfigUnit[]): TirePosition[] {
  const out: TirePosition[] = [];
  (units || []).forEach((u) => {
    out.push(...unitPositions(u.role, u.layout_key, u.label, u.axles));
  });
  return out;
}

export type TireState = "green" | "yellow" | "red" | "empty";

export function treadState(
  treadMm: number | null | undefined,
  greenMin: number,
  yellowMin: number,
): TireState {
  if (treadMm == null) return "empty";
  if (treadMm >= greenMin) return "green";
  if (treadMm >= yellowMin) return "yellow";
  return "red";
}

export function stateColor(state: TireState, colors: { success: string; warning: string; error: string; border: string }): string {
  if (state === "green") return colors.success;
  if (state === "yellow") return colors.warning;
  if (state === "red") return colors.error;
  return colors.border;
}

// Rótulo legível de uma posição para exibição.
export function positionLabel(code: string, positions: TirePosition[]): string {
  const p = positions.find((x) => x.code === code);
  if (!p) return code;
  const sideTxt = p.side === "L" ? "Esq." : "Dir.";
  const dualTxt = p.dualPos ? (p.dualPos === "O" ? " externo" : " interno") : "";
  return `${p.unitLabel} · ${p.axleLabel} ${sideTxt}${dualTxt}`;
}
