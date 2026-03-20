import { auth } from '@/lib/auth';
import { MINISTRY_ROLES } from '@/lib/people-types';
import PendingApplicationsClient from './PendingApplicationsClient';

export default async function PendingApplicationsPage() {
  const session = await auth(); // TODO: migrate to requireRole()

  const userRole = session?.user?.role || 'officer';
  const userAgency = session?.user?.agency || null;

  const isDG = MINISTRY_ROLES.includes(userRole);

  return <PendingApplicationsClient isDG={isDG} userAgency={userAgency} />;
}
