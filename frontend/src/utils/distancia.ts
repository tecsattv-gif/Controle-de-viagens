// Distância da posição atual do telefone até cada local com coordenadas
// (paradas, início/fim do controle diário, carregamento/descarga, abastecimento).
// O GPS só fica ligado enquanto uma tela que mostra a distância está aberta
// (economiza bateria) e atualiza a cada ~50 m andados.
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useSyncExternalStore } from "react";
import { Platform } from "react-native";

export type Posicao = { lat: number; lng: number };

let posicao: Posicao | null = null;
let usuarios = 0;
let assinatura: Location.LocationSubscription | null = null;
let iniciando = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((l) => l());

function definir(p: Posicao) {
  posicao = p;
  avisar();
}

async function ligar() {
  if (Platform.OS === "web" || assinatura || iniciando) return;
  iniciando = true;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return;
    // Mostra logo a última posição conhecida e depois vai atualizando.
    const ultima = await Location.getLastKnownPositionAsync().catch(() => null);
    if (ultima && !posicao) definir({ lat: ultima.coords.latitude, lng: ultima.coords.longitude });
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 10000 },
      (pos) => definir({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    );
    if (usuarios > 0) assinatura = sub;
    else sub.remove(); // a tela fechou enquanto ligava
  } catch {
    // Sem GPS: os cartões simplesmente não mostram a distância.
  } finally {
    iniciando = false;
  }
}

function desligar() {
  assinatura?.remove();
  assinatura = null;
}

// Posição atual (null enquanto não houver GPS). Liga o GPS quando a tela
// ganha foco e desliga quando nenhuma tela que usa a distância está aberta.
export function useMinhaPosicao(): Posicao | null {
  useFocusEffect(
    useCallback(() => {
      usuarios++;
      ligar();
      return () => {
        usuarios = Math.max(0, usuarios - 1);
        if (usuarios === 0) desligar();
      };
    }, []),
  );
  return useSyncExternalStore(
    (l) => {
      ouvintes.add(l);
      return () => ouvintes.delete(l);
    },
    () => posicao,
  );
}

// Distância em linha reta (fórmula de Haversine), em metros.
export function distanciaMetros(a: Posicao, b: Posicao): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Ex.: "850 m", "12,4 km", "1.234 km".
export function formatarDistancia(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  if (km < 100) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} km`;
}

// Distância formatada (ex.: "12,4 km"), ou null se faltar GPS ou coordenadas do local.
export function distanciaAte(
  minha: Posicao | null,
  lugar: { lat?: string | null; lng?: string | null },
): string | null {
  if (!minha || !lugar.lat || !lugar.lng) return null;
  const lat = parseFloat(String(lugar.lat).replace(",", "."));
  const lng = parseFloat(String(lugar.lng).replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return formatarDistancia(distanciaMetros(minha, { lat, lng }));
}
