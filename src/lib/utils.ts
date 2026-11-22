import type { Timestamp } from 'firebase/firestore';
import type { ExpiryStatus, VerificationStatus } from '../types';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

export function formatTimestamp(ts?: Timestamp | string | null): string {
  if (!ts) return 'Just now';
  try {
    const date = typeof ts === 'string' ? new Date(ts) : ts.toDate();
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

export function daysUntilExpiry(expiryStr: string): number | null {
  if (!expiryStr) return null;
  const trimmed = expiryStr.trim();
  let parsed: Date | null = null;
  const full = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (full) {
    parsed = new Date(Date.UTC(Number(full[1]), Number(full[2]) - 1, Number(full[3])));
  } else {
    const ym = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
    if (ym) {
      parsed = new Date(Date.UTC(Number(ym[1]), Number(ym[2]), 0));
    } else {
      const my = trimmed.match(/^(\d{1,2})[-/](\d{2,4})$/);
      if (my) {
        let y = Number(my[2]);
        if (y < 100) y += 2000;
        parsed = new Date(Date.UTC(y, Number(my[1]), 0));
      }
    }
  }
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeExpiryStatus(expiryStr: string, nearDays = 90): ExpiryStatus {
  const days = daysUntilExpiry(expiryStr);
  if (days === null) return 'ambiguous';
  if (days < 0) return 'expired';
  if (days <= nearDays) return 'near_expiry';
  return 'valid';
}

export async function fileToBase64AndHash(file: File): Promise<{
  base64: string;
  dataUrl: string;
  sha256: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return { base64, dataUrl, sha256 };
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(','))].join('\n');
}

export const VERIFICATION_STATUS_META: Record<
  VerificationStatus,
  {
    label: string;
    shortLabel: string;
    textColor: string;
    surfaceBg: string;
    borderColor: string;
    description: string;
  }
> = {
  verified_match: {
    label: 'Verified Source Match',
    shortLabel: 'Verified Match',
    textColor: 'text-emerald-800',
    surfaceBg: 'bg-emerald-50/70',
    borderColor: 'border-emerald-200',
    description: 'Matched against an authoritative connected source for this identifier.',
  },
  mismatch_suspicious: {
    label: 'Mismatch / Suspicious',
    shortLabel: 'Mismatch / Flagged',
    textColor: 'text-rose-800',
    surfaceBg: 'bg-rose-50/70',
    borderColor: 'border-rose-200',
    description: 'Conflicting batch, expiry, manufacturer, or recall match detected. Requires escalation.',
  },
  needs_review: {
    label: 'Needs Manual Review',
    shortLabel: 'Needs Review',
    textColor: 'text-amber-800',
    surfaceBg: 'bg-amber-50/70',
    borderColor: 'border-amber-200',
    description: 'Partial reference found or pack-level serialization requires human confirmation.',
  },
  not_found: {
    label: 'Not Found in Source',
    shortLabel: 'Not Found',
    textColor: 'text-slate-700',
    surfaceBg: 'bg-slate-100/80',
    borderColor: 'border-slate-300',
    description: 'No matching record returned by currently connected reference registries.',
  },
  provider_unavailable: {
    label: 'Provider Unavailable',
    shortLabel: 'Unavailable',
    textColor: 'text-indigo-800',
    surfaceBg: 'bg-indigo-50/70',
    borderColor: 'border-indigo-200',
    description: 'External verification connector did not respond. Retry later; no result was invented.',
  },
};

export const EXPIRY_STATUS_META: Record<
  ExpiryStatus,
  { label: string; textColor: string }
> = {
  valid: { label: 'Within Shelf Life', textColor: 'text-emerald-700' },
  near_expiry: { label: 'Near Expiry', textColor: 'text-amber-700' },
  expired: { label: 'Expired', textColor: 'text-rose-700' },
  ambiguous: { label: 'Date Needs Confirmation', textColor: 'text-slate-600' },
};
