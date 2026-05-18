import { fmtBudgetAmount } from '@/lib/format';
import type { AgencyAggregate, ContractorAggregate, ValueBracket } from '@/lib/nptab/aggregate';

interface Props {
  byAgency: AgencyAggregate[];
  byValueBracket: ValueBracket[];
  byContractor: ContractorAggregate[];
}

export function AggregateBlocks({ byAgency, byValueBracket, byContractor }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Block heading="Breaches by Agency">
        {byAgency.length === 0 ? (
          <p className="text-sm text-navy-500">None.</p>
        ) : (
          <ul className="space-y-1.5">
            {byAgency.map((a) => (
              <li key={a.agency} className="flex justify-between text-sm">
                <span className="text-white">{a.agency}</span>
                <span className="text-navy-300 tabular-nums">
                  {a.count} · {a.total_value > 0 ? fmtBudgetAmount(a.total_value) : '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block heading="Breaches by Value Bracket">
        <ul className="space-y-1.5">
          {byValueBracket.map((b) => (
            <li key={b.label} className="flex justify-between text-sm">
              <span className="text-white">{b.label}</span>
              <span className="text-navy-300 tabular-nums">
                {b.count} · {b.total_value > 0 ? fmtBudgetAmount(b.total_value) : '-'}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block heading="Contractors (2+ tenders)">
        {byContractor.length === 0 ? (
          <p className="text-sm text-navy-500">None.</p>
        ) : (
          <ul className="space-y-1.5">
            {byContractor.map((c) => (
              <li key={c.contractor} className="flex justify-between text-sm">
                <span className="text-white">{c.contractor}</span>
                <span className="text-navy-300 tabular-nums">
                  {c.count} · {c.total_value > 0 ? fmtBudgetAmount(c.total_value) : '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="card-premium p-4 space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">{heading}</h3>
      {children}
    </div>
  );
}

