import * as Haptics from "expo-haptics";
import { PencilSimple, Trash } from "phosphor-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { confirmDelete } from "@/src/utils/confirmDelete";

type Props = {
  onEdit?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
  testID?: string;
  // Mostra o lápis laranja + "Toque para editar" ao final (padrão: quando há onEdit)
  showEditHint?: boolean;
};

// Linha padronizada de todo o app:
// - Arrastar para o lado revela "Apagar" -> confirmação -> exclui apenas o item.
// - Toque no card abre a edição (lápis laranja + "Toque para editar").
export function SwipeableRow({ onEdit, onDelete, children, testID, showEditHint }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  const hint = showEditHint ?? !!onEdit;

  const handleDelete = () => {
    if (!onDelete) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    confirmDelete({
      title: t("Excluir registro"),
      message: t("Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita."),
      confirmText: t("Apagar"),
      cancelText: t("Cancelar"),
      onConfirm: onDelete,
    });
  };

  const renderRightActions = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={handleDelete}
      testID={testID ? `${testID}-delete` : undefined}
      accessibilityRole="button"
      // @ts-expect-error react-native-web maps dataSet to data-* attributes
      dataSet={{ printHide: "true" }}
    >
      <Trash size={24} color={colors.onError} weight="bold" />
      <Text style={styles.deleteText}>{t("Apagar")}</Text>
    </Pressable>
  );

  const inner = (
    <>
      {children}
      {hint ? (
        <View
          style={styles.editHint}
          // @ts-expect-error react-native-web maps dataSet to data-* attributes
          dataSet={{ printHide: "true" }}
        >
          <PencilSimple size={18} color={colors.brandPrimary} weight="bold" />
          <Text style={styles.editText}>{t("Toque para editar")}</Text>
        </View>
      ) : null}
    </>
  );

  const card = onEdit ? (
    <Pressable style={styles.card} onPress={onEdit} testID={testID} accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    <View style={styles.card} testID={testID}>
      {inner}
    </View>
  );

  if (!onDelete) return card;

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      {card}
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  editHint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  editText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.brandPrimary },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    marginLeft: 10,
    borderRadius: 12,
    gap: 4,
  },
  deleteText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onError },
}));
