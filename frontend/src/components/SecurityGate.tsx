import { LockKey } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";

import { unlockWithDevice } from "@/src/utils/deviceAuth";
import { getLockMode, verifyPasscode } from "@/src/utils/lockStorage";
import { fonts, makeStyles, useTheme } from "@/src/theme";

// Lock gate shown after the splash. Behavior depends on the saved lock mode:
// - 'passcode': prompt for the app password (with a "forgot" device fallback).
// - 'device': biometrics + device PIN/pattern/password.
// - none: no lock, allow access. The app never stores/asks the phone's PIN.
export function SecurityGate({ onAuthed }: { onAuthed: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<"checking" | "passcode" | "locked">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const tryDevice = useCallback(async () => {
    setError(null);
    try {
      const ok = await unlockWithDevice();
      if (ok) onAuthed();
      else setError("Autenticação cancelada ou falhou.");
    } catch {
      setError("Não foi possível usar a autenticação do aparelho.");
    }
  }, [onAuthed]);

  const submitPasscode = useCallback(async () => {
    setError(null);
    const ok = await verifyPasscode(password);
    if (ok) onAuthed();
    else setError("Senha incorreta.");
  }, [password, onAuthed]);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    if (Platform.OS === "web") {
      onAuthed();
      return;
    }

    const mode = await getLockMode();
    if (!mode) {
      onAuthed();
      return;
    }
    if (mode === "passcode") {
      setPhase("passcode");
      return;
    }
    // device mode
    setPhase("locked");
    try {
      const ok = await unlockWithDevice();
      if (ok) onAuthed();
    } catch {
      // stay locked; user taps retry
    }
  }, [onAuthed]);

  useEffect(() => {
    start();
  }, [start]);

  return (
    <View style={styles.root} testID="security-gate">
      <View style={styles.iconCircle}>
        <LockKey size={52} color={colors.brandPrimary} weight="fill" />
      </View>
      <Text style={styles.title}>APP BLOQUEADO</Text>

      {phase === "checking" ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 20 }} />
      ) : phase === "passcode" ? (
        <>
          <Text style={styles.hint}>Digite a senha do aplicativo.</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Senha do app"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
            testID="gate-password-input"
            onSubmitEditing={submitPasscode}
          />
          <Pressable style={styles.button} onPress={submitPasscode} testID="gate-unlock-button">
            <Text style={styles.buttonText}>Desbloquear</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={tryDevice} testID="gate-forgot-button">
            <Text style={styles.linkText}>Esqueci a senha — usar senha do telefone</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Use sua biometria ou o PIN/padrão/senha do aparelho para entrar.
          </Text>
          <Pressable style={styles.button} onPress={tryDevice} testID="gate-device-button">
            <Text style={styles.buttonText}>Desbloquear</Text>
          </Pressable>
        </>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const),
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    zIndex: 1100,
  },
  iconCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    marginBottom: 22,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 26,
    letterSpacing: 1,
    color: colors.onSurface,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: "center",
    color: colors.muted,
    marginTop: 12,
    lineHeight: 20,
  },
  input: {
    alignSelf: "stretch",
    marginTop: 20,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    height: 52,
    minWidth: 220,
    alignSelf: "stretch",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  buttonText: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
  linkBtn: {
    marginTop: 18,
    padding: 6,
  },
  linkText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brandPrimary,
    textAlign: "center",
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.error,
    marginTop: 16,
    textAlign: "center",
  },
}));
