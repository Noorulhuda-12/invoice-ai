import React from 'react';

export default function HistoryTable({ invoices = [], onSelectInvoice }) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No invoices analyzed yet.
      </div>
    );
  }

  const getRiskStatus = (level) => {
    switch (level) {
      case 'High':
        return { emoji: '🔴', text: 'High', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
      case 'Medium':
        return { emoji: '🟡', text: 'Medium', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
      case 'Low':
      default:
        return { emoji: '🟢', text: 'Low', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    }
  };

  const formatAmount = (amt) => {
    const floatVal = parseFloat(amt);
    return isNaN(floatVal) ? 'N/A' : `$${floatVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="overflow-x-auto w-full border border-zinc-800/80 rounded-xl bg-zinc-900/20">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900/50">
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Invoice #</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {invoices.map((inv) => {
            const risk = getRiskStatus(inv.risk_level);
            return (
              <tr
                key={inv.id}
                onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                className="hover:bg-zinc-800/40 cursor-pointer transition-colors duration-150 group"
              >
                <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs">
                  <span className="mr-1.5" title={`${risk.text} Risk`}>{risk.emoji}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${risk.color} font-bold`}>
                    {risk.text}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-zinc-100 font-medium group-hover:text-indigo-400 transition-colors duration-150">
                  {inv.vendor || 'Unknown Vendor'}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300 font-mono text-xs">
                  {inv.invoice_number || 'N/A'}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400 text-xs">
                  {inv.invoice_date || 'N/A'}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-zinc-100 text-sm font-semibold">
                  {formatAmount(inv.total_amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
