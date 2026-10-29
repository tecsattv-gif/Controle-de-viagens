import * as Location from "expo-location";
import { ArrowClockwise, MapPin } from "phosphor-react-native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export type Coords = { lat: string; lng: string };

// Coordenadas de um campo de local (carregamento, descarga...).
// capture() busca a posição atual do GPS; sem "force", só busca se ainda não houver.
export function useCoordsField() {
  const t = useT();
  const [coords, setCoords] = useState<Coords>({ lat: "", lng: "" });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const latest = useRef(coords);
  latest.current = coords;

  const capture = useCallback(
    async (force = false) => {
      if (Platform.OS === "web" || busy.current) return;
      if (!force && latest.current.lat && latest.current.lng) return;
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

  return { coords, setCoords, locating, error, capture };
}

type Props = {
  coords: Coords;
  locating: boolean;
  error: string | null;
  onRefresh: () => void;
  testID?: string;
};

// Linha "📍 coordenadas" mostrada logo abaixo do campo de local.
export function CoordsRow({ coords, locating, error, onRefresh, testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const has = !!(coords.lat && coords.lng);

  return (
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
      {Platform.OS !== "web" && !locating ? (
        <Pressable onPress={onRefresh} hitSlop={10}>
          <ArrowClockwise size={18} color={colors.brandPrimary} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    marginTop: -4,
    marginBottom: 12,
  },
  text: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.brandPrimary, textDecorationLine: "underline" },
}));
