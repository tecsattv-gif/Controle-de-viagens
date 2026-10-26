import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Drop, FilePdf, Gauge, MapPin, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDailyLogs } from "@/src/api/dailyLogs";
import {
  OilChange,
  OilComponent,
  componentStatus,
  maxKmFrom,
  useDeleteOilChange,
  useOilChanges,
} from "@/src/api/oilChanges";
import { useTrips } from "@/src/api/trips";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt, money, toISODate } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function TrocaOleoHistoricoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data, isLoading, isError, refetch } = useOilChanges();
  const { data: trips } = useTrips();
  const { data: dailyLogs } = useDailyLogs();
  const deleteM = useDeleteOilChange();
  const removeWithUndo = useUndoableDelete();
  const { companyName, companyLogoUrl } = useReportHeader();
  const [exporting, setExporting] = useState(false);

  const currentKm = maxKmFrom(trips, dailyLogs, data);
  const todayISO = toISODate(new Date());
  const items = data ?? [];

  const openForm = (id?: string) => {
    if (id) router.push({ pathname: "/troca-oleo-form", params: { id } });
    else router.push("/troca-oleo-form");
  };

  const reasonText = (byKm: boolean, byTime: boolean) =>
    byKm && byTime ? t("KM e tempo") : byKm ? t("KM") : t("tempo");

  const exportPdf = async () => {
    setExporting(true);
    const companyHtml = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const block = (rec: OilChange) => {
      const comps = (rec.components || [])
        .filter((c) => c.enabled)
        .map((c) => {
          const parts = [esc(t(c.label))];
          const spec = [c.oil_type, c.brand].filter(Boolean).join(" · ");
          if (spec) parts.push(esc(spec));
          if (c.liters) parts.push(`${c.liters} L`);
          if (c.value) parts.push(esc(money(c.value)));
          let nexts = "";
          if (c.next_km) nexts += ` — ${esc(t("Próxima por KM"))}: ${formatInt(c.next_km)} km`;
          if (c.next_date) nexts += ` — ${esc(t("Próxima por tempo"))}: ${esc(formatDateBR(c.next_date))}`;
          return `<li>${parts.join(" · ")}${nexts}</li>`;
        })
        .join("");
      const flt = (rec.filters || []).map((f) => esc(t(f.label))).join(", ");
      return `<div class="rec">
        <div class="recHead"><span class="recDate">${esc(formatDateBR(rec.date))}</span><span class="recTot">${esc(money(rec.total))}</span></div>
        <div class="line"><b>${esc(t("Veículo"))}:</b> ${esc(rec.vehicle_plate || rec.vehicle_label || "—")} &nbsp; <b>KM:</b> ${formatInt(rec.km)}</div>
        ${rec.place ? `<div class="line"><b>${esc(t("Local / oficina"))}:</b> ${esc(rec.place)}</div>` : ""}
        ${comps ? `<div class="line"><b>${esc(t("Óleos"))}:</b></div><ul>${comps}</ul>` : ""}
        ${flt ? `<div class="line"><b>${esc(t("Filtros substituídos"))}:</b> ${flt}</div>` : ""}
      </div>`;
    };
    const body = items.length
      ? items.map(block).join("")
      : `<div class="muted">${esc(t("Nenhuma troca registrada."))}</div>`;
    const grandTotal = items.reduce((s, r) => s + (r.total || 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        *{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
        body{color:#1A1C19;font-size:11pt;margin:24px}
        .title{color:#E65C00;font-size:18pt;font-weight:800;margin-bottom:12px}
        .rec{border:1px solid #e3e3e3;border-radius:8px;padding:10px 12px;margin-bottom:10px}
        .recHead{display:flex;justify-content:space-between;font-weight:800}
        .recDate{font-size:13pt}.recTot{color:#E65C00}
        .line{margin-top:4px;font-size:10pt}
        ul{margin:4px 0 0 0;padding-left:18px;font-size:9.5pt}
        .muted{color:#888;text-align:center;padding:16px}
        .grand{margin-top:12px;background:#121212;color:#fff;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;font-weight:700}
        .grand .val{color:#FF8A3D}
      </style></head><body>
      ${companyHtml}
      <div class="title">${esc(t("RELATÓRIO DE TROCA DE ÓLEO E FILTROS"))}</div>
      ${body}
      <div class="grand"><span>${esc(t("Total geral"))}</span><span class="val">${esc(money(grandTotal))}</span></div>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: t("Troca de Óleo e Filtros"), UTI: "com.adobe.pdf" });
      }
    } catch {
      try {
        await Print.printAsync({ html });
      } catch {
        // ignore
      }
    } finally {
      setExporting(false);
    }
  };

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="troca-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar as trocas.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="troca-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="troca-empty">
        <Drop size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhuma troca")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Cadastrar Troca” para registrar a primeira.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="troca-oleo-historico-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="troca-hist-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Histórico")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <OilChangeCard
            item={item}
            currentKm={currentKm}
            todayISO={todayISO}
            reasonText={reasonText}
            onEdit={openForm}
            onDelete={(id) => removeWithUndo({ queryKey: ["oil-changes"], id, run: () => deleteM.mutateAsync(id) })}
          />
        )}
        ListEmptyComponent={emptyNode}
        ListFooterComponent={
          items.length > 0 ? (
            <Pressable style={[styles.pdfBtn, exporting && styles.disabled]} onPress={exportPdf} disabled={exporting} testID="troca-export-pdf">
              {exporting ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <FilePdf size={22} color={colors.onBrandPrimary} weight="bold" />
                  <Text style={styles.pdfText}>{t("Exportar PDF")}</Text>
                </>
              )}
            </Pressable>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
      />
    </View>
  );
}

function OilChangeCard({
  item,
  currentKm,
  todayISO,
  reasonText,
  onEdit,
  onDelete,
}: {
  item: OilChange;
  currentKm: number;
  todayISO: string;
  reasonText: (byKm: boolean, byTime: boolean) => string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  const comps = (item.components || []).filter((c) => c.enabled);
  const filters = item.filters || [];

  const renderComp = (c: OilComponent, i: number) => {
    const hasInterval = c.control === "km" || c.control === "time" || c.control === "both";
    const st = hasInterval ? componentStatus(c, currentKm, todayISO) : null;
    const spec = [c.oil_type, c.brand].filter(Boolean).join(" · ");
    return (
      <View key={i} style={styles.compBox}>
        <Text style={styles.compTitle}>{t(c.label)}</Text>
        {spec || c.liters || c.value ? (
          <Text style={styles.compSpec}>
            {[spec, c.liters ? `${c.liters} L` : "", c.value ? money(c.value) : ""].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {c.next_km ? <Text style={styles.compNext}>{t("Próxima por KM")}: {formatInt(c.next_km)} km</Text> : null}
        {c.next_date ? <Text style={styles.compNext}>{t("Próxima por tempo")}: {formatDateBR(c.next_date)}</Text> : null}
        {st && st.status === "overdue" ? (
          <Text style={styles.badgeOverdue}>🔴 {t("TROCA VENCIDA")} ({reasonText(st.byKm, st.byTime)})</Text>
        ) : st && st.status === "upcoming" ? (
          <Text style={styles.badgeUpcoming}>🟡 {t("Troca próxima")} ({reasonText(st.byKm, st.byTime)})</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SwipeableRow onEdit={() => onEdit(item.id)} onDelete={() => onDelete(item.id)} testID={`troca-card-${item.id}`}>
      <View style={styles.cardHead}>
        <Text style={styles.cardDate}>{formatDateBR(item.date)}</Text>
        <Text style={styles.cardTotal}>{money(item.total)}</Text>
      </View>
      <Text style={styles.vehicle} numberOfLines={1}>
        {item.vehicle_plate || item.vehicle_label || t("Sem veículo")}
      </Text>
      <View style={styles.metaRow}>
        <Gauge size={14} color={colors.muted} weight="bold" />
        <Text style={styles.metaText}>{formatInt(item.km)} km</Text>
        {item.traction ? <Text style={styles.metaText}>· {item.traction}</Text> : null}
      </View>
      {item.place ? (
        <View style={styles.metaRow}>
          <MapPin size={14} color={colors.muted} weight="regular" />
          <Text style={styles.metaText} numberOfLines={1}>{item.place}</Text>
        </View>
      ) : null}

      {comps.map(renderComp)}

      {filters.length > 0 ? (
        <Text style={styles.filterLine}>
          {t("Filtros substituídos")}: {filters.map((f) => t(f.label)).join(", ")}
        </Text>
      ) : null}
    </SwipeableRow>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, marginTop: 40 },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  dimText: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brandPrimary },
  retryText: { fontFamily: fonts.body, fontSize: 15, fontWeight: "700", color: colors.onBrandPrimary },
  listContent: { padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  cardTotal: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary },
  vehicle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  compBox: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  compTitle: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface },
  compSpec: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  compNext: { fontFamily: fonts.body, fontSize: 12, color: colors.brandPrimary, marginTop: 2 },
  badgeOverdue: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.error, marginTop: 4 },
  badgeUpcoming: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.warning ?? colors.brandPrimary, marginTop: 4 },
  filterLine: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 8 },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.5 },
  pdfText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
