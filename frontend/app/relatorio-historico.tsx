import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { dailyKm, DailyLog, useDailyLogs, useDeleteDailyLog } from "@/src/api/dailyLogs";
import { Freight, useFreights, useDeleteFreight } from "@/src/api/freights";
import { Maintenance, useMaintenances, useDeleteMaintenance } from "@/src/api/maintenance";
import { OtherExpense, useOtherExpenses, useDeleteOtherExpense } from "@/src/api/otherExpenses";
import { Refueling, useRefuelings, useDeleteRefueling } from "@/src/api/refuelings";
import { TollExpense, useTollExpenses, useDeleteTollExpense } from "@/src/api/tollExpenses";
import { Trip, useTrips, useDeleteTrip } from "@/src/api/trips";
import { MonthlyKm, isMonthlyOpen, useMonthlyKm, useDeleteMonthlyKm } from "@/src/api/monthlyKm";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt, money } from "@/src/utils/format";

type Category =
  | "todos"
  | "viagens"
  | "fretes"
  | "abastecimento"
  | "pedagios"
  | "manutencao"
  | "outros"
  | "controle"
  | "mensal";

type HType = "viagem" | "frete" | "abastecimento" | "pedagios" | "manutencao" | "outros" | "controle" | "mensal";

type HistRow = {
  id: string;
  date: string;
  type: HType;
  typeLabel: string;
  right: string;
  infos: string[];
  km: number;
  value: number;
};

function refuelingValue(r: Refueling): number {
  return (r.diesel_liters || 0) * (r.diesel_price || 0) + (r.arla_liters || 0) * (r.arla_price || 0);
}

