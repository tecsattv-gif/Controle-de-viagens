import type { QueryKey } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { queryClient } from "@/src/query-client";
import { fonts, makeStyles } from "@/src/theme";

const UNDO_MS = 10000;

type RemoveOpts = {
  queryKey: QueryKey;
  id: string;
  run: () => Promise<unknown>;
  label?: string;
};

type Ctx = { removeWithUndo: (opts: RemoveOpts) => void };

const UndoContext = createContext<Ctx | null>(null);

export function useUndoableDelete() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndoableDelete must be used within UndoDeleteProvider");
  return ctx.removeWithUndo;
}

type Pending = { queryKey: QueryKey; snapshot: unknown; run: () => Promise<unknown> };

export function UndoDeleteProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("");
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Executa de fato a exclusão pendente (commit).
  const commit = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    clearTimer();
    setVisible(false);
    if (!p) return;
    p.run()
      .catch(() => {
        // Falhou: restaura o item na lista.
        queryClient.setQueryData(p.queryKey, p.snapshot);
      })
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: p.queryKey });
      });
  }, []);

  const removeWithUndo = useCallback(
    (opts: RemoveOpts) => {
      // Se já havia algo pendente, confirma antes de iniciar o novo.
      if (pendingRef.current) commit();
      const snapshot = queryClient.getQueryData<{ id: string }[]>(opts.queryKey);
      queryClient.setQueryData<{ id: string }[]>(opts.queryKey, (old) =>
        old ? old.filter((x) => x.id !== opts.id) : old,
      );
      pendingRef.current = { queryKey: opts.queryKey, snapshot, run: opts.run };
      setLabel(opts.label || t("Item apagado"));
      setVisible(true);
      clearTimer();
      timerRef.current = setTimeout(commit, UNDO_MS);
    },
    [commit, t],
  );

  const undo = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    clearTimer();
    setVisible(false);
    if (p) queryClient.setQueryData(p.queryKey, p.snapshot);
  }, []);

  useEffect(() => clearTimer, []);

  return (
    <UndoContext.Provider value={{ removeWithUndo }}>
      {children}
      {visible ? (
        <View style={[styles.snack, { bottom: insets.bottom + 24 }]} testID="undo-snackbar">
          <Text style={styles.snackText} numberOfLines={1}>
            {label}
          </Text>
          <Pressable onPress={undo} hitSlop={8} testID="undo-button" accessibilityRole="button">
            <Text style={styles.undoText}>{t("Desfazer")}</Text>
          </Pressable>
        </View>
      ) : null}
    </UndoContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  snack: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.surfaceInverse,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  snackText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceInverse },
  undoText: {
    fontFamily: fonts.displayBold,
    fontSize: 15,
    letterSpacing: 0.5,
    color: colors.brandPrimary,
  },
}));
