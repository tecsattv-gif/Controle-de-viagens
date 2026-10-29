import { MonthlyKm, isMonthlyOpen, useDeleteMonthlyKm, useMonthlyKm } from "@/src/api/monthlyKm";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { formatDateBR, formatInt } from "@/src/utils/format";
import { useRouter } from "expo-router";

function kmOf(x: MonthlyKm): number {
  return !isMonthlyOpen(x) && x.end_km > x.start_km ? x.end_km - x.start_km : 0;
}

export default function RelatorioControleMensalScreen() {
  const t = useT();
  const router = useRouter();
  const { data } = useMonthlyKm();
  const del = useDeleteMonthlyKm();
  const removeWithUndo = useUndoableDelete();

  return (
    <PeriodReport<MonthlyKm>
      title={t("Relatório do Controle Mensal")}
      pdfTitle={t("RELATÓRIO DO CONTROLE MENSAL DE KM")}
      screenTestId="relatorio-controle-mensal-screen"
      idPrefix="mensal"
      fileBase="controle-mensal"
      data={data}
      getDate={(x) => x.start_date}
      onEditItem={(x) => router.push({ pathname: "/controle-mensal-form", params: { id: x.id } })}
      onDeleteItem={(x) => removeWithUndo({ queryKey: ["monthly-km"], id: x.id, run: () => del.mutateAsync(x.id) })}
      renderRow={(x) => ({
        left: `${formatDateBR(x.start_date)}${x.end_date ? ` → ${formatDateBR(x.end_date)}` : ""}`,
        right: isMonthlyOpen(x) ? t("Em aberto") : `${formatInt(kmOf(x))} km`,
        infos: [
          `${t("KM inicial")}: ${formatInt(x.start_km)}`,
          `${t("KM final")}: ${isMonthlyOpen(x) ? "—" : formatInt(x.end_km)}`,
        ],
      })}
      totals={(items) => [
        { label: t("KM rodados"), value: `${formatInt(items.reduce((s, x) => s + kmOf(x), 0))} km` },
      ]}
      pdfHeaders={[t("Início"), t("Fim"), t("KM inicial"), t("KM final"), t("KM rodados")]}
      alignRight={[false, false, true, true, true]}
      pdfCells={(x) => [
        formatDateBR(x.start_date),
        x.end_date ? formatDateBR(x.end_date) : "—",
        formatInt(x.start_km),
        isMonthlyOpen(x) ? "—" : formatInt(x.end_km),
        isMonthlyOpen(x) ? t("Em aberto") : formatInt(kmOf(x)),
      ]}
      csvHeaders={[t("Início"), t("Fim"), t("KM inicial"), t("KM final"), t("KM rodados")]}
      csvCells={(x) => [
        formatDateBR(x.start_date),
        x.end_date ? formatDateBR(x.end_date) : "",
        String(x.start_km || ""),
        isMonthlyOpen(x) ? "" : String(x.end_km),
        isMonthlyOpen(x) ? "" : String(kmOf(x)),
      ]}
      emptyLabel={t("Nenhum controle mensal no período.")}
      countLabel={(n) => t("{n} controle(s) mensal(is) no período", { n })}
    />
  );
}
