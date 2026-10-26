import { useLocalSearchParams, useRouter } from "expo-router";
import { Bell, Check, DeviceMobile, Eye, LockSimple, LockSimpleOpen, PaperPlaneTilt, Trash, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AdminUser,
  PaymentSettings,
  useAdminAction,
  useAdminSettings,
  useAdminUsers,
  useDeleteUser,
  useSaveAdminSettings,
} from "@/src/api/license";
import { useAdminMessages, useSendMessage } from "@/src/api/messages";
import { useNotificationSettings, usePendingPaymentsCount, useSaveNotificationSettings } from "@/src/api/paymentRequests";
import { PaymentRequestsTab } from "@/src/components/admin/PaymentRequestsTab";
import { TextField } from "@/src/components/TextField";
import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR } from "@/src/utils/format";
import { fileUrl } from "@/src/utils/upload";

const STATUS_LABEL: Record<string, string> = {
  TESTE: "TESTE",
  AGUARDANDO_PAGAMENTO: "AGUARDANDO PAGAMENTO",
  ATIVO: "ATIVO",
  EXPIRADO: "EXPIRADO",
  BLOQUEADO: "BLOQUEADO",
};

export default function AdminScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"users" | "licenses" | "settings" | "messages">(
    params.tab === "licenses" ? "licenses" : "users",
  );
  const [prKey, setPrKey] = useState(0);
  const { data: pending } = usePendingPaymentsCount(!!user?.is_admin);
  const pendingCount = pending?.count ?? 0;
  const openPending = () => {
    setPrKey((k) => k + 1);
    setTab("licenses");
  };

  if (!user?.is_admin) {
    return (
      <View style={[styles.screen, styles.center]} testID="admin-denied">
        <Text style={styles.deniedText}>{t("Acesso restrito ao administrador.")}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>{t("Voltar")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="admin-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="admin-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Painel do administrador")}</Text>
        <Pressable onPress={openPending} style={styles.bellBtn} hitSlop={8} testID="admin-bell" accessibilityLabel={t("Pagamentos pendentes")}>
          <Bell size={24} color={colors.onSurface} weight={pendingCount > 0 ? "fill" : "regular"} />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge} testID="admin-bell-count">
              <Text style={styles.bellBadgeText}>{pendingCount > 99 ? "99+" : pendingCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {pendingCount > 0 && tab !== "licenses" ? (
        <Pressable style={styles.pendingBanner} onPress={openPending} testID="admin-pending-banner">
          <Text style={styles.pendingBannerText}>
            🔔 {t("{n} pagamento(s) aguardando aprovação", { n: pendingCount })} · {t("Verificar pagamento")}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === "users" && styles.tabActive]} onPress={() => setTab("users")} testID="admin-tab-users">
          <Text style={[styles.tabText, tab === "users" && styles.tabTextActive]}>{t("Usuários")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "licenses" && styles.tabActive]} onPress={() => setTab("licenses")} testID="admin-tab-licenses">
          <Text style={[styles.tabText, tab === "licenses" && styles.tabTextActive]}>{t("Licenças")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "settings" && styles.tabActive]} onPress={() => setTab("settings")} testID="admin-tab-settings">
          <Text style={[styles.tabText, tab === "settings" && styles.tabTextActive]}>{t("Pagamentos")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "messages" && styles.tabActive]} onPress={() => setTab("messages")} testID="admin-tab-messages">
          <Text style={[styles.tabText, tab === "messages" && styles.tabTextActive]}>{t("Mensagens")}</Text>
        </Pressable>
      </View>

      {tab === "users" ? (
        <UsersTab />
      ) : tab === "licenses" ? (
        <PaymentRequestsTab key={prKey} initialFilter="PENDENTE" />
      ) : tab === "settings" ? (
        <SettingsTab />
      ) : (
        <MessagesTab />
      )}
    </View>
  );
}

function UsersTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useAdminUsers();
  const action = useAdminAction();
  const del = useDeleteUser();

  const run = (userId: string, act: string, note?: string) => {
    action.mutate({ userId, action: act, note });
  };

  const confirmDelete = (u: AdminUser) => {
    const doDelete = () => del.mutate(u.user_id);
    if (Platform.OS === "web") {
      doDelete();
      return;
    }
    Alert.alert(
      t("Excluir usuário"),
      t("Excluir {who} e todos os seus dados? Esta ação não pode ser desfeita.", { who: u.email }),
      [
        { text: t("Cancelar"), style: "cancel" },
        { text: t("Excluir"), style: "destructive", onPress: doDelete },
      ],
    );
  };

  if (isLoading) return <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />;

  return (
    <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {(data ?? []).map((u: AdminUser) => (
        <View key={u.user_id} style={styles.card} testID={`admin-user-${u.email}`}>
          <View style={styles.rowBetween}>
            <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
            <View style={[styles.badge, statusStyle(u.license_status, colors)]}>
              <Text style={styles.badgeText}>{STATUS_LABEL[u.license_status] || u.license_status}</Text>
            </View>
          </View>
          {u.is_admin ? <Text style={styles.meta}>{t("Administrador")}</Text> : null}
          {u.trial_ends_at ? (
            <Text style={styles.meta}>{t("Teste até")}: {formatDateBR(u.trial_ends_at.slice(0, 10))} · {t("{n} dia(s)", { n: u.days_left ?? 0 })}</Text>
          ) : null}
          <Text style={styles.meta}>{t("Dispositivo")}: {u.device_id ? u.device_id.slice(0, 12) + "…" : t("não vinculado")}</Text>
          {u.payment_method ? (
            <Text style={styles.meta}>{t("Pagamento")}: {u.payment_method}{u.payment_submitted_at ? ` · ${formatDateBR(u.payment_submitted_at.slice(0, 10))}` : ""}</Text>
          ) : null}

          {u.is_admin ? null : (
            <View style={styles.actions}>
              {u.payment_proof_path && !u.payment_proof_path.includes("/payment-proofs/") ? (
                <Pressable style={styles.actBtn} onPress={() => Linking.openURL(fileUrl(u.payment_proof_path as string))} testID={`admin-proof-${u.email}`}>
                  <Eye size={16} color={colors.info} weight="bold" />
                  <Text style={styles.actText}>{t("Ver comprovante")}</Text>
                </Pressable>
              ) : null}
              {u.license_status === "AGUARDANDO_PAGAMENTO" ? (
                <>
                  <Pressable style={[styles.actBtn, styles.okBtn]} onPress={() => run(u.user_id, "confirm-payment")} testID={`admin-confirm-${u.email}`}>
                    <Check size={16} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={[styles.actText, { color: colors.onBrandPrimary }]}>{t("Confirmar pagamento")}</Text>
                  </Pressable>
                  <Pressable style={styles.actBtn} onPress={() => run(u.user_id, "reject-payment", t("Comprovante não confere"))} testID={`admin-reject-${u.email}`}>
                    <X size={16} color={colors.error} weight="bold" />
                    <Text style={[styles.actText, { color: colors.error }]}>{t("Recusar pagamento")}</Text>
                  </Pressable>
                </>
              ) : null}
              {u.license_status === "BLOQUEADO" ? (
                <Pressable style={styles.actBtn} onPress={() => run(u.user_id, "unblock")} testID={`admin-unblock-${u.email}`}>
                  <LockSimpleOpen size={16} color={colors.success} weight="bold" />
                  <Text style={[styles.actText, { color: colors.success }]}>{t("Liberar usuário")}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.actBtn} onPress={() => run(u.user_id, "block")} testID={`admin-block-${u.email}`}>
                  <LockSimple size={16} color={colors.error} weight="bold" />
                  <Text style={[styles.actText, { color: colors.error }]}>{t("Bloquear usuário")}</Text>
                </Pressable>
              )}
              {u.license_status !== "ATIVO" ? (
                <Pressable style={styles.actBtn} onPress={() => run(u.user_id, "confirm-payment")} testID={`admin-activate-${u.email}`}>
                  <Check size={16} color={colors.success} weight="bold" />
                  <Text style={[styles.actText, { color: colors.success }]}>{t("Ativar")}</Text>
                </Pressable>
              ) : null}
              {u.device_id ? (
                <Pressable style={styles.actBtn} onPress={() => run(u.user_id, "unbind-device")} testID={`admin-unbind-${u.email}`}>
                  <DeviceMobile size={16} color={colors.warning} weight="bold" />
                  <Text style={[styles.actText, { color: colors.warning }]}>{t("Desvincular dispositivo")}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.actBtn} onPress={() => confirmDelete(u)} testID={`admin-delete-${u.email}`}>
                <Trash size={16} color={colors.error} weight="bold" />
                <Text style={[styles.actText, { color: colors.error }]}>{t("Excluir usuário")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </KeyboardAwareScrollView>
  );
}

function SettingsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data } = useAdminSettings();
  const save = useSaveAdminSettings();
  const { data: notif } = useNotificationSettings();
  const saveNotif = useSaveNotificationSettings();
  const [form, setForm] = useState<PaymentSettings | null>(null);
  const [nForm, setNForm] = useState<{ admin_email: string; email_enabled: boolean } | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  useEffect(() => {
    if (notif && !nForm) setNForm(notif);
  }, [notif, nForm]);

  if (!form) return <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />;

  const patch = (p: Partial<PaymentSettings>) => setForm({ ...form, ...p });

  const onSaveNotif = async () => {
    if (!nForm) return;
    try {
      await saveNotif.mutateAsync({ admin_email: nForm.admin_email.trim(), email_enabled: nForm.email_enabled });
      if (Platform.OS === "web") window.alert(t("Configurações salvas."));
      else Alert.alert(t("Notificações"), t("Configurações salvas."));
    } catch (e: any) {
      Alert.alert(t("Erro"), e?.message || t("Não foi possível salvar."));
    }
  };

  const onSave = async () => {
    try {
      await save.mutateAsync(form);
      Alert.alert(t("Pagamentos"), t("Configurações salvas."));
    } catch (e: any) {
      Alert.alert(t("Erro"), e?.message || t("Não foi possível salvar."));
    }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.sectionHeader}>🔔 {t("Notificações de pagamentos")}</Text>
      {nForm ? (
        <>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("Avisar por e-mail")}</Text>
            <Switch
              value={nForm.email_enabled}
              onValueChange={(v) => setNForm({ ...nForm, email_enabled: v })}
              testID="toggle-notif-email"
            />
          </View>
          <TextField
            label={t("E-mail do administrador")}
            value={nForm.admin_email}
            onChangeText={(v) => setNForm({ ...nForm, admin_email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="set-admin-email"
          />
          <Pressable
            style={[styles.saveBtn, saveNotif.isPending && styles.disabled]}
            onPress={onSaveNotif}
            disabled={saveNotif.isPending}
            testID="save-notif-settings"
          >
            {saveNotif.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>{t("Salvar")}</Text>}
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={colors.brandPrimary} />
      )}

      <Text style={styles.sectionHeader}>{t("Configurações de pagamento")}</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{t("Ativar IBAN (EUR)")}</Text>
        <Switch value={form.iban_enabled} onValueChange={(v) => patch({ iban_enabled: v })} testID="toggle-iban" />
      </View>
      <TextField label={t("IBAN")} value={form.iban} onChangeText={(v) => patch({ iban: v })} testID="set-iban" />
      <TextField label={t("Titular da conta")} value={form.iban_holder} onChangeText={(v) => patch({ iban_holder: v })} testID="set-iban-holder" />
      <TextField label={t("Preço em EUR (€)")} value={form.price_eur} onChangeText={(v) => patch({ price_eur: v })} testID="set-price-eur" />

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{t("Ativar PIX (BRL)")}</Text>
        <Switch value={form.pix_enabled} onValueChange={(v) => patch({ pix_enabled: v })} testID="toggle-pix" />
      </View>
      <TextField label={t("Chave PIX")} value={form.pix_key} onChangeText={(v) => patch({ pix_key: v })} testID="set-pix" />
      <TextField label={t("Preço em BRL (R$)")} value={form.price_brl} onChangeText={(v) => patch({ price_brl: v })} testID="set-price-brl" />

      <TextField
        label={t("Instruções de pagamento")}
        value={form.instructions}
        onChangeText={(v) => patch({ instructions: v })}
        multiline
        testID="set-instructions"
      />

      <Pressable style={[styles.saveBtn, save.isPending && styles.disabled]} onPress={onSave} disabled={save.isPending} testID="save-settings">
        {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>{t("Salvar")}</Text>}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function MessagesTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data: users } = useAdminUsers();
  const { data: history } = useAdminMessages();
  const send = useSendMessage();

  const [mode, setMode] = useState<"all" | "individual">("all");
  const [selectedUser, setSelectedUser] = useState<{ id: string; label: string } | null>(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("info");

  const filtered = (users ?? [])
    .filter((u) => !u.is_admin)
    .filter((u) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (u.email || "").toLowerCase().includes(q) ||
        (u.display_name || "").toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q)
      );
    });

  const TYPES = [
    { key: "info", label: "ℹ️ " + t("Informação") },
    { key: "warning", label: "⚠️ " + t("Aviso") },
    { key: "payment", label: "💳 " + t("Pagamento/Assinatura") },
    { key: "update", label: "📱 " + t("Atualização do aplicativo") },
  ];

  const onSend = async () => {
    if (mode === "individual" && !selectedUser) {
      Alert.alert(t("Mensagens"), t("Selecione um usuário."));
      return;
    }
    if (!title.trim() || !body.trim()) {
      Alert.alert(t("Mensagens"), t("Informe o título e a mensagem."));
      return;
    }
    const targetId = mode === "all" ? "all" : (selectedUser as { id: string }).id;
    try {
      const r = await send.mutateAsync({ target: targetId, title: title.trim(), body: body.trim(), type });
      Alert.alert(t("Mensagens"), t("Mensagem enviada para {n} usuário(s).", { n: r.sent }));
      setTitle("");
      setBody("");
    } catch (e: any) {
      Alert.alert(t("Erro"), e?.message || t("Não foi possível enviar."));
    }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.sectionHeader}>{t("Enviar mensagem")}</Text>

      <Text style={styles.fieldLabel}>{t("Destinatário")}</Text>
      <View style={styles.typeWrap}>
        <Pressable
          style={[styles.typeChip, mode === "all" && styles.typeChipActive]}
          onPress={() => setMode("all")}
          testID="msg-mode-all"
        >
          <Text style={[styles.typeChipText, mode === "all" && styles.typeChipTextActive]}>{t("Todos os usuários")}</Text>
        </Pressable>
        <Pressable
          style={[styles.typeChip, mode === "individual" && styles.typeChipActive]}
          onPress={() => setMode("individual")}
          testID="msg-mode-individual"
        >
          <Text style={[styles.typeChipText, mode === "individual" && styles.typeChipTextActive]}>{t("Usuário individual")}</Text>
        </Pressable>
      </View>

      {mode === "individual" ? (
        <>
          <TextField label={t("Pesquisar por nome, e-mail ou ID")} value={search} onChangeText={setSearch} testID="msg-search" />
          {selectedUser ? (
            <Text style={styles.fieldLabel}>{t("Selecionado: {who}", { who: selectedUser.label })}</Text>
          ) : null}
          <View style={styles.pickerCard}>
            {filtered.length === 0 ? (
              <Text style={styles.meta}>{t("Nenhum usuário encontrado.")}</Text>
            ) : (
              filtered.slice(0, 30).map((u) => {
                const active = selectedUser?.id === u.user_id;
                return (
                  <Pressable
                    key={u.user_id}
                    style={[styles.recipientOpt, active && styles.recipientOptActive]}
                    onPress={() => setSelectedUser({ id: u.user_id, label: u.email })}
                    testID={`msg-recipient-${u.email}`}
                  >
                    <Text style={[styles.recipientText, active && { color: colors.brandPrimary }]} numberOfLines={1}>
                      {u.display_name ? `${u.display_name} · ` : ""}{u.email}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      ) : null}

      <TextField label={t("Título da mensagem")} value={title} onChangeText={setTitle} testID="msg-title" />
      <TextField label={t("Mensagem")} value={body} onChangeText={setBody} multiline testID="msg-body" />

      <Text style={styles.fieldLabel}>{t("Tipo")}</Text>
      <View style={styles.typeWrap}>
        {TYPES.map((tp) => (
          <Pressable
            key={tp.key}
            style={[styles.typeChip, type === tp.key && styles.typeChipActive]}
            onPress={() => setType(tp.key)}
            testID={`msg-type-${tp.key}`}
          >
            <Text style={[styles.typeChipText, type === tp.key && styles.typeChipTextActive]}>{tp.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={[styles.saveBtn, send.isPending && styles.disabled]} onPress={onSend} disabled={send.isPending} testID="msg-send">
        {send.isPending ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <View style={styles.sendInner}>
            <PaperPlaneTilt size={18} color={colors.onBrandPrimary} weight="bold" />
            <Text style={styles.saveText}>{t("Enviar mensagem")}</Text>
          </View>
        )}
      </Pressable>

      <Text style={styles.sectionHeader}>{t("Enviadas")}</Text>
      {(history ?? []).length === 0 ? (
        <Text style={styles.meta}>{t("Nenhuma mensagem enviada.")}</Text>
      ) : (
        (history ?? []).map((h) => (
          <View key={h.batch_id} style={styles.card} testID={`msg-history-${h.batch_id}`}>
            <Text style={styles.email} numberOfLines={1}>{h.title}</Text>
            <Text style={styles.meta}>
              {h.target === "all" ? t("Todos os usuários") : t("Individual")} · {t("{n} destinatário(s)", { n: h.recipients })} · {t("{n} lida(s)", { n: h.read })}
            </Text>
          </View>
        ))
      )}
    </KeyboardAwareScrollView>
  );
}

function statusStyle(status: string, colors: any) {
  switch (status) {
    case "ATIVO":
      return { backgroundColor: colors.success };
    case "AGUARDANDO_PAGAMENTO":
      return { backgroundColor: colors.info };
    case "BLOQUEADO":
    case "EXPIRADO":
      return { backgroundColor: colors.error };
    default:
      return { backgroundColor: colors.brandPrimary };
  }
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  deniedText: { fontFamily: fonts.body, fontSize: 15, color: colors.onSurfaceSecondary, marginBottom: 16, textAlign: "center" },
  backBtn: { paddingHorizontal: 20, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  backText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
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
  bellBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  bellBadge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: "800", color: colors.onBrandPrimary },
  pendingBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceSecondary,
  },
  pendingBannerText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurface },
  tabs: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary },
  tabTextActive: { color: colors.onBrandPrimary },
  content: { padding: 16, gap: 12 },
  sectionHeader: {
    fontFamily: fonts.displayBold,
    fontSize: 16,
    color: colors.onSurface,
    marginTop: 6,
    marginBottom: 2,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  email: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.body, fontSize: 10, fontWeight: "800", color: colors.onBrandPrimary, letterSpacing: 0.3 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  okBtn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  actText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  toggleLabel: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  saveBtn: { height: 54, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  sendInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  disabled: { opacity: 0.5 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onBrandPrimary },
  fieldLabel: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurfaceSecondary, marginTop: 4 },
  selectBox: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  selectText: { fontFamily: fonts.body, fontSize: 15, color: colors.onSurface },
  pickerCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  recipientOpt: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  recipientOptActive: { backgroundColor: colors.brandTertiary },
  recipientText: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface },
  typeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  typeChipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  typeChipText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  typeChipTextActive: { color: colors.onBrandTertiary, fontWeight: "700" },
}));
