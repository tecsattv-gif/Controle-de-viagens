import type { Trip, TripInput } from "@/src/api/trips";

export type Currency = "EUR" | "BRL";
export const FREIGHT_STATUSES = [
  "Não informado",
  "A receber",
  "Parcialmente recebido",
  "Pago",
] as const;
export type FreightStatus = (typeof FREIGHT_STATUSES)[number];

export function currencySymbol(c: string): string {
  return c === "BRL" ? "R$" : "€";
}

// Controlled form shape used by the shared FreightSection.
export type TollEntry = { value: string; currency: Currency };

export type FreightForm = {
  grossValue: string;
  grossCurrency: Currency;
  netValue: string;
  netCurrency: Currency;
  paidValue: string;
  paidCurrency: Currency;
  payDate: string; // "" or yyyy-mm-dd
  status: FreightStatus;
  dieselValue: string;
  dieselCurrency: Currency;
  arlaValue: string;
  arlaCurrency: Currency;
  tolls: TollEntry[];
};

export const emptyFreight: FreightForm = {
  grossValue: "",
  grossCurrency: "EUR",
  netValue: "",
  netCurrency: "EUR",
  paidValue: "",
  paidCurrency: "EUR",
  payDate: "",
  status: "Não informado",
  dieselValue: "",
  dieselCurrency: "EUR",
  arlaValue: "",
  arlaCurrency: "EUR",
  tolls: [],
};

function numToInput(n: number): string {
  return n ? String(n).replace(".", ",") : "";
}

function cur(v: string): Currency {
  return v === "BRL" ? "BRL" : "EUR";
}

function status(v: string): FreightStatus {
  return (FREIGHT_STATUSES as readonly string[]).includes(v)
    ? (v as FreightStatus)
    : "Não informado";
}

export function freightFromTrip(t: Trip): FreightForm {
  return {
    grossValue: numToInput(t.freight_gross),
    grossCurrency: cur(t.freight_gross_currency),
    netValue: numToInput(t.freight_net),
    netCurrency: cur(t.freight_net_currency),
    paidValue: numToInput(t.freight_paid),
    paidCurrency: cur(t.freight_paid_currency),
    payDate: t.freight_payment_date || "",
    status: status(t.freight_status),
    dieselValue: numToInput(t.freight_diesel),
    dieselCurrency: cur(t.freight_diesel_currency),
    arlaValue: numToInput(t.freight_arla),
    arlaCurrency: cur(t.freight_arla_currency),
    tolls: (t.tolls || []).map((x) => ({
      value: numToInput(x.value),
      currency: cur(x.currency),
    })),
  };
}

