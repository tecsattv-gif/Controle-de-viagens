import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Linking, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  CalendarX,
  IdentificationCard,
  Palette,
  PencilSimple,
  Plus,
  Question,
  Trash,
  Truck,
  UserCircle,
} from "phosphor-react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Driver, expiryStatus, useDeleteDriver, useDrivers, useSetPrimaryDriver } from "@/src/api/drivers";import {
  useDeleteVehicle,
  useVehicles,
  Vehicle,
  vehicleLabel,
  vehicleTitle,
} from "@/src/api/vehicles";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { PhotoPicker } from "@/src/components/PhotoPicker";
import { TextField } from "@/src/components/TextField";
import { useAuth } from "@/src/context/AuthContext";
import { LANGUAGES, useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR } from "@/src/utils/format";
import { fileUrl } from "@/src/utils/upload";
import { AdminPendingBadge } from "@/src/components/admin/AdminPendingBadge";
import { SparkleIcon } from "phosphor-react-native";

type Tab = "vehicles" | "drivers";

export default function CadastrosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("vehicles");
  const { user, signOut, updateLanguage } = useAuth();
  const t = useT();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const deleteVehicle = useDeleteVehicle();
  const deleteDriver = useDeleteDriver();
  const setPrimary = useSetPrimaryDriver();

  const vList = vehicles ?? [];
  const dList = drivers ?? [];

  return (
    <View style={styles.screen} testID="cadastros-screen">
      <ScreenHeader title={t("Cadastros")} subtitle={t("Veículos e motoristas")} />

      <View style={styles.segment}>
        <Pressable
          style={[styles.segBtn, tab === "vehicles" && styles.segBtnActive]}
          onPress={() => setTab("vehicles")}
          testID="seg-vehicles"
        >
          <Truck size={18} color={tab === "vehicles" ? colors.onBrandPrimary : colors.muted} weight="bold" />
          <Text style={[styles.segText, tab === "vehicles" && styles.segTextActive]}>{t("Veículos")}</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, tab === "drivers" && styles.segBtnActive]}
          onPress={() => setTab("drivers")}
          testID="seg-drivers"
        >
          <UserCircle size={18} color={tab === "drivers" ? colors.onBrandPrimary : colors.muted} weight="bold" />
          <Text style={[styles.segText, tab === "drivers" && styles.segTextActive]}>{t("Motoristas")}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      >
        {tab === "vehicles" ? (
          vList.length === 0 ? (
            <Empty text={t("Nenhum veículo cadastrado. Toque em “Novo” para adicionar.")} />
          ) : (
            vList.map((v) => (
              <VehicleRow
                key={v.id}
                v={v}
                onEdit={() => router.push({ pathname: "/vehicle-form", params: { id: v.id } })}
                onDelete={() => deleteVehicle.mutate(v.id)}
              />
            ))
          )
        ) : dList.length === 0 ? (
          <Empty text={t("Nenhum motorista cadastrado. Toque em “Novo” para adicionar.")} />
        ) : (
          dList.map((d, i) => (
            <DriverRow
              key={d.id}
              d={d}
              index={i}
              total={dList.length}
              onEdit={() => router.push({ pathname: "/driver-form", params: { id: d.id } })}
              onDelete={() => deleteDriver.mutate(d.id)}
              onMakePrimary={() => setPrimary.mutate(d.id)}
            />
          ))
        )}

        <CompanySettings />

        <View style={styles.langCard} testID="cadastros-language">
          <Text style={styles.langTitle}>{t("Idioma do aplicativo")}</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((l) => {
              const active = (user?.app_language ?? "pt-BR") === l.code;
              return (
                <Pressable
                  key={l.code}
                  style={[styles.langChip, active && styles.langChipActive]}
                  onPress={() => updateLanguage(l.code).catch(() => {})}
                  testID={`quick-language-${l.code}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          style={styles.coresRow}
          onPress={() => router.push("/cores")}
          testID="cadastros-cores"
          accessibilityRole="button"
        >
          <View style={styles.coresIcon}>
            <Palette size={24} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coresTitle}>{t("Cores do aplicativo")}</Text>
            <Text style={styles.coresSub}>{t("Cor principal e tema (claro/escuro)")}</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.coresRow}
          onPress={() => router.push("/ajuda")}
          testID="cadastros-ajuda"
          accessibilityRole="button"
        >
          <View style={styles.coresIcon}>
            <Question size={24} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coresTitle}>{t("Ajuda e Tutoriais")}</Text>
            <Text style={styles.coresSub}>{t("Central de ajuda, tutoriais e assistente")}</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.coresRow}
          onPress={() => router.push("/assistente-ia")}
          testID="cadastros-ai"
          accessibilityRole="button"
        >
          <View style={styles.coresIcon}>
            <SparkleIcon size={24} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coresTitle}>{t("Assistente IA")}</Text>
            <Text style={styles.coresSub}>{t("Pergunte sobre o app e os seus dados (ChatGPT)")}</Text>
          </View>
        </Pressable>

        <View style={styles.about} testID="about-section">
          <Text style={styles.aboutTitle}>{t("Sobre o aplicativo")}</Text>
          <Text style={styles.aboutApp}>Controle de Viagens</Text>
          <Text style={styles.aboutLine}>Desenvolvido por: Luiz Alberto Cardoso</Text>
          <Pressable
            onPress={() => Linking.openURL("mailto:tecsattv@gmail.com")}
            hitSlop={8}
            testID="about-email"
            accessibilityRole="link"
          >
            <Text style={styles.aboutEmail}>E-mail: tecsattv@gmail.com</Text>
          </Pressable>
          <Text style={styles.aboutLine}>{t("Versão: 1.0.20")}</Text>

          {user ? (
            <>
              <Text style={styles.accountLine}>{t("Conectado como {who}", { who: user.email || user.display_name })}</Text>
              {user.is_admin ? (
                <Pressable style={styles.adminBtn} onPress={() => router.push("/admin")} testID="admin-panel-button">
                  <Text style={styles.adminText}>{t("Painel do administrador")}</Text>
                  <AdminPendingBadge />
                </Pressable>
              ) : null}
              <Pressable style={styles.logoutBtn} onPress={signOut} testID="logout-button">
                <Text style={styles.logoutText}>{t("Sair da conta")}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Pressable
        style={[styles.fab, { bottom: 20 }]}
        onPress={() => {
          if (tab === "drivers") {
            if (dList.length >= 2) {
              const msg = t("Máximo de 2 motoristas cadastrados.");
              if (Platform.OS === "web") window.alert(msg);
              else Alert.alert(msg);
              return;
            }
            router.push("/driver-form");
          } else {
            router.push("/vehicle-form");
          }
        }}
        testID="cadastro-fab"
        accessibilityRole="button"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>{t("Novo")}</Text>
      </Pressable>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.emptyBox} testID="cadastro-empty">
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function VehicleRow({ v, onEdit, onDelete }: { v: Vehicle; onEdit: () => void; onDelete: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.card} testID={`vehicle-row-${v.id}`}>
      <View style={styles.cardRow}>
        <Pressable style={styles.cardMain} onPress={onEdit} accessibilityRole="button">
          <View style={styles.cardHead}>
            {v.photo_path ? (
              <Image source={{ uri: fileUrl(v.photo_path) }} style={styles.thumb} contentFit="cover" />
            ) : (
              <Truck size={20} color={colors.brandPrimary} weight="fill" />
            )}
            <Text style={styles.cardTitle} numberOfLines={1}>
              {vehicleTitle(v)}
            </Text>
          </View>
          {v.company ? <Text style={styles.cardSub} numberOfLines={1}>Empresa: {v.company}</Text> : null}
          <Text style={styles.cardSub} numberOfLines={2}>{vehicleLabel(v)}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={onEdit} style={styles.iconBtn} hitSlop={8} testID={`edit-vehicle-${v.id}`}>
            <PencilSimple size={20} color={colors.muted} weight="bold" />
          </Pressable>
          <Pressable onPress={onDelete} style={styles.iconBtn} hitSlop={8} testID={`delete-vehicle-${v.id}`}>
            <Trash size={20} color={colors.error} weight="bold" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ExpiryPill({ label, iso }: { label: string; iso: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const status = expiryStatus(iso);
  if (!iso || status === null) return null;
  const color =
    status === "expired" ? colors.error : status === "soon" ? colors.warning : colors.muted;
  return (
    <View style={styles.pill}>
      <CalendarX size={13} color={color} weight="bold" />
      <Text style={[styles.pillText, { color }]}>
        {label}: {formatDateBR(iso)}
        {status === "expired" ? " (vencido)" : status === "soon" ? " (a vencer)" : ""}
      </Text>
    </View>
  );
}

function DriverRow({ d, index, total, onEdit, onDelete, onMakePrimary }: { d: Driver; index: number; total: number; onEdit: () => void; onDelete: () => void; onMakePrimary: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const showOrder = total >= 2;
  return (
    <View style={styles.card} testID={`driver-row-${d.id}`}>
      <View style={styles.cardRow}>
        <Pressable style={styles.cardMain} onPress={onEdit} accessibilityRole="button">
          <View style={styles.cardHead}>
            {d.photo_path ? (
              <Image source={{ uri: fileUrl(d.photo_path) }} style={styles.thumbCircle} contentFit="cover" />
            ) : (
              <UserCircle size={20} color={colors.brandPrimary} weight="fill" />
            )}
            <Text style={styles.cardTitle} numberOfLines={1}>
              {d.full_name || t("Motorista")}
            </Text>
            {showOrder ? (
              <View style={[styles.orderBadge, index === 0 && styles.orderBadgePrimary]}>
                <Text style={[styles.orderBadgeText, index === 0 && styles.orderBadgeTextPrimary]}>
                  {index === 0 ? t("1º motorista") : t("2º motorista")}
                </Text>
              </View>
            ) : null}
          </View>
          {d.license_number ? (
            <View style={styles.cardSubRow}>
              <IdentificationCard size={14} color={colors.muted} weight="bold" />
              <Text style={styles.cardSub} numberOfLines={1}>CNH {d.license_number}</Text>
            </View>
          ) : null}
          {d.age != null || d.blood_type ? (
            <Text style={styles.cardSub}>
              {d.age != null ? `${d.age} anos` : ""}
              {d.age != null && d.blood_type ? "  •  " : ""}
              {d.blood_type ? `Tipo ${d.blood_type}` : ""}
            </Text>
          ) : null}
          <ExpiryPill label="CNH" iso={d.license_expiry} />
          <ExpiryPill label="Toxicológico" iso={d.toxicology_expiry} />
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={onEdit} style={styles.iconBtn} hitSlop={8} testID={`edit-driver-${d.id}`}>
            <PencilSimple size={20} color={colors.muted} weight="bold" />
          </Pressable>
          <Pressable onPress={onDelete} style={styles.iconBtn} hitSlop={8} testID={`delete-driver-${d.id}`}>
            <Trash size={20} color={colors.error} weight="bold" />
          </Pressable>
        </View>
      </View>
      {showOrder && index !== 0 ? (
        <Pressable style={styles.makePrimaryBtn} onPress={onMakePrimary} testID={`make-primary-${d.id}`}>
          <Text style={styles.makePrimaryText}>{t("Tornar 1º motorista")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CompanySettings() {
  const styles = useStyles();
  const t = useT();
  const { user, updateCompany } = useAuth();
  const [name, setName] = useState(user?.company_name ?? "");
  const [logo, setLogo] = useState(user?.company_logo_path ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name !== (user?.company_name ?? "") || logo !== (user?.company_logo_path ?? "");

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateCompany(name.trim(), logo);
      setSaved(true);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.companyCard} testID="cadastros-company">
      <Text style={styles.langTitle}>{t("Dados da empresa (relatórios)")}</Text>
      <Text style={styles.companyHint}>{t("Nome e logo que aparecem no topo dos relatórios em PDF.")}</Text>
      <TextField
        label={t("Nome da empresa")}
        value={name}
        onChangeText={setName}
        placeholder={t("Ex.: Transportes Silva Lda.")}
        testID="field-company-name"
      />
      <PhotoPicker label={t("Logo da empresa")} value={logo} onChange={setLogo} testID="company-logo" />
      <Pressable
        style={[styles.companySaveBtn, (!dirty || saving) && styles.companySaveDisabled]}
        onPress={save}
        disabled={!dirty || saving}
        testID="save-company"
        accessibilityRole="button"
      >
        <Text style={styles.companySaveText}>{saving ? t("Salvando...") : saved && !dirty ? t("Salvo!") : t("Salvar empresa")}</Text>
      </Pressable>
    </View>
  );
}


const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  segment: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  segBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  segText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.muted },
  segTextActive: { color: colors.onBrandPrimary },
  content: { padding: 16, gap: 12 },
  card: {
    flexDirection: "column",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  cardRow: { flexDirection: "row" },
  langCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  coresRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  coresIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  coresTitle: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.onSurface, letterSpacing: 0.3 },
  coresSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  companyCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  companyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -4, marginBottom: 10 },
  companySaveBtn: {
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
    marginTop: 4,
  },
  companySaveDisabled: { opacity: 0.5 },
  companySaveText: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.3, color: colors.onBrandPrimary },
  langTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.onSurface,
    marginBottom: 10,
  },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  langChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  langChipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  langChipTextActive: { color: colors.onBrandPrimary },
  cardMain: { flex: 1, gap: 4 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  thumb: { width: 32, height: 32, borderRadius: 6 },
  thumbCircle: { width: 32, height: 32, borderRadius: 999 },
  cardTitle: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.onSurface },
  cardSub: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  cardSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  orderBadgePrimary: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
  },
  orderBadgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: "700", color: colors.muted },
  orderBadgeTextPrimary: { color: colors.brandPrimary },
  makePrimaryBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  makePrimaryText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.brandPrimary },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  pillText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
  actions: { justifyContent: "center", gap: 14, paddingLeft: 10 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  emptyBox: {
    padding: 20,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  about: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 8,
    paddingTop: 20,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
  },
  accountLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 16,
  },
  logoutBtn: {
    marginTop: 10,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.error,
  },
  adminBtn: {
    marginTop: 12,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  adminText: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.onBrandPrimary,
  },
  logoutText: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.error,
  },
  aboutTitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  aboutApp: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.onSurfaceSecondary,
    marginBottom: 2,
  },
  aboutLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  aboutEmail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brandPrimary,
    marginTop: 2,
    textDecorationLine: "underline",
  },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
}));
