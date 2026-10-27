import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarBlank, Clock } from "phosphor-react-native";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";

type Props = {
  label: string;
  mode: "date" | "time";
  value: Date;
  displayValue: string;
  onChange: (d: Date) => void;
  testID?: string;
};

export function PickerField({
  label,
  mode,
  value,
  displayValue,
  onChange,
  testID,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (event.type === "set" && selected) {
      onChange(selected);
      if (Platform.OS === "ios") setShow(false);
    } else if (event.type === "dismissed") {
      setShow(false);
    }
  };

  const Icon = mode === "date" ? CalendarBlank : Clock;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.field}
        onPress={() => Platform.OS !== "web" && setShow(true)}
        testID={testID}
        accessibilityRole="button"
      >
        <Icon size={20} color={colors.brandPrimary} weight="bold" />
        <Text style={styles.value}>{displayValue}</Text>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={value}
          mode={mode}
          is24Hour
          display="default"
          onChange={handleChange}
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
  value: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
  },
}));
