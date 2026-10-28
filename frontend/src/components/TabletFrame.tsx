import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Platform, useWindowDimensions, View } from "react-native";

import { useTheme } from "@/src/theme";

// Largura máxima do conteúdo. No telefone não muda nada (a tela é mais
// estreita que isso); no tablet o app fica centralizado numa coluna
// confortável, em vez de esticar cartões e botões de ponta a ponta.
export const CONTENT_MAX_WIDTH = 720;

// Menor lado da tela a partir do qual consideramos "tablet".
const TABLET_MIN_SIDE = 600;

export function TabletFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;

  // Telefone: sempre em pé. Tablet: pode girar (retrato ou paisagem).
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(
      isTablet ? ScreenOrientation.OrientationLock.DEFAULT : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, [isTablet]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center" }}>
      <View style={{ flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH }}>{children}</View>
    </View>
  );
}
