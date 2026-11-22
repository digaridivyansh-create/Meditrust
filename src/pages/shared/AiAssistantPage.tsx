import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Download,
  Film,
  Languages,
  Paperclip,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { saveChatMessage } from '../../lib/firestoreService';
import {
  buildPharmacyWorkspaceSnapshot,
  executePharmacistAiAction,
  type ActionExecutionResult,
  type PharmacistAiAgentResponse,
  type PlannedPharmacyAction,
  type PurchaseOrderDraft,
  type RiskAuditReport,
} from '../../lib/pharmacistAiExecutor';
import { downloadTextFile, fileToBase64AndHash, formatTimestamp } from '../../lib/utils';
import { extractVideoKeyFrames, type SampledVideoFrame } from '../../lib/videoFrameExtractor';
import type { PortalRole, PreferredLanguage } from '../../types';

function SafeFormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          return (
            <p key={i} className="font-display font-semibold text-[#0B1B2B] pt-1">
              {trimmed.replace(/^#{2,3}\s+/, '')}
            </p>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <p key={i} className="pl-3">
              · {trimmed.slice(2).replace(/\*\*/g, '')}
            </p>
          );
        }
        return <p key={i}>{trimmed.replace(/\*\*/g, '')}</p>;
      })}
    </div>
  );
}

