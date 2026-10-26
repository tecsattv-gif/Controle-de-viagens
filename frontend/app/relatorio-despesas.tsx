import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Maintenance, useMaintenances, useDeleteMaintenance } from "@/src/api/maintenance";
import { OilChange, useOilChanges, useDeleteOilChange } from "@/src/api/oilChanges";
import { OtherExpense, useOtherExpenses, useDeleteOtherExpense } from "@/src/api/otherExpenses";
import { Refueling, useRefuelings, useDeleteRefueling } from "@/src/api/refuelings";
import { TollExpense, useTollExpenses, useDeleteTollExpense } from "@/src/api/tollExpenses";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatDecimal, money } from "@/src/utils/format";

type Category = "todos" | "abastecimento" | "pedagios" | "manutencao" | "oleo" | "outros";

type ExpenseRow = {
  id: string;
  date: string;
  value: number;
  type: "abastecimento" | "pedagios" | "manutencao" | "oleo" | "outros";
  typeLabel: string;
  place: string;
  detail: string;
  dieselLiters?: number;
  arlaLiters?: number;
};

function refuelingValue(r: Refueling): number {
  return (r.diesel_liters || 0) * (r.diesel_price || 0) + (r.arla_liters || 0) * (r.arla_price || 0);
}

export default function RelatorioDespesasScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const [category, setCategory] = useState<Category>("todos");

  const { data: refuelings } = useRefuelings();
  const { data: tolls } = useTollExpenses();
  const { data: maintenances } = useMaintenances();
  const { data: others } = useOtherExpenses();
  const { data: oilChanges } = useOilChanges();
  const delRefuel = useDeleteRefueling();
  const delToll = useDeleteTollExpense();
  const delMaint = useDeleteMaintenance();
  const delOther = useDeleteOtherExpense();
  const delOil = useDeleteOilChange();
  const removeWithUndo = useUndoableDelete();

  const refuelRows: ExpenseRow[] = (refuelings ?? []).map((r) => {
    const parts = [t("Diesel: {l} L", { l: formatDecimal(r.diesel_liters || 0) })];
    if ((r.arla_liters || 0) > 0) parts.push(`ARLA 32: ${formatDecimal(r.arla_liters)} L`);
    return {
      id: r.id,
      date: r.date,
      value: refuelingValue(r),
      type: "abastecimento",
      typeLabel: t("Abastecimento"),
      place: r.station_place || r.station_name || "",
      detail: parts.join(" · "),
      dieselLiters: r.diesel_liters || 0,
      arlaLiters: r.arla_liters || 0,
    };
  });
  const tollRows: ExpenseRow[] = (tolls ?? []).map((x) => ({
    id: x.id,
    date: x.date,
    value: x.value || 0,
    type: "pedagios",
    typeLabel: t("Pedágios"),
    place: x.place || "",
    detail: "",
  }));
  const maintRows: ExpenseRow[] = (maintenances ?? []).map((m) => ({
    id: m.id,
    date: m.date,
    value: m.price || 0,
    type: "manutencao",
    typeLabel: t("Manutenção"),
    place: m.place || "",
    detail: [m.category, m.description].filter(Boolean).join(" · "),
  }));
  const otherRows: ExpenseRow[] = (others ?? []).map((o) => ({
    id: o.id,
    date: o.date,
    value: o.value || 0,
    type: "outros",
    typeLabel: t("Outros"),
    place: o.place || "",
    detail: o.service || "",
  }));
  const oilRows: ExpenseRow[] = (oilChanges ?? []).map((o: OilChange) => ({
    id: o.id,
    date: o.date,
    value: o.total || 0,
    type: "oleo",
    typeLabel: t("Troca de Óleo"),
    place: o.vehicle_plate || o.place || "",
    detail: (o.components || []).filter((c) => c.enabled).map((c) => t(c.label)).join(" · "),
  }));

  const dataByCategory: Record<Category, ExpenseRow[]> = {
    todos: [...refuelRows, ...tollRows, ...maintRows, ...oilRows, ...otherRows],
    abastecimento: refuelRows,
    pedagios: tollRows,
    manutencao: maintRows,
    oleo: oilRows,
    outros: otherRows,
  };
  const data = dataByCategory[category];

  const editRoute: Record<ExpenseRow["type"], string> = {
    abastecimento: "/abastecimento-form",
    pedagios: "/pedagio-form",
    manutencao: "/manutencao-form",
    oleo: "/troca-oleo-form",
    outros: "/outros-form",
  };

  const deleteRow = (x: ExpenseRow) => {
    const map = {
      abastecimento: { qk: ["refuelings"] as const, run: () => delRefuel.mutateAsync(x.id) },
      pedagios: { qk: ["toll-expenses"] as const, run: () => delToll.mutateAsync(x.id) },
      manutencao: { qk: ["maintenances"] as const, run: () => delMaint.mutateAsync(x.id) },
      oleo: { qk: ["oil-changes"] as const, run: () => delOil.mutateAsync(x.id) },
      outros: { qk: ["other-expenses"] as const, run: () => delOther.mutateAsync(x.id) },
    };
    const m = map[x.type as keyof typeof map] ?? map.outros;
    removeWithUndo({ queryKey: m.qk, id: x.id, run: m.run });
  };

  const chips: { key: Category; label: string }[] = [
    { key: "todos", label: t("Todos") },
    { key: "abastecimento", label: t("Abastecimento") },
    { key: "pedagios", label: t("Pedágios") },
    { key: "manutencao", label: t("Manutenção") },
    { key: "oleo", label: t("Troca de Óleo") },
    { key: "outros", label: t("Outros") },
  ];

  const topContent = (
    <View style={styles.chipsWrap}>
      {chips.map((c) => {
        const active = category === c.key;
        return (
          <Pressable
            key={c.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => setCategory(c.key)}
            testID={`despesas-cat-${c.key}`}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <PeriodReport<ExpenseRow>
      key={category}
      title={t("Relatório de Despesas")}
      pdfTitle={t("RELATÓRIO DE DESPESAS")}
      screenTestId="relatorio-despesas-screen"
      idPrefix="despesas"
      fileBase="despesas"
      data={data}
      getDate={(x) => x.date}
      topContent={topContent}
      onEditItem={(x) => router.push({ pathname: editRoute[x.type], params: { id: x.id } })}
      onDeleteItem={deleteRow}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: money(x.value),
        infos: [x.typeLabel, [x.place, x.detail].filter(Boolean).join(" · ")],
      })}
      totals={(items) => {
        const sum = (rows: ExpenseRow[]) => rows.reduce((s, r) => s + r.value, 0);
        const lines = [] as { label: string; value: string }[];
        if (category === "todos") {
          const ab = items.filter((r) => r.type === "abastecimento");
          const pd = items.filter((r) => r.type === "pedagios");
          const mn = items.filter((r) => r.type === "manutencao");
          const ol = items.filter((r) => r.type === "oleo");
          const ou = items.filter((r) => r.type === "outros");
          if (ab.length) lines.push({ label: t("Abastecimento"), value: money(sum(ab)) });
          if (pd.length) lines.push({ label: t("Pedágios"), value: money(sum(pd)) });
          if (mn.length) lines.push({ label: t("Manutenção"), value: money(sum(mn)) });
          if (ol.length) lines.push({ label: t("Troca de Óleo"), value: money(sum(ol)) });
          if (ou.length) lines.push({ label: t("Outros"), value: money(sum(ou)) });
        }
        lines.push({ label: t("Total de despesas"), value: money(sum(items)) });
        const totalDiesel = items.reduce((s, r) => s + (r.dieselLiters || 0), 0);
        const totalArla = items.reduce((s, r) => s + (r.arlaLiters || 0), 0);
        if (totalDiesel > 0) lines.push({ label: t("Litros de Diesel"), value: `${formatDecimal(totalDiesel)} L` });
        if (totalArla > 0) lines.push({ label: t("Litros de ARLA 32"), value: `${formatDecimal(totalArla)} L` });
        return lines;
      }}
      pdfHeaders={[t("Data"), t("Tipo"), t("Local / descrição"), t("Valor")]}
      alignRight={[false, false, false, true]}
      pdfCells={(x) => [
        formatDateBR(x.date),
        x.typeLabel,
        [x.place, x.detail].filter(Boolean).join(" · ") || "—",
        money(x.value),
      ]}
      csvHeaders={[t("Data"), t("Tipo"), t("Local"), t("Descrição"), t("Valor")]}
      csvCells={(x) => [formatDateBR(x.date), x.typeLabel, x.place, x.detail, String(x.value)]}
      emptyLabel={t("Nenhuma despesa no período.")}
      countLabel={(n) => t("{n} despesa(s) no período", { n })}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onBrandPrimary },
}));
