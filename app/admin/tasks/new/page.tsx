'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import Link from 'next/link';

const AGENCIES = [
  { value: 'gpl', label: 'GPL' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gwi', label: 'GWI' },
  { value: 'gcaa', label: 'GCAA' },
  { value: 'marad', label: 'MARAD' },
  { value: 'heci', label: 'HECI' },
  { value: 'ppdi', label: 'PPDI' },
  { value: 'has', label: 'HAS' },
];

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

interface User {
  id: string;
  full_name: string;
  agency: string;
  role: string;
}

export default function CreateTaskPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
    agency: '',
    assignee_id: '',
    priority: 'medium',
    due_date: '',
    tags: '',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        if (d.success) setUsers(d.data.filter((u: any) => u.is_active));
      })
      .catch(() => {});
  }, []);

  const filteredUsers = form.agency
    ? users.filter(u => u.agency === form.agency)
    : users;

  const handleSubmit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    if (!form.title || !form.assignee_id) {
      setError('Title and assignee are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');

      if (addAnother) {
        setForm(f => ({ ...f, title: '', description: '', tags: '' }));
      } else {
        router.push(`/admin/tasks/${data.data.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/tasks" className="p-2 rounded-lg hover:bg-[#2d3a52]/50 text-[#64748b] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Create Task</h1>
      </div>

      <form onSubmit={handleSubmit} className="card-premium p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-[#64748b] mb-1.5">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            placeholder="What needs to be done?"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#64748b] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4}
            className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
            placeholder="Provide details, context, deliverables..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Agency *</label>
            <select
              value={form.agency}
              onChange={e => setForm(f => ({ ...f, agency: e.target.value, assignee_id: '' }))}
              className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">Select...</option>
              {AGENCIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Assignee *</label>
            <select
              value={form.assignee_id}
              onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">Select...</option>
              {filteredUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.agency.toUpperCase()})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#64748b] mb-1.5">Tags (comma-separated)</label>
          <input
            type="text"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            placeholder="infrastructure, urgent, Q1-target"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={(e) => handleSubmit(e as any, true)}
            disabled={loading}
            className="px-4 py-2.5 text-sm text-[#d4af37] border border-[#d4af37]/30 rounded-lg hover:bg-[#d4af37]/10 transition-colors"
          >
            Create & Add Another
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-gold flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Task
          </button>
        </div>
      </form>
    </div>
  );
}
