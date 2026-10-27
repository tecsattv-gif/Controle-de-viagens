import { Drop, Gauge, MapPin, NotePencil } from "phosphor-react-native";
import { Text, View } from "react-native";

import type { Refueling } from "@/src/api/refuelings";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatDecimal, formatInt, money } from "@/src/utils/format";

type Props = {
  item: Refueling;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text style={styles.infoText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

export function RefuelingCard({ item, onEdit, onDelete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  const dieselTotal = (item.diesel_liters || 0) * (item.diesel_price || 0);
  const arlaTotal = (item.arla_liters || 0) * (item.arla_price || 0);
  const hasArla = (item.arla_liters || 0) > 0 || (item.arla_price || 0) > 0;
  const grandTotal = dieselTotal + arlaTotal;

  return (
    <SwipeableRow
      onEdit={() => onEdit(item.id)}
      onDelete={() => onDelete(item.id)}
      testID={`refueling-card-${item.id}`}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{formatDateBR(item.date)}</Text>
        <Text style={styles.total}>{grandTotal > 0 ? money(grandTotal) : t("Valor não informado")}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.grid}>
        {item.station_place ? (
          <InfoRow
            icon={<MapPin size={16} color={colors.brandPrimary} weight="bold" />}
            text={item.station_place}
          />
        ) : null}
        <InfoRow
          icon={<Drop size={16} color={colors.info} weight="bold" />}
          text={`${t("Diesel: {l} L", { l: formatDecimal(item.diesel_liters) })}${
            dieselTotal > 0 ? `  •  ${money(dieselTotal)}` : ""
          }`}
        />
        <InfoRow
          icon={<Gauge size={16} color={colors.muted} weight="bold" />}
          text={t("KM Diesel: {km}", { km: formatInt(item.km) })}
        />
        {hasArla ? (
          <>
            <InfoRow
              icon={<Drop size={16} color={colors.warning} weight="regular" />}
              text={`${t("ARLA 32: {l} L", { l: formatDecimal(item.arla_liters) })}${
                arlaTotal > 0 ? `  •  ${money(arlaTotal)}` : ""
              }`}
            />
            {item.arla_km ? (
              <InfoRow
                icon={<Gauge size={16} color={colors.muted} weight="regular" />}
                text={t("KM ARLA: {km}", { km: formatInt(item.arla_km) })}
              />
            ) : null}
          </>
        ) : null}
        {item.notes ? (
          <InfoRow
            icon={<NotePencil size={16} color={colors.muted} weight="bold" />}
            text={item.notes}
          />
        ) : null}
      </View>
    </SwipeableRow>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  date: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 22,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  total: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    color: colors.brandPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  grid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
}));
