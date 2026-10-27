import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";

import { fonts, makeStyles } from "@/src/theme";

const DURATION_MS = 2000;

// In-app animated splash shown for 2s on launch, then it fades out and the
// onFinish callback reveals the main app. Purely presentational — it does not
// touch data, navigation state, or any existing feature.
export function AppSplash({ onFinish }: { onFinish: () => void }) {
  const styles = useStyles();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start();

    const timer = setTimeout(onFinish, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onFinish, opacity, scale, progress]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.root} testID="app-splash">
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <Image
          source={require("../../assets/images/truck-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>CONTROLE DE VIAGENS</Text>
        <Text style={styles.subtitle}>Quilometragem • Fretes • Abastecimentos</Text>
        <View style={styles.about}>
          <Text style={styles.aboutApp}>Controle de Viagens</Text>
          <Text style={styles.aboutLine}>Desenvolvido por: Luiz Alberto Cardoso</Text>
          <Text style={styles.aboutLine}>E-mail: tecsattv@gmail.com</Text>
          <Text style={styles.aboutLine}>Versão: 1.1.0</Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: barWidth }]} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const),
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 64,
    paddingBottom: 40,
    zIndex: 1000,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 320,
    height: 320,
    borderRadius: 56,
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 34,
    letterSpacing: 1,
    textAlign: "center",
    color: colors.onSurface,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: "center",
    color: colors.muted,
    marginTop: 8,
  },
  about: {
    alignItems: "center",
    marginTop: 36,
  },
  aboutApp: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.onSurfaceSecondary,
    marginBottom: 4,
  },
  aboutLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    textAlign: "center",
  },
  footer: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: 40,
  },
  track: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandPrimary,
  },
}));
