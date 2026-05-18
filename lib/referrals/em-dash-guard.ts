const EM_DASH = '—';

export function containsEmDash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes(EM_DASH);
}

export function rejectEmDash(value: string | null | undefined, fieldName: string): void {
  if (containsEmDash(value)) {
    throw new EmDashError(`${fieldName} may not contain em-dashes (U+2014). Use a comma or rephrase.`);
  }
}

export function stripEmDash(value: string): string {
  return value.replace(/\s*—\s*/g, ', ');
}

export class EmDashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmDashError';
  }
}
