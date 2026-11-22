import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Download,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  buildPharmacyWorkspaceSnapshot,
  executePharmacistAiAction,
  type ActionExecutionResult,
  type PharmacistAiAgentResponse,
  type PlannedPharmacyAction,
} from '../lib/pharmacistAiExecutor';
import { downloadTextFile } from '../lib/utils';

interface PharmacistAiCommandBarProps {
  compact?: boolean;
  onNavigate?: (page: string) => void;
}

export function PharmacistAiCommandBar({ compact = false, onNavigate }: PharmacistAiCommandBarProps) {
  const { user, profile, data } = useAuth();
  const { lang, t } = useLanguage();

  const [command, setCommand] = useState('');
  const [autoExecute, setAutoExecute] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [response, setResponse] = useState<PharmacistAiAgentResponse | null>(null);
  const [actionStates, setActionStates] = useState<
    Record<string, { status: 'idle' | 'running' | 'done' | 'error'; result?: ActionExecutionResult }>
  >({});

  const runAction = async (action: PlannedPharmacyAction) => {
    if (!user) return;
    setActionStates((prev) => ({ ...prev, [action.actionId]: { status: 'running' } }));
    const res = await executePharmacistAiAction(action, {
      ownerId: user.uid,
      actorName: profile?.displayName || user.email || 'Pharmacist',
      pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
      data,
    });
    setActionStates((prev) => ({
      ...prev,
      [action.actionId]: { status: res.ok ? 'done' : 'error', result: res },
    }));
  };

  const runCommand = async (promptText: string) => {
    if (!user || !promptText.trim() || running) return;
    setErrorMsg('');
    setRunning(true);
    setCommand('');
    setActionStates({});

    try {
      const snapshot = buildPharmacyWorkspaceSnapshot(data, profile);
      const res = await fetch('/api/v1/pharmacist/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptText.trim(),
          language: lang === 'hi' ? 'hi' : 'en',
          snapshot,
        }),
      });
      const json = (await res.json()) as PharmacistAiAgentResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'AI pharmacy operation failed.');

      setResponse(json);

      if (autoExecute && json.proposedActions && json.proposedActions.length > 0) {
        for (const act of json.proposedActions) {
          await runAction(act);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to execute AI command.');
    } finally {
      setRunning(false);
    }
  };

  const executeAllPending = async () => {
    if (!response?.proposedActions) return;
    for (const act of response.proposedActions) {
      const st = actionStates[act.actionId]?.status;
      if (st !== 'done' && st !== 'running') {
        await runAction(act);
      }
    }
  };

  const quickCommands = [
    {
      label: t('Generate Reorder PO', 'रीऑर्डर PO बनाएं'),
      prompt: 'Check all low-stock and near-expiry batches and generate a supplier reorder purchase order.',
    },
    {
      label: t('Run Live Risk Audit', 'लाइव रिस्क ऑडिट चलाएं'),
      prompt: 'Run a full pharmacy risk audit covering expired stock, near-expiry, low stock, quarantine flags, and traceability gaps.',
    },
    {
      label: t('Dispense 10 Dolo-650', '10 Dolo-650 डिस्पेंस करें'),
      prompt: 'Dispense 10 units of Dolo-650 from current stock for counter sale.',
    },
    {
      label: t('Receive Crocin Batch', 'नया Crocin बैच जोड़ें'),
      prompt: 'Receive 100 strips of Crocin Advance batch CRC-2026-905 expiring 2028-06-30 from MedLine Distributors at Rs 22.',
    },
  ];

  const pendingCount = (response?.proposedActions || []).filter(
    (a) => actionStates[a.actionId]?.status !== 'done'
  ).length;

  return (
    <div className="bg-white border border-teal-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-[#0D7377]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-bold text-[#0B1B2B]">
                {t('AI Pharmacy Operations Agent', 'एआई फार्मेसी संचालन एजेंट')}
              </h3>
              <span className="text-[11px] font-mono font-semibold text-[#0D7377] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                {t('Live Tool Execution', 'लाइव एक्शन मोड')}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {t(
                'Type any pharmacy task in English, Hindi, or Hinglish—AI directly prepares & executes real stock receipts, dispensing, quarantine flags, alerts, custody hand-offs, and supplier POs.',
                'अंग्रेज़ी, हिन्दी या हिंग्लिश में कोई भी फार्मेसी कार्य लिखें—एआई सीधे स्टॉक जोड़ने, डिस्पेंस, क्वारंटीन, अलर्ट और सप्लायर PO बनाता और लागू करता है।'
              )}
            </p>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0 select-none">
          <input
            type="checkbox"
            checked={autoExecute}
            onChange={(e) => setAutoExecute(e.target.checked)}
            className="w-4 h-4 accent-[#0D7377] rounded"
          />
          <span>{t('Auto-Execute Actions', 'ऑटो-एग्ज़ीक्यूट')}</span>
        </label>
      </div>

      {/* Command Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCommand(command);
        }}
        className="flex flex-col sm:flex-row gap-2.5"
      >
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={running}
          maxLength={600}
          placeholder={t(
            'e.g., "Dispense 12 units of Dolo-650", "Quarantine batch GGP1-25M18", or "Generate reorder PO"',
            'उदा: "Dolo-650 के 10 स्ट्रिप डिस्पेंस करें" या "कम स्टॉक का रीऑर्डर PO बनाएं"'
          )}
          className="flex-1 px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
        />
        <button
          type="submit"
          disabled={running || !command.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
        >
          {running ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>{running ? t('Executing AI...', 'चल रहा है...') : t('Run AI Function', 'एआई चलाएं')}</span>
        </button>
      </form>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {quickCommands.map((qc) => (
          <button
            key={qc.label}
            type="button"
            disabled={running}
            onClick={() => void runCommand(qc.prompt)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-[#F8FAFC] hover:bg-teal-50 hover:text-[#0D7377] hover:border-teal-200 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {qc.label}
          </button>
        ))}
        {onNavigate && !compact && (
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="ml-auto text-xs font-semibold text-[#0D7377] hover:underline cursor-pointer"
          >
            {t('Open Full AI Copilot →', 'पूरा एआई कोपायलट खोलें →')}
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Result Panel */}
      {response && (
        <div className="pt-3 border-t border-slate-200 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-[#0B1B2B] leading-relaxed whitespace-pre-wrap">{response.reply}</p>
            <button
              type="button"
              onClick={() => setResponse(null)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              aria-label="Dismiss AI output"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Executable Function Cards */}
          {response.proposedActions && response.proposedActions.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('AI Proposed Live Operations', 'एआई द्वारा तैयार वास्तविक कार्य')} ({response.proposedActions.length})
                </p>
                {pendingCount > 1 && (
                  <button
                    type="button"
                    onClick={() => void executeAllPending()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-[#0B1B2B] hover:bg-slate-800 rounded-md cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    <span>{t(`Execute All (${pendingCount})`, `सभी लागू करें (${pendingCount})`)}</span>
                  </button>
                )}
              </div>

              {response.proposedActions.map((act) => {
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
                          onClick={() => void runAction(act)}
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

          {/* Purchase Order Card */}
          {response.purchaseOrder && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-[#F8FAFC] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[#0D7377]" />
                  <span className="text-xs font-bold text-[#0B1B2B]">
                    {response.purchaseOrder.poNumber} · {response.purchaseOrder.items.length} Line(s) ·{' '}
                    {response.purchaseOrder.totalUnits} Units · Est. ₹
                    {response.purchaseOrder.estimatedTotalInr.toLocaleString()}
                  </span>
                </div>
                {response.purchaseOrder.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        `${response.purchaseOrder!.poNumber}.csv`,
                        response.purchaseOrder!.csvContent,
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
              {response.purchaseOrder.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Medicine</th>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2 text-right">On Hand</th>
                        <th className="px-3 py-2 text-right">Order Qty</th>
                        <th className="px-3 py-2 text-right">Est. Cost</th>
                        <th className="px-3 py-2">Trigger</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {response.purchaseOrder.items.map((item) => (
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
                          <td className="px-3 py-2 text-slate-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Live Risk Audit Summary */}
          {response.riskAudit && (
            <div className="rounded-lg border border-slate-200 p-4 bg-[#F8FAFC] space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-[#0B1B2B] flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#0D7377]" />
                  Live Risk Audit ({response.riskAudit.totalBatches} batches)
                </span>
                <span className="font-mono text-rose-700 font-semibold">
                  Expired: {response.riskAudit.expiredCount}
                </span>
                <span className="font-mono text-amber-700 font-semibold">
                  Near Expiry: {response.riskAudit.nearExpiryCount}
                </span>
                <span className="font-mono text-amber-700 font-semibold">
                  Low Stock: {response.riskAudit.lowStockCount}
                </span>
                <span className="font-mono text-rose-700 font-semibold">
                  Flagged: {response.riskAudit.quarantinedOrSuspiciousCount}
                </span>
              </div>

              {response.riskAudit.findings.length > 0 && (
                <ul className="space-y-1.5 text-xs">
                  {response.riskAudit.findings.slice(0, 8).map((f, idx) => (
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
    </div>
  );
}
