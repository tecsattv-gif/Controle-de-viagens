import { Tabs } from "expo-router";
import {
  Calculator,
  ClockCounterClockwise,
  Gauge,
  PlusCircle,
  Truck,
} from "phosphor-react-native";
import { Platform } from "react-native";

import { useTheme } from "@/src/theme";
import { useT } from "@/src/i18n";

export default function TabsLayout() {
  const { colors } = useTheme();
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: {
          fontFamily: "DMSans",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("Resumo"),
          tabBarIcon: ({ color, focused }) => (
            <Gauge size={26} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="nova"
        options={{
          title: t("Novo"),
          tabBarIcon: ({ color, focused }) => (
            <PlusCircle size={26} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: t("Histórico"),
          tabBarIcon: ({ color, focused }) => (
            <ClockCounterClockwise
              size={26}
              color={color}
              weight={focused ? "fill" : "regular"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="abastecimentos"
        options={{
          title: t("Despesas"),
          tabBarIcon: ({ color, focused }) => (
            <Calculator size={26} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="cadastros"
        options={{
          title: t("Cadastros"),
          tabBarIcon: ({ color, focused }) => (
            <Truck size={26} color={color} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
    </Tabs>
  );
}
