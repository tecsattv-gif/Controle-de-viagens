import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Clock } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatTimeHM, maskTimeInput, parseTimeInput } from "@/src/utils/format";

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  error?: string;
  testID?: string;
};

// A time field the user can TYPE manually (HH:mm) or pick from the native
// time picker via the clock icon.
export function TimeInputField({ label, value, onChange, error, testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [text, setText] = useState(formatTimeHM(value));
  const [show, setShow] = useState(false);

  useEffect(() => {
    const parsed = parseTimeInput(text);
    if (!parsed || formatTimeHM(parsed) !== formatTimeHM(value)) {
      setText(formatTimeHM(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (t: string) => {
    const masked = maskTimeInput(t);
    setText(masked);
    const parsed = parseTimeInput(masked);
    if (parsed) onChange(parsed);
  };

  const handlePicker = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (event.type === "set" && selected) {
      onChange(selected);
      setText(formatTimeHM(selected));
      if (Platform.OS === "ios") setShow(false);
    } else if (event.type === "dismissed") {
      setShow(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <TextInput
          value={text}
          onChangeText={handleText}
          placeholder="HH:MM"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={5}
          style={styles.input}
          testID={testID}
        />
        <Pressable
          onPress={() => Platform.OS !== "web" && setShow(true)}
          hitSlop={10}
          testID={testID ? `${testID}-picker` : undefined}
          accessibilityRole="button"
        >
          <Clock size={20} color={colors.brandPrimary} weight="bold" />
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {show ? (
        <DateTimePicker
          value={value}
          mode="time"
          is24Hour
          display="default"
          onChange={handlePicker}
          themeVariant="dark"
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { flex: 1, marginBottom: 12 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6 },
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
  fieldError: { borderColor: colors.error },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 12,
  },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: colors.error, marginTop: 4 },
}));
