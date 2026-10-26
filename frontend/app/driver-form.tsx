import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FloppyDisk, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BLOOD_TYPES,
  useCreateDriver,
  useDrivers,
  useUpdateDriver,
} from "@/src/api/drivers";
import { DateInputField } from "@/src/components/DateInputField";
import { PhotoPicker } from "@/src/components/PhotoPicker";
import { TextField } from "@/src/components/TextField";
import { useAuth } from "@/src/context/AuthContext";
import { LANGUAGES, useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { canUseDeviceAuth, unlockWithDevice } from "@/src/utils/deviceAuth";
import { APP_CURRENCIES, parseISODate, toISODate } from "@/src/utils/format";
import { clearLock, getLockMode, LockMode, setDeviceMode, setPasscode } from "@/src/utils/lockStorage";

// Idade em anos completos a partir da data de nascimento.
function ageFromDate(birth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? 0 : age;
}

export default function DriverFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;
  const { user, updateCurrency, updateLanguage } = useAuth();
  const t = useT();

  const { data: drivers, isLoading } = useDrivers();
  const existing = editing ? drivers?.find((d) => d.id === params.id) : undefined;

  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const saving = createDriver.isPending || updateDriver.isPending;

  const [fullName, setFullName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [company, setCompany] = useState("");
  const [cpf, setCpf] = useState("");
  const [license, setLicense] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState(new Date(1990, 0, 1));
  const [hasBirthDate, setHasBirthDate] = useState(false);
  const [blood, setBlood] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState(new Date());
  const [toxExpiry, setToxExpiry] = useState(new Date());
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // App-wide security lock (not per driver).
  const [lockMode, setLockMode] = useState<LockMode | null>(null);
  const [secChoice, setSecChoice] = useState<"none" | "device" | "passcode">("none");
  const [appPassword, setAppPassword] = useState("");
  const [appPasswordConfirm, setAppPasswordConfirm] = useState("");
  const [secMsg, setSecMsg] = useState<string | null>(null);
  const [secSaving, setSecSaving] = useState(false);

  useEffect(() => {
    getLockMode().then((m) => {
      setLockMode(m);
      setSecChoice(m ?? "none");
    });
  }, []);

  const applySecurity = async () => {
    setSecMsg(null);
    if (Platform.OS === "web") {
      setSecMsg("A senha de acesso só pode ser configurada no aplicativo (celular).");
      return;
    }
    setSecSaving(true);
    try {
      if (secChoice === "none") {
        await clearLock();
        setLockMode(null);
        setSecMsg("Bloqueio de acesso desativado.");
      } else if (secChoice === "device") {
        if (!(await canUseDeviceAuth())) {
          setSecMsg("Configure biometria ou uma senha/PIN no seu telefone primeiro.");
          return;
        }
        if (!(await unlockWithDevice())) {
          setSecMsg("Autenticação do telefone cancelada.");
          return;
        }
        await setDeviceMode();
        setLockMode("device");
        setSecMsg("Pronto! O app usará a senha/biometria do telefone.");
      } else {
        if (appPassword !== appPasswordConfirm) {
          setSecMsg("As senhas não coincidem.");
          return;
        }
        await setPasscode(appPassword);
        setLockMode("passcode");
        setAppPassword("");
        setAppPasswordConfirm("");
        setSecMsg("Senha do aplicativo salva com sucesso.");
      }
    } catch (e: any) {
      setSecMsg(e?.message ?? "Não foi possível salvar a segurança.");
    } finally {
      setSecSaving(false);
    }
  };

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setFullName(existing.full_name);
      setDriverNumber(existing.driver_number || "");
      setCompany(existing.company || "");
      setCpf(existing.cpf);
      setLicense(existing.license_number);
      setAge(existing.age != null ? String(existing.age) : "");
      if (existing.birth_date) {
        setBirthDate(parseISODate(existing.birth_date));
        setHasBirthDate(true);
      }
      setBlood(existing.blood_type);
      if (existing.license_expiry) setLicenseExpiry(parseISODate(existing.license_expiry));
      if (existing.toxicology_expiry) setToxExpiry(parseISODate(existing.toxicology_expiry));
      setPhoto(existing.photo_path || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const handleSave = () => {
    if (!fullName.trim()) {
      setError(t("Informe o nome completo do motorista."));
      return;
    }
    setError(null);
    const ageN = parseInt(age, 10);
    const input = {
      full_name: fullName.trim(),
      driver_number: driverNumber.trim(),
      company: company.trim(),
      cpf: cpf.trim(),
      license_number: license.trim(),
      age: computedAge != null ? computedAge : isNaN(ageN) ? null : ageN,
      birth_date: hasBirthDate ? toISODate(birthDate) : "",
      blood_type: blood,
      license_expiry: toISODate(licenseExpiry),
      toxicology_expiry: toISODate(toxExpiry),
      photo_path: photo,
    };
    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) => setError(err?.message ?? t("Não foi possível salvar."));
    if (editing && params.id) {
      updateDriver.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createDriver.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !isLoading && !existing;

  const computedAge = hasBirthDate ? ageFromDate(birthDate) : null;

  return (
    <View style={styles.screen} testID="driver-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="driver-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar motorista") : t("Novo motorista")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Motorista não encontrado.")}</Text>
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={92} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {error ? (
              <View style={styles.banner}>
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : null}

            <PhotoPicker label={t("Foto do motorista")} value={photo} onChange={setPhoto} shape="circle" testID="driver-photo" />
            <TextField label={t("Nome completo")} value={fullName} onChangeText={setFullName} placeholder={t("Ex.: João da Silva")} testID="field-driver-name" />
            <TextField label={t("Nº / identificação do motorista (opcional)")} value={driverNumber} onChangeText={setDriverNumber} placeholder={t("Opcional")} testID="field-driver-number" />
            <TextField label={t("Empresa (opcional)")} value={company} onChangeText={setCompany} placeholder={t("Opcional")} testID="field-driver-company" />
            <TextField label={t("CPF (opcional)")} value={cpf} onChangeText={setCpf} placeholder={t("Opcional")} keyboardType="number-pad" testID="field-driver-cpf" />
            <TextField label={t("Nº CNH / Carta de Condução")} value={license} onChangeText={setLicense} placeholder="Ex.: 01234567890" testID="field-driver-license" />
            <DateInputField
              label={t("Data de nascimento (opcional)")}
              value={birthDate}
              onChange={(d) => {
                setBirthDate(d);
                setHasBirthDate(true);
              }}
              fourDigitYear
              testID="field-driver-birthdate"
            />

            <TextField
              label={t("Idade (automática pela data de nascimento)")}
              value={computedAge != null ? String(computedAge) : age}
              editable={false}
              placeholder={t("Defina a data de nascimento")}
              testID="field-driver-age"
            />

            <Text style={styles.subLabel}>{t("Tipo sanguíneo")}</Text>
            <View style={styles.optionRow}>
              {BLOOD_TYPES.map((bt) => {
                const active = blood === bt;
                return (
                  <Pressable
                    key={bt}
                    style={[styles.bloodBtn, active && styles.optionBtnActive]}
                    onPress={() => setBlood(active ? "" : bt)}
                    testID={`blood-${bt}`}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{bt}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.row}>
              <DateInputField label={t("Validade CNH")} value={licenseExpiry} onChange={setLicenseExpiry} testID="field-license-expiry" />
              <View style={{ width: 12 }} />
              <DateInputField label={t("Validade toxicológico")} value={toxExpiry} onChange={setToxExpiry} testID="field-tox-expiry" />
            </View>

            <View style={styles.secDivider} />
            <Text style={styles.secTitle}>{t("Idioma do aplicativo")}</Text>
            <Text style={styles.secSub}>
              {t("Idioma usado em toda a interface do app. Vale para o aplicativo todo e não altera os dados já cadastrados.")}
            </Text>
            <View style={styles.optionRow}>
              {LANGUAGES.map((l) => {
                const active = (user?.app_language ?? "pt-BR") === l.code;
                return (
                  <Pressable
                    key={l.code}
                    style={[styles.currencyBtn, active && styles.optionBtnActive]}
                    onPress={() => {
                      updateLanguage(l.code).catch(() => {});
                    }}
                    testID={`language-${l.code}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.currencyBtnText, active && styles.optionTextActive]}>
                      {l.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.secDivider} />
            <Text style={styles.secTitle}>{t("Moeda do aplicativo")}</Text>
            <Text style={styles.secSub}>
              {t("Moeda usada em todos os valores do app. Vale para o aplicativo todo (não é por motorista) e não converte valores.")}
            </Text>
            <View style={styles.optionRow}>
              {APP_CURRENCIES.map((c) => {
                const active = (user?.app_currency ?? "EUR") === c.code;
                return (
                  <Pressable
                    key={c.code}
                    style={[styles.currencyBtn, active && styles.optionBtnActive]}
                    onPress={() => {
                      updateCurrency(c.code).catch(() => {});
                    }}
                    testID={`currency-${c.code}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.currencyBtnText, active && styles.optionTextActive]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.secDivider} />
            <Text style={styles.secTitle}>{t("Segurança do aplicativo")}</Text>
            <Text style={styles.secSub}>
              {t("Proteja a abertura do app. Vale para o aplicativo todo (não é por motorista).")}
            </Text>

            <View style={styles.secOptions}>
              {(
                [
                  ["none", t("Sem bloqueio")],
                  ["device", t("Senha do telefone")],
                  ["passcode", t("Senha do app")],
                ] as const
              ).map(([key, label]) => {
                const active = secChoice === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.secBtn, active && styles.optionBtnActive]}
                    onPress={() => {
                      setSecChoice(key);
                      setSecMsg(null);
                    }}
                    testID={`sec-choice-${key}`}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {secChoice === "passcode" ? (
              <>
                <TextField
                  label={t("Criar senha do app")}
                  value={appPassword}
                  onChangeText={setAppPassword}
                  placeholder={t("Mínimo 4 caracteres")}
                  secureTextEntry
                  autoCapitalize="none"
                  testID="field-app-password"
                />
                <TextField
                  label={t("Confirmar senha")}
                  value={appPasswordConfirm}
                  onChangeText={setAppPasswordConfirm}
                  placeholder={t("Repita a senha")}
                  secureTextEntry
                  autoCapitalize="none"
                  testID="field-app-password-confirm"
                />
              </>
            ) : null}

            {secChoice === "device" ? (
              <Text style={styles.secSub}>
                Usa a biometria/impressão digital e, quando disponível, o PIN, padrão ou senha do
                próprio telefone. O app não guarda essas informações.
              </Text>
            ) : null}

            {secMsg ? <Text style={styles.secMsg}>{secMsg}</Text> : null}

            <Pressable
              style={[styles.secSave, secSaving && styles.saveBtnDisabled]}
              onPress={applySecurity}
              disabled={secSaving}
              testID="save-security-button"
            >
              {secSaving ? (
                <ActivityIndicator color={colors.brandPrimary} />
              ) : (
                <Text style={styles.secSaveText}>
                  {lockMode ? t("Atualizar segurança") : t("Ativar segurança")}
                </Text>
              )}
            </Pressable>
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} testID="save-driver-button">
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar motorista")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>
        </>
      )}
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
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dimText: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  content: { padding: 16, paddingBottom: 110 },
  row: { flexDirection: "row" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  subLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 8 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  bloodBtn: {
    width: 56,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  optionBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  currencyBtn: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  currencyBtnText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },  optionText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary },
  optionTextActive: { color: colors.onBrandPrimary },
  secDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 8,
    marginBottom: 18,
  },
  secTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  secSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  secOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  secBtn: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  secMsg: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brandPrimary,
    marginBottom: 12,
  },
  secSave: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    marginTop: 2,
  },
  secSaveText: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    letterSpacing: 0.5,
    color: colors.brandPrimary,
  },
  saveBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
