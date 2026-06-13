import React, { useState } from 'react';
import { ArrowLeft, Brain, Cpu, Database, AlertTriangle, ShieldCheck, List, History } from 'lucide-react';
import FieldCard from './FieldCard';
import RiskGauge from './RiskGauge';
import ChatPanel from './ChatPanel';
import HistoryTable from './HistoryTable';

export default function ResultsScreen({ invoice, onBack, history, onSelectInvoice }) {
  const [activeTab, setActiveTab] = useState('fields');
  const [expandedFlags, setExpandedFlags] = useState({});

  if (!invoice) return null;

  // Format method badge
  const isAiExtracted = invoice.extraction_method === 'claude' || invoice.extraction_method === 'hybrid';
  const methodLabel = isAiExtracted ? 'AI Extracted' : 'Regex Extracted';
  const methodBadgeClass = isAiExtracted 
    ? 'bg-purple-500/15 text-purple-400 border-purple-500/20' 
    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

  const toggleFlag = (flagName) => {
    setExpandedFlags(prev => ({
      ...prev,
      [flagName]: !prev[flagName]
    }));
  };

  const getFlagStyles = (flag) => {
    switch (flag) {
      case 'DUPLICATE':
      case 'LARGE_AMOUNT':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'MISSING_VAT':
      case 'MATH_ERROR':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'ROUND_AMOUNT':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'MISSING_DATE':
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  // Line items totals calculation
  const lineItems = invoice.line_items || [];
  const subtotal = lineItems.reduce((acc, curr) => acc + (curr.subtotal || 0.0), 0.0);
  const vat = invoice.vat_amount || 0.0;
  const total = invoice.total_amount || 0.0;

  // Map reasons to flags for the accordion
  const flagReasons = {};
  if (invoice.flags && invoice.reasons) {
    invoice.flags.forEach((flag, idx) => {
      flagReasons[flag] = invoice.reasons[idx] || "No explanation provided.";
    });
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f0f11] text-zinc-100 font-sans">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/15">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-800 transition-colors text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            New invoice
          </button>
          
          <div className="h-4 w-px bg-zinc-800" />
          
          {/* Breadcrumb filename */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-zinc-500 text-xs font-semibold uppercase font-mono">InvoiceAI</span>
            <span className="text-zinc-600 text-xs font-mono">/</span>
            <span className="text-zinc-300 text-xs font-semibold truncate font-mono" title={invoice.vendor}>
              {invoice.vendor || 'Extracted Invoice'}
            </span>
          </div>

          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${methodBadgeClass}`}>
            {methodLabel}
          </span>
        </div>

        {/* Small Logo right side */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center font-mono font-bold text-white text-xs">
            I
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        
        {/* LEFT PANEL: Fields | Risk | Line Items | History */}
        <div className="w-full lg:w-[420px] flex flex-col border-r border-zinc-800/80 bg-zinc-950/20 min-h-0">
          
          {/* Tabs header */}
          <div className="flex border-b border-zinc-800/80 bg-zinc-900/10 px-2 py-1 gap-1">
            {[
              { id: 'fields', label: 'Fields', icon: Cpu },
              { id: 'risk', label: 'Risk', icon: AlertTriangle },
              { id: 'items', label: 'Line Items', icon: List },
              { id: 'history', label: 'History', icon: History }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-zinc-800/60 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Scrollable Tab Panel Container */}
          <div className="flex-1 overflow-y-auto p-5">
            
            {/* TAB: FIELDS */}
            {activeTab === 'fields' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldCard label="Vendor" value={invoice.vendor} confidence={invoice.ocr_confidence} />
                  </div>
                  <FieldCard label="Invoice #" value={invoice.invoice_number} confidence={invoice.ocr_confidence} />
                  <FieldCard label="Invoice Date" value={invoice.invoice_date} confidence={invoice.ocr_confidence} />
                  <div className="col-span-2">
                    <FieldCard label="Total Amount" value={invoice.total_amount} confidence={invoice.ocr_confidence} isAmount />
                  </div>
                  <div className="col-span-2">
                    <FieldCard label="VAT / Tax Amount" value={invoice.vat_amount} confidence={invoice.ocr_confidence} isAmount />
                  </div>
                </div>

                <div className="p-3.5 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">OCR Engine</span>
                  <span className="text-[11px] font-mono text-zinc-300 font-semibold bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                    PaddleOCR (Conf: {Math.round(invoice.ocr_confidence * 100)}%)
                  </span>
                </div>
              </div>
            )}

            {/* TAB: RISK */}
            {activeTab === 'risk' && (
              <div className="space-y-6 flex flex-col items-center">
                <RiskGauge score={invoice.risk_score} />

                {/* Risk Level Badge */}
                <div className="text-center space-y-1">
                  <div className={`text-base font-bold tracking-wide uppercase px-4 py-1 rounded-full border ${
                    invoice.risk_level === 'High' 
                      ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                      : invoice.risk_level === 'Medium' 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {invoice.risk_level} Risk Level
                  </div>
                </div>

                {/* Accordion List of flags */}
                <div className="w-full space-y-2.5 pt-4 border-t border-zinc-900">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                    Risk Triggers ({invoice.flags?.length || 0})
                  </div>
                  
                  {invoice.flags && invoice.flags.length > 0 ? (
                    invoice.flags.map((flag) => {
                      const expanded = expandedFlags[flag];
                      return (
                        <div
                          key={flag}
                          className="border border-zinc-850 rounded-xl overflow-hidden bg-zinc-900/10"
                        >
                          <button
                            onClick={() => toggleFlag(flag)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-xs font-bold font-mono border-b border-zinc-850 transition-colors ${getFlagStyles(flag)}`}
                          >
                            <span>⚠️ {flag}</span>
                            <span className="text-[10px] opacity-70">
                              {expanded ? '▲' : '▼'}
                            </span>
                          </button>
                          {expanded && (
                            <div className="p-3.5 text-xs text-zinc-300 leading-relaxed bg-zinc-900/30">
                              {flagReasons[flag]}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center gap-2.5 p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 text-emerald-400/90 text-xs">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span>No anomalies triggered. This invoice appears safe.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: LINE ITEMS */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                {lineItems.length > 0 ? (
                  <>
                    {/* Items loop */}
                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {lineItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex flex-col justify-between hover:border-zinc-800 transition-colors"
                        >
                          <div className="text-zinc-200 font-medium text-xs truncate" title={item.description}>
                            {item.description || 'Line Item Description'}
                          </div>
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-850">
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {item.qty || 1} × ${item.unit_price ? item.unit_price.toFixed(2) : '0.00'}
                            </div>
                            <div className="text-xs font-mono font-semibold text-zinc-100">
                              ${item.subtotal ? item.subtotal.toFixed(2) : '0.00'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals Section */}
                    <div className="pt-4 border-t border-zinc-800 space-y-2 text-xs font-medium">
                      <div className="flex justify-between text-zinc-400">
                        <span>Subtotal</span>
                        <span className="font-mono">${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>VAT / Tax</span>
                        <span className="font-mono">${vat.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-100 text-sm font-bold pt-2 border-t border-zinc-850">
                        <span>Total amount</span>
                        <span className="font-mono text-indigo-400">${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 text-zinc-500 text-xs">
                    No line items extracted.
                  </div>
                )}
              </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">
                  All past Invoices
                </div>
                <HistoryTable invoices={history} onSelectInvoice={onSelectInvoice} />
              </div>
            )}

          </div>
        </div>

        {/* RIGHT PANEL: AI Chat */}
        <div className="flex-1 min-w-0 h-full">
          <ChatPanel invoiceContext={invoice} />
        </div>

      </div>
    </div>
  );
}
