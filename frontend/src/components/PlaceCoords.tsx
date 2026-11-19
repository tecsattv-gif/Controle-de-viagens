import * as Location from "expo-location";
import { ArrowClockwise, MapPin, NavigationArrow, PencilSimple, Trash, X } from "phosphor-react-native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { distanciaAte, useMinhaPosicao } from "@/src/utils/distancia";

export type Coords = { lat: string; lng: string };

// Coordenadas de um campo de local (carregamento, descarga...).
// capture() busca a posição atual do GPS; sem "force", só busca se ainda não houver.
export function useCoordsField() {
  const t = useT();
  const [coords, setCoords] = useState<Coords>({ lat: "", lng: "" });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // Depois de apagar, tocar no campo não busca de novo (só a setinha ↻).
  const cleared = useRef(false);
  const latest = useRef(coords);
  latest.current = coords;

  const capture = useCallback(
    async (force = false) => {
      if (Platform.OS === "web" || busy.current) return;
      if (!force && ((latest.current.lat && latest.current.lng) || cleared.current)) return;
      cleared.current = false;
      busy.current = true;
      setLocating(true);
      setError(null);
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          setError(t("Permita o acesso à localização para gravar as coordenadas."));
          return;
        }
        let pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
          () => null,
        );
        if (!pos) pos = await Location.getLastKnownPositionAsync();
        if (!pos) {
          setError(t("Não foi possível obter a localização. Verifique se o GPS está ligado."));
          return;
        }
        setCoords({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
      } catch {
        setError(t("Não foi possível obter a localização. Verifique se o GPS está ligado."));
      } finally {
        busy.current = false;
        setLocating(false);
      }
    },
    [t],
  );

  const clear = useCallback(() => {
    cleared.current = true;
    setCoords({ lat: "", lng: "" });
    setError(null);
  }, []);

  return { coords, setCoords, locating, error, capture, clear };
}

type Props = {
  coords: Coords;
  locating: boolean;
  error: string | null;
  onRefresh: () => void;
  // Apaga as coordenadas (pede confirmação). Sem ele, o botão não aparece.
  onClear?: () => void;
  // Grava coordenadas digitadas à mão (botão ✏️). Sem ele, o botão não aparece.
  onManual?: (c: Coords) => void;
  testID?: string;
};

