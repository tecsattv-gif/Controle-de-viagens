import { TollExpense, useTollExpenses, useDeleteTollExpense } from "@/src/api/tollExpenses";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { formatDateBR, money } from "@/src/utils/format";
import { useRouter } from "expo-router";

export default function RelatorioPedagiosScreen() {
  const t = useT();
  const router = useRouter();
  const { data } = useTollExpenses();
  const del = useDeleteTollExpense();
  const removeWithUndo = useUndoableDelete();

  return (
    <PeriodReport<TollExpense>
      title={t("Relatório de Pedágios")}
      pdfTitle={t("RELATÓRIO DE PEDÁGIOS")}
      screenTestId="relatorio-pedagios-screen"
      idPrefix="pedagio"
      fileBase="pedagios"
      data={data}
      getDate={(x) => x.date}
      onEditItem={(x) => router.push({ pathname: "/pedagio-form", params: { id: x.id } })}
      onDeleteItem={(x) => removeWithUndo({ queryKey: ["toll-expenses"], id: x.id, run: () => del.mutateAsync(x.id) })}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: money(x.value),
        infos: [x.place || ""],
      })}
      totals={(items) => [
        { label: t("Total gasto"), value: money(items.reduce((s, x) => s + (x.value || 0), 0)) },
      ]}
      pdfHeaders={[t("Data"), t("Local"), t("Valor")]}
      alignRight={[false, false, true]}
      pdfCells={(x) => [formatDateBR(x.date), x.place || "—", money(x.value)]}
      csvHeaders={[t("Data"), t("Local"), t("Valor")]}
      csvCells={(x) => [formatDateBR(x.date), x.place || "", money(x.value)]}
      emptyLabel={t("Nenhum pedágio no período.")}
      countLabel={(n) => t("{n} pedágio(s) no período", { n })}
    />
  );
}
