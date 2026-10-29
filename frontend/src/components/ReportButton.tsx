import { useRouter } from "expo-router";
import { FileText } from "phosphor-react-native";
import { Pressable, Text } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";

// Botão "Relatório PDF" usado no topo das listas que têm um relatório próprio.
export function ReportButton({ route, label, testID }: { route: string; label: string; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push(route as any)}
      testID={testID}
      accessibilityRole="button"
    >
      <FileText size={20} color={colors.brandPrimary} weight="bold" />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  text: { fontFamily: fonts.displayBold, fontSize: 17, letterSpacing: 0.5, color: colors.brandPrimary },
}));
