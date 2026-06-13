import React, { useState, useRef } from 'react';
import { Upload, FileText, Sparkles, Loader2 } from 'lucide-react';
import { uploadInvoice } from '../utils/api';

export default function UploadScreen({ onUploadSuccess, history = [], onSelectInvoice, showToast }) {
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [fileName, setFileName] = useState('');
  
  const fileInputRef = useRef(null);
  const stepIntervalRef = useRef(null);

  const processingSteps = [
    "Extracting text...",
    "Parsing fields...",
    "Checking for anomalies...",
    "Finalising..."
  ];

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const startProcessingInterval = () => {
    setCurrentStep(0);
    stepIntervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < processingSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 2000);
  };

  const clearProcessingInterval = () => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
    }
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      showToast("File is too large. Max size is 20MB.");
      return;
    }

    // Validate extension
    const allowed = ["pdf", "png", "jpg", "jpeg", "tiff", "webp"];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      showToast(`Invalid file type. Allowed formats: ${allowed.join(', ').toUpperCase()}`);
      return;
    }

    setFileName(file.name);
    setProcessing(true);
    startProcessingInterval();

    try {
      const data = await uploadInvoice(file);
      showToast("Invoice processed successfully!");
      onUploadSuccess(data);
    } catch (err) {
      console.error(err);
      showToast(`Error processing invoice: ${err.message}`);
    } finally {
      clearProcessingInterval();
      setProcessing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current.click();
  };

  const handleTryDemo = async () => {
    // Generate a simple dummy PDF in bytes and upload it, or notify user.
    // To make it easy, we can check if there's a demo invoice we can upload, 
    // or we can fetch a sample from a URL, or simply create a mock file in JS and upload it.
    showToast("Generating demo invoice...");
    const content = "INVOICE\nInvoice #: INV-2026-999\nDate: 2026-06-10\nVendor: Vercel Inc.\nSubtotal: $150.00\nVAT: $30.00\nTotal: $180.00\n";
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], 'demo_invoice.txt', { type: 'text/plain' });
    
    // Rename to .pdf or .png so it passes validation (we use png for text files for mock purposes)
    const demoFile = new File([blob], 'demo_invoice.png', { type: 'image/png' });
    processFile(demoFile);
  };

  const getRiskEmoji = (level) => {
    switch (level) {
      case 'High': return '🔴';
      case 'Medium': return '🟡';
      case 'Low':
      default: return '🟢';
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
      
      {/* Upload Screen Standard State */}
      {!processing ? (
        <div className="w-full max-w-lg space-y-8">
          
          {/* Header */}
          <div className="text-center space-y-2.5">
            <div className="flex items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-mono font-bold text-white text-base shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                I
              </div>
              <span className="text-xl font-bold font-mono tracking-tight text-white">InvoiceAI</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium">
              AI-powered invoice analysis in seconds
            </p>
          </div>

          {/* Drag & Drop Card */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
              dragActive 
                ? 'border-indigo-500 bg-[#1e1e2e]/50 shadow-[0_0_25px_rgba(79,70,229,0.1)]' 
                : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50'
            }`}
            onClick={triggerBrowse}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple={false}
              onChange={handleChange}
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp"
            />
            
            <div className="w-14 h-14 rounded-full bg-zinc-800/80 flex items-center justify-center border border-zinc-700/50 text-zinc-300">
              <Upload className="w-6 h-6 text-zinc-400" />
            </div>

            <div className="space-y-1">
              <p className="text-zinc-200 font-semibold text-sm">
                Drop invoice PDF or image here
              </p>
              <p className="text-zinc-500 text-[11px] font-medium tracking-wide">
                JPG · PNG · TIFF · PDF · MAX 20MB
              </p>
            </div>
          </div>

          {/* Buttons Row */}
          <div className="flex gap-4 items-center justify-center">
            <button
              onClick={triggerBrowse}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-8 py-3 rounded-xl transition-all shadow-[0_4px_12px_rgba(79,70,229,0.2)] hover:shadow-[0_4px_16px_rgba(79,70,229,0.35)]"
            >
              Browse file
            </button>
            <button
              onClick={handleTryDemo}
              className="flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 text-zinc-300 font-semibold text-sm px-6 py-3 rounded-xl transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Try demo
            </button>
          </div>

          {/* Recent Invoices History */}
          {history.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-zinc-800/50">
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                Recent invoices
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {history.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectInvoice(item)}
                    className="flex items-center justify-between p-3.5 bg-zinc-900/30 border border-zinc-800/80 rounded-xl hover:bg-zinc-800/40 hover:border-zinc-700/50 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm" title={`${item.risk_level} Risk`}>
                        {getRiskEmoji(item.risk_level)}
                      </span>
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-400 transition-colors">
                          {item.vendor || 'Unknown Vendor'}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {item.invoice_number || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold text-zinc-100">
                      ${item.total_amount ? item.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        
        /* Processing state */
        <div className="w-full max-w-sm text-center space-y-6 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring */}
            <div className="absolute w-16 h-16 rounded-full border-2 border-indigo-500/20 animate-ping" />
            <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-indigo-500 animate-spin flex items-center justify-center bg-zinc-900">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin-slow" />
            </div>
          </div>

          <div className="space-y-3 w-full">
            <h3 className="text-zinc-100 font-semibold text-sm tracking-wide">
              {processingSteps[currentStep]}
            </h3>
            
            {/* Filename below */}
            <p className="text-zinc-500 text-xs truncate max-w-xs mx-auto font-mono">
              {fileName}
            </p>

            {/* Progress Dots */}
            <div className="flex justify-center items-center gap-2 pt-2">
              {processingSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentStep 
                      ? 'w-6 bg-indigo-500' 
                      : idx < currentStep 
                        ? 'w-1.5 bg-indigo-500/50' 
                        : 'w-1.5 bg-zinc-800'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
