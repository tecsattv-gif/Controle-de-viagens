import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { CheckCircle, Camera, Copy, FileArrowUp, FilePdf, Image as ImageIcon, Warning, X } from "phosphor-react-native";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePaymentInfo } from "@/src/api/license";
import { amountLabel, openMyProof, PaymentRequest, useMyPaymentRequests, useSubmitPaymentRequest } from "@/src/api/paymentRequests";
import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR } from "@/src/utils/format";
import { NetworkError } from "@/src/utils/upload";

type Proof = { uri: string; name: string; isPdf: boolean } | null;

const newCid = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export default function AtivarScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { user, refreshMe } = useAuth();
  const { data: info, isLoading } = usePaymentInfo();
  const { data: myRequests, refetch: refetchRequests } = useMyPaymentRequests();
  const submit = useSubmitPaymentRequest();

  const [method, setMethod] = useState<"IBAN" | "PIX" | "">("");
  const [proof, setProofState] = useState<Proof>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const cidRef = useRef(newCid());
  const busyRef = useRef(false);

  // A new file means a new request id; retrying the same file reuses it (no duplicates).
  const setProof = (p: Proof) => {
    cidRef.current = newCid();
    setProofState(p);
  };

  const pendingReq = (myRequests ?? []).find((r) => r.status === "PENDENTE");
  const awaiting = !!pendingReq || user?.license_status === "AGUARDANDO_PAGAMENTO";
  const rejectedNote = user?.license_status === "EXPIRADO" ? (user?.payment_note || "") : "";

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert(t("Copiado"), t("{label} copiado.", { label }));
  };

  const showPickerError = (e: any) =>
    Alert.alert(t("Erro"), `${t("Não foi possível abrir a câmera/galeria.")}\n${e?.message ?? ""}`.trim());

  const pickImage = async () => {
    try {
      // Android uses the system Photo Picker, which needs no storage permission.
      if (Platform.OS === "ios") {
        const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        let granted = perm.granted;
        if (!granted && perm.canAskAgain) {
          const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
          granted = req.granted;
        }
        if (!granted) {
          Alert.alert(t("Permissão necessária"), t("Autorize o acesso à galeria para escolher uma foto."), [
            { text: t("Cancelar"), style: "cancel" },
            { text: t("Abrir ajustes"), onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (!res.canceled && res.assets?.[0]?.uri) {
        const a = res.assets[0];
        setProof({ uri: a.uri, name: a.fileName || `comprovante-${Date.now()}.jpg`, isPdf: false });
      }
    } catch (e: any) {
      showPickerError(e);
    }
  };

  const pickCamera = async () => {
    try {
      await pickCameraInner();
    } catch (e: any) {
      showPickerError(e);
    }
  };

  const pickCameraInner = async () => {
    const perm = await ImagePicker.getCameraPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) {
      const req = await ImagePicker.requestCameraPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      Alert.alert(t("Permissão necessária"), t("Autorize o acesso à câmera para tirar uma foto."), [
        { text: t("Cancelar"), style: "cancel" },
        { text: t("Abrir ajustes"), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      setProof({ uri: a.uri, name: a.fileName || `comprovante-${Date.now()}.jpg`, isPdf: false });
    }
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true });
      if (!res.canceled && res.assets?.[0]?.uri) {
        const a = res.assets[0];
        const isPdf = (a.mimeType || a.name || "").toLowerCase().includes("pdf");
        setProof({ uri: a.uri, name: a.name || `comprovante-${Date.now()}.${isPdf ? "pdf" : "jpg"}`, isPdf });
      }
    } catch (e: any) {
      showPickerError(e);
    }
  };

  const handleSubmit = async () => {
    if (busyRef.current) return;
    if (!method) {
      Alert.alert(t("Ativar versão completa"), t("Selecione a forma de pagamento."));
      return;
    }
    if (!proof) {
      Alert.alert(t("Ativar versão completa"), t("Anexe o comprovante de pagamento."));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await submit.mutateAsync({ uri: proof.uri, name: proof.name, method, amount: "", clientRequestId: cidRef.current });
      await refreshMe();
      await refetchRequests();
      setProofState(null);
      setSent(true);
    } catch (e: any) {
      const msg = e instanceof NetworkError
        ? t("Não foi possível enviar o comprovante. Verifique sua ligação à internet e tente novamente.")
        : e?.message || t("Não foi possível enviar o comprovante.");
      Alert.alert(t("Erro"), msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openProof = async (r: PaymentRequest) => {
    try {
      await openMyProof(r.request_id);
    } catch (e: any) {
      Alert.alert(t("Erro"), e?.message || t("Não foi possível abrir o comprovante."));
    }
  };

  return (
    <View style={styles.screen} testID="ativar-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="ativar-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Ativar versão completa")}</Text>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {sent ? (
          <View style={styles.successCard} testID="ativar-success">
            <CheckCircle size={22} color={colors.success} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.waitTitle}>✅ {t("Comprovante enviado com sucesso!")}</Text>
              <Text style={styles.waitSub}>{t("Seu pagamento foi encaminhado para análise.")}</Text>
              <Text style={styles.waitSub}>{t("Aguarde a confirmação do administrador para ativação da licença.")}</Text>
            </View>
          </View>
        ) : awaiting ? (
          <View style={styles.waitCard} testID="ativar-awaiting">
            <CheckCircle size={22} color={colors.info} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.waitTitle}>{t("Comprovante enviado.")}</Text>
              <Text style={styles.waitSub}>{t("Aguardando confirmação do pagamento.")}</Text>
            </View>
          </View>
        ) : null}

        {rejectedNote ? (
          <View style={styles.rejectCard}>
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.rejectText}>{t("Pagamento recusado")}: {rejectedNote}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
        ) : (
          <>
            {(info?.price_eur || info?.price_brl) ? (
              <View style={styles.priceRow}>
                {info?.price_eur ? (
                  <View style={styles.priceBox}>
                    <Text style={styles.priceLabel}>EUR (€)</Text>
                    <Text style={styles.priceValue}>€ {info.price_eur}</Text>
                  </View>
                ) : null}
                {info?.price_brl ? (
                  <View style={styles.priceBox}>
                    <Text style={styles.priceLabel}>BRL (R$)</Text>
                    <Text style={styles.priceValue}>R$ {info.price_brl}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {info?.instructions ? <Text style={styles.instructions}>{info.instructions}</Text> : null}

            <Text style={styles.sectionLabel}>{t("Forma de pagamento")}</Text>

            {info?.iban_enabled ? (
              <Pressable
                style={[styles.methodCard, method === "IBAN" && styles.methodActive]}
                onPress={() => setMethod("IBAN")}
                testID="method-iban"
              >
                <Text style={styles.methodTitle}>🇵🇹/🇪🇺 {t("Transferência IBAN (EUR €)")}</Text>
                {info.iban ? (
                  <Pressable style={styles.copyRow} onPress={() => copy(info.iban, "IBAN")}>
                    <Text style={styles.copyText} numberOfLines={1}>IBAN: {info.iban}</Text>
                    <Copy size={16} color={colors.brandPrimary} weight="bold" />
                  </Pressable>
                ) : null}
                {info.iban_holder ? <Text style={styles.methodSub}>{t("Titular")}: {info.iban_holder}</Text> : null}
              </Pressable>
            ) : null}

            {info?.pix_enabled ? (
              <Pressable
                style={[styles.methodCard, method === "PIX" && styles.methodActive]}
                onPress={() => setMethod("PIX")}
                testID="method-pix"
              >
                <Text style={styles.methodTitle}>🇧🇷 {t("PIX (BRL R$)")}</Text>
                {info.pix_key ? (
                  <Pressable style={styles.copyRow} onPress={() => copy(info.pix_key, t("Chave PIX"))}>
                    <Text style={styles.copyText} numberOfLines={1}>{t("Chave PIX")}: {info.pix_key}</Text>
                    <Copy size={16} color={colors.brandPrimary} weight="bold" />
                  </Pressable>
                ) : null}
              </Pressable>
            ) : null}

            {!info?.iban_enabled && !info?.pix_enabled ? (
              <Text style={styles.instructions}>{t("Nenhuma forma de pagamento disponível no momento.")}</Text>
            ) : null}

            <Text style={styles.sectionLabel}>📎 {t("Enviar comprovante de pagamento")}</Text>
            <Text style={styles.methodSub}>{t("Formatos aceites: JPG, PNG ou PDF (máx. 10 MB).")}</Text>
            <View style={styles.attachRow}>
              <Pressable style={styles.attachBtn} onPress={pickCamera} testID="attach-camera">
                <Camera size={18} color={colors.brandPrimary} weight="bold" />
                <Text style={styles.attachText}>{t("Câmera")}</Text>
              </Pressable>
              <Pressable style={styles.attachBtn} onPress={pickImage} testID="attach-image">
                <ImageIcon size={18} color={colors.brandPrimary} weight="bold" />
                <Text style={styles.attachText}>{t("Galeria")}</Text>
              </Pressable>
              <Pressable style={styles.attachBtn} onPress={pickPdf} testID="attach-pdf">
                <FilePdf size={18} color={colors.brandPrimary} weight="bold" />
                <Text style={styles.attachText}>PDF</Text>
              </Pressable>
            </View>
            {proof ? (
              <View style={styles.proofRow} testID="proof-selected">
                <FileArrowUp size={16} color={colors.success} weight="bold" />
                <Text style={styles.proofText} numberOfLines={1}>{proof.name}</Text>
                <Pressable onPress={() => setProof(null)} hitSlop={8}>
                  <X size={16} color={colors.muted} weight="bold" />
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={[styles.submitBtn, (busy || !!pendingReq) && styles.disabled]}
              onPress={handleSubmit}
              disabled={busy || !!pendingReq}
              testID="submit-payment"
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.submitText}>{t("Enviar comprovante")}</Text>
              )}
            </Pressable>
            {pendingReq ? (
              <Text style={styles.webHint}>{t("Já existe um comprovante aguardando análise.")}</Text>
            ) : null}
            {Platform.OS === "web" ? (
              <Text style={styles.webHint}>{t("Anexar arquivo funciona melhor no app (celular).")}</Text>
            ) : null}

            {(myRequests ?? []).length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>{t("Minhas solicitações")}</Text>
                {(myRequests ?? []).map((r) => (
                  <View key={r.request_id} style={styles.reqCard} testID={`my-request-${r.request_id}`}>
                    <View style={styles.reqRow}>
                      <Text style={styles.methodTitle}>{r.method === "PIX" ? "Pix" : "IBAN"} · {amountLabel(r)}</Text>
                      <Text style={[styles.reqStatus, { color: r.status === "APROVADO" ? colors.success : r.status === "REJEITADO" ? colors.error : colors.warning }]}>
                        {r.status === "APROVADO" ? "🟢 " + t("Aprovado") : r.status === "REJEITADO" ? "🔴 " + t("Rejeitado") : "🟡 " + t("Aguardando análise")}
                      </Text>
                    </View>
                    <Text style={styles.methodSub}>{t("Enviado em")}: {formatDateBR(r.created_at.slice(0, 10))} {r.created_at.slice(11, 16)}</Text>
                    {r.status === "REJEITADO" && r.reject_reason ? (
                      <Text style={styles.methodSub}>{t("Motivo")}: {r.reject_reason}</Text>
                    ) : null}
                    <Pressable onPress={() => openProof(r)} hitSlop={6} testID={`my-proof-${r.request_id}`}>
                      <Text style={styles.linkText}>👁️ {t("Visualizar comprovante")}</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
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
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3, flex: 1 },
  content: { padding: 16, gap: 12 },
  waitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.info,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  waitTitle: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  waitSub: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  rejectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  rejectText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  priceRow: { flexDirection: "row", gap: 12 },
  priceBox: {
    flex: 1,
    backgroundColor: colors.brandTertiary,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  priceLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.onBrandTertiary },
  priceValue: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onBrandTertiary, marginTop: 2 },
  instructions: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },
  sectionLabel: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.brandPrimary,
    marginTop: 6,
  },
  methodCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  methodActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  methodTitle: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  methodSub: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  copyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurface },
  attachRow: { flexDirection: "row", gap: 12 },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  attachText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
  proofRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  proofText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  submitBtn: {
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.5 },
  submitText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.onBrandPrimary },
  webHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 8 },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  reqCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  reqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  reqStatus: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
  linkText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.brandPrimary, marginTop: 4, paddingVertical: 6 },
}));
