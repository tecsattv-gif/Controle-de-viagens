import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppSplash } from "@/src/components/AppSplash";
import { LoginScreen } from "@/src/components/LoginScreen";
import { SecurityGate } from "@/src/components/SecurityGate";
import { StartOnResumo } from "@/src/components/StartOnResumo";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { UndoDeleteProvider } from "@/src/context/UndoDelete";import { queryClient } from "@/src/query-client";
import { loadAppTheme } from "@/src/utils/accentColor";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

const DARK = { flex: 1, backgroundColor: "#121212" } as const;

// Renders the gate overlays until the user is fully authenticated and (optionally)
// past the device lock. The app (children/Stack) only mounts AFTER auth, so data
// queries never fire without a token.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [deviceUnlocked, setDeviceUnlocked] = useState(false);

  useEffect(() => {
    if (!user) setDeviceUnlocked(false);
  }, [user]);

  if (showSplash) return <AppSplash onFinish={() => setShowSplash(false)} />;
  if (loading) return <View style={DARK} />;
  if (!user) return <LoginScreen />;
  if (!deviceUnlocked) return <SecurityGate onAuthed={() => setDeviceUnlocked(true)} />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    BarlowCondensed: require("../assets/fonts/BarlowCondensed-Regular.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    DMSans: require("../assets/fonts/DMSans.ttf"),
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    loadAppTheme();
  }, []);

  // Web only: when the user prints the page from the browser, hide in-app
  // edit/delete affordances so they never appear in the printed/PDF document.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const id = "print-hide-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent =
      "@media print { [data-print-hide='true'] { display: none !important; } }";
    document.head.appendChild(style);
  }, []);

  if (!loaded) return <View style={DARK} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <StatusBar style="light" />
                <AuthGate>
                  <UndoDeleteProvider>
                    <Stack screenOptions={{ headerShown: false }} />
                    <StartOnResumo />
                  </UndoDeleteProvider>
                </AuthGate>
              </AuthProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
