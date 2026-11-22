import {
  AlertTriangle,
  CheckCircle2,
  SearchX,
  ShieldAlert,
  WifiOff,
  Clock,
  CalendarCheck,
  CalendarX,
  HelpCircle,
} from 'lucide-react';
import { EXPIRY_STATUS_META, VERIFICATION_STATUS_META } from '../lib/utils';
import type { ExpiryStatus, VerificationStatus } from '../types';

export function VerificationStatusLabel({
  status,
  compact = false,
}: {
  status: VerificationStatus;
  compact?: boolean;
}) {
  const meta = VERIFICATION_STATUS_META[status];
  const Icon =
    status === 'verified_match'
      ? CheckCircle2
      : status === 'mismatch_suspicious'
        ? ShieldAlert
        : status === 'needs_review'
          ? AlertTriangle
          : status === 'provider_unavailable'
            ? WifiOff
            : SearchX;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.textColor} whitespace-nowrap`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}

export function ExpiryStatusLabel({ status }: { status: ExpiryStatus }) {
  const meta = EXPIRY_STATUS_META[status];
  const Icon =
    status === 'valid'
      ? CalendarCheck
      : status === 'near_expiry'
        ? Clock
        : status === 'expired'
          ? CalendarX
          : HelpCircle;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.textColor} whitespace-nowrap`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
