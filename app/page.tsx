// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ShieldAlert, CheckCircle2, Bot, Send, TrendingUp } from 'lucide-react';

const DEMO_AGENT_ID = 'agent_123';

type StatPoint = {
  date: string;
  authorized: number;
  captured: number;
  blocked: number;
  authNotCaptured: number;
};

// ---- Minimal SVG Line Chart (zero dependencies) ----
function LineChart({ data }: { data: StatPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        No data yet. Run some agent actions to populate the chart.
      </div>
    );
  }

  const W = 560;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allValues = data.flatMap((d) => [
    d.authorized,
    d.captured,
    d.blocked,
    d.authNotCaptured,
  ]);
  const maxVal = Math.max(...allValues, 1);

  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;

  const toX = (i: number) => PAD.left + (data.length > 1 ? i * xStep : innerW / 2);
  const toY = (v: number) => PAD.top + innerH - (v / maxVal) * innerH;

  const makePath = (key: keyof Omit<StatPoint, 'date'>) =>
    data
      .map((d, i) => {
        const x = toX(i);
        const y = toY(d[key]);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      })
      .join(' ');

  const lines: { key: keyof Omit<StatPoint, 'date'>; color: string; label: string }[] = [
    { key: 'authorized', color: '#635bff', label: 'Authorized' },
    { key: 'captured', color: '#10b981', label: 'Captured' },
    { key: 'blocked', color: '#f43f5e', label: 'Blocked' },
    { key: 'authNotCaptured', color: '#f59e0b', label: 'Auth, not captured' },
  ];

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div>
      <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full" aria-label="System surface line chart">
        {/* Grid lines */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} y1={toY(t)} x2={W - PAD.right} y2={toY(t)}
              stroke="#e2e8f0" strokeDasharray="4 2"
            />
            <text x={PAD.left - 6} y={toY(t) + 4} textAnchor="end"
              className="fill-slate-400" style={{ fontSize: 10 }}>
              {t}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          // Show max ~7 labels to avoid overlap
          if (data.length > 7 && i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return null;
          return (
            <text key={d.date} x={toX(i)} y={H - 8} textAnchor="middle"
              className="fill-slate-400" style={{ fontSize: 9 }}>
              {d.date.slice(5)}
            </text>
          );
        })}

        {/* Lines */}
        {lines.map((l) => (
          <path key={l.key} d={makePath(l.key)} fill="none" stroke={l.color}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Dots */}
        {lines.map((l) =>
          data.map((d, i) => (
            <circle key={l.key + '-' + i} cx={toX(i)} cy={toY(d[l.key])}
              r={3} fill={l.color} />
          )),
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 px-1">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block w-3 h-[3px] rounded" style={{ backgroundColor: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [agentResponse, setAgentResponse] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runSteps, setRunSteps] = useState<any[]>([]);
  const [chartData, setChartData] = useState<StatPoint[]>([]);

  // Human-owned boundary
  const [delegationActive, setDelegationActive] = useState(true);
  const [isEditingBoundary, setIsEditingBoundary] = useState(false);
  const [limitCents, setLimitCents] = useState(5000);
  const [vendorAllowlist, setVendorAllowlist] = useState('kaggle_api, openai, sephora');

  // Transcript details toggle
  const [showSystemEvaluation, setShowSystemEvaluation] = useState(false);

  // Stripe-ish type styles
  const stripeInk = '#30313D';
  const sectionTitle = 'text-[20px] leading-[28px] font-semibold tracking-[-0.01em]';
  const pageTitle = 'text-[28px] leading-[32px] font-semibold tracking-[-0.01em]';
  const eyebrow = 'text-xs font-mono text-slate-500 uppercase tracking-wider';

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch('/api/activity');
      const data = await res.json();
      setRequests(data);
    };
    const fetchChart = async () => {
      const res = await fetch('/api/activity/stats');
      const data = await res.json();
      setChartData(data);
    };
    fetchData();
    fetchChart();
    const interval = setInterval(() => { fetchData(); fetchChart(); }, 3000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    let authorized = 0;
    let denied = 0;
    let captured = 0;

    for (const req of requests) {
      if (req.state === 'APPROVED_AUTHORIZED') authorized += 1;
      else if (req.state === 'CAPTURED') captured += 1;
      else if (req.state === 'DENIED') denied += 1;
    }

    const pendingCapture = authorized;
    return { authorized, denied, captured, pendingCapture };
  }, [requests]);

  const fetchRunDetails = async (id: string) => {
    const res = await fetch('/api/agent-runs?id=' + id);
    if (!res.ok) return;
    const data = await res.json();
    setRunSteps(data.steps ?? []);
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) return;

    setIsLoading(true);
    setAgentResponse(null);
    setRunSteps([]);
    setRunStatus(null);
    setShowSystemEvaluation(false);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: DEMO_AGENT_ID,
          prompt,
          boundary: {
            limitCents,
            vendorAllowlist: vendorAllowlist
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
            active: delegationActive,
          },
        }),
      });

      const data = await res.json();

      setAgentResponse(data.agentResponse ?? null);
      setRunId(data.runId ?? null);
      setRunStatus(data.finalStatus ?? null);

      if (data.runId) await fetchRunDetails(data.runId);

      // Refresh ledger + chart immediately
      const a = await fetch('/api/activity');
      const rows = await a.json();
      setRequests(rows);
      const c = await fetch('/api/activity/stats');
      const cData = await c.json();
      setChartData(cData);
    } catch (err) {
      setAgentResponse('Agent run failed. Please try again.');
    } finally {
      setPrompt('');
      setIsLoading(false);
    }
  };

  const handleCapture = async (requestId: string) => {
    try {
      await fetch('/api/agents/' + DEMO_AGENT_ID + '/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });

      const res = await fetch('/api/activity');
      const data = await res.json();
      setRequests(data);
      const c = await fetch('/api/activity/stats');
      const cData = await c.json();
      setChartData(cData);
    } catch {
      // ignore for demo
    }
  };

  const limitUsd = (limitCents / 100).toFixed(2);

  const normalizedResult = useMemo(() => {
    const s = (runStatus ?? '').toLowerCase();
    if (!s) return null;

    if (s.includes('deny') || s.includes('denied') || s.includes('blocked')) {
      return { result: 'Denied by policy', state: 'Blocked' as const };
    }
    if (s.includes('captur') || s.includes('captured') || s.includes('succeed')) {
      return { result: 'Captured by Stripe', state: 'Captured' as const };
    }
    if (s.includes('authoriz') || s.includes('authorized') || s.includes('approve')) {
      return { result: 'Authorized by Stripe', state: 'Awaiting capture' as const };
    }

    return { result: runStatus, state: 'Awaiting capture' as const };
  }, [runStatus]);

  return (
    <div className="min-h-screen bg-[#F6F9FC] text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className={pageTitle} style={{ color: stripeInk }}>
            Delegate
          </h1>
          <div className="flex items-center gap-3" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="col-span-1 space-y-6">
            {/* Agent Activity */}
            <div>
              <div className={eyebrow + ' px-1'}>Agent activity</div>

              <div className="mt-2 bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className={sectionTitle} style={{ color: stripeInk }}>
                      Propose Spend
                    </h2>
                    <p className="text-slate-600 text-sm mt-1">Agent</p>
                  </div>
                  <Bot className="w-5 h-5 text-slate-500 mt-1" />
                </div>

                <form onSubmit={handleSimulate} className="mt-4 flex flex-col gap-3">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={'e.g., Buy a $2 dataset from ' +
                      (vendorAllowlist.split(',')[0]?.trim() || 'kaggle_api') + '...'}
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#635bff]/30 focus:border-[#635bff] outline-none resize-none h-24"
                  />

                  <button
                    type="submit"
                    disabled={isLoading || !delegationActive}
                    className="bg-[#635bff] hover:bg-[#4d5ae0] text-white font-medium py-2 px-4 rounded-lg flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                    title={!delegationActive ? 'Delegation has been revoked' : undefined}
                  >
                    {isLoading ? 'Submitting...' : 'Submit agent action'}
                    <Send className="w-4 h-4" />
                  </button>

                  {!delegationActive && (
                    <p className="text-xs text-slate-600">
                      Delegation is revoked. Reactivate or edit the boundary to continue.
                    </p>
                  )}
                </form>
              </div>
            </div>

            {/* Decision Summary */}
            <div>
              <div className={eyebrow + ' px-1'}>Agent outcome</div>

              <div className="mt-2 bg-white border border-slate-200 p-6 rounded-xl shadow-sm min-h-[220px]">
                <h2 className={sectionTitle} style={{ color: stripeInk }}>
                  Decision Summary
                </h2>

                <div className="mt-4">
                  {agentResponse ? (
                    <div className="text-sm text-slate-800 space-y-2">
                      <div>
                        • Proposed:{' '}
                        <span className="text-slate-700">
                          {runSteps?.find((s: any) =>
                            String(s.summary ?? '').toLowerCase().includes('propos')
                          )?.summary ?? 'Spend request'}
                        </span>
                      </div>
                      <div>
                        • Policy:{' '}
                        <span className="text-slate-700">
                          Within ${limitUsd} per-action limit
                        </span>
                      </div>
                      <div>
                        • Result:{' '}
                        <span className="text-slate-700">
                          {normalizedResult?.result ?? 'Processed'}
                        </span>
                      </div>
                      <div>
                        • State:{' '}
                        <span className="text-slate-700">
                          {normalizedResult?.state ?? '—'}
                        </span>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowSystemEvaluation((v) => !v)}
                          className="text-xs text-[#635bff] hover:text-[#4d5ae0] underline"
                        >
                          {showSystemEvaluation
                            ? 'Hide system evaluation'
                            : 'View system evaluation'}
                        </button>
                      </div>

                      {runSteps.length > 0 && showSystemEvaluation && (
                        <div className="mt-3 space-y-2">
                          <div className={eyebrow}>System evaluation</div>
                          <div className="space-y-1.5 text-xs">
                            {runSteps.map((step: any) => (
                              <div
                                key={step.id}
                                className="flex gap-2 items-start border-l-2 border-slate-200 pl-2 py-0.5"
                              >
                                <span className="font-mono font-medium text-slate-500 shrink-0">
                                  {step.actor ?? step.type}
                                </span>
                                <span className="text-slate-600">{step.summary}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700">
                      Agent proposed spend → Policy evaluated → Stripe authorized/denied → Captured or blocked.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-span-2 space-y-6">
            {/* Delegation Boundary */}
            <div>
              <div className={eyebrow}>Human control</div>

              <div className="mt-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h2 className={sectionTitle} style={{ color: stripeInk }}>
                      Delegation Boundary
                    </h2>

                    <div className="mt-2 text-sm text-slate-800">
                      <span className="text-slate-500">Owner:</span> AI Test User
                      (Stripe Customer)
                    </div>

                    <div className="mt-4 text-sm text-slate-800">
                      <div className="text-slate-500 mb-2">
                        This agent is authorized to:
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-800">
                        <li>
                          Spend up to <span className="font-mono">${limitUsd}</span> per
                          action
                        </li>
                        <li>
                          Vendors: <span className="font-mono">{vendorAllowlist}</span>
                        </li>
                        <li>
                          Mode: <span className="font-mono">Autonomous</span> (no
                          per-transaction approval)
                        </li>
                      </ul>

                      {!delegationActive && (
                        <div className="mt-3 text-xs text-slate-600">
                          No agent-initiated spend is permitted while delegation is revoked.
                        </div>
                      )}
                    </div>

                    {/* Inline editor */}
                    {isEditingBoundary && (
                      <div className="mt-5 border-t border-slate-200 pt-5">
                        <div className={eyebrow + ' mb-3'}>Edit boundary</div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <label className="text-sm text-slate-700">
                            Per-action limit (USD cents)
                            <input
                              value={limitCents}
                              onChange={(e) =>
                                setLimitCents(Number(e.target.value || 0))
                              }
                              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#635bff]/30 focus:border-[#635bff] outline-none"
                              inputMode="numeric"
                            />
                          </label>

                          <label className="text-sm text-slate-700">
                            Vendor allowlist (comma-separated)
                            <input
                              value={vendorAllowlist}
                              onChange={(e) => setVendorAllowlist(e.target.value)}
                              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#635bff]/30 focus:border-[#635bff] outline-none"
                            />
                          </label>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                            onClick={() => setIsEditingBoundary(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded bg-[#635bff] hover:bg-[#4d5ae0] text-white"
                            onClick={() => {
                              setDelegationActive(true);
                              setIsEditingBoundary(false);
                            }}
                          >
                            Save boundary
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-xs text-slate-500">Status</div>
                    <div
                      className={'mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ' +
                        (delegationActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200')}
                    >
                      {delegationActive ? 'Active' : 'Revoked'}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                        onClick={() => setIsEditingBoundary(true)}
                      >
                        Edit boundary
                      </button>

                      {delegationActive ? (
                        <button
                          type="button"
                          onClick={() => setDelegationActive(false)}
                          className="text-xs px-3 py-1.5 rounded border border-rose-200 bg-white hover:bg-rose-50 text-rose-700"
                        >
                          Revoke delegation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDelegationActive(true)}
                          className="text-xs px-3 py-1.5 rounded bg-[#635bff] hover:bg-[#4d5ae0] text-white"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ FIX 3: System Surface Dashboard with Line Chart */}
            <div>
              <div className={eyebrow}>System surface</div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono text-slate-700">
                <div className="px-3 py-1 rounded-full bg-white border border-slate-200">
                  Authorized: {stats.authorized}
                </div>
                <div className="px-3 py-1 rounded-full bg-white border border-slate-200">
                  Captured: {stats.captured}
                </div>
                <div className="px-3 py-1 rounded-full bg-white border border-slate-200">
                  Blocked: {stats.denied}
                </div>
                <div className="px-3 py-1 rounded-full bg-white border border-amber-200 text-amber-700">
                  Authorized, not captured: {stats.pendingCapture}
                </div>
                {runStatus && (
                  <div className="px-3 py-1 rounded-full bg-white border border-slate-200">
                    Last run status: {runStatus}
                  </div>
                )}
              </div>

              {/* Dashboard Line Chart */}
              <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-slate-600" />
                  <h2 className={sectionTitle} style={{ color: stripeInk }}>
                    Transaction Trends
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Daily breakdown of transaction categories over time.
                </p>
                <LineChart data={chartData} />
              </div>

              {/* Live Spend Ledger */}
              <div className="mt-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-600" />
                <h2 className={sectionTitle} style={{ color: stripeInk }}>
                  Live Spend Ledger
                </h2>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                Most recent transactions first. All spend requests are evaluated against the active delegation boundary before Stripe authorization.
              </p>

              <div className="mt-3 border border-slate-200 bg-white rounded-xl overflow-hidden h-[420px] overflow-y-auto shadow-sm">
                {requests.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No spend requests yet.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-white text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-4 font-medium">Vendor</th>
                        <th className="p-4 font-medium">Amount</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 font-mono">
                      {requests.map((req: any) => (
                        <tr
                          key={req.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 text-slate-800">{req.vendor}</td>
                          <td className="p-4 text-slate-800">
                            ${(req.amountCents / 100).toFixed(2)}
                          </td>

                          <td className="p-4">
                            {req.state === 'APPROVED_AUTHORIZED' && (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 w-fit">
                                  <CheckCircle2 className="w-4 h-4" /> Authorized
                                </span>
                                <span className="text-xs text-slate-500">
                                  Authorized — within delegation boundary
                                </span>
                              </div>
                            )}

                            {req.state === 'CAPTURED' && (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 w-fit">
                                  <CheckCircle2 className="w-4 h-4" /> Captured
                                </span>
                                <span className="text-xs text-slate-500">
                                  Captured — within delegation boundary
                                </span>
                              </div>
                            )}

                            {req.state === 'DENIED' && (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 w-fit">
                                  <ShieldAlert className="w-4 h-4" /> Blocked
                                </span>
                                <span className="text-xs text-slate-500">
                                  {req.denyReason}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="p-4">
                            {req.state === 'APPROVED_AUTHORIZED' && (
                              <button
                                onClick={() => handleCapture(req.id)}
                                className="text-xs px-3 py-1.5 rounded bg-[#635bff] hover:bg-[#4d5ae0] text-white"
                              >
                                Capture
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Stripe remains the system of record. Ledger entries map 1:1 to Stripe PaymentIntents (manual capture).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
