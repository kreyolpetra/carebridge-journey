import { useQuery } from "@tanstack/react-query";
import { Building2, Hospital } from "lucide-react";
import { facilitiesQuery, islandsQuery } from "@/lib/api";
import { encountersQuery, ENCOUNTER_KIND_LABEL } from "@/lib/org";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { shortDate } from "@/lib/format";

/**
 * Every hospital and clinic on the Grid that has seen this patient.
 * Because they all run on the Grid, each of them reads the same single record.
 */
export function CareNetwork({ patientId, patientFirstName }: { patientId: string; patientFirstName?: string | undefined }) {
  const encounters = useQuery(encountersQuery(patientId));
  const facilities = useQuery(facilitiesQuery);
  const islands = useQuery(islandsQuery);

  const rows = encounters.data ?? [];
  const facilityById = new Map((facilities.data ?? []).map((f) => [f.id, f]));
  const islandName = (code?: string) => (islands.data ?? []).find((i) => i.code === code)?.name ?? code ?? "";

  const grouped = new Map<string, { count: number; last: string; kinds: Set<string> }>();
  for (const e of rows) {
    const g = grouped.get(e.facility_id) ?? { count: 0, last: e.started_at, kinds: new Set<string>() };
    g.count += 1;
    if (new Date(e.started_at) > new Date(g.last)) g.last = e.started_at;
    g.kinds.add(e.kind);
    grouped.set(e.facility_id, g);
  }
  const entries = [...grouped.entries()].sort(
    (a, b) => new Date(b[1].last).getTime() - new Date(a[1].last).getTime(),
  );

  return (
    <Panel>
      <PanelHeader
        title="Care network"
        subtitle={
          entries.length > 1
            ? `${entries.length} hospitals and clinics have treated ${patientFirstName ?? "you"} — they all read this one record`
            : "Hospitals and clinics on the Grid that hold part of this record"
        }
        right={<Pill className="border-primary/30 bg-primary/10 text-primary">{rows.length} visits</Pill>}
      />
      <div className="divide-y divide-border">
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No facility visits recorded yet.</p>
        ) : (
          entries.map(([facilityId, g]) => {
            const f = facilityById.get(facilityId);
            const isHospital = f?.kind === "hospital";
            return (
              <div key={facilityId} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {isHospital ? <Hospital className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{f?.name ?? "Unknown facility"}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {islandName(f?.island_code)} · {g.count} visit{g.count === 1 ? "" : "s"} · last {shortDate(g.last)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[...g.kinds].map((k) => (
                      <Pill key={k} className="border-border bg-surface text-muted-foreground">
                        {ENCOUNTER_KIND_LABEL[k] ?? k}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
        Any facility on the Grid with an active visit sees the full record — readings, medications, notes and
        referrals from every other hospital or clinic. Every look-up is written to the consent ledger.
      </p>
    </Panel>
  );
}
