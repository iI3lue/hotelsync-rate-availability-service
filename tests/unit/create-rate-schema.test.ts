import { createRateSchema } from "../../src/validators/rates.js";

const ROOM_TYPE = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const ok = { room_type_id: ROOM_TYPE, report_date: "2026-12-24", price: 350000.5 };

describe("createRateSchema", () => {
  it("acepta un payload válido", () => {
    expect(createRateSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    ["precio negativo", { ...ok, price: -10 }],
    ["precio cero", { ...ok, price: 0 }],
    ["precio como string", { ...ok, price: "100" }],
    ["precio sobre Decimal(10,2)", { ...ok, price: 100_000_000 }],
    ["más de 2 decimales", { ...ok, price: 10.999 }],
    ["fecha con formato inválido", { ...ok, report_date: "24/12/2026" }],
    ["fecha de calendario inexistente", { ...ok, report_date: "2026-02-31" }],
    ["room_type_id no UUID", { ...ok, room_type_id: "abc" }],
    ["falta price", { room_type_id: ROOM_TYPE, report_date: "2026-12-24" }],
  ])("rechaza %s", (_name, payload) => {
    expect(createRateSchema.safeParse(payload).success).toBe(false);
  });
});
