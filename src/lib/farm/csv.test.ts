import { describe, expect, it } from "vitest";
import {
  exportFarmCsv,
  filterFarmRows,
  parseFarmCsv,
  rowsFromLeads,
  type FarmRow,
} from "./csv";
import type { LeadSurface } from "@/lib/core/types";

function lead(partial: Partial<LeadSurface> & Pick<LeadSurface, "address">): LeadSurface {
  return {
    id: partial.id ?? "00000000-0000-0000-0000-000000000001",
    agent_id: partial.agent_id ?? "00000000-0000-0000-0000-000000000002",
    lng: partial.lng ?? -77.26,
    lat: partial.lat ?? 39.23,
    address: partial.address,
    locality: partial.locality,
    h3_index: partial.h3_index ?? "h3",
    status: partial.status ?? "new",
    contact: partial.contact,
    first_seen_at: partial.first_seen_at ?? "2026-01-01T00:00:00.000Z",
    last_worked_at: partial.last_worked_at ?? "2026-01-02T00:00:00.000Z",
  };
}

describe("parseFarmCsv", () => {
  it("reads address rows and skips blanks", () => {
    const parsed = parseFarmCsv(
      "address,locality,lng,lat\n22125 Clarksburg Rd,Clarksburg,-77.26,39.23\n\n,nowhere,0,0\n",
    );
    expect(parsed.rows).toEqual([
      {
        address: "22125 Clarksburg Rd",
        locality: "Clarksburg",
        lng: -77.26,
        lat: 39.23,
      },
    ]);
    expect(parsed.skipped).toBe(1);
  });

  it("keeps quoted commas inside addresses", () => {
    const parsed = parseFarmCsv('"address"\n"12 Oak Street, Apt 4"\n');
    expect(parsed.rows[0]?.address).toBe("12 Oak Street, Apt 4");
  });

  it("marks rows without coordinates as needing geocode", () => {
    const parsed = parseFarmCsv("address\n21900 Stringtown Rd\n");
    expect(parsed.rows[0]).toEqual({
      address: "21900 Stringtown Rd",
      locality: undefined,
      lng: undefined,
      lat: undefined,
    });
    expect(parsed.needsGeocode).toBe(1);
  });
});

describe("exportFarmCsv", () => {
  it("round-trips contactable leads", () => {
    const rows: FarmRow[] = [
      {
        id: "lead-1",
        address: "12800 Piedmont Rd",
        locality: "Clarksburg",
        lng: -77.2,
        lat: 39.2,
        status: "contacted",
        contactName: "Maria K.",
        contactEmail: "maria@example.com",
        contactability: "contactable",
      },
    ];
    const csv = exportFarmCsv(rows);
    expect(csv).toContain("address,locality,lng,lat,status,contact_name,contact_email,contactability");
    expect(csv).toContain("Maria K.");
    const parsed = parseFarmCsv(csv);
    expect(parsed.rows[0]?.address).toBe("12800 Piedmont Rd");
    expect(parsed.rows[0]?.lng).toBe(-77.2);
  });
});

describe("filterFarmRows", () => {
  const rows: FarmRow[] = [
    {
      id: "a",
      address: "22125 Clarksburg Rd",
      locality: "Clarksburg",
      status: "researching",
      contactability: "missing",
    },
    {
      id: "b",
      address: "12800 Piedmont Rd",
      locality: "Clarksburg",
      status: "contacted",
      contactName: "Maria K.",
      contactability: "contactable",
    },
  ];

  it("filters by query across address and contact", () => {
    expect(filterFarmRows(rows, { q: "maria" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by status", () => {
    expect(filterFarmRows(rows, { status: "researching" }).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("rowsFromLeads", () => {
  it("maps lead contactability without inventing facts", () => {
    const rows = rowsFromLeads([
      lead({
        id: "1",
        address: "22125 Clarksburg Rd",
        locality: "Clarksburg",
        status: "new",
      }),
    ]);
    expect(rows[0]).toMatchObject({
      address: "22125 Clarksburg Rd",
      locality: "Clarksburg",
      status: "new",
      contactability: "missing",
      contactName: undefined,
    });
  });
});
