import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles } from "@/src/theme";
import { getAppCurrencySymbol, parseISODate, toISODate } from "@/src/utils/format";
import {
  FREIGHT_STATUSES,
  FreightForm,
  FreightStatus,
} from "@/src/utils/freight";

type Props = {
  value: FreightForm;
  onChange: (next: FreightForm) => void;
  idPrefix?: string;
};

export function FreightSection({ value, onChange, idPrefix = "freight" }: Props) {
  const styles = useStyles();
  const t = useT();
  const sym = getAppCurrencySymbol();
  const [payDate, setPayDate] = useState<Date>(
    value.payDate ? parseISODate(value.payDate) : new Date(),
  );
  const patch = (p: Partial<FreightForm>) => onChange({ ...value, ...p });

  const payEnabled = value.payDate !== "";

  return (
    <View>
      <Text style={styles.hint}>{t("Opcional — preencha apenas o que quiser.")}</Text>

      <Text style={styles.groupLabel}>{t("Frete Bruto")}</Text>
      <TextField
        label={t("Valor do frete bruto ({sym})", { sym })}
        value={value.grossValue}
        onChangeText={(txt) => patch({ grossValue: txt })}
        keyboardType="decimal-pad"
        placeholder="0,00"
        testID={`${idPrefix}-gross-value`}
      />

      <Text style={styles.groupLabel}>{t("Frete Líquido")}</Text>
      <TextField
        label={t("Valor do frete líquido ({sym})", { sym })}
        value={value.netValue}
        onChangeText={(txt) => patch({ netValue: txt })}
        keyboardType="decimal-pad"
        placeholder="0,00"
        testID={`${idPrefix}-net-value`}
      />

      <Text style={styles.groupLabel}>{t("Valor Pago / Recebido")}</Text>
      <TextField
        label={t("Valor efetivamente recebido ({sym})", { sym })}
        value={value.paidValue}
        onChangeText={(txt) => patch({ paidValue: txt })}
        keyboardType="decimal-pad"
        placeholder="0,00"
        testID={`${idPrefix}-paid-value`}
      />

      <View style={styles.payToggleRow}>
        <Pressable
          style={[styles.chip, payEnabled && styles.chipActive]}
          onPress={() => patch({ payDate: payEnabled ? "" : toISODate(payDate) })}
          testID={`${idPrefix}-paydate-toggle`}
          accessibilityRole="button"
        >
          <Text style={[styles.chipText, payEnabled && styles.chipTextActive]}>
            {payEnabled ? t("Data do pagamento informada") : t("Informar data do pagamento")}
          </Text>
        </Pressable>
      </View>
      {payEnabled ? (
        <DateInputField
          label={t("Data do pagamento")}
          value={payDate}
          onChange={(d) => {
            setPayDate(d);
            patch({ payDate: toISODate(d) });
          }}
          testID={`${idPrefix}-paydate`}
        />
      ) : null}

      <Text style={styles.groupLabel}>{t("Situação do frete")}</Text>
      <View style={styles.statusWrap}>
        {FREIGHT_STATUSES.map((s: FreightStatus) => {
          const active = value.status === s;
          return (
            <Pressable
              key={s}
              style={[styles.statusBtn, active && styles.statusBtnActive]}
              onPress={() => patch({ status: s })}
              testID={`${idPrefix}-status-${s}`}
              accessibilityRole="button"
            >
              <Text style={[styles.statusText, active && styles.statusTextActive]}>{t(s)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: 10 },
  groupLabel: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.brandPrimary,
    marginTop: 6,
    marginBottom: 8,
  },
  currencyRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  currencyBtn: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  currencyBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  currencyText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  currencyTextActive: { color: colors.onBrandPrimary },
  payToggleRow: { marginBottom: 12 },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brandPrimary,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderStyle: "solid" },
  chipText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
  chipTextActive: { color: colors.onBrandTertiary },
  statusWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  statusBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  statusBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  statusText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  statusTextActive: { color: colors.onBrandPrimary },
  tollRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  tollInput: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    minHeight: 48,
  },
  tollCur: {
    width: 52,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tollCurText: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onBrandTertiary },
  tollRemove: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  addToll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 2,
    marginBottom: 12,
  },
  addTollText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
}));
