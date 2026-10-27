import { Pressable, Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { fonts, makeStyles } from "@/src/theme";

export type SortMode = "created" | "date";

type WithDates = { created_at?: string; date?: string };

// Ordena por inserção mais recente (created_at) ou pela data do registro (date).
export function sortItems<T extends WithDates>(items: T[], mode: SortMode): T[] {
  return [...items].sort((a, b) => {
    if (mode === "date") {
      const d = (b.date || "").localeCompare(a.date || "");
      if (d !== 0) return d;
    }
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

export function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const styles = useStyles();
  const t = useT();
  const opts: { key: SortMode; label: string }[] = [
    { key: "created", label: t("Mais recentes") },
    { key: "date", label: t("Por data") },
  ];
  return (
    <View style={styles.row} testID="sort-toggle">
      {opts.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={o.key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(o.key)}
            testID={`sort-${o.key}`}
            accessibilityRole="button"
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  pillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pillText: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  pillTextActive: { color: colors.onBrandPrimary },
}));
