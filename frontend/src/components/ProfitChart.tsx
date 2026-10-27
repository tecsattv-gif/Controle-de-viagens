import { Text, View } from "react-native";

import { fonts, makeStyles } from "@/src/theme";

export type ProfitBar = { label: string; value: number };

// Compact money label for narrow chart columns: 1.530 -> "1,5k".
function compact(n: number, symbol: string): string {
  if (!n) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) {
    return `${sign}${symbol}${(abs / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return `${sign}${symbol}${Math.round(abs)}`;
}

const TRACK_H = 84;

// Simple bottom-anchored bar chart (no external deps). Positive profit uses the
// brand color, losses use the error color. Values are labelled above each bar.
export function ProfitChart({ data, symbol }: { data: ProfitBar[]; symbol: string }) {
  const styles = useStyles();
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <View style={styles.bars} testID={`profit-chart-${symbol}`}>
      {data.map((d, i) => {
        const h = Math.max(d.value ? 3 : 0, Math.round((Math.abs(d.value) / max) * TRACK_H));
        const neg = d.value < 0;
        return (
          <View key={i} style={styles.col}>
            <Text style={styles.barVal} numberOfLines={1} adjustsFontSizeToFit>
              {compact(d.value, symbol)}
            </Text>
            <View style={styles.track}>
              <View style={[styles.bar, { height: h }, neg ? styles.barNeg : styles.barPos]} />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: "center",
  },
  barVal: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    marginBottom: 4,
  },
  track: {
    height: TRACK_H,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bar: {
    width: "72%",
    minWidth: 8,
    borderRadius: 5,
  },
  barPos: { backgroundColor: colors.brandPrimary },
  barNeg: { backgroundColor: colors.error },
  barLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    marginTop: 5,
  },
}));
