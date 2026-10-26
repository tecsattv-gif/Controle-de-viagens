import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ArrowCounterClockwise, Check, FloppyDisk, GasPump, Palette, X } from "phosphor-react-native";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ColorPicker, { HueSlider, Panel1 } from "reanimated-color-picker";

import { useT } from "@/src/i18n";
import {
  ColorScheme,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  ThemeMode,
  buildColors,
  contrastOn,
  fonts,
  isValidHex,
  makeStyles,
  normalizeHex,
  useTheme,
} from "@/src/theme";
import { resetAppTheme, saveAppTheme } from "@/src/utils/accentColor";

const PRESETS: { key: string; hex: string }[] = [
  { key: "Laranja", hex: "#FF6D00" },
  { key: "Azul", hex: "#1E88E5" },
  { key: "Azul-claro", hex: "#4FC3F7" },
  { key: "Verde", hex: "#43A047" },
  { key: "Verde-limão", hex: "#C0CA33" },
  { key: "Vermelho", hex: "#E53935" },
  { key: "Vinho", hex: "#880E4F" },
  { key: "Roxo", hex: "#8E24AA" },
  { key: "Rosa", hex: "#EC407A" },
  { key: "Amarelo", hex: "#FDD835" },
  { key: "Cinza", hex: "#607D8B" },
  { key: "Turquesa", hex: "#00BCD4" },
];

const MODES: { key: ThemeMode; label: string; icon: string }[] = [
  { key: "light", label: "Claro", icon: "☀️" },
  { key: "dark", label: "Escuro", icon: "🌙" },
  { key: "auto", label: "Automático", icon: "📱" },
];

