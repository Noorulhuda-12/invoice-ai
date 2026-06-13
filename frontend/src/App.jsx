import React, { useState, useEffect } from 'react';
import UploadScreen from './components/UploadScreen';
import ResultsScreen from './components/ResultsScreen';
import { getInvoiceHistory, getInvoiceDetails } from './utils/api';

export default function App() {
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '' });

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await getInvoiceHistory();
      setHistory(data);
    } catch (err) {
      console.error("Failed to load invoice history", err);
    }
  };

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 4000);
  };

  const handleUploadSuccess = (invoiceData) => {
    setActiveInvoice(invoiceData);
    // Reload history list so it includes the newly saved invoice
    loadHistory();
  };

  const handleSelectInvoice = async (invoiceItem) => {
    try {
      const fullDetails = await getInvoiceDetails(invoiceItem.id);
      setActiveInvoice(fullDetails);
    } catch (err) {
      showToast(`Failed to load invoice details: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] text-zinc-100 font-sans relative antialiased selection:bg-indigo-600/30">
      
      {/* Dynamic Screen Routing */}
      {activeInvoice ? (
        <ResultsScreen
          invoice={activeInvoice}
          onBack={() => {
            setActiveInvoice(null);
            loadHistory();
          }}
          history={history}
          onSelectInvoice={handleSelectInvoice}
        />
      ) : (
        <UploadScreen
          onUploadSuccess={handleUploadSuccess}
          history={history}
          onSelectInvoice={handleSelectInvoice}
          showToast={showToast}
        />
      )}

      {/* Slide-Up Bottom-Center Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce duration-300">
          <div className="bg-zinc-900/90 text-zinc-200 border border-zinc-800 text-xs font-semibold px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 max-w-sm">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.8)]" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}
