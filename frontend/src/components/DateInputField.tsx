import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarBlank } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleProp, Text, TextInput, View, ViewStyle } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  formatDateInput,
  formatDateInput4,
  maskDateInput,
  maskDateInput4,
  parseDateInput,
  parseDateInput4,
  toISODate,
} from "@/src/utils/format";

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  error?: string;
  testID?: string;
  fourDigitYear?: boolean;
  style?: StyleProp<ViewStyle>;
};

// A date field the user can TYPE manually (DD/MM/AAAA) or pick from the
// native calendar via the calendar icon.
export function DateInputField({
  label,
  value,
  onChange,
  error,
  testID,
  fourDigitYear,
  style,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fmt = fourDigitYear ? formatDateInput4 : formatDateInput;
  const mask = fourDigitYear ? maskDateInput4 : maskDateInput;
  const parse = fourDigitYear ? parseDateInput4 : parseDateInput;
  const [text, setText] = useState(fmt(value));
  const [show, setShow] = useState(false);

  // Keep the text in sync when the date changes from outside (picker / reset),
  // without fighting the user while they type a partial value.
  useEffect(() => {
    const parsed = parse(text);
    if (!parsed || toISODate(parsed) !== toISODate(value)) {
      setText(fmt(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (t: string) => {
    const masked = mask(t);
    setText(masked);
    const parsed = parse(masked);
    if (parsed) onChange(parsed);
  };

  const handlePicker = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (event.type === "set" && selected) {
      onChange(selected);
      setText(fmt(selected));
      if (Platform.OS === "ios") setShow(false);
    } else if (event.type === "dismissed") {
      setShow(false);
    }
  };

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <TextInput
          value={text}
          onChangeText={handleText}
          placeholder={fourDigitYear ? "DD/MM/AAAA" : "DD/MM/AA"}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={fourDigitYear ? 10 : 8}
          style={styles.input}
          testID={testID}
        />
        <Pressable
          onPress={() => Platform.OS !== "web" && setShow(true)}
          hitSlop={10}
          testID={testID ? `${testID}-picker` : undefined}
          accessibilityRole="button"
        >
          <CalendarBlank size={20} color={colors.brandPrimary} weight="bold" />
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {show ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={handlePicker}
          themeVariant="dark"
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: {
    flex: 1,
    marginBottom: 12,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  fieldError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
}));
