// "Servidor" local: reproduz, dentro do próprio app, as mesmas rotas e regras
// que antes ficavam no backend (FastAPI/MongoDB). Assim os módulos de
// src/api continuam a usar os mesmos caminhos ("/trips", "/drivers/{id}"...),
// mas os dados são lidos/gravados no banco local do telefone (src/local/db.ts).

import { load, newId, nowIso, save } from "./db";

export class LocalApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Doc = Record<string, any>;

// ---------------------------------------------------------------------------
// Conversão de tipos (equivalente ao que o Pydantic fazia no servidor)
// ---------------------------------------------------------------------------
const INT = Symbol("int");
const FLOAT = Symbol("float");
const OPT_INT = Symbol("optional-int");
// string/boolean = valor padrão; INT/FLOAT/OPT_INT = número; [spec] = lista; {..} = objeto aninhado;
// "__list_str__" = lista de textos; "__list_dict__" = lista de objetos livres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FieldSpec = any;

function toInt(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toFloat(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function coerce(spec: FieldSpec, v: any): any {
  if (spec === INT) return v === undefined || v === null || v === "" ? 0 : toInt(v);
  if (spec === FLOAT) return v === undefined || v === null || v === "" ? 0 : toFloat(v);
  if (spec === OPT_INT) return v === undefined || v === null || v === "" ? null : toInt(v);
  if (spec === "__list_str__") return Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
  if (spec === "__list_dict__") return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
  if (typeof spec === "boolean") return v === undefined || v === null ? spec : Boolean(v);
  if (typeof spec === "string") return v === undefined || v === null ? spec : String(v);
  if (Array.isArray(spec)) {
    const item = spec[0];
    return Array.isArray(v) ? v.map((x) => coerce(item, x)) : [];
  }
  // objeto aninhado
  const src = v && typeof v === "object" ? v : {};
  return pick(spec as Record<string, FieldSpec>, src);
}

function pick(spec: Record<string, FieldSpec>, body: Doc): Doc {
  const out: Doc = {};
  for (const [k, s] of Object.entries(spec)) out[k] = coerce(s, body?.[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Esquemas (campos editáveis de cada tipo de registro + valores padrão)
// ---------------------------------------------------------------------------
const TOLL = { value: FLOAT, currency: "EUR" };

const TRIP = {
  date: "", end_date: "", km_start: INT, km_end: INT, start_time: "", end_time: "",
  loading_place: "", unloading_place: "", rest_place: "", rest_stops: "__list_str__", notes: "",
  freight_gross: FLOAT, freight_gross_currency: "EUR", freight_net: FLOAT, freight_net_currency: "EUR",
  freight_paid: FLOAT, freight_paid_currency: "EUR", freight_payment_date: "", freight_status: "Não informado",
  freight_diesel: FLOAT, freight_diesel_currency: "EUR", freight_arla: FLOAT, freight_arla_currency: "EUR",
  tolls: [TOLL], vehicle_id: "", vehicle_label: "", driver_id: "", driver_name: "", driver_license: "",
} satisfies Record<string, FieldSpec>;

const REFUELING = {
  date: "", station_name: "", station_place: "", diesel_liters: FLOAT, diesel_price: FLOAT,
  arla_liters: FLOAT, arla_price: FLOAT, currency: "EUR", payment_method: "Cartão", card_type: "",
  card_name: "", km: INT, arla_km: INT, notes: "",
} satisfies Record<string, FieldSpec>;

const TOLL_EXPENSE = { date: "", value: FLOAT, place: "" } satisfies Record<string, FieldSpec>;
const OTHER_EXPENSE = { date: "", place: "", service: "", value: FLOAT } satisfies Record<string, FieldSpec>;
const MAINTENANCE = {
  category: "Mecânica", date: "", place: "", description: "", price: FLOAT, km: INT, notes: "",
} satisfies Record<string, FieldSpec>;

const OIL_COMPONENT = {
  kind: "", label: "", enabled: false, oil_type: "", brand: "", liters: FLOAT, value: FLOAT, km: INT,
  date: "", control: "km", interval_km: INT, next_km: INT, interval_time: INT, time_unit: "months",
  next_date: "", alert_km: INT, alert_days: INT,
};
const FILTER_ITEM = { kind: "", label: "", brand: "", oil_type: "", quantity: "", value: FLOAT };
const OIL_CHANGE = {
  vehicle_id: "", vehicle_label: "", vehicle_plate: "", current_km: INT, date: "", km: INT, place: "",
  notes: "", traction: "", components: [OIL_COMPONENT], filters: [FILTER_ITEM], labor_value: FLOAT,
  other_costs: FLOAT, total: FLOAT,
} satisfies Record<string, FieldSpec>;

const SERVICE_ORDER = {
  date: "", km: INT, vehicle_plate: "", trailer_plate: "", descriptions: "__list_str__",
} satisfies Record<string, FieldSpec>;

const DAILY_LOG = {
  date: "", start_place: "", start_km: INT, start_time: "", end_place: "", end_km: INT, end_time: "",
  stops: [{ place: "", time: "" }], notes: "",
} satisfies Record<string, FieldSpec>;

const MONTHLY_KM = { start_date: "", start_km: INT, end_date: "", end_km: INT } satisfies Record<string, FieldSpec>;

const FREIGHT = {
  date: "", client: "", origin: "", destination: "", value: FLOAT, currency: "EUR", weight: FLOAT,
  reference: "", notes: "",
} satisfies Record<string, FieldSpec>;

const VEHICLE = {
  company: "", truck_brand: "", truck_plate: "", truck_model: "", trailers: "__list_str__",
  uses_dolly: false, dolly_plate: "", dolly_trailer_plate: "", photo_path: "",
} satisfies Record<string, FieldSpec>;

const DRIVER = {
  full_name: "", driver_number: "", company: "", cpf: "", license_number: "", age: OPT_INT,
  birth_date: "", blood_type: "", license_expiry: "", toxicology_expiry: "", photo_path: "",
} satisfies Record<string, FieldSpec>;

const TIRE_CREATE = {
  number: "", brand: "", size: "", install_date: "", install_km: INT, current_tread_mm: FLOAT,
  notes: "", vehicle_id: "", position_code: "",
} satisfies Record<string, FieldSpec>;
const TIRE_UPDATE = {
  number: "", brand: "", size: "", install_date: "", install_km: INT, current_tread_mm: FLOAT, notes: "",
} satisfies Record<string, FieldSpec>;

// ---------------------------------------------------------------------------
// Coleções simples (CRUD padrão)
// ---------------------------------------------------------------------------
type Sorter = (a: Doc, b: Doc) => number;
const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
const byDateDesc: Sorter = (a, b) => cmp(b.date ?? "", a.date ?? "") || cmp(b.created_at ?? "", a.created_at ?? "");
const byCreatedDesc: Sorter = (a, b) => cmp(b.created_at ?? "", a.created_at ?? "");

type Collection = {
  key: string;
  spec: Record<string, FieldSpec>;
  notFound: string;
  sort: Sorter;
  validate?: (d: Doc) => void;
  serialize?: (d: Doc) => Doc;
};

function validateKm(start: string, end: string) {
  return (d: Doc) => {
    if (d[end] && d[end] < d[start]) {
      throw new LocalApiError(400, "O KM final deve ser igual ou superior ao KM inicial.");
    }
  };
}

const COLLECTIONS: Record<string, Collection> = {
  trips: {
    key: "trips",
    spec: TRIP,
    notFound: "Viagem não encontrada",
    sort: byDateDesc,
    validate: (d) => {
      validateKm("km_start", "km_end")(d);
      if (d.end_date && d.end_date < d.date) {
        throw new LocalApiError(400, "A data final deve ser igual ou posterior à data inicial.");
      }
    },
    serialize: (d) => ({ ...d, km: Math.max(0, (d.km_end || 0) - (d.km_start || 0)) }),
  },
  refuelings: { key: "refuelings", spec: REFUELING, notFound: "Abastecimento não encontrado", sort: byDateDesc },
  "toll-expenses": { key: "toll_expenses", spec: TOLL_EXPENSE, notFound: "Pedágio não encontrado", sort: byDateDesc },
  "other-expenses": { key: "other_expenses", spec: OTHER_EXPENSE, notFound: "Despesa não encontrada", sort: byDateDesc },
  maintenances: { key: "maintenances", spec: MAINTENANCE, notFound: "Manutenção não encontrada", sort: byDateDesc },
  "oil-changes": { key: "oil_changes", spec: OIL_CHANGE, notFound: "Troca de óleo não encontrada", sort: byDateDesc },
  "service-orders": {
    key: "service_orders",
    spec: SERVICE_ORDER,
    notFound: "Ordem de serviço não encontrada",
    sort: (a, b) => (b.number || 0) - (a.number || 0),
  },
  "daily-logs": { key: "daily_logs", spec: DAILY_LOG, notFound: "Controle diário não encontrado", sort: byDateDesc },
  "monthly-km": {
    key: "monthly_km",
    spec: MONTHLY_KM,
    notFound: "Controle mensal não encontrado",
    sort: (a, b) => cmp(b.start_date ?? "", a.start_date ?? "") || cmp(b.created_at ?? "", a.created_at ?? ""),
    validate: validateKm("start_km", "end_km"),
  },
  freights: { key: "freights", spec: FREIGHT, notFound: "Frete não encontrado", sort: byDateDesc },
  vehicles: { key: "vehicles", spec: VEHICLE, notFound: "Veículo não encontrado", sort: byCreatedDesc },
  drivers: {
    key: "drivers",
    spec: DRIVER,
    notFound: "Motorista não encontrado",
    sort: (a, b) => (a.order || 0) - (b.order || 0) || cmp(a.created_at ?? "", b.created_at ?? ""),
  },
};

/** Chaves do banco local que guardam listas de registros (usadas no backup e na IA). */
export const DATA_KEYS = [
  ...Object.values(COLLECTIONS).map((c) => c.key),
  "tires",
  "tire_configs",
];

async function all(key: string): Promise<Doc[]> {
  return load<Doc[]>(key, []);
}

function out(c: Collection, d: Doc): Doc {
  return c.serialize ? c.serialize(d) : d;
}

async function listColl(c: Collection) {
  const items = await all(c.key);
  items.sort(c.sort);
  return items.map((d) => out(c, d));
}

async function createColl(c: Collection, body: Doc) {
  const data = pick(c.spec, body);
  c.validate?.(data);
  const items = await all(c.key);
  const doc: Doc = { id: newId(), ...data, created_at: nowIso() };

  if (c.key === "service_orders") {
    // Número sequencial que nunca é reutilizado, mesmo após apagar uma OS.
    const seq = await load<number>("seq_service_orders", 0);
    const maxNum = items.reduce((m, x) => Math.max(m, x.number || 0), 0);
    doc.number = Math.max(seq, maxNum) + 1;
    await save("seq_service_orders", doc.number);
  }
  if (c.key === "drivers") {
    if (items.length >= 2) throw new LocalApiError(400, "Limite de 2 motoristas atingido.");
    doc.order = items.length;
  }

  items.push(doc);
  await save(c.key, items);
  return out(c, doc);
}

async function updateColl(c: Collection, id: string, body: Doc) {
  const data = pick(c.spec, body);
  c.validate?.(data);
  const items = await all(c.key);
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) throw new LocalApiError(404, c.notFound);
  items[idx] = { ...items[idx], ...data };
  await save(c.key, items);
  return out(c, items[idx]);
}

async function deleteColl(c: Collection, id: string) {
  const items = await all(c.key);
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) throw new LocalApiError(404, c.notFound);
  await save(c.key, next);
  return { success: true };
}

async function setPrimaryDriver(id: string) {
  const items = await all("drivers");
  const target = items.find((d) => d.id === id);
  if (!target) throw new LocalApiError(404, "Motorista não encontrado");
  target.order = 0;
  items
    .filter((d) => d.id !== id)
    .sort((a, b) => cmp(a.created_at ?? "", b.created_at ?? ""))
    .forEach((d, i) => {
      d.order = i + 1;
    });
  await save("drivers", items);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Pneus
// ---------------------------------------------------------------------------
async function tiresList(vehicleId?: string) {
  let items = await all("tires");
  if (vehicleId) items = items.filter((t) => t.vehicle_id === vehicleId);
  items.sort(byCreatedDesc);
  return items;
}

async function tireFind(items: Doc[], id: string) {
  const t = items.find((x) => x.id === id);
  if (!t) throw new LocalApiError(404, "Pneu não encontrado");
  return t;
}

async function tireCreate(body: Doc) {
  const p = pick(TIRE_CREATE, body);
  const items = await all("tires");
  if (p.number && items.some((t) => t.number === p.number)) {
    throw new LocalApiError(400, "Já existe um pneu com esse número.");
  }
  if (
    p.vehicle_id &&
    p.position_code &&
    items.some((t) => t.status === "installed" && t.vehicle_id === p.vehicle_id && t.position_code === p.position_code)
  ) {
    throw new LocalApiError(400, "Já existe um pneu nessa posição.");
  }
  const t: Doc = {
    id: newId(),
    ...p,
    status: p.position_code ? "installed" : "removed",
    removed_km: 0,
    measurements: [] as Doc[],
    movements: [] as Doc[],
    created_at: nowIso(),
  };
  if (p.current_tread_mm && p.install_date) {
    t.measurements = [{ id: newId(), date: p.install_date, tread_mm: p.current_tread_mm, notes: "", created_at: nowIso() }];
  }
  items.push(t);
  await save("tires", items);
  return t;
}

async function tireUpdate(id: string, body: Doc) {
  const p = pick(TIRE_UPDATE, body);
  const items = await all("tires");
  const t = await tireFind(items, id);
  if (p.number && p.number !== t.number && items.some((x) => x.id !== id && x.number === p.number)) {
    throw new LocalApiError(400, "Já existe um pneu com esse número.");
  }
  Object.assign(t, p);
  await save("tires", items);
  return t;
}

async function tireDelete(id: string) {
  const items = await all("tires");
  await tireFind(items, id);
  await save("tires", items.filter((x) => x.id !== id));
  return { success: true };
}

async function tireAddMeasurement(id: string, body: Doc) {
  const items = await all("tires");
  const t = await tireFind(items, id);
  const m: Doc = { id: newId(), ...pick({ date: "", tread_mm: FLOAT, notes: "" }, body), created_at: nowIso() };
  t.measurements = [...(t.measurements || []), m];
  t.current_tread_mm = m.tread_mm;
  await save("tires", items);
  return t;
}

async function tireDeleteMeasurement(id: string, mid: string) {
  const items = await all("tires");
  const t = await tireFind(items, id);
  const ms: Doc[] = (t.measurements || []).filter((m: Doc) => m.id !== mid);
  const sorted = [...ms].sort((a, b) => cmp(a.date ?? "", b.date ?? "") || cmp(a.created_at ?? "", b.created_at ?? ""));
  t.measurements = ms;
  t.current_tread_mm = sorted.length ? sorted[sorted.length - 1].tread_mm : t.current_tread_mm || 0;
  await save("tires", items);
  return t;
}

async function tireMove(id: string, body: Doc) {
  const p = pick({ to_position: "", vehicle_id: "", km: INT, date: "" }, body);
  const items = await all("tires");
  const t = await tireFind(items, id);
  const oldPos = t.position_code || "";
  const oldVehicle = t.vehicle_id || "";
  const targetVehicle = p.vehicle_id || oldVehicle;
  const toPos = p.to_position || "";
  const movement = (vehicle_id: string, from_position: string, to_position: string) => ({
    id: newId(), date: p.date, vehicle_id, from_position, to_position, km: p.km, created_at: nowIso(),
  });

  let mov: Doc;
  if (toPos === "") {
    mov = movement(oldVehicle, oldPos, "REMOVIDO");
    Object.assign(t, { status: "removed", position_code: "", removed_km: p.km });
  } else {
    const occ = items.find(
      (x) => x.id !== id && x.status === "installed" && x.vehicle_id === targetVehicle && x.position_code === toPos,
    );
    if (occ) {
      if (targetVehicle !== oldVehicle || !oldPos) {
        throw new LocalApiError(400, "A posição de destino já está ocupada.");
      }
      occ.position_code = oldPos;
      occ.movements = [...(occ.movements || []), movement(targetVehicle, toPos, oldPos)];
    }
    const transfer = targetVehicle !== oldVehicle;
    const wasRemoved = t.status === "removed";
    mov = movement(targetVehicle, oldPos, toPos);
    Object.assign(t, { status: "installed", position_code: toPos, vehicle_id: targetVehicle });
    if (transfer || wasRemoved) {
      t.install_km = p.km;
      if (p.date) t.install_date = p.date;
    }
  }
  t.movements = [...(t.movements || []), mov];
  await save("tires", items);
  return t;
}

async function tireConfigUpsert(vehicleId: string, body: Doc) {
  const items = await all("tire_configs");
  const units = Array.isArray(body?.units) ? body.units : [];
  const existing = items.find((c) => c.vehicle_id === vehicleId);
  if (existing) {
    existing.units = units;
    await save("tire_configs", items);
    return existing;
  }
  const cfg = { id: newId(), vehicle_id: vehicleId, units, created_at: nowIso() };
  items.push(cfg);
  await save("tire_configs", items);
  return cfg;
}

const TIRE_SETTINGS_DEFAULT = { green_min_mm: 5.0, yellow_min_mm: 3.0 };

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------
async function route(method: string, fullPath: string, body: Doc): Promise<unknown> {
  const [pathOnly, query = ""] = fullPath.split("?");
  const params = new URLSearchParams(query);
  const seg = pathOnly.replace(/^\/+|\/+$/g, "").split("/").map(decodeURIComponent);
  const [base, id, sub, subId] = seg;

  // Pneus e configurações de pneus
  if (base === "tires") {
    if (!id) {
      if (method === "GET") return tiresList(params.get("vehicle_id") || undefined);
      if (method === "POST") return tireCreate(body);
    } else if (!sub) {
      if (method === "GET") return tireFind(await all("tires"), id);
      if (method === "PUT") return tireUpdate(id, body);
      if (method === "DELETE") return tireDelete(id);
    } else if (sub === "measurements") {
      if (method === "POST" && !subId) return tireAddMeasurement(id, body);
      if (method === "DELETE" && subId) return tireDeleteMeasurement(id, subId);
    } else if (sub === "move" && method === "POST") {
      return tireMove(id, body);
    }
  }
  if (base === "tire-configs") {
    if (method === "GET" && !id) return all("tire_configs");
    if (method === "PUT" && id) return tireConfigUpsert(id, body);
  }
  if (base === "tire-settings") {
    if (method === "GET") return load("tire_settings", TIRE_SETTINGS_DEFAULT);
    if (method === "PUT") {
      const s = pick({ green_min_mm: FLOAT, yellow_min_mm: FLOAT }, { ...TIRE_SETTINGS_DEFAULT, ...body });
      await save("tire_settings", s);
      return s;
    }
  }

  if (base === "drivers" && sub === "primary" && method === "PUT") return setPrimaryDriver(id);

  const c = COLLECTIONS[base];
  if (c && !sub) {
    if (!id && method === "GET") return listColl(c);
    if (!id && method === "POST") return createColl(c, body);
    if (id && method === "PUT") return updateColl(c, id, body);
    if (id && method === "DELETE") return deleteColl(c, id);
  }

  throw new LocalApiError(404, "Função não disponível nesta versão do aplicativo.");
}

/**
 * Substitui o antigo `fetch` para o servidor. Recebe o mesmo caminho e as
 * mesmas opções (method/body JSON) e devolve a mesma resposta.
 */
export async function localRequest<T>(path: string, options?: { method?: string; body?: any }): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  let body: Doc = {};
  if (typeof options?.body === "string" && options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  } else if (options?.body && typeof options.body === "object") {
    body = options.body;
  }
  const result = await route(method, path, body);
  return JSON.parse(JSON.stringify(result ?? null)) as T;
}
