import * as LocalAuthentication from "expo-local-authentication";

// True when the device has biometric hardware AND an enrolled credential
// (fingerprint/face) or a device PIN/pattern/password.
export async function canUseDeviceAuth(): Promise<boolean> {
  const [hardware, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return hardware && level !== LocalAuthentication.SecurityLevel.NONE;
}

// Prompt the OS for biometrics with device PIN/pattern/password fallback.
export async function unlockWithDevice(): Promise<boolean> {
  if (!(await canUseDeviceAuth())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Desbloqueie o Controle de Viagens",
    cancelLabel: "Cancelar",
    disableDeviceFallback: false,
  });
  return result.success;
}
