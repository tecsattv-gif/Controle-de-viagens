import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { ClipboardText, FilePdf, Gauge, Truck, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ServiceOrder,
  formatOsNumber,
  useDeleteServiceOrder,
  useServiceOrders,
} from "@/src/api/serviceOrders";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";
import { htmlToPdf } from "@/src/utils/pdf";
import { themeReportHtml } from "@/src/utils/reportColors";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function OsHistoricoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data, isLoading, isError, refetch } = useServiceOrders();
  const deleteM = useDeleteServiceOrder();
  const removeWithUndo = useUndoableDelete();
  const { companyName, companyLogoUrl } = useReportHeader();
  const [exportingId, setExportingId] = useState<string | null>(null);

  const items = data ?? [];

  const openForm = (id?: string) => {
    if (id) router.push({ pathname: "/os-form", params: { id } });
    else router.push("/os-form");
  };

  const exportPdf = async (rec: ServiceOrder) => {
    setExportingId(rec.id);
    const companyHtml = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const services = (rec.descriptions || [])
      .map((d, i) => `<li><span class="sn">${i + 1}.</span> ${esc(d)}</li>`)
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        *{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
        body{color:#1A1C19;font-size:11pt;margin:28px}
        .osTitle{color:#E65C00;font-size:15pt;font-weight:800;margin:4px 0 8px 0}
        .info{border:1px solid #e3e3e3;border-radius:8px;padding:6px 10px;margin-bottom:10px;font-size:10pt;line-height:1.5}
        .info .row{display:flex;flex-wrap:wrap;gap:4px 18px}
        .info .cell{white-space:nowrap}
        .info .k{font-weight:800}
        .svcHead{font-size:12pt;font-weight:800;color:#121212;margin:6px 0 6px 0;letter-spacing:0.5px}
        ol,ul{margin:0;padding:0;list-style:none}
        li{padding:8px 0;border-bottom:1px solid #eee;font-size:12pt}
        li .sn{font-weight:800;color:#E65C00;margin-right:6px}
      </style></head><body>
      ${companyHtml}
      <div class="osTitle">${esc(t("ORDEM DE SERVIÇO"))} – ${esc(t("OS Nº {n}", { n: formatOsNumber(rec.number) }))}</div>
      <div class="info">
        <div class="row">
          <span class="cell"><span class="k">${esc(t("Data"))}:</span> ${esc(formatDateBR(rec.date))}</span>
          <span class="cell"><span class="k">${esc(t("KM"))}:</span> ${rec.km ? formatInt(rec.km) : "—"}</span>
        </div>
        <div class="row">
          <span class="cell"><span class="k">${esc(t("Matrícula do veículo"))}:</span> ${esc(rec.vehicle_plate || "—")}</span>
          <span class="cell"><span class="k">${esc(t("Matrícula do reboque"))}:</span> ${esc(rec.trailer_plate || "—")}</span>
        </div>
      </div>
      <div class="svcHead">${esc(t("SERVIÇOS A SEREM REALIZADOS"))}</div>
      <ul>${services}</ul>
    </body></html>`;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: t("OS Nº {n}", { n: formatOsNumber(rec.number) }),
          UTI: "com.adobe.pdf",
        });
      }
    } catch {
      try {
        await Print.printAsync({ html: themeReportHtml(html) });
      } catch {
        // ignore
      }
    } finally {
      setExportingId(null);
    }
  };

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="os-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar as ordens de serviço.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="os-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="os-empty">
        <ClipboardText size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhuma OS")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Nova OS” para cadastrar a primeira.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="os-historico-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="os-hist-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Histórico de OS")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <SwipeableRow
            onEdit={() => openForm(item.id)}
            onDelete={() =>
              removeWithUndo({ queryKey: ["service-orders"], id: item.id, run: () => deleteM.mutateAsync(item.id) })
            }
            testID={`os-card-${item.id}`}
          >
            <View style={styles.cardHead}>
              <Text style={styles.osNumber}>{t("OS Nº {n}", { n: formatOsNumber(item.number) })}</Text>
              <Text style={styles.cardDate}>{formatDateBR(item.date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Truck size={14} color={colors.muted} weight="bold" />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.vehicle_plate || t("Sem veículo")}
                {item.trailer_plate ? ` · ${item.trailer_plate}` : ""}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Gauge size={14} color={colors.muted} weight="bold" />
              <Text style={styles.metaText}>{item.km ? `${formatInt(item.km)} km` : "—"}</Text>
            </View>

            {(item.descriptions || []).map((d, i) => (
              <Text key={i} style={styles.descLine}>
                <Text style={styles.descNum}>{i + 1}. </Text>
                {d}
              </Text>
            ))}

            <Pressable
              style={[styles.pdfBtn, exportingId === item.id && styles.disabled]}
              onPress={() => exportPdf(item)}
              disabled={exportingId === item.id}
              testID={`os-pdf-${item.id}`}
            >
              {exportingId === item.id ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <FilePdf size={20} color={colors.onBrandPrimary} weight="bold" />
                  <Text style={styles.pdfText}>{t("Gerar PDF")}</Text>
                </>
              )}
            </Pressable>
          </SwipeableRow>
        )}
        ListEmptyComponent={emptyNode}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
      />
    </View>
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
  osNumber: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary, letterSpacing: 0.3 },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurfaceSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  descLine: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, marginTop: 8, lineHeight: 20 },
  descNum: { fontFamily: fonts.displaySemiBold, color: colors.onSurface },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 10,
    marginTop: 14,
    backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.5 },
  pdfText: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.3, color: colors.onBrandPrimary },
}));