function parseNum(s: string): number {
  const n = parseFloat((s || "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Produce the freight-related fields for a TripInput payload.
export function freightToInput(f: FreightForm): Pick<
  TripInput,
  | "freight_gross"
  | "freight_gross_currency"
  | "freight_net"
  | "freight_net_currency"
  | "freight_paid"
  | "freight_paid_currency"
  | "freight_payment_date"
  | "freight_status"
  | "freight_diesel"
  | "freight_diesel_currency"
  | "freight_arla"
  | "freight_arla_currency"
  | "tolls"
> {
  return {
    freight_gross: parseNum(f.grossValue),
    freight_gross_currency: f.grossCurrency,
    freight_net: parseNum(f.netValue),
    freight_net_currency: f.netCurrency,
    freight_paid: parseNum(f.paidValue),
    freight_paid_currency: f.paidCurrency,
    freight_payment_date: f.payDate,
    freight_status: f.status,
    freight_diesel: parseNum(f.dieselValue),
    freight_diesel_currency: f.dieselCurrency,
    freight_arla: parseNum(f.arlaValue),
    freight_arla_currency: f.arlaCurrency,
    tolls: f.tolls
      .map((t) => ({ value: parseNum(t.value), currency: t.currency }))
      .filter((t) => t.value > 0),
  };
}

export function tollsTotal(t: Trip, currency: Currency): number {
  return (t.tolls || [])
    .filter((x) => cur(x.currency) === currency)
    .reduce((s, x) => s + (x.value || 0), 0);
}

// Per-trip financial summary, split by currency (no mixing/conversion).
export type TripFinance = {
  grossEur: number;
  grossBrl: number;
  dieselEur: number;
  dieselBrl: number;
  arlaEur: number;
  arlaBrl: number;
  tollsEur: number;
  tollsBrl: number;
  expensesEur: number;
  expensesBrl: number;
  netEur: number;
  netBrl: number;
};

export function computeTripFinance(t: Trip): TripFinance {
  const grossEur = t.freight_gross_currency === "BRL" ? 0 : t.freight_gross || 0;
  const grossBrl = t.freight_gross_currency === "BRL" ? t.freight_gross || 0 : 0;
  const dieselEur = t.freight_diesel_currency === "BRL" ? 0 : t.freight_diesel || 0;
  const dieselBrl = t.freight_diesel_currency === "BRL" ? t.freight_diesel || 0 : 0;
  const arlaEur = t.freight_arla_currency === "BRL" ? 0 : t.freight_arla || 0;
  const arlaBrl = t.freight_arla_currency === "BRL" ? t.freight_arla || 0 : 0;
  const tollsEur = tollsTotal(t, "EUR");
  const tollsBrl = tollsTotal(t, "BRL");
  const expensesEur = dieselEur + arlaEur + tollsEur;
  const expensesBrl = dieselBrl + arlaBrl + tollsBrl;
  return {
    grossEur,
    grossBrl,
    dieselEur,
    dieselBrl,
    arlaEur,
    arlaBrl,
    tollsEur,
    tollsBrl,
    expensesEur,
    expensesBrl,
    netEur: grossEur - expensesEur,
    netBrl: grossBrl - expensesBrl,
  };
}

// Cost per km = (diesel + arla + tolls) / km rodados, split by currency.
export function costPerKm(t: Trip): { eur: number; brl: number } {
  const f = computeTripFinance(t);
  const km = t.km || 0;
  return {
    eur: km > 0 ? f.expensesEur / km : 0,
    brl: km > 0 ? f.expensesBrl / km : 0,
  };
}

export function hasFreight(t: Trip): boolean {
  return (
    (t.freight_gross || 0) > 0 ||
    (t.freight_net || 0) > 0 ||
    (t.freight_paid || 0) > 0 ||
    (t.freight_diesel || 0) > 0 ||
    (t.freight_arla || 0) > 0 ||
    (t.tolls || []).length > 0 ||
    (!!t.freight_status && t.freight_status !== "Não informado")
  );
}

export type FreightTotals = {
  grossEur: number;
  grossBrl: number;
  netEur: number;
  netBrl: number;
  paidEur: number;
  paidBrl: number;
  toReceiveEur: number;
  toReceiveBrl: number;
  dieselEur: number;
  dieselBrl: number;
  arlaEur: number;
  arlaBrl: number;
  tollsEur: number;
  tollsBrl: number;
  expensesEur: number;
  expensesBrl: number;
  resultEur: number;
  resultBrl: number;
};

// Sum freight by currency. Never mixes EUR/BRL, no conversion. Trips without
// any freight info are ignored.
export function computeFreightTotals(trips: Trip[]): FreightTotals {
  const t: FreightTotals = {
    grossEur: 0,
    grossBrl: 0,
    netEur: 0,
    netBrl: 0,
    paidEur: 0,
    paidBrl: 0,
    toReceiveEur: 0,
    toReceiveBrl: 0,
    dieselEur: 0,
    dieselBrl: 0,
    arlaEur: 0,
    arlaBrl: 0,
    tollsEur: 0,
    tollsBrl: 0,
    expensesEur: 0,
    expensesBrl: 0,
    resultEur: 0,
    resultBrl: 0,
  };
  for (const trip of trips) {
    if (!hasFreight(trip)) continue;
    if (trip.freight_gross_currency === "BRL") t.grossBrl += trip.freight_gross || 0;
    else t.grossEur += trip.freight_gross || 0;
    if (trip.freight_net_currency === "BRL") t.netBrl += trip.freight_net || 0;
    else t.netEur += trip.freight_net || 0;
    if (trip.freight_paid_currency === "BRL") t.paidBrl += trip.freight_paid || 0;
    else t.paidEur += trip.freight_paid || 0;
    const fin = computeTripFinance(trip);
    t.dieselEur += fin.dieselEur;
    t.dieselBrl += fin.dieselBrl;
    t.arlaEur += fin.arlaEur;
    t.arlaBrl += fin.arlaBrl;
    t.tollsEur += fin.tollsEur;
    t.tollsBrl += fin.tollsBrl;
    t.expensesEur += fin.expensesEur;
    t.expensesBrl += fin.expensesBrl;
  }
  t.toReceiveEur = Math.max(0, t.netEur - t.paidEur);
  t.toReceiveBrl = Math.max(0, t.netBrl - t.paidBrl);
  t.resultEur = t.grossEur - t.expensesEur;
  t.resultBrl = t.grossBrl - t.expensesBrl;
  return t;
}
