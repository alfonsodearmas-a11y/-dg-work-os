import { auth } from '@/lib/auth';
import PendingApplicationsClient from './PendingApplicationsClient';

export default async function PendingApplicationsPage() {
  const session = await auth();

  const userRole = session?.user?.role || 'officer';
  const userAgency = session?.user?.agency || null;

  const isDG = ['dg', 'minister', 'ps'].includes(userRole);

  return <PendingApplicationsClient isDG={isDG} userAgency={userAgency} />;
}
