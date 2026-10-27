import { Alert, Platform } from "react-native";

// Confirmação de exclusão que funciona no app (Alert nativo) e no preview web
// (window.confirm), já que o Alert do React Native Web não exibe diálogo.
export function confirmDelete(opts: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(opts.message)) {
      opts.onConfirm();
    }
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelText, style: "cancel" },
    { text: opts.confirmText, style: "destructive", onPress: opts.onConfirm },
  ]);
}
