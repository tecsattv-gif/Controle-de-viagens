import { CaretDown, Check, X } from "phosphor-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";

export type SelectOption = { id: string; title: string; subtitle?: string };

type Props = {
  label: string;
  placeholder: string;
  value: string; // selected id ("" = none)
  options: SelectOption[];
  onChange: (id: string) => void;
  emptyHint?: string;
  testID?: string;
};

export function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange,
  emptyHint,
  testID,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)} testID={testID} accessibilityRole="button">
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.title : placeholder}
        </Text>
        <CaretDown size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} testID={testID ? `${testID}-close` : undefined}>
                <X size={22} color={colors.onSurface} weight="bold" />
              </Pressable>
            </View>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {options.length === 0 ? (
                <Text style={styles.emptyHint}>{emptyHint ?? "Nenhum item cadastrado."}</Text>
              ) : (
                <>
                  <Pressable style={styles.option} onPress={() => pick("")} testID={testID ? `${testID}-none` : undefined}>
                    <Text style={styles.optionTitle}>Nenhum</Text>
                    {value === "" ? <Check size={18} color={colors.brandPrimary} weight="bold" /> : null}
                  </Pressable>
                  {options.map((o) => (
                    <Pressable
                      key={o.id}
                      style={styles.option}
                      onPress={() => pick(o.id)}
                      testID={testID ? `${testID}-opt-${o.id}` : undefined}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle} numberOfLines={1}>{o.title}</Text>
                        {o.subtitle ? <Text style={styles.optionSub} numberOfLines={1}>{o.subtitle}</Text> : null}
                      </View>
                      {value === o.id ? <Check size={18} color={colors.brandPrimary} weight="bold" /> : null}
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { marginBottom: 12 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  value: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.onSurface, marginRight: 8 },
  placeholder: { color: colors.muted },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  list: { flexGrow: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  optionTitle: { fontFamily: fonts.body, fontSize: 16, color: colors.onSurface },
  optionSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  emptyHint: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, paddingVertical: 20, textAlign: "center" },
}));
