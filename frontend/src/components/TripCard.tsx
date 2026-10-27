import {
  ArrowsLeftRight,
  MapPin,
  NotePencil,
  PathIcon as Path,
  Truck,
  UserCircle,
} from "phosphor-react-native";
import { Text, View } from "react-native";

import type { Trip } from "@/src/api/trips";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt, money } from "@/src/utils/format";
import { computeTripFinance, hasFreight } from "@/src/utils/freight";

type Props = {
  trip: Trip;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

function InfoRow({
  icon,
  text,
  testID,
}: {
  icon: React.ReactNode;
  text: string;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow} testID={testID}>
      {icon}
      <Text style={styles.infoText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function TripCard({ trip, onEdit, onDelete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  return (
    <SwipeableRow
      onEdit={() => onEdit(trip.id)}
      onDelete={() => onDelete(trip.id)}
      testID={`trip-card-${trip.id}`}
    >
      <View style={styles.header}>
        <Text style={styles.date} numberOfLines={1}>
          {trip.end_date && trip.end_date !== trip.date
            ? `${formatDateBR(trip.date)} → ${formatDateBR(trip.end_date)}`
            : formatDateBR(trip.date)}
        </Text>
        <View style={styles.kmBadge}>
          <Path size={14} color={colors.onBrandTertiary} weight="bold" />
          <Text style={styles.kmText}>{formatInt(trip.km)} km</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.grid}>
        <InfoRow
          icon={<ArrowsLeftRight size={16} color={colors.muted} weight="bold" />}
          text={`${formatInt(trip.km_start)} → ${formatInt(trip.km_end)}`}
        />
        {trip.loading_place ? (
          <InfoRow
            icon={<MapPin size={16} color={colors.muted} weight="bold" />}
            text={t("Carga: {p}", { p: trip.loading_place })}
          />
        ) : null}
        {trip.unloading_place ? (
          <InfoRow
            icon={<MapPin size={16} color={colors.brandPrimary} weight="bold" />}
            text={t("Descarga: {p}", { p: trip.unloading_place })}
          />
        ) : null}
        {trip.vehicle_label ? (
          <InfoRow
            icon={<Truck size={16} color={colors.brandPrimary} weight="bold" />}
            text={trip.vehicle_label}
          />
        ) : null}
        {trip.driver_name ? (
          <InfoRow
            icon={<UserCircle size={16} color={colors.muted} weight="bold" />}
            text={
              trip.driver_license
                ? `${trip.driver_name} • ${t("CNH {n}", { n: trip.driver_license })}`
                : trip.driver_name
            }
          />
        ) : null}
        {trip.notes ? (
          <InfoRow
            icon={<NotePencil size={16} color={colors.muted} weight="bold" />}
            text={trip.notes}
          />
        ) : null}
      </View>

      {hasFreight(trip) ? <FinanceSummary trip={trip} /> : null}
    </SwipeableRow>
  );
}

function FinanceSummary({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const t = useT();
  const f = computeTripFinance(trip);
  const gross = f.grossEur + f.grossBrl;
  const diesel = f.dieselEur + f.dieselBrl;
  const arla = f.arlaEur + f.arlaBrl;
  const tolls = f.tollsEur + f.tollsBrl;
  const expenses = f.expensesEur + f.expensesBrl;
  const net = f.netEur + f.netBrl;
  return (
    <View style={styles.finance} testID={`trip-finance-${trip.id}`}>
      <Text style={styles.financeTitle}>{t("RESUMO FINANCEIRO")}</Text>
      {trip.freight_status && trip.freight_status !== "Não informado" ? (
        <Text style={styles.financeStatus}>{t("Situação")}: {t(trip.freight_status)}</Text>
      ) : null}
      <View style={styles.financeBlock}>
        <FinRow label={t("Frete bruto")} value={money(gross)} />
        {diesel > 0 ? <FinRow label={t("Diesel")} value={money(diesel)} /> : null}
        {arla > 0 ? <FinRow label="ARLA 32" value={money(arla)} /> : null}
        {tolls > 0 ? <FinRow label={t("Pedágios")} value={money(tolls)} /> : null}
        {expenses > 0 ? <FinRow label={t("Total despesas")} value={money(expenses)} /> : null}
        {expenses > 0 ? (
          <FinRow
            label={t("Custo por km")}
            value={money(trip.km > 0 ? expenses / trip.km : 0)}
          />
        ) : null}
        <FinRow label={t("Frete líquido")} value={money(net)} strong />
      </View>
    </View>
  );
}

function FinRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.finRow}>
      <Text style={[styles.finLabel, strong && styles.finStrong]}>{label}</Text>
      <Text style={[styles.finValue, strong && styles.finStrong]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  date: {
    flexShrink: 1,
    marginRight: 8,
    fontFamily: fonts.displaySemiBold,
    fontSize: 22,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  kmBadge: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kmText: {
    fontFamily: fonts.displayBold,
    fontSize: 15,
    color: colors.onBrandTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  grid: {
    gap: 8,
  },
  finance: {
    marginTop: 12,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  financeTitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.brandPrimary,
    marginBottom: 6,
  },
  financeStatus: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: 6,
  },
  financeBlock: {
    marginTop: 4,
    paddingTop: 4,
  },
  finRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  finLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  finValue: { fontFamily: fonts.body, fontSize: 12, color: colors.onSurfaceSecondary },
  finStrong: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 14,
    color: colors.onSurface,
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