export default function CoresScreen() {
  const styles = useStyles();
  const { colors, mode: currentMode } = useTheme();
  const device = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const [selected, setSelected] = useState<string>(colors.brandPrimary);
  const [mode, setMode] = useState<ThemeMode>(currentMode);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hexInput, setHexInput] = useState<string>(colors.brandPrimary);

  const resolvedScheme: ColorScheme = mode === "auto" ? (device === "light" ? "light" : "dark") : mode;
  const preview = buildColors(selected, resolvedScheme);
  const isPreset = PRESETS.some((p) => p.hex.toUpperCase() === selected.toUpperCase());

  const applyHex = (raw: string) => {
    if (isValidHex(raw)) setSelected(normalizeHex(raw));
  };

  const handleSave = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveAppTheme(selected, mode);
    router.back();
  };

  const handleReset = async () => {
    setSelected(DEFAULT_ACCENT);
    setMode(DEFAULT_MODE);
    setHexInput(DEFAULT_ACCENT);
    await resetAppTheme();
  };

  return (
    <View style={styles.screen} testID="cores-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="cores-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Cores do aplicativo")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>{t("Personalize a cor principal e o tema. A mudança é apenas visual e não altera seus dados.")}</Text>

        {/* Prévia */}
        <Text style={styles.sectionLabel}>{t("Prévia")}</Text>
        <View style={[styles.previewCard, { backgroundColor: preview.surface, borderColor: preview.border }]} testID="cores-preview">
          <View style={[styles.previewHeader, { backgroundColor: preview.surfaceSecondary, borderBottomColor: preview.border }]}>
            <Text style={[styles.previewHeaderText, { color: preview.brandPrimary }]}>{t("Cabeçalho")}</Text>
          </View>
          <View style={styles.previewBody}>
            <View style={styles.previewRow}>
              <View style={[styles.previewIconBox, { backgroundColor: preview.brandTertiary }]}>
                <GasPump size={22} color={preview.onBrandTertiary} weight="fill" />
              </View>
              <View style={[styles.previewBar, { backgroundColor: preview.surfaceTertiary }]}>
                <View style={[styles.previewBarFill, { backgroundColor: preview.brandPrimary }]} />
              </View>
            </View>
            <View style={[styles.previewMiniCard, { backgroundColor: preview.surfaceSecondary, borderColor: preview.border }]}>
              <Text style={[styles.previewCardText, { color: preview.onSurface }]}>{t("Cartão de exemplo")}</Text>
              <Text style={[styles.previewLink, { color: preview.brandPrimary }]}>{t("Texto em destaque")}</Text>
            </View>
            <View style={[styles.previewBtn, { backgroundColor: preview.brandPrimary }]}>
              <Text style={[styles.previewBtnText, { color: preview.onBrandPrimary }]}>{t("Botão principal")}</Text>
            </View>
          </View>
        </View>

        {/* Tema */}
        <Text style={styles.sectionLabel}>{t("Tema")}</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                onPress={() => setMode(m.key)}
                testID={`cores-mode-${m.key}`}
                accessibilityRole="button"
              >
                <Text style={styles.modeIcon}>{m.icon}</Text>
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{t(m.label)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cores prontas */}
        <Text style={styles.sectionLabel}>{t("Cores prontas")}</Text>
        <View style={styles.palette}>
          {PRESETS.map((p) => {
            const active = selected.toUpperCase() === p.hex.toUpperCase();
            return (
              <Pressable
                key={p.hex}
                style={styles.presetItem}
                onPress={() => {
                  setSelected(p.hex);
                  setHexInput(p.hex);
                }}
                testID={`cores-preset-${p.key}`}
                accessibilityRole="button"
              >
                <View style={[styles.swatch, { backgroundColor: p.hex }, active && styles.swatchActive]}>
                  {active ? <Check size={20} color={contrastOn(p.hex)} weight="bold" /> : null}
                </View>
                <Text style={[styles.presetName, active && styles.presetNameActive]} numberOfLines={1}>
                  {t(p.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cor personalizada */}
        <Text style={styles.sectionLabel}>{t("Cor personalizada")}</Text>
        <View style={styles.customRow}>
          <Pressable
            style={[styles.customSwatch, { backgroundColor: selected }, !isPreset && styles.swatchActive]}
            onPress={() => setPickerOpen(true)}
            testID="cores-open-picker"
          >
            <Palette size={20} color={contrastOn(selected)} weight="fill" />
          </Pressable>
          <View style={styles.hexWrap}>
            <TextInput
              style={styles.hexInput}
              value={hexInput}
              onChangeText={(v) => {
                setHexInput(v);
                applyHex(v);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="#FF6600"
              placeholderTextColor={colors.muted}
              testID="cores-hex-input"
            />
          </View>
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave} testID="cores-save">
          <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
          <Text style={styles.saveText}>{t("Salvar alterações")}</Text>
        </Pressable>

        <Pressable style={styles.resetBtn} onPress={handleReset} testID="cores-reset">
          <ArrowCounterClockwise size={20} color={colors.brandPrimary} weight="bold" />
          <Text style={styles.resetText}>{t("Restaurar padrão")}</Text>
        </Pressable>
      </ScrollView>

      {/* Color picker modal */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>{t("Cor personalizada")}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} testID="cores-picker-close">
                <X size={22} color={colors.onSurface} weight="bold" />
              </Pressable>
            </View>
            <ColorPicker
              style={{ gap: 18 }}
              value={selected}
              onComplete={(c) => {
                setSelected(normalizeHex(c.hex));
                setHexInput(normalizeHex(c.hex));
              }}
            >
              <Panel1 style={styles.pickerPanel} />
              <HueSlider />
            </ColorPicker>
            <Pressable style={styles.pickerOk} onPress={() => setPickerOpen(false)} testID="cores-picker-ok">
              <Text style={styles.pickerOkText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  content: { padding: 16 },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginBottom: 18 },
  sectionLabel: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, letterSpacing: 0.3, marginBottom: 10 },
  previewCard: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 20 },
  previewHeader: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  previewHeaderText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.3 },
  previewBody: { padding: 14, gap: 12 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  previewIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  previewBar: { flex: 1, height: 10, borderRadius: 999, overflow: "hidden" },
  previewBarFill: { width: "70%", height: "100%", borderRadius: 999 },
  previewMiniCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  previewCardText: { fontFamily: fonts.body, fontSize: 14 },
  previewLink: { fontFamily: fonts.displaySemiBold, fontSize: 15 },
  previewBtn: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  previewBtnText: { fontFamily: fonts.displayBold, fontSize: 17, letterSpacing: 0.5 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  modeBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  modeIcon: { fontSize: 20 },
  modeText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  modeTextActive: { color: colors.onBrandTertiary },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  presetItem: { width: 72, alignItems: "center", gap: 6 },
  swatch: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  swatchActive: { borderColor: colors.onSurface },
  presetName: { fontFamily: fonts.body, fontSize: 12, color: colors.onSurfaceSecondary, textAlign: "center" },
  presetNameActive: { color: colors.brandPrimary, fontWeight: "700" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  customSwatch: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  hexWrap: { flex: 1 },
  hexInput: {
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
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
  saveText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.brandPrimary,
    borderWidth: 1.5,
  },
  resetText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.brandPrimary },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 18,
  },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  pickerPanel: { height: 200, borderRadius: 12 },
  pickerOk: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandPrimary },
  pickerOkText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
