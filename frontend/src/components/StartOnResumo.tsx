import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

// Every time the app opens (after login/unlock) start on the Resumo tab,
// regardless of the last screen or URL that was open.
export function StartOnResumo() {
  const router = useRouter();
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !navState?.key) return;
    done.current = true;
    if (pathname !== "/") router.replace("/");
  }, [navState?.key, pathname, router]);

  return null;
}
