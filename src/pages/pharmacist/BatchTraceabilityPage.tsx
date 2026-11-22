import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { addTraceabilityEvent, logAuditEvent } from '../../lib/firestoreService';
import { formatTimestamp } from '../../lib/utils';
import type { TraceEventType } from '../../types';

const EXPECTED_UPSTREAM: TraceEventType[] = ['MANUFACTURED', 'DISPATCHED', 'RECEIVED'];

export function BatchTraceabilityPage() {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [eventType, setEventType] = useState<TraceEventType>('DISPATCHED');
  const [actorOrg, setActorOrg] = useState('');
  const [sourceLocation, setSourceLocation] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveBatchId = selectedBatchId || data.batches[0]?.id || '';
  const selectedBatch = data.batches.find((b) => b.id === effectiveBatchId);

  const batchEvents = useMemo(
    () =>
      data.traceEvents
        .filter((ev) => ev.batchId === effectiveBatchId)
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [data.traceEvents, effectiveBatchId]
  );

  // Detect missing upstream custody hand-offs strictly per PDF Feature 5
  const missingHandoffs = useMemo(() => {
    if (!selectedBatch) return [];
    const present = new Set(batchEvents.map((e) => e.eventType));
    return EXPECTED_UPSTREAM.filter((stage) => !present.has(stage));
  }, [selectedBatch, batchEvents]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedBatch) return;
    setSaving(true);
    try {
      const id = await addTraceabilityEvent({
        ownerId: user.uid,
        batchId: selectedBatch.id,
        batchNumber: selectedBatch.batchNumber,
        medicineName: selectedBatch.medicineName,
        eventType,
        actorOrg: actorOrg.trim() || profile?.pharmacyName || 'Authorized Participant',
        sourceLocation: sourceLocation.trim(),
        destinationLocation: destinationLocation.trim(),
        quantity: Math.max(0, Math.round(Number(quantity) || 0)),
        evidenceRef: evidenceRef.trim(),
        notes: notes.trim(),
        eventDate,
      });
      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'CUSTODY_EVENT_RECORDED',
        targetType: 'traceability_event',
        targetId: id,
        details: `Recorded ${eventType} hand-off for Batch ${selectedBatch.batchNumber} (${actorOrg}).`,
      });
      setActorOrg('');
      setSourceLocation('');
      setDestinationLocation('');
      setEvidenceRef('');
      setNotes('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
          {t('Supply Chain & Batch Traceability', 'सप्लाई चेन और बैच ट्रेसेबिलिटी')}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {t(
            'Inspect known chain-of-custody events, attach delivery note or invoice references, and explicitly surface missing hand-offs rather than presenting an incomplete chain as verified.',
            'ज्ञात कस्टडी चरणों की जाँच करें, डिलीवरी या इनवॉइस संदर्भ जोड़ें और अधूरी सप्लाई चेन की स्पष्ट पहचान करें।'
          )}
        </p>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.pharmacistLab}
        imageAlt="Pharmacist inspecting sealed pharmaceutical batch traceability bottle"
        {...CLINICAL_QUOTES.features.traceability}
        compact
      />

      {data.batches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <GitBranch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#0B1B2B]">No inventory batches available yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Receive a stock batch in Inventory Management first to build and audit its chain of
            custody.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Batch Selector Sidebar */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-sm font-semibold text-[#0B1B2B]">
                Select Registered Batch ({data.batches.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {data.batches.map((b) => {
                const count = data.traceEvents.filter((e) => e.batchId === b.id).length;
                const active = b.id === effectiveBatchId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      active ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                      {b.medicineName}
                    </p>
                    <p className="font-mono text-xs text-slate-500 mt-0.5 tabular-nums">
                      Batch {b.batchNumber} · {count} event(s)
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custody Timeline & Add Event */}
          <div className="lg:col-span-8 space-y-6">
            {selectedBatch && (
              <>
                {/* Completeness Audit Banner */}
                <div
                  className={`rounded-xl border p-5 ${
                    missingHandoffs.length > 0
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {missingHandoffs.length > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs leading-relaxed">
                      <p className="font-semibold text-[#0B1B2B] text-sm">
                        {missingHandoffs.length > 0
                          ? `Incomplete Chain of Custody · ${missingHandoffs.length} Missing Upstream Hand-Off(s)`
                          : 'Complete Documented Custody Chain (Manufactured → Dispatched → Received)'}
                      </p>
                      <p className="text-slate-700 mt-1">
                        {missingHandoffs.length > 0
                          ? `Missing documented stage(s): ${missingHandoffs.join(', ')}. An incomplete chain is never presented as fully verified.`
                          : `Batch ${selectedBatch.batchNumber} has documented manufacturer, dispatch, and pharmacy receipt hand-offs with supporting references.`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200">
                    <div>
                      <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                        Known Chain of Custody · Batch {selectedBatch.batchNumber}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedBatch.medicineName} · Manufacturer: {selectedBatch.manufacturer}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-500">Append-Only</span>
                  </div>

                  <div className="space-y-4">
                    {batchEvents.map((ev, index) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0"
                      >
                        <span className="font-mono text-xs font-semibold text-[#0D7377] tabular-nums mt-0.5">
                          {String(index + 1).padStart(2, '0')}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#0B1B2B]">
                              {ev.eventType} · {ev.actorOrg}
                            </p>
                            <span className="font-mono text-xs text-slate-500 tabular-nums">
                              {ev.eventDate} · Qty {ev.quantity}
                            </span>
                          </div>
                          {(ev.sourceLocation || ev.destinationLocation) && (
                            <p className="text-xs text-slate-600 mt-1">
                              Route: {ev.sourceLocation || 'Origin'} →{' '}
                              {ev.destinationLocation || 'Destination'}
                            </p>
                          )}
                          {ev.evidenceRef && (
                            <p className="font-mono text-xs text-slate-500 mt-1">
                              Evidence Ref: {ev.evidenceRef}
                            </p>
                          )}
                          {ev.notes && <p className="text-xs text-slate-500 mt-1">{ev.notes}</p>}
                          <p className="text-[11px] text-slate-400 mt-1">
                            Logged {formatTimestamp(ev.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Custody Hand-Off Form */}
                <form
                  onSubmit={handleAddEvent}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                    <Plus className="w-4 h-4 text-[#0D7377]" />
                    <h4 className="font-display text-sm font-semibold text-[#0B1B2B]">
                      Record Supply Chain Hand-Off Event
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Custody Stage *
                      </label>
                      <select
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value as TraceEventType)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      >
                        <option value="MANUFACTURED">Manufactured</option>
                        <option value="DISPATCHED">Dispatched by Distributor</option>
                        <option value="RECEIVED">Received at Pharmacy</option>
                        <option value="TRANSFERRED">Transferred to Branch</option>
                        <option value="DISPENSED">Dispensed</option>
                        <option value="QUARANTINED">Quarantined</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Authorized Organization *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={160}
                        value={actorOrg}
                        onChange={(e) => setActorOrg(e.target.value)}
                        placeholder="Manufacturer / Distributor / Pharmacy"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Event Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Source Location
                      </label>
                      <input
                        type="text"
                        maxLength={160}
                        value={sourceLocation}
                        onChange={(e) => setSourceLocation(e.target.value)}
                        placeholder="Plant / Warehouse"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Destination Location
                      </label>
                      <input
                        type="text"
                        maxLength={160}
                        value={destinationLocation}
                        onChange={(e) => setDestinationLocation(e.target.value)}
                        placeholder="Regional Depot / Pharmacy"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quantity & Delivery Note Ref
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={0}
                          required
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                        />
                        <input
                          type="text"
                          maxLength={140}
                          value={evidenceRef}
                          onChange={(e) => setEvidenceRef(e.target.value)}
                          placeholder="DN / Inv #"
                          className="w-full px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supporting Evidence Notes
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Cold-chain seal verified, invoice matched against distributor dispatch manifest..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
                    >
                      {saving ? 'Appending Event...' : 'Append Custody Event'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
