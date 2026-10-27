import { MinusIcon, PlusIcon } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { MAX_CUSTOM_AXLES, tireCount } from "@/src/utils/axleMaps";

type Axle = { dual: boolean };

type Props = {
  title: string;
  roleKey: string;
  axles: Axle[];
  onChange: (axles: Axle[]) => void;
};

// Editor de eixos de um reboque: quantidade de eixos + rodado simples/duplo por eixo.
export function TrailerAxleEditor({ title, roleKey, axles, onChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  const setCount = (n: number) => {
    const next = axles.slice(0, n);
    while (next.length < n) next.push({ dual: next.length > 0 ? next[next.length - 1].dual : true });
    onChange(next);
  };

  const setDual = (i: number, dual: boolean) => onChange(axles.map((a, idx) => (idx === i ? { dual } : a)));

  return (
    <View style={styles.card} testID={`trailer-editor-${roleKey}`}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.countRow}>
        <Text style={styles.label}>{t("Quantidade de eixos")}</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepBtn, axles.length <= 1 && styles.disabled]}
            onPress={() => setCount(Math.max(1, axles.length - 1))}
            disabled={axles.length <= 1}
            hitSlop={6}
            testID={`axle-minus-${roleKey}`}
          >
            <MinusIcon size={18} color={colors.onSurface} weight="bold" />
          </Pressable>
          <Text style={styles.count} testID={`axle-count-${roleKey}`}>{axles.length}</Text>
          <Pressable
            style={[styles.stepBtn, axles.length >= MAX_CUSTOM_AXLES && styles.disabled]}
            onPress={() => setCount(Math.min(MAX_CUSTOM_AXLES, axles.length + 1))}
            disabled={axles.length >= MAX_CUSTOM_AXLES}
            hitSlop={6}
            testID={`axle-plus-${roleKey}`}
          >
            <PlusIcon size={18} color={colors.onSurface} weight="bold" />
          </Pressable>
        </View>
      </View>

      {axles.map((a, i) => (
        <View key={i} style={styles.axleRow}>
          <Text style={styles.axleLabel}>{t("Eixo")} {i + 1}</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segBtn, !a.dual && styles.segActive]}
              onPress={() => setDual(i, false)}
              testID={`axle-${roleKey}-${i + 1}-simples`}
            >
              <Text style={[styles.segText, !a.dual && styles.segTextActive]}>{t("Simples")} (2)</Text>
            </Pressable>
            <Pressable
              style={[styles.segBtn, a.dual && styles.segActive]}
              onPress={() => setDual(i, true)}
              testID={`axle-${roleKey}-${i + 1}-duplo`}
            >
              <Text style={[styles.segText, a.dual && styles.segTextActive]}>{t("Duplo")} (4)</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={styles.total} testID={`axle-total-${roleKey}`}>
        {t("Total de pneus: {n}", { n: tireCount(axles) })}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  count: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, minWidth: 20, textAlign: "center" },
  axleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  axleLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, width: 56 },
  segment: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  segBtn: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  segActive: { backgroundColor: colors.brandPrimary },
  segText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  segTextActive: { color: colors.onBrandPrimary, fontWeight: "700" },
  total: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.muted, textAlign: "right" },
}));
