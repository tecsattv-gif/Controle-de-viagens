import { Maintenance, useMaintenances, useDeleteMaintenance } from "@/src/api/maintenance";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { formatDateBR, money } from "@/src/utils/format";
import { useRouter } from "expo-router";

export default function RelatorioManutencaoScreen() {
  const t = useT();
  const router = useRouter();
  const { data } = useMaintenances();
  const del = useDeleteMaintenance();
  const removeWithUndo = useUndoableDelete();

  return (
    <PeriodReport<Maintenance>
      title={t("Relatório de Manutenção")}
      pdfTitle={t("RELATÓRIO DE MANUTENÇÃO")}
      screenTestId="relatorio-manutencao-screen"
      idPrefix="manut"
      fileBase="manutencao"
      data={data}
      getDate={(x) => x.date}
      onEditItem={(x) => router.push({ pathname: "/manutencao-form", params: { id: x.id } })}
      onDeleteItem={(x) => removeWithUndo({ queryKey: ["maintenances"], id: x.id, run: () => del.mutateAsync(x.id) })}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: money(x.price),
        infos: [
          x.category ? t(x.category) : "",
          x.description || "",
          x.place || "",
          x.km ? t("KM: {km}", { km: x.km }) : "",
        ],
      })}
      totals={(items) => [
        { label: t("Total gasto"), value: money(items.reduce((s, x) => s + (x.price || 0), 0)) },
      ]}
      pdfHeaders={[t("Data"), t("Categoria"), t("Descrição"), t("Local"), t("KM"), t("Valor")]}
      alignRight={[false, false, false, false, true, true]}
      pdfCells={(x) => [
        formatDateBR(x.date),
        x.category ? t(x.category) : "—",
        x.description || "—",
        x.place || "—",
        x.km ? String(x.km) : "—",
        money(x.price),
      ]}
      csvHeaders={[t("Data"), t("Categoria"), t("Descrição"), t("Local"), t("KM"), t("Valor")]}
      csvCells={(x) => [
        formatDateBR(x.date),
        x.category ? t(x.category) : "",
        x.description || "",
        x.place || "",
        x.km ? String(x.km) : "",
        money(x.price),
      ]}
      emptyLabel={t("Nenhuma manutenção no período.")}
      countLabel={(n) => t("{n} manutenção(ões) no período", { n })}
    />
  );
}
