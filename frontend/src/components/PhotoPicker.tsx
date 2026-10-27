import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Camera, Image as ImageIcon, Trash, User } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useT } from "@/src/i18n";
import { fileUrl, uploadImage } from "@/src/utils/upload";

type Props = {
  label: string;
  value: string; // stored path ("" = none)
  onChange: (path: string) => void;
  shape?: "circle" | "rounded";
  testID?: string;
};

export function PhotoPicker({ label, value, onChange, shape = "rounded", testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const handleUpload = async (uri: string) => {
    setBusy(true);
    try {
      const path = await uploadImage(uri);
      onChange(path);
    } catch (e: any) {
      Alert.alert(t("Erro"), e?.message ?? t("Não foi possível enviar a foto."));
    } finally {
      setBusy(false);
    }
  };

  const ensure = async (
    getStatus: () => Promise<ImagePicker.PermissionResponse>,
    request: () => Promise<ImagePicker.PermissionResponse>,
    deniedMsg: string,
  ): Promise<boolean> => {
    const current = await getStatus();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const res = await request();
      if (res.granted) return true;
    }
    Alert.alert(t("Permissão necessária"), deniedMsg, [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Abrir ajustes"), onPress: () => Linking.openSettings() },
    ]);
    return false;
  };

  // Never fail silently: any picker/permission error is shown to the user.
  const showPickerError = (e: any) =>
    Alert.alert(t("Erro"), `${t("Não foi possível abrir a câmera/galeria.")}\n${e?.message ?? ""}`.trim());

  const pickFromGallery = async () => {
    try {
      // Android uses the system Photo Picker, which needs no storage permission.
      if (Platform.OS === "ios") {
        const ok = await ensure(
          ImagePicker.getMediaLibraryPermissionsAsync,
          ImagePicker.requestMediaLibraryPermissionsAsync,
          t("Autorize o acesso à galeria para escolher uma foto."),
        );
        if (!ok) return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
      });
      if (!result.canceled && result.assets?.[0]?.uri) await handleUpload(result.assets[0].uri);
    } catch (e: any) {
      showPickerError(e);
    }
  };

  const takePhoto = async () => {
    try {
      const ok = await ensure(
        ImagePicker.getCameraPermissionsAsync,
        ImagePicker.requestCameraPermissionsAsync,
        t("Autorize o acesso à câmera para tirar uma foto."),
      );
      if (!ok) return;
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.6,
      });
      if (!result.canceled && result.assets?.[0]?.uri) await handleUpload(result.assets[0].uri);
    } catch (e: any) {
      showPickerError(e);
    }
  };

  const uri = value ? fileUrl(value) : "";

  return (
    <View style={styles.wrapper} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={[styles.thumb, shape === "circle" && styles.circle]}>
          {busy ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : uri ? (
            <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" testID={`${testID}-img`} />
          ) : (
            <User size={34} color={colors.muted} weight="regular" />
          )}
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.btn} onPress={takePhoto} disabled={busy} testID={`${testID}-camera`}>
            <Camera size={18} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.btnText}>{t("Câmera")}</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={pickFromGallery} disabled={busy} testID={`${testID}-gallery`}>
            <ImageIcon size={18} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.btnText}>{t("Galeria")}</Text>
          </Pressable>
          {value ? (
            <Pressable style={styles.btn} onPress={() => onChange("")} disabled={busy} testID={`${testID}-remove`}>
              <Trash size={18} color={colors.error} weight="bold" />
              <Text style={[styles.btnText, { color: colors.error }]}>{t("Remover")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {Platform.OS === "web" ? (
        <Text style={styles.hint}>{t("A câmera só funciona no app (Expo Go/telemóvel).")}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { marginBottom: 14 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circle: { borderRadius: 999 },
  thumbImg: { width: "100%", height: "100%" },
  actions: { flex: 1, gap: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  btnText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 6 },
}));