// Linha "📍 coordenadas" mostrada logo abaixo do campo de local.
export function CoordsRow({ coords, locating, error, onRefresh, onClear, onManual, testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const has = !!(coords.lat && coords.lng);

  return (
    <View style={styles.wrap}>
      <View style={styles.row} testID={testID}>
        <MapPin size={16} color={colors.brandPrimary} weight="fill" />
        {locating ? (
          <>
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <Text style={[styles.text, { flex: 1 }]}>{t("Obtendo localização...")}</Text>
          </>
        ) : has ? (
          <Pressable
            style={{ flex: 1 }}
            onPress={() =>
              Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`)
            }
          >
            <Text style={styles.link}>{`${coords.lat}, ${coords.lng}`}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.text, { flex: 1 }, error ? { color: colors.error } : null]}>
            {error || t("Sem coordenadas")}
          </Text>
        )}
        {!locating && onManual ? (
          <ManualCoordsButton coords={coords} onSave={onManual} testID={testID ? `${testID}-manual` : undefined} />
        ) : null}
        {has && !locating && onClear ? (
          <Pressable onPress={() => confirmClearCoords(t, onClear)} hitSlop={10}>
            <Trash size={18} color={colors.error} weight="bold" />
          </Pressable>
        ) : null}
        {/* Setinha ↻ só aparece quando não há coordenadas (ex.: depois de apagar na lixeira). */}
        {Platform.OS !== "web" && !locating && !has ? (
          <Pressable onPress={onRefresh} hitSlop={10}>
            <ArrowClockwise size={18} color={colors.brandPrimary} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      {!locating ? <DistanceLine coords={coords} /> : null}
    </View>
  );
}

// Converte o texto digitado em número (aceita vírgula decimal: "48,8566").
function parseNum(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Reconhece "lat, lng" colado de uma vez (ex.: copiado do Google Maps):
// "48.8566, 2.3522" · "48.8566,2.3522" · "48,8566 2,3522" · "48,8566; 2,3522".
export function splitPastedCoords(v: string): Coords | null {
  const t = v.trim();
  const m =
    // Vírgula como separador só quando os números usam ponto ("48.85,2.35")
    // ou há espaço depois dela ("48, 2"); "48,8566" sozinho é vírgula decimal.
    t.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/) ||
    t.match(/^(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)$/) ||
    t.match(/^(-?\d+(?:[.,]\d+)?)\s*[;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

// Botão ✏️ que abre uma janelinha para digitar (ou colar) as coordenadas à mão.
export function ManualCoordsButton({
  coords,
  onSave,
  testID,
}: {
  coords: { lat?: string | null; lng?: string | null };
  onSave: (c: Coords) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const show = () => {
    setLat(coords.lat || "");
    setLng(coords.lng || "");
    setErr(null);
    setOpen(true);
  };

  // Se colar "lat, lng" num dos campos, preenche os dois.
  const onChange = (v: string, set: (s: string) => void) => {
    const pair = splitPastedCoords(v);
    if (pair) {
      setLat(pair.lat);
      setLng(pair.lng);
    } else {
      set(v);
    }
    setErr(null);
  };

  const save = () => {
    const a = parseNum(lat);
    const b = parseNum(lng);
    if (a === null || b === null) {
      setErr(t("Digite a latitude e a longitude (ex.: 48.856600 e 2.352200)."));
      return;
    }
    if (a < -90 || a > 90) {
      setErr(t("A latitude deve estar entre -90 e 90."));
      return;
    }
    if (b < -180 || b > 180) {
      setErr(t("A longitude deve estar entre -180 e 180."));
      return;
    }
    onSave({ lat: a.toFixed(6), lng: b.toFixed(6) });
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={show} hitSlop={10} testID={testID} accessibilityLabel={t("Inserir coordenadas")}>
        <PencilSimple size={18} color={colors.brandPrimary} weight="bold" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{t("Inserir coordenadas")}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                  <X size={22} color={colors.onSurface} weight="bold" />
                </Pressable>
              </View>
              <Text style={styles.hint}>
                {t("Digite ou cole as coordenadas (ex.: copiadas do Google Maps: 48.856600, 2.352200).")}
              </Text>
              <Text style={styles.label}>{t("Latitude")}</Text>
              <TextInput
                value={lat}
                onChangeText={(v) => onChange(v, setLat)}
                placeholder="48.856600"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                testID={testID ? `${testID}-lat` : undefined}
              />
              <Text style={styles.label}>{t("Longitude")}</Text>
              <TextInput
                value={lng}
                onChangeText={(v) => onChange(v, setLng)}
                placeholder="2.352200"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                onSubmitEditing={save}
                testID={testID ? `${testID}-lng` : undefined}
              />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setOpen(false)}>
                  <Text style={styles.btnGhostText}>{t("Cancelar")}</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save} testID={testID ? `${testID}-save` : undefined}>
                  <Text style={styles.btnPrimaryText}>{t("Salvar")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// Linha laranja "➤ 12,4 km de você" (em linha reta), logo abaixo das
// coordenadas. Some sozinha sem GPS ou sem coordenadas.
export function DistanceLine({ coords }: { coords: { lat?: string | null; lng?: string | null } }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const minha = useMinhaPosicao();
  const d = distanciaAte(minha, coords);
  if (!d) return null;
  return (
    <View style={styles.distRow}>
      <NavigationArrow size={15} color={colors.brandPrimary} weight="fill" />
      <Text style={styles.dist}>{t("{d} de você", { d })}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { marginTop: -4, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2, marginTop: 6 },
  dist: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary },
  text: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.brandPrimary, textDecorationLine: "underline" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 12 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6, marginTop: 4 },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  err: { fontFamily: fonts.body, fontSize: 13, color: colors.error, marginTop: 4 },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onBrandPrimary },
}));

// Confirmação antes de apagar as coordenadas.
export function confirmClearCoords(t: (s: string) => string, onConfirm: () => void) {
  confirmDelete({
    title: t("Apagar coordenadas"),
    message: t("Apagar as coordenadas deste local?"),
    confirmText: t("Apagar"),
    cancelText: t("Cancelar"),
    onConfirm,
  });
}
