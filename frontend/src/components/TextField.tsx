import { forwardRef, useState } from "react";
import { Pressable, Text, TextInput, TextInputProps, View } from "react-native";
import { InfoIcon } from "phosphor-react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
};

// Capitaliza automaticamente a inicial do que é digitado.
// - "sentences" (padrão): primeira letra do campo em maiúscula
// - "words": primeira letra de cada palavra em maiúscula
function capitalizeText(text: string, mode: "sentences" | "words"): string {
  if (!text) return text;
  if (mode === "words") {
    return text.replace(/(^|\s)(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, style, autoCapitalize = "sentences", onChangeText, ...rest },
  ref,
) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [showHint, setShowHint] = useState(false);

  const handleChangeText = (text: string) => {
    let out = text;
    if (autoCapitalize === "sentences" || autoCapitalize === "words") {
      out = capitalizeText(text, autoCapitalize);
    }
    onChangeText?.(out);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? (
          <Pressable
            onPress={() => setShowHint((v) => !v)}
            hitSlop={10}
            style={styles.infoBtn}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <InfoIcon size={16} color={colors.brandPrimary} weight="fill" />
          </Pressable>
        ) : null}
      </View>
      {hint && showHint ? <Text style={styles.hintText}>{hint}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText ? handleChangeText : undefined}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  wrapper: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  infoBtn: { padding: 2 },
  hintText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
    lineHeight: 17,
  },
  input: {
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
}));
