import { Text, View } from "react-native";

import { fonts, makeStyles } from "@/src/theme";

type Props = {
  label: string;
  value: string;
  unit?: string;
  testID?: string;
};

// Shrink the number's font based on how many characters it has, so long
// values (e.g. "12.450") always fit inside the card without ellipsis.
function valueFontSize(value: string): number {
  const len = value.length;
  if (len <= 4) return 28;
  if (len <= 6) return 23;
  if (len <= 8) return 18;
  return 15;
}

export function MetricCard({ label, value, unit, testID }: Props) {
  const styles = useStyles();
  const fontSize = valueFontSize(value);
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { fontSize, lineHeight: fontSize + 4 }]}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    color: colors.muted,
    marginBottom: 6,
    minHeight: 28,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  value: {
    flexShrink: 1,
    fontFamily: fonts.displayBold,
    color: colors.onSurface,
  },
  unit: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.muted,
    marginLeft: 4,
    marginBottom: 4,
  },
}));
