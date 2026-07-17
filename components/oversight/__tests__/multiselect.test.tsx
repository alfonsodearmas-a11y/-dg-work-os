// @vitest-environment jsdom
//
// MultiSelect primitive — layering contract. The dropdown menu must render as
// ONE opaque floating layer that escapes ancestor stacking/overflow traps (a
// .card-premium backdrop-filter context, a SlidePanel scroll container): it is
// portaled to <body>, fixed-positioned (never in normal flow, never pushing
// sibling cards), opaque, and z-elevated above the panel. Selecting closes it
// only for single-select adapters (closeOnSelect); filters stay open across
// multiple picks. Outside-click and Escape always close it, and Escape must not
// bubble to an enclosing SlidePanel's window handler.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MultiSelect } from '@/components/oversight/shared';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

afterEach(() => cleanup());

function openMenu() {
  const trigger = screen.getByRole('button');
  fireEvent.click(trigger);
  return trigger;
}

function getMenu(): HTMLElement {
  // The menu is the portaled listbox container holding the option checkboxes.
  return screen.getByRole('checkbox', { name: 'Alpha' }).closest('div[style]') as HTMLElement;
}

describe('MultiSelect — floating layer contract', () => {
  it('portals the open menu out of its in-flow wrapper, to <body>', () => {
    render(
      <div data-testid="host" className="card-premium">
        <MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />
      </div>,
    );
    openMenu();
    const host = screen.getByTestId('host');
    const menu = getMenu();
    // Escaped the trapping ancestor entirely (not a descendant of the card).
    expect(host.contains(menu)).toBe(false);
    // Lives under document.body (portal target).
    expect(document.body.contains(menu)).toBe(true);
  });

  it('renders as an opaque, fixed, z-elevated surface (not in normal flow)', () => {
    render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />);
    openMenu();
    const menu = getMenu();
    expect(menu.style.position).toBe('fixed'); // out of normal flow — never pushes layout
    expect(menu.className).toContain('bg-navy-900'); // opaque design-system surface
    expect(menu.className).toContain('border');
    expect(menu.className).toContain('z-[60]'); // above SlidePanel's z-50
  });

  it('stays open across multiple picks by default (multi-select filters)', () => {
    const onChange = vi.fn();
    render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    // Still open — Beta reachable for a second pick.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('checkbox', { name: 'Gamma' })).toBeInTheDocument();
  });

  it('closeOnSelect closes the menu after a single pick (single-select adapter)', () => {
    const onChange = vi.fn();
    render(<MultiSelect label="Assign" options={OPTIONS} selected={[]} onChange={onChange} closeOnSelect />);
    openMenu();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['a']);
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('outside-click (mousedown) closes the menu', () => {
    render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />);
    openMenu();
    expect(getMenu()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('mousedown inside the portaled menu does NOT close it (so option clicks land)', () => {
    render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />);
    openMenu();
    fireEvent.mouseDown(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('Escape closes the menu and is stopped before an enclosing window handler', () => {
    const panelEscape = vi.fn();
    window.addEventListener('keydown', panelEscape);
    try {
      render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />);
      openMenu();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
      // The panel's window-level Escape must not fire while the menu consumes it.
      expect(panelEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', panelEscape);
    }
  });

  it('preserves trigger combobox aria (haspopup + expanded toggles)', () => {
    render(<MultiSelect label="Filter" options={OPTIONS} selected={[]} onChange={() => {}} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
