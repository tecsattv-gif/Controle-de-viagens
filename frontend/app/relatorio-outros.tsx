import { OtherExpense, useDeleteOtherExpense, useOtherExpenses } from "@/src/api/otherExpenses";
import { PeriodReport } from "@/src/components/PeriodReport";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { formatDateBR, money } from "@/src/utils/format";
import { useRouter } from "expo-router";

export default function RelatorioOutrosScreen() {
  const t = useT();
  const router = useRouter();
  const { data } = useOtherExpenses();
  const del = useDeleteOtherExpense();
  const removeWithUndo = useUndoableDelete();

  return (
    <PeriodReport<OtherExpense>
      title={t("Relatório de Outras Despesas")}
      pdfTitle={t("RELATÓRIO DE OUTRAS DESPESAS")}
      screenTestId="relatorio-outros-screen"
      idPrefix="outros"
      fileBase="outras-despesas"
      data={data}
      getDate={(x) => x.date}
      onEditItem={(x) => router.push({ pathname: "/outros-form", params: { id: x.id } })}
      onDeleteItem={(x) => removeWithUndo({ queryKey: ["other-expenses"], id: x.id, run: () => del.mutateAsync(x.id) })}
      renderRow={(x) => ({
        left: formatDateBR(x.date),
        right: money(x.value),
        infos: [x.service || "", x.place || ""],
      })}
      totals={(items) => [
        { label: t("Total gasto"), value: money(items.reduce((s, x) => s + (x.value || 0), 0)) },
      ]}
      pdfHeaders={[t("Data"), t("Serviço prestado"), t("Local"), t("Valor")]}
      alignRight={[false, false, false, true]}
      pdfCells={(x) => [formatDateBR(x.date), x.service || "—", x.place || "—", money(x.value)]}
      csvHeaders={[t("Data"), t("Serviço prestado"), t("Local"), t("Valor")]}
      csvCells={(x) => [formatDateBR(x.date), x.service || "", x.place || "", money(x.value)]}
      emptyLabel={t("Nenhuma despesa no período.")}
      countLabel={(n) => t("{n} despesa(s) no período", { n })}
    />
  );
}
