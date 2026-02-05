'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Calendar, DollarSign, Clock, MapPin, User, FileText, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { format, addMonths, differenceInDays, isPast } from 'date-fns';

const AGENCY_INFO: Record<string, string> = {
  'GPL': 'Guyana Power & Light',
  'GWI': 'Guyana Water Inc.',
  'HECI': 'Hinterland Electrification Company Inc.',
  'CJIA': 'Cheddi Jagan International Airport',
  'MARAD': 'Maritime Administration Department',
  'GCAA': 'Guyana Civil Aviation Authority',
  'MOPUA': 'Ministry of Public Works',
  'HAS': 'Harbour & Aviation Services',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'COMMENCED': { bg: 'bg-[#d4af37]/20', text: 'text-[#f4d03f]', label: 'In Progress' },
  'DELAYED': { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Delayed' },
  'COMPLETED': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Completed' },
  'CANCELLED': { bg: 'bg-[#64748b]/20', text: 'text-[#94a3b8]', label: 'Cancelled' },
  'ROLLOVER': { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Rollover' },
};

function formatCurrency(value: number | null): string {
  if (!value) return '-';
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr || dateStr === '1970-01-01') return 'Not set';
  try {
    return format(new Date(dateStr), 'MMMM d, yyyy');
  } catch {
    return 'Invalid date';
  }
}

function calculateEndDate(startDate: string | null, durationMonths: number | null): Date | null {
  if (!startDate || startDate === '1970-01-01' || !durationMonths) return null;
  try {
    return addMonths(new Date(startDate), durationMonths);
  } catch {
    return null;
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  async function fetchProject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-white">Project not found</h2>
        <Link href="/projects" className="text-[#d4af37] hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[project.project_status] || STATUS_STYLES['COMMENCED'];
  const agencyName = AGENCY_INFO[project.sub_agency] || project.sub_agency;

  const endDate = project.expected_end_date
    ? new Date(project.expected_end_date)
    : calculateEndDate(project.agreement_start_date, project.duration_months);

  const isOverdue = endDate && isPast(endDate) && project.completion_percent < 100;
  const daysRemaining = endDate ? differenceInDays(endDate, new Date()) : null;

  const spendPercent = project.allocated_balance && project.total_expenditure
    ? (project.total_expenditure / project.allocated_balance) * 100
    : null;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start space-x-4">
        <Link
          href={project.sub_agency ? `/projects/agency/${project.sub_agency}` : '/projects'}
          className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <Link href={`/projects/agency/${project.sub_agency}`}>
              <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-[#0a1628] hover:shadow-lg hover:shadow-[#d4af37]/20 transition-shadow">
                {project.sub_agency}
              </span>
            </Link>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
            {isOverdue && (
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Overdue
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white">{project.project_name}</h1>
          <p className="text-[#64748b] font-mono mt-1">{project.project_reference}</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-premium p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Completion</span>
          </div>
          <p className="stat-number-lg">{project.completion_percent || 0}%</p>
          <div className="mt-3 w-full bg-[#2d3a52] rounded-full h-3">
            <div
              className={`h-3 rounded-full ${project.project_status === 'DELAYED' ? 'bg-red-500' : 'progress-gold'}`}
              style={{ width: `${Math.min(project.completion_percent || 0, 100)}%` }}
            />
          </div>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Contract Value</span>
          </div>
          <p className="stat-number-lg">{formatCurrency(project.contract_value)}</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Duration</span>
          </div>
          <p className="stat-number">{project.duration_months || '-'}</p>
          <p className="text-[#64748b] text-sm">months</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${daysRemaining && daysRemaining < 0 ? 'bg-red-500/20' : 'bg-[#d4af37]/20'}`}>
              <Calendar className={`h-5 w-5 ${daysRemaining && daysRemaining < 0 ? 'text-red-400' : 'text-[#d4af37]'}`} />
            </div>
            <span className="text-[#64748b] text-sm">{daysRemaining && daysRemaining < 0 ? 'Overdue' : 'Remaining'}</span>
          </div>
          <p className={`stat-number ${daysRemaining && daysRemaining < 0 ? 'text-red-400' : ''}`}>
            {daysRemaining !== null ? Math.abs(daysRemaining) : '-'}
          </p>
          <p className="text-[#64748b] text-sm">days</p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Information */}
        <div className="card-premium p-6">
          <div className="flex items-center space-x-2 mb-6">
            <FileText className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Project Information</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[#64748b] text-sm">Project Name</p>
              <p className="text-white font-medium mt-1">{project.project_name}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Reference</p>
              <p className="text-white font-mono mt-1">{project.project_reference}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Agency</p>
              <p className="text-white font-medium mt-1">{agencyName}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Region</p>
              <p className="text-white font-medium mt-1">{project.region || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Status</p>
              <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium mt-1 ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            </div>
          </div>
        </div>

        {/* Contractor */}
        <div className="card-premium p-6">
          <div className="flex items-center space-x-2 mb-6">
            <User className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Contractor</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[#64748b] text-sm">Contractor Name</p>
              <p className="text-white text-xl font-semibold mt-1">{project.contractor || 'Not assigned'}</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="card-premium p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Calendar className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Timeline</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[#64748b] text-sm">Contract Awarded</p>
              <p className="text-white font-medium mt-1">{formatDate(project.contract_awarded_date)}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Start Date</p>
              <p className="text-white font-medium mt-1">{formatDate(project.agreement_start_date)}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Expected End Date</p>
              <p className={`font-medium mt-1 ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                {endDate ? format(endDate, 'MMMM d, yyyy') : 'Not set'}
                {isOverdue && ' (Overdue)'}
              </p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Duration</p>
              <p className="text-white font-medium mt-1">{project.duration_months ? `${project.duration_months} months` : 'Not specified'}</p>
            </div>
          </div>
        </div>

        {/* Financial */}
        <div className="card-premium p-6">
          <div className="flex items-center space-x-2 mb-6">
            <DollarSign className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Financial</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[#64748b] text-sm">Contract Value</p>
              <p className="text-[#d4af37] text-xl font-bold mt-1">{formatCurrency(project.contract_value)}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Allocated Balance</p>
              <p className="text-white font-medium mt-1">{formatCurrency(project.allocated_balance)}</p>
            </div>
            <div>
              <p className="text-[#64748b] text-sm">Total Expenditure</p>
              <p className="text-white font-medium mt-1">{formatCurrency(project.total_expenditure)}</p>
            </div>
            {spendPercent !== null && (
              <div>
                <p className="text-[#64748b] text-sm">Spend vs Allocation</p>
                <div className="flex items-center space-x-3 mt-2">
                  <div className="flex-1 bg-[#2d3a52] rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${spendPercent > project.completion_percent ? 'bg-orange-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(spendPercent, 100)}%` }}
                    />
                  </div>
                  <span className="text-white font-medium text-sm">{spendPercent.toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div className="card-premium p-6">
        <div className="flex items-center space-x-2 mb-4">
          <FileText className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Remarks</h2>
        </div>
        <p className="text-[#94a3b8] whitespace-pre-wrap">
          {project.remarks || 'No remarks available for this project.'}
        </p>
      </div>

      {/* Metadata */}
      <div className="text-sm text-[#64748b] text-center">
        Last updated: {formatDate(project.last_updated)}
      </div>
    </div>
  );
}
