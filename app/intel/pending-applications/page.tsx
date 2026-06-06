import { auth } from '@/lib/auth';
import PendingApplicationsClient from './PendingApplicationsClient';

export default async function PendingApplicationsPage() {
  const session = await auth(); // TODO: migrate to requireRole()

  const userRole = session?.user?.role || 'agency_manager';
  const userAgency = session?.user?.agency || null;

  const isDG = (userRole) === 'superadmin';

  return <PendingApplicationsClient isDG={isDG} userAgency={userAgency} />;
}