export default function RelatorioHistoricoScreen() {
  const styles = useStyles();
  const t = useT();
  const router = useRouter();
  const [category, setCategory] = useState<Category>("todos");

  const { data: trips } = useTrips();
  const { data: freights } = useFreights();
  const { data: refuelings } = useRefuelings();
  const { data: tolls } = useTollExpenses();
  const { data: maintenances } = useMaintenances();
  const { data: dailyLogs } = useDailyLogs();
  const { data: others } = useOtherExpenses();
  const { data: monthlyKm } = useMonthlyKm();
  const delTrip = useDeleteTrip();
  const delFreight = useDeleteFreight();
  const delRefuel = useDeleteRefueling();
  const delToll = useDeleteTollExpense();
  const delMaint = useDeleteMaintenance();
  const delDaily = useDeleteDailyLog();
  const delOther = useDeleteOtherExpense();
  const delMensal = useDeleteMonthlyKm();
  const removeWithUndo = useUndoableDelete();

  const deleteRow = (x: HistRow) => {
    const map = {
      viagem: { qk: ["trips"] as const, run: () => delTrip.mutateAsync(x.id) },
      frete: { qk: ["freights"] as const, run: () => delFreight.mutateAsync(x.id) },
      abastecimento: { qk: ["refuelings"] as const, run: () => delRefuel.mutateAsync(x.id) },
      pedagios: { qk: ["toll-expenses"] as const, run: () => delToll.mutateAsync(x.id) },
      manutencao: { qk: ["maintenances"] as const, run: () => delMaint.mutateAsync(x.id) },
      outros: { qk: ["other-expenses"] as const, run: () => delOther.mutateAsync(x.id) },
      controle: { qk: ["daily-logs"] as const, run: () => delDaily.mutateAsync(x.id) },
      mensal: { qk: ["monthly-km"] as const, run: () => delMensal.mutateAsync(x.id) },
    };
    const m = map[x.type as keyof typeof map];
    if (m) removeWithUndo({ queryKey: m.qk, id: x.id, run: m.run });
  };

  const tripRows: HistRow[] = (trips ?? []).map((x: Trip) => ({
    id: x.id,
    date: x.date,
    type: "viagem",
    typeLabel: t("Viagem"),
    right: `${formatInt(x.km || 0)} km`,
    infos: [[x.loading_place, x.unloading_place].filter(Boolean).join(" → ")],
    km: x.km || 0,
    value: 0,
  }));
  const freightRows: HistRow[] = (freights ?? []).map((x: Freight) => ({
    id: x.id,
    date: x.date,
    type: "frete",
    typeLabel: t("Frete"),
    right: money(x.value || 0),
    infos: [x.client || "", [x.origin, x.destination].filter(Boolean).join(" → ")],
    km: 0,
    value: x.value || 0,
  }));
  const refuelRows: HistRow[] = (refuelings ?? []).map((x: Refueling) => ({
    id: x.id,
    date: x.date,
    type: "abastecimento",
    typeLabel: t("Abastecimento"),
    right: money(refuelingValue(x)),
    infos: [x.station_place || x.station_name || ""],
    km: 0,
    value: refuelingValue(x),
  }));
  const tollRows: HistRow[] = (tolls ?? []).map((x: TollExpense) => ({
    id: x.id,
    date: x.date,
    type: "pedagios",
    typeLabel: t("Pedágios"),
    right: money(x.value || 0),
    infos: [x.place || ""],
    km: 0,
    value: x.value || 0,
  }));
  const maintRows: HistRow[] = (maintenances ?? []).map((x: Maintenance) => ({
    id: x.id,
    date: x.date,
    type: "manutencao",
    typeLabel: t("Manutenção"),
    right: money(x.price || 0),
    infos: [[x.category, x.description].filter(Boolean).join(" · ")],
    km: 0,
    value: x.price || 0,
  }));
  const controleRows: HistRow[] = (dailyLogs ?? []).map((x: DailyLog) => ({
    id: x.id,
    date: x.date,
    type: "controle",
    typeLabel: t("Controle Diário"),
    right: `${formatInt(dailyKm(x))} km`,
    infos: [[x.start_place, x.end_place].filter(Boolean).join(" → ")],
    km: dailyKm(x),
    value: 0,
  }));
  const otherRows: HistRow[] = (others ?? []).map((x: OtherExpense) => ({
    id: x.id,
    date: x.date,
    type: "outros",
    typeLabel: t("Outros"),
    right: money(x.value || 0),
    infos: [[x.service, x.place].filter(Boolean).join(" · ")],
    km: 0,
    value: x.value || 0,
  }));
  const mensalRows: HistRow[] = (monthlyKm ?? []).map((x: MonthlyKm) => {
    const open = isMonthlyOpen(x);
    const km = !open && x.end_km > x.start_km ? x.end_km - x.start_km : 0;
    return {
      id: x.id,
      date: x.start_date,
      type: "mensal",
      typeLabel: t("Controle Mensal"),
      right: open ? t("Em aberto") : `${formatInt(km)} km`,
      infos: [
        `${t("KM inicial")}: ${formatInt(x.start_km)}` + (open ? "" : ` · ${t("KM final")}: ${formatInt(x.end_km)}`),
      ],
      km,
      value: 0,
    };
  });

  const dataByCategory: Record<Category, HistRow[]> = {
    todos: [...tripRows, ...freightRows, ...refuelRows, ...tollRows, ...maintRows, ...otherRows, ...controleRows, ...mensalRows],
    viagens: tripRows,
    fretes: freightRows,
    abastecimento: refuelRows,
    pedagios: tollRows,
    manutencao: maintRows,
    outros: otherRows,
    controle: controleRows,
    mensal: mensalRows,
  };
  const data = dataByCategory[category];

  const editRoute: Record<HType, string> = {
    viagem: "/editar-viagem",
    frete: "/frete-form",
    abastecimento: "/abastecimento-form",
    pedagios: "/pedagio-form",
    manutencao: "/manutencao-form",
    outros: "/outros-form",
    controle: "/controle-diario-form",
    mensal: "/controle-mensal-form",
  };

  const chips: { key: Category; label: string }[] = [
    { key: "todos", label: t("Todos") },
    { key: "viagens", label: t("Viagens") },
    { key: "fretes", label: t("Fretes") },
    { key: "abastecimento", label: t("Abastecimento") },
    { key: "pedagios", label: t("Pedágios") },
    { key: "manutencao", label: t("Manutenção") },
    { key: "outros", label: t("Outros") },
    { key: "controle", label: t("Controle Diário") },
    { key: "mensal", label: t("Controle Mensal") },
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
            testID={`hist-cat-${c.key}`}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const sumKm = (rows: HistRow[]) => rows.reduce((s, r) => s + r.km, 0);
  const sumVal = (rows: HistRow[]) => rows.reduce((s, r) => s + r.value, 0);

  return (
    <PeriodReport<HistRow>
      key={category}
      title={t("Relatório Geral")}
      pdfTitle={t("RELATÓRIO GERAL")}
      screenTestId="relatorio-historico-screen"
      idPrefix="histrel"
      fileBase="relatorio_geral"
      data={data}
      getDate={(x) => x.date}
      topContent={topContent}
      onEditItem={(x) => router.push({ pathname: editRoute[x.type], params: { id: x.id } })}
      onDeleteItem={deleteRow}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: x.right,
        infos: [x.typeLabel, ...x.infos.filter(Boolean)],
      })}
      totals={(items) => {
        const lines: { label: string; value: string }[] = [];
        const trip = items.filter((r) => r.type === "viagem");
        const ctrl = items.filter((r) => r.type === "controle");
        const frt = items.filter((r) => r.type === "frete");
        const desp = items.filter(
          (r) => r.type === "abastecimento" || r.type === "pedagios" || r.type === "manutencao" || r.type === "outros",
        );
        if (trip.length) lines.push({ label: t("KM em viagens"), value: `${formatInt(sumKm(trip))} km` });
        if (ctrl.length) lines.push({ label: t("KM no controle diário"), value: `${formatInt(sumKm(ctrl))} km` });
        const mes = items.filter((r) => r.type === "mensal");
        if (mes.length) lines.push({ label: t("KM no controle mensal"), value: `${formatInt(sumKm(mes))} km` });
        if (frt.length) lines.push({ label: t("Total de fretes"), value: money(sumVal(frt)) });
        if (desp.length) lines.push({ label: t("Total de despesas"), value: money(sumVal(desp)) });
        lines.push({ label: t("Registros"), value: String(items.length) });
        return lines;
      }}
      pdfHeaders={[t("Data"), t("Tipo"), t("Descrição"), t("KM / Valor")]}
      alignRight={[false, false, false, true]}
      pdfCells={(x) => [formatDateBR(x.date), x.typeLabel, x.infos.filter(Boolean).join(" · ") || "—", x.right]}
      csvHeaders={[t("Data"), t("Tipo"), t("Descrição"), t("KM"), t("Valor")]}
      csvCells={(x) => [
        formatDateBR(x.date),
        x.typeLabel,
        x.infos.filter(Boolean).join(" · "),
        x.km ? String(x.km) : "",
        x.value ? String(x.value) : "",
      ]}
      emptyLabel={t("Nenhum registro no período.")}
      countLabel={(n) => t("{n} registro(s) no período", { n })}
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
