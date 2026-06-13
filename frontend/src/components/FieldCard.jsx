import React from 'react';

export default function FieldCard({ label, value, confidence, isAmount = false }) {
  const isMissing = value === null || value === undefined || value === '';

  // Determine confidence badge color
  let badgeBg = 'bg-zinc-800 text-zinc-400';
  let badgeText = 'N/A';

  if (!isMissing && confidence !== undefined && confidence !== null) {
    const confPct = Math.round(confidence * 100);
    badgeText = `${confPct}%`;
    if (confPct >= 80) {
      badgeBg = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    } else if (confPct >= 60) {
      badgeBg = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    } else {
      badgeBg = 'bg-red-500/10 text-red-400 border border-red-500/20';
    }
  }

  // Value formatting
  let displayValue = value;
  if (!isMissing && isAmount) {
    const floatVal = parseFloat(value);
    if (!isNaN(floatVal)) {
      displayValue = `$${floatVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700/50 transition-all duration-200">
      <div>
        <div className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-1">
          {label}
        </div>
        
        {isMissing ? (
          <div className="text-red-500 text-[15px] font-semibold tracking-wide">
            Missing
          </div>
        ) : (
          <div className="text-zinc-100 text-[15px] font-semibold truncate" title={displayValue}>
            {displayValue}
          </div>
        )}
      </div>

      {!isMissing && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-medium">Confidence</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${badgeBg}`}>
            {badgeText}
          </span>
        </div>
      )}
    </div>
  );
}
