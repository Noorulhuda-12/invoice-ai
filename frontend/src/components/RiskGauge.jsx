import React from 'react';

export default function RiskGauge({ score = 0.0 }) {
  // Score normalisation: clamp to 0.0 - 1.0
  const clampedScore = Math.max(0.0, Math.min(1.0, score));
  
  // Semicircle arc length = PI * R (R=50 => ~157.08)
  const strokeLength = 157.08;
  const dashOffset = strokeLength - strokeLength * clampedScore;

  // Determine indicator colors
  let strokeColor = '#10b981'; // Green
  let textColor = 'text-emerald-400';
  if (clampedScore >= 0.60) {
    strokeColor = '#ef4444'; // Red
    textColor = 'text-red-500';
  } else if (clampedScore >= 0.30) {
    strokeColor = '#f59e0b'; // Amber
    textColor = 'text-amber-500';
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-48 h-28 flex items-end justify-center overflow-hidden">
        {/* Semicircle Gauge SVG */}
        <svg viewBox="0 0 120 70" className="w-full h-full">
          {/* Background Arc */}
          <path
            d="M 10,60 A 50,50 0 0,1 110,60"
            fill="none"
            stroke="#27272a" /* zinc-800 */
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Foreground Colored Arc */}
          <path
            d="M 10,60 A 50,50 0 0,1 110,60"
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={strokeLength}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Score text overlay centered inside the arc */}
        <div className="absolute bottom-0 text-center">
          <div className={`text-4xl font-extrabold font-mono tracking-tight ${textColor}`}>
            {clampedScore.toFixed(2)}
          </div>
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mt-0.5">
            Risk Score
          </div>
        </div>
      </div>
    </div>
  );
}
