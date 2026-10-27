import { Text, View } from "react-native";

import { Tire, TireSettings } from "@/src/api/tires";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { TirePosition, stateColor, treadState } from "@/src/utils/axleMaps";
import { TouchableOpacity } from "react-native";

type Props = {
  positions: TirePosition[];
  tiresByPos: Record<string, Tire>;
  settings: TireSettings;
  onPressPosition: (code: string, tire?: Tire) => void;
};

// Agrupa posições por unidade (preservando a ordem) e por eixo.
function group(positions: TirePosition[]) {
  const units: { role: string; label: string; axles: { index: number; label: string; left: TirePosition[]; right: TirePosition[] }[] }[] = [];
  positions.forEach((p) => {
    let u = units.find((x) => x.role === p.unitRole);
    if (!u) {
      u = { role: p.unitRole, label: p.unitLabel, axles: [] };
      units.push(u);
    }
    let ax = u.axles.find((a) => a.index === p.axleIndex);
    if (!ax) {
      ax = { index: p.axleIndex, label: p.axleLabel, left: [], right: [] };
      u.axles.push(ax);
    }
    if (p.side === "L") ax.left.push(p);
    else ax.right.push(p);
  });
  // Ordena pneus: esquerda = externo(O) primeiro; direita = interno(I) primeiro, externo por último.
  units.forEach((u) =>
    u.axles.forEach((a) => {
      a.left.sort((x, y) => (x.dualPos === "O" ? -1 : 1) - (y.dualPos === "O" ? -1 : 1));
      a.right.sort((x, y) => (x.dualPos === "I" ? -1 : 1) - (y.dualPos === "I" ? -1 : 1));
    }),
  );
  return units;
}

export function TireMap({ positions, tiresByPos, settings, onPressPosition }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const units = group(positions);

  const renderTire = (p: TirePosition) => {
    const tire = tiresByPos[p.code];
    const st = treadState(tire ? tire.current_tread_mm : null, settings.green_min_mm, settings.yellow_min_mm);
    const bg = stateColor(st, colors);
    return (
      <TouchableOpacity
        key={p.code}
        style={[styles.tire, { backgroundColor: tire ? bg : colors.surfaceSecondary, borderColor: tire ? bg : colors.border }]}
        onPress={() => onPressPosition(p.code, tire)}
        testID={`tire-pos-${p.code}`}
        activeOpacity={0.7}
      >
        <Text style={[styles.tireTxt, { color: tire ? "#101010" : colors.muted }]} numberOfLines={1}>
          {tire ? tire.number || "•" : "+"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.total} testID="tire-map-total">
        {t("Total de pneus: {n}", { n: positions.length })}
      </Text>
      {units.map((u) => (
        <View key={u.role} style={styles.unit} testID={`tire-unit-${u.role}`}>
          <Text style={styles.unitLabel}>
            {u.label} · {t("{a} eixos · {p} pneus", { a: u.axles.length, p: u.axles.reduce((n, a) => n + a.left.length + a.right.length, 0) })}
          </Text>
          {u.axles.map((a) => (
            <View key={a.index} style={styles.axleBlock}>
              <Text style={styles.axleCaption}>
                {t("Eixo")} {a.index} · {a.left.length > 1 ? t("Duplo") : t("Simples")}
              </Text>
              <View style={styles.axleRow}>
                <View style={styles.side}>{a.left.map(renderTire)}</View>
                <View style={styles.spine} />
                <View style={[styles.side, styles.sideRight]}>{a.right.map(renderTire)}</View>
              </View>
            </View>
          ))}
        </View>
      ))}
      <View style={styles.legend}>
        <LegendDot color={colors.success} label={t("Bom")} />
        <LegendDot color={colors.warning} label={t("Atenção")} />
        <LegendDot color={colors.error} label={t("Trocar")} />
        <LegendDot color={colors.border} label={t("Vazio")} />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendTxt}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 14 },
  unit: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  unitLabel: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary, letterSpacing: 0.3 },
  axleBlock: { gap: 4 },
  axleCaption: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: "center" },
  total: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface, textAlign: "center" },
  axleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  side: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "flex-end" },
  sideRight: { justifyContent: "flex-start" },
  spine: {
    width: 44,
    height: 8,
    marginHorizontal: 10,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  tire: {
    width: 38,
    height: 50,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tireTxt: { fontFamily: fonts.displayBold, fontSize: 11 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendTxt: { fontFamily: fonts.body, fontSize: 12, color: colors.onSurfaceSecondary },
}));
