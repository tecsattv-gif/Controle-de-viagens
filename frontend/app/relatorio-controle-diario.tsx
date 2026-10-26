import { useRouter } from "expo-router";

import { dailyKm, DailyLog, useDailyLogs, useDeleteDailyLog } from "@/src/api/dailyLogs";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { formatDateBR, formatInt } from "@/src/utils/format";

function stopsText(x: DailyLog): string {
  return (x.stops || [])
    .map((s) => [s.time, s.place].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" • ");
}

function routeText(x: DailyLog): string {
  return [x.start_place, x.end_place].filter(Boolean).join(" → ");
}

export default function RelatorioControleDiarioScreen() {
  const t = useT();
  const router = useRouter();
  const { data } = useDailyLogs();
  const del = useDeleteDailyLog();
  const removeWithUndo = useUndoableDelete();

  return (
    <PeriodReport<DailyLog>
      title={t("Relatório Controle Diário")}
      pdfTitle={t("RELATÓRIO CONTROLE DIÁRIO")}
      screenTestId="relatorio-controle-diario-screen"
      idPrefix="cd"
      fileBase="controle_diario"
      data={data}
      getDate={(x) => x.date}
      onEditItem={(x) => router.push({ pathname: "/controle-diario-form", params: { id: x.id } })}
      onDeleteItem={(x) => removeWithUndo({ queryKey: ["daily-logs"], id: x.id, run: () => del.mutateAsync(x.id) })}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: `${formatInt(dailyKm(x))} km`,
        infos: [
          routeText(x),
          [x.start_time, x.end_time].filter(Boolean).join(" - "),
          stopsText(x) ? t("Paradas: {s}", { s: stopsText(x) }) : "",
        ],
      })}
      totals={(items) => [
        { label: t("Total de KM no período"), value: `${formatInt(items.reduce((s, x) => s + dailyKm(x), 0))} km` },
        { label: t("Dias registrados"), value: String(items.length) },
      ]}
      pdfHeaders={[t("Data"), t("Início"), t("Fim"), t("KM inicial"), t("KM final"), t("KM do dia"), t("Paradas")]}
      alignRight={[false, false, false, true, true, true, false]}
      pdfCells={(x) => [
        formatDateBR(x.date),
        [x.start_time, x.start_place].filter(Boolean).join(" ") || "—",
        [x.end_time, x.end_place].filter(Boolean).join(" ") || "—",
        String(x.start_km),
        String(x.end_km),
        `${formatInt(dailyKm(x))} km`,
        stopsText(x) || "—",
      ]}
      csvHeaders={[t("Data"), t("Local início"), t("Hora início"), t("Local fim"), t("Hora fim"), t("KM inicial"), t("KM final"), t("KM do dia"), t("Paradas")]}
      csvCells={(x) => [
        formatDateBR(x.date),
        x.start_place || "",
        x.start_time || "",
        x.end_place || "",
        x.end_time || "",
        String(x.start_km),
        String(x.end_km),
        String(dailyKm(x)),
        stopsText(x),
      ]}
      emptyLabel={t("Nenhum controle diário no período.")}
      countLabel={(n) => t("{n} controle(s) no período", { n })}
    />
  );
}
