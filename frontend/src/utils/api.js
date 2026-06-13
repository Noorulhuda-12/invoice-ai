/**
 * API utility functions for communicating with the Flask backend.
 */

export async function uploadInvoice(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed with status ${response.status}`);
  }

  return await response.json();
}

export async function getInvoiceHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  return await response.json();
}

export async function getInvoiceDetails(invoiceId) {
  const response = await fetch(`/api/invoice/${invoiceId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch invoice details: ${response.statusText}`);
  }
  return await response.json();
}

export async function getVendorDetails(vendorName) {
  const response = await fetch(`/api/vendor/${encodeURIComponent(vendorName)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor: ${response.statusText}`);
  }
  return await response.json();
}

export async function getHealth() {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Sends a message to the AI Assistant and streams the response via SSE.
 * 
 * @param {string} message - User query message.
 * @param {object} invoiceContext - Extracted fields and risk info of active invoice.
 * @param {function} onChunk - Callback triggered when a text chunk is received.
 * @param {function} onDone - Callback triggered when stream terminates.
 * @param {function} onError - Callback triggered on error.
 */
export async function chatStream(message, invoiceContext, onChunk, onDone, onError) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        invoice_context: invoiceContext,
        stream: true
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Save last partial line back to buffer
      buffer = lines.pop();

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;

        if (cleaned.startsWith('data: ')) {
          const dataStr = cleaned.slice(6);
          if (dataStr === '[DONE]') {
            onDone();
            return;
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.text) {
              onChunk(data.text);
            }
          } catch (err) {
            console.error('Error parsing SSE chunk:', err, cleaned);
          }
        }
      }
    }
    onDone();
  } catch (error) {
    onError(error);
  }
}