export function AiAssistantPage({ portalRole }: { portalRole: PortalRole }) {
  const { user, profile, data } = useAuth();
  const { lang: uiLang, t } = useLanguage();
  const [language, setLanguage] = useState<PreferredLanguage>(
    uiLang === 'hi' ? 'hi' : profile?.preferredLanguage || 'en'
  );
  const [selectedContextKey, setSelectedContextKey] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (uiLang === 'hi') {
      setLanguage('hi');
    } else if (language === 'hi') {
      setLanguage('en');
    }
  }, [uiLang]);

  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [videoAttachment, setVideoAttachment] = useState<{
    name: string;
    durationSec: number;
    frames: SampledVideoFrame[];
  } | null>(null);
  const [samplingVideo, setSamplingVideo] = useState(false);

  // Pharmacist real AI function calling state
  const [autoExecuteOps, setAutoExecuteOps] = useState(false);
  const [latestOpsResult, setLatestOpsResult] = useState<{
    proposedActions: PlannedPharmacyAction[];
    purchaseOrder?: PurchaseOrderDraft;
    riskAudit?: RiskAuditReport;
  } | null>(null);
  const [actionStates, setActionStates] = useState<
    Record<string, { status: 'idle' | 'running' | 'done' | 'error'; result?: ActionExecutionResult }>
  >({});

  const sessionId = `session_${portalRole}`;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(
    () =>
      [...data.chatMessages]
        .filter((m) => m.portalRole === portalRole && m.sessionId === sessionId)
        .reverse(),
    [data.chatMessages, portalRole, sessionId]
  );

  // Build list of authorized grounding records
  const groundingOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; contextText: string }> = [];
    data.scans.slice(0, 10).forEach((s) => {
      opts.push({
        key: `scan:${s.id}`,
        label: `Scan: ${s.medicineName} (Batch ${s.batchNumber || 'N/A'} · ${s.verificationStatus})`,
        contextText: [
          `RECORD TYPE: Medicine Scan (${s.id})`,
          `Medicine: ${s.medicineName} ${s.strength || ''} (${s.genericName || 'Generic unrecorded'})`,
          `Manufacturer: ${s.manufacturer || 'Unknown'}`,
          `Batch: ${s.batchNumber || 'Unknown'}, Expiry: ${s.expiryDate || 'Unknown'} (${s.expiryStatus})`,
          `Verification Status (Authoritative): ${s.verificationStatus}`,
          `Source: ${s.sourceName}`,
          `Evidence: ${s.sourceEvidence || 'None'}`,
          `Safety Notices: ${s.safetyNotices || 'None'}`,
          `Recommended Next Step: ${s.nextStep || 'None'}`,
        ].join('\n'),
      });
    });

    data.documents.slice(0, 8).forEach((d) => {
      opts.push({
        key: `doc:${d.id}`,
        label: `Document: ${d.documentTitle} (${d.documentType} · ${d.verificationStatus})`,
        contextText: [
          `RECORD TYPE: Verified Document (${d.id})`,
          `Title: ${d.documentTitle} (${d.documentType})`,
          `Issuer: ${d.issuerName || 'Unknown'}, Date: ${d.documentDate || 'Unknown'}`,
          `SHA-256: ${d.sha256Hash}`,
          `Status: ${d.verificationStatus}`,
          `Summary: ${d.extractedSummary || 'None'}`,
          `Anomalies: ${(d.anomalies || []).join('; ') || 'None'}`,
        ].join('\n'),
      });
    });

    if (portalRole === 'pharmacist') {
      data.batches.slice(0, 8).forEach((b) => {
        opts.push({
          key: `batch:${b.id}`,
          label: `Batch: ${b.medicineName} · ${b.batchNumber} (Qty ${b.quantityOnHand})`,
          contextText: [
            `RECORD TYPE: Pharmacy Inventory Batch (${b.id})`,
            `Medicine: ${b.medicineName} ${b.strength || ''}`,
            `Batch: ${b.batchNumber}, Expiry: ${b.expiryDate}`,
            `Manufacturer: ${b.manufacturer}, Supplier: ${b.supplierName}`,
            `Quantity On Hand: ${b.quantityOnHand}, Reorder Threshold: ${b.reorderThreshold}`,
            `Verification Status: ${b.verificationStatus}, Recall Flagged: ${b.recallFlagged}`,
          ].join('\n'),
        });
      });
    }
    return opts;
  }, [data.scans, data.documents, data.batches, portalRole]);

  const activeGrounding = groundingOptions.find((o) => o.key === selectedContextKey);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setErrorMsg(
        t(
          'Attach JPEG, PNG, WebP, or PDF files (max 10 MB). Use the Video button for MP4/WebM clips.',
          'JPEG, PNG, WebP या PDF फाइल संलग्न करें (अधिकतम 10 MB)। वीडियो के लिए वीडियो बटन का उपयोग करें।'
        )
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t('Attachment must be under 10 MB.', 'फाइल 10 MB से कम होनी चाहिए।'));
      return;
    }
    setErrorMsg('');
    setVideoAttachment(null);
    const { base64 } = await fileToBase64AndHash(file);
    setAttachment({ name: file.name, mimeType: file.type, base64 });
    e.target.value = '';
  };

  const handleAttachVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setAttachment(null);
    setSamplingVideo(true);
    try {
      const extracted = await extractVideoKeyFrames(file, 5);
      setVideoAttachment({
        name: file.name,
        durationSec: extracted.durationSec,
        frames: extracted.frames,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sample video frames.');
    } finally {
      setSamplingVideo(false);
      e.target.value = '';
    }
  };

  const runProposedAction = async (action: PlannedPharmacyAction) => {
    if (!user) return;
    setActionStates((prev) => ({ ...prev, [action.actionId]: { status: 'running' } }));
    const result = await executePharmacistAiAction(action, {
      ownerId: user.uid,
      actorName: profile?.displayName || user.email || 'Pharmacist',
      pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
      data,
    });
    setActionStates((prev) => ({
      ...prev,
      [action.actionId]: { status: result.ok ? 'done' : 'error', result },
    }));
  };

  const sendPrompt = async (promptText: string) => {
    if (!user || !promptText.trim() || sending) return;
    setErrorMsg('');
    setSending(true);
    const trimmed = promptText.trim();
    const currentAttachment = attachment;
    const currentVideo = videoAttachment;
    setInput('');
    setAttachment(null);
    setVideoAttachment(null);

    try {
      const attachLabel = currentVideo
        ? `${currentVideo.name} (${currentVideo.frames.length} frames, ${currentVideo.durationSec}s)`
        : currentAttachment?.name;

      await saveChatMessage({
        ownerId: user.uid,
        portalRole,
        sessionId,
        sender: 'user',
        language,
        content: trimmed,
        attachmentName: attachLabel,
        groundingRef: activeGrounding?.label,
      });

      const usePharmacistAgent =
        portalRole === 'pharmacist' && !currentAttachment && !currentVideo;

      let replyText = '';

      if (usePharmacistAgent) {
        const snapshot = buildPharmacyWorkspaceSnapshot(data, profile);
        const res = await fetch('/api/v1/pharmacist/ai-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            language,
            history: messages.slice(-6).map((m) => ({ sender: m.sender, content: m.content })),
            snapshot,
          }),
        });
        const json = (await res.json()) as PharmacistAiAgentResponse & { error?: string };
        if (!res.ok) throw new Error(json.error || 'Pharmacist AI agent request failed.');

        replyText = json.reply;
        const hasOps =
          (json.proposedActions && json.proposedActions.length > 0) ||
          Boolean(json.purchaseOrder) ||
          Boolean(json.riskAudit);

        if (hasOps) {
          setActionStates({});
          setLatestOpsResult({
            proposedActions: json.proposedActions || [],
            purchaseOrder: json.purchaseOrder,
            riskAudit: json.riskAudit,
          });
          if (autoExecuteOps && json.proposedActions && json.proposedActions.length > 0) {
            for (const act of json.proposedActions) {
              await runProposedAction(act);
            }
          }
        }
      } else {
        const res = await fetch('/api/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            language,
            portalRole,
            groundingContext: activeGrounding?.contextText || '',
            history: messages.slice(-6).map((m) => ({ sender: m.sender, content: m.content })),
            attachmentBase64: currentAttachment?.base64,
            attachmentMimeType: currentAttachment?.mimeType,
            attachmentName: attachLabel,
            videoFrames: currentVideo
              ? currentVideo.frames.map((f) => ({
                  timestamp: f.timestamp,
                  base64: f.base64,
                  mimeType: f.mimeType,
                }))
              : [],
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Assistant request failed.');
        replyText = json.reply;
      }

      await saveChatMessage({
        ownerId: user.uid,
        portalRole,
        sessionId,
        sender: 'assistant',
        language,
        content: replyText,
        groundingRef:
          activeGrounding?.label ||
          (usePharmacistAgent ? `Live Pharmacy Operations (${data.batches.length} batches)` : undefined),
      });

      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to get assistant reply.');
    } finally {
      setSending(false);
    }
  };

  const quickPrompts =
    portalRole === 'pharmacist'
      ? [
          'Check all low-stock and near-expiry batches and generate a supplier reorder purchase order.',
          'Run a full pharmacy risk audit for expiry, low stock, quarantine flags, and traceability gaps.',
          'Dispense 10 units of Dolo-650 from current stock for counter sale.',
          'Receive 100 strips of Crocin Advance batch CRC-2026-901 expiring 2028-06-30 from MedLine Distributors at Rs 22.',
        ]
      : [
          'What does "Needs Manual Review" mean on my medicine scan?',
          'इस दवा के बैच नंबर और एक्सपायरी डेट को कैसे जांचें?',
          'Yeh medicine label par likhe fields ka matlab kya hota hai?',
        ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {portalRole === 'pharmacist'
              ? t('Multilingual Pharmacy AI Copilot', 'बहुभाषी फार्मेसी एआई सहायक')
              : t('Multilingual Medicine Safety AI Assistant', 'बहुभाषी दवा सुरक्षा एआई सहायक')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Ask questions in English, Hindi, or Hinglish grounded in your saved scans, documents, or uploaded pack images and PDFs.',
              'अपने सेव किए गए स्कैन, दस्तावेज़ों या अपलोड फाइलों के आधार पर हिन्दी, अंग्रेज़ी या हिंग्लिश में सवाल पूछें।'
            )}
          </p>
        </div>

        {/* Language Segmented Selector */}
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-[#0D7377] shrink-0" />
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'हिन्दी (Hindi)' },
                { id: 'hinglish', label: 'Hinglish' },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setLanguage(lang.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  language === lang.id
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.heroVerification}
        imageAlt="Clinical pharmacist consulting verified medicine safety references"
        {...CLINICAL_QUOTES.features.assistant}
        compact
      />

      {/* Grounding Context Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          {portalRole === 'pharmacist' ? (
            <Bot className="w-4 h-4 text-[#0D7377] shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-[#0D7377] shrink-0" />
          )}
          <span>
            {portalRole === 'pharmacist' ? (
              <>
                <strong className="text-[#0B1B2B]">Live Function Calling Active:</strong> Connected to
                your {data.batches.length} live stock batch(es) &amp; {data.alerts.filter((a) => a.status !== 'resolved').length} open alert(s) to receive stock, dispense, quarantine, log hand-offs, and generate POs.
              </>
            ) : (
              <>
                <strong className="text-[#0B1B2B]">Safety Boundary:</strong> Explains evidence &amp; labels
                only—never prescribes, diagnoses, or overrides deterministic verification outcomes.
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {portalRole === 'pharmacist' && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={autoExecuteOps}
                onChange={(e) => setAutoExecuteOps(e.target.checked)}
                className="w-4 h-4 accent-[#0D7377] rounded"
              />
              <span>{t('Auto-Execute AI Actions', 'ऑटो-एग्ज़ीक्यूट')}</span>
            </label>
          )}

          <select
            value={selectedContextKey}
            onChange={(e) => setSelectedContextKey(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377] max-w-full md:max-w-sm"
          >
            <option value="">
              {portalRole === 'pharmacist'
                ? 'Live Pharmacy Workspace (All Batches & Alerts)'
                : 'General Safety Knowledge (No record pinned)'}
            </option>
            {groundingOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live Pharmacist Executable Action Panel */}
      {portalRole === 'pharmacist' && latestOpsResult && (
        <div className="bg-white border border-teal-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#0D7377]" />
              <h3 className="font-display text-sm font-bold text-[#0B1B2B]">
                {t('Executable AI Operations Panel', 'एआई कार्य निष्पादन पैनल')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setLatestOpsResult(null)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Close action panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {latestOpsResult.proposedActions.length > 0 && (
            <div className="space-y-2.5">
              {latestOpsResult.proposedActions.map((act) => {
                const st = actionStates[act.actionId];
                const isDone = st?.status === 'done';
                const isRunning = st?.status === 'running';
                const isErr = st?.status === 'error';
                return (
                  <div
                    key={act.actionId}
                    className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isDone
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : act.severity === 'critical'
                          ? 'bg-rose-50/60 border-rose-200'
                          : 'bg-[#F8FAFC] border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {act.toolName}
                        </span>
                        <span className="text-sm font-semibold text-[#0B1B2B]">{act.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{act.summary}</p>
                      {st?.result && (
                        <p
                          className={`text-xs font-medium mt-1.5 ${
                            isErr ? 'text-rose-700' : 'text-emerald-800'
                          }`}
                        >
                          {isDone ? '✓ ' : '✗ '}
                          {st.result.message}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('Executed', 'लागू हो गया')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => void runProposedAction(act)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0D7377] hover:bg-[#0A5C5F] rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          {isRunning ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span>{isRunning ? t('Running...', 'लागू हो रहा है...') : t('Execute Now', 'अभी लागू करें')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {latestOpsResult.purchaseOrder && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-[#F8FAFC] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0B1B2B]">
                  <ClipboardList className="w-4 h-4 text-[#0D7377]" />
                  <span>
                    {latestOpsResult.purchaseOrder.poNumber} · {latestOpsResult.purchaseOrder.items.length} Line(s) ·{' '}
                    {latestOpsResult.purchaseOrder.totalUnits} Units · Est. ₹
                    {latestOpsResult.purchaseOrder.estimatedTotalInr.toLocaleString()}
                  </span>
                </div>
                {latestOpsResult.purchaseOrder.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        `${latestOpsResult.purchaseOrder!.poNumber}.csv`,
                        latestOpsResult.purchaseOrder!.csvContent,
                        'text/csv'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[#0D7377] bg-white border border-teal-200 rounded-md hover:bg-teal-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('Download PO CSV', 'PO CSV डाउनलोड करें')}</span>
                  </button>
                )}
              </div>
              {latestOpsResult.purchaseOrder.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Medicine</th>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2 text-right">On Hand</th>
                        <th className="px-3 py-2 text-right">Order Qty</th>
                        <th className="px-3 py-2 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {latestOpsResult.purchaseOrder.items.map((item) => (
                        <tr key={`${item.batchNumber}-${item.medicineName}`}>
                          <td className="px-3 py-2 font-semibold text-[#0B1B2B]">{item.medicineName}</td>
                          <td className="px-3 py-2 text-slate-600">{item.supplierName}</td>
                          <td className="px-3 py-2 text-right font-mono">{item.currentStock}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-[#0D7377]">
                            +{item.recommendedOrderQty}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            ₹{item.estimatedLineTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {latestOpsResult.riskAudit && (
            <div className="rounded-lg border border-slate-200 p-4 bg-[#F8FAFC] space-y-2.5">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-[#0B1B2B] flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#0D7377]" />
                  Live Risk Audit ({latestOpsResult.riskAudit.totalBatches} batches)
                </span>
                <span className="font-mono text-rose-700 font-semibold">
                  Expired: {latestOpsResult.riskAudit.expiredCount}
                </span>
                <span className="font-mono text-amber-700 font-semibold">
                  Near Expiry: {latestOpsResult.riskAudit.nearExpiryCount}
                </span>
                <span className="font-mono text-amber-700 font-semibold">
                  Low Stock: {latestOpsResult.riskAudit.lowStockCount}
                </span>
              </div>
              {latestOpsResult.riskAudit.findings.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {latestOpsResult.riskAudit.findings.slice(0, 6).map((f, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-700">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          f.severity === 'critical'
                            ? 'text-rose-600'
                            : f.severity === 'warning'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                        }`}
                      />
                      <span>
                        <strong className="text-[#0B1B2B]">{f.category}:</strong> {f.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Chat Viewport */}
      <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[560px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
              <p className="font-display text-lg font-semibold text-[#0B1B2B] mb-2">
                Ask grounded questions about any medicine pack or document
              </p>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                Select a saved scan or document above, or attach a pack photo / leaflet PDF directly
                in the composer below.
              </p>
              <div className="w-full space-y-2">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => void sendPrompt(qp)}
                    className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-2xl rounded-xl px-5 py-4 ${
                    msg.sender === 'user'
                      ? 'bg-[#0B1B2B] text-white'
                      : 'bg-[#F8FAFC] border border-slate-200 text-[#0B1B2B]'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-[11px] mb-2 ${
                      msg.sender === 'user' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    <span className="font-semibold">
                      {msg.sender === 'user' ? profile?.displayName || 'You' : 'MediTrust AI'}
                    </span>
                    <span>·</span>
                    <span className="uppercase font-mono">{msg.language}</span>
                    {msg.attachmentName && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[160px]">{msg.attachmentName}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatTimestamp(msg.createdAt)}</span>
                  </div>

                  {msg.sender === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <SafeFormattedText text={msg.content} />
                  )}

                  {msg.groundingRef && (
                    <p
                      className={`mt-2.5 pt-2 border-t text-[11px] ${
                        msg.sender === 'user'
                          ? 'border-slate-700 text-slate-300'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      Grounded in: {msg.groundingRef}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D7377]" />
                <span>Reviewing evidence and preparing grounded explanation...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendPrompt(input);
          }}
          className="border-t border-slate-200 p-4 bg-white space-y-2.5"
        >
          {samplingVideo && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D7377]" />
              <span>
                {t(
                  'Sampling timestamped key frames from video for multimodal inspection...',
                  'मल्टीमॉडल जाँच के लिए वीडियो से टाइमस्टैम्प फ्रेम निकाले जा रहे हैं...'
                )}
              </span>
            </div>
          )}

          {attachment && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
              <span className="truncate">
                {t('Attached:', 'संलग्न:')} {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="p-0.5 hover:text-rose-700 cursor-pointer"
                aria-label="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {videoAttachment && (
            <div className="p-2.5 bg-teal-50/70 border border-teal-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-teal-950">
                <span className="font-semibold truncate">
                  {t('Video Sampled:', 'वीडियो फ्रेम तैयार:')} {videoAttachment.name} (
                  {videoAttachment.frames.length} {t('frames', 'फ्रेम')} · {videoAttachment.durationSec}s)
                </span>
                <button
                  type="button"
                  onClick={() => setVideoAttachment(null)}
                  className="p-0.5 hover:text-rose-700 cursor-pointer"
                  aria-label="Remove video"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {videoAttachment.frames.map((frame) => (
                  <div key={frame.timestamp} className="shrink-0 text-center">
                    <img
                      src={frame.previewDataUrl}
                      alt={`Frame ${frame.timestamp}`}
                      className="w-20 h-14 object-cover rounded border border-teal-300"
                    />
                    <span className="block font-mono text-[10px] text-teal-900 mt-0.5">
                      {frame.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label
              className="p-2.5 text-slate-500 hover:text-[#0D7377] border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
              title={t('Attach medicine image or PDF leaflet', 'दवा की फोटो या PDF पर्चा संलग्न करें')}
            >
              <Paperclip className="w-4 h-4" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => void handleAttachFile(e)}
                className="hidden"
              />
            </label>

            <label
              className="p-2.5 text-slate-500 hover:text-[#0D7377] border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
              title={t('Upload medicine pack video for timestamped frame inspection', 'वीडियो अपलोड करें (टाइमस्टैम्प फ्रेम जाँच)')}
            >
              <Film className="w-4 h-4" />
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => void handleAttachVideo(e)}
                className="hidden"
              />
            </label>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={4000}
              placeholder={
                language === 'hi'
                  ? 'दवा, बैच नंबर, वीडियो या एक्सपायरी के बारे में पूछें...'
                  : language === 'hinglish'
                    ? 'Medicine label, video, expiry ya verification status ke baare mein poochein...'
                    : 'Ask about extracted labels, uploaded pack photos, PDFs, or videos...'
              }
              className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
            />

            <button
              type="submit"
              disabled={sending || samplingVideo || !input.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{t('Send', 'भेजें')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
