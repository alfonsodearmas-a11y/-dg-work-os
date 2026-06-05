import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth-helpers';
import { fmtGuyanaDate } from '@/lib/format';
import { listOpenFlaggedTasks } from '@/lib/minister-attention/queries';
import { Forbidden } from '@/components/layout/Forbidden';
import { NewMinisterReferralButton } from './_components/NewMinisterReferralButton';

export const dynamic = 'force-dynamic';

export default async function MinisterAttentionPage() {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) {
    if (result.status === 403) {
      return <Forbidden detail="This view is reserved for the Minister and DG." />;
    }
    redirect('/login');
  }
  const { session } = result;
  const isDG = session.user.role === 'superadmin';
  const tasks = await listOpenFlaggedTasks();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Minister Attention</h1>
          <p className="text-sm text-navy-500">
            {tasks.length} {tasks.length === 1 ? 'task is' : 'tasks are'} flagged for the Minister.
          </p>
        </div>
        {isDG && <NewMinisterReferralButton />}
      </header>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Agency</th>
              <th className="px-4 py-3">Referred By</th>
              <th className="px-4 py-3">Referred</th>
              <th className="px-4 py-3">Minister Seen</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-1 text-navy-500">
                    <p className="text-base text-white">No tasks need attention</p>
                    <p className="text-sm">
                      When the DG refers a tender, project, or task to the Minister, it appears here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="border-b border-navy-800/60 hover:bg-navy-900/40">
                  <td className="px-4 py-3 text-white max-w-[36rem]">
                    <Link href={`/tasks?taskId=${t.id}`} className="hover:text-gold-400">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-300">{t.agency ?? '—'}</td>
                  <td className="px-4 py-3 text-navy-300">{t.referrer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-navy-300">{fmtGuyanaDate(t.referred_to_minister_at)}</td>
                  <td className="px-4 py-3 text-navy-300">
                    {t.minister_seen_at ? fmtGuyanaDate(t.minister_seen_at) : (
                      <span className="text-amber-400/80">Unseen</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
