// @vitest-environment jsdom
//
// Shared-primitive guard: RegistryFilters is a MultiSelect caller OUTSIDE the
// Direct Outreach panel. The portal/layering fix must not regress it — its
// filter menus still render, float out of flow (portaled), and stay open across
// multiple picks (multi-select semantics; no closeOnSelect).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RegistryFilters, DEFAULT_FILTERS } from '@/components/delayed-projects/RegistryFilters';

afterEach(() => cleanup());

describe('RegistryFilters (MultiSelect caller guard)', () => {
  it('renders both filter triggers and the search box', () => {
    render(<RegistryFilters filters={DEFAULT_FILTERS} onChange={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /Agency/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Region/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
  });

  it('opens a portaled menu and stays open across multiple picks', () => {
    const onChange = vi.fn();
    render(<RegistryFilters filters={DEFAULT_FILTERS} onChange={onChange} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Agency/ }));

    const gpl = screen.getByRole('checkbox', { name: 'GPL' });
    const menu = gpl.closest('div[style]') as HTMLElement;
    // Portaled to <body>, fixed (out of normal flow) — never pushes the filter row.
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.style.position).toBe('fixed');

    fireEvent.click(gpl);
    // Filter is multi-select: menu stays open so a second agency is reachable.
    expect(within(menu).getByRole('checkbox', { name: 'GWI' })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'GWI' }));

    expect(onChange).toHaveBeenCalledWith({ sub_agencies: ['GPL'] });
    expect(onChange).toHaveBeenCalledWith({ sub_agencies: ['GWI'] });
  });
});
