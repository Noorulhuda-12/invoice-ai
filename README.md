# InvoiceAI - Intelligent Invoice Analyzer

An enterprise-ready, AI-powered invoice analysis dashboard. This application ingests invoices (PDF, PNG, JPG, WebP, etc.), runs layout-aware text extraction via **PaddleOCR**, executes a **deterministic anomaly detection engine** to check for fraud/errors, and exposes an interactive **Claude-powered SSE streaming chat assistant** seeded with vendor memory and transaction contexts.

## Architecture

```mermaid
graph TD
    Browser[React UI - Browser] -->|Port 80| Nginx[Nginx Reverse Proxy]
    Nginx -->|/api/* (Port 5000)| Flask[Flask Backend API]
    Flask -->|Run OCR| PaddleOCR[PaddleOCR Engine]
    Flask -->|SQL Queries| SQLite[(SQLite Database)]
    Flask -->|Low-confidence Fallback / Chat| Claude[Anthropic Claude API]
```

## Features & Implementation Details

### 1. OCR & Layout-Aware Extraction
- **PDF Conversion**: Uses `pdf2image` (with Poppler, 200 DPI) to convert document pages into PIL images (processes page 0).
- **Layout Zoning**: Divides the parsed invoice height coordinates into four zones:
  - **Header Zone (<20%)**: Target zone for vendor detection.
  - **Meta Zone (20%-35%)**: Ingests invoice numbers and dates.
  - **Table Zone (35%-80%)**: Line item grid search.
  - **Footer Zone (>=80%)**: Target zone for total amounts, taxes, and VAT.
- **Regex Extraction**: Runs optimized regular expressions matching dates, amounts, and invoice numbers on zone-specific text.
- **Spatial Extraction**: Locates labels (like "Total" or "VAT") and searches for the nearest numerical values on the same row (within 50px vertical difference).
- **Claude Vision Fallback**: Triggers if no text is parsed or overall extraction confidence (measured by core fields found) is `< 0.70` (fewer than 3 out of 4 core fields found). The image is base64 encoded and sent to `claude-3-5-sonnet-20241022` to return clean JSON metadata.

### 2. Deterministic Anomaly Detection
Every uploaded invoice runs through a weighted 6-rule fraud and validation engine:
- **Rule 1: Duplicate Invoice (Weight: 0.40)**: Queries database for matched vendor name + invoice number.
- **Rule 2: Missing VAT (Weight: 0.20)**: Triggers if total > $100 and VAT is 0.0 or null (ignores verified VAT-exempt vendors).
- **Rule 3: Unusually Large Amount (Weight: 0.25)**: Triggers if invoice amount is $> 2.5\sigma$ above historical average (for vendors with $\ge 3$ invoices). Otherwise, falls back to a global high-value threshold of $50,000.
- **Rule 4: Missing Date (Weight: 0.15)**: Triggers if invoice date is null.
- **Rule 5: Round Number (Weight: 0.10)**: Triggers if total amount > $5000 and is divisible by 1000.
- **Rule 6: VAT Math Mismatch (Weight: 0.20)**: Triggers if the sum of line items subtotals + VAT != stated total (difference $> \$0.50$).

**Risk Scoring Thresholds**:
- **Low Risk**: $< 0.30$
- **Medium Risk**: $< 0.60$
- **High Risk**: $\ge 0.60$

### 3. AI Assistant Chat
- Interfaced using Server-Sent Events (SSE) streaming.
- Full context injection on every request, including current invoice fields, line items, triggered anomaly rules, and vendor memory.
- Context includes vendor history stats: `invoice_count`, `avg_amount`, `typical_vat_rate`, and `last_seen`.

---

## Quickstart

### Prerequisites
- Docker & Docker Compose
- Anthropic API Key (placed in `.env`)

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/invoice-ai.git
   cd invoice-ai
   ```
2. Create environment file:
   ```bash
   cp .env.example .env
   # Open .env and add your Anthropic API Key
   ```
3. Run the container cluster:
   ```bash
   docker compose up --build
   ```
4. Access the web dashboard:
   - **Frontend (Web Application)**: [http://localhost](http://localhost)
   - **Backend API (Health Check)**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## Testing

Run the integration and pipeline tests inside the backend container to verify OCR and anomaly logic using synthetic PDFs:

```bash
docker compose exec backend pytest tests/test_pipeline.py
```

---

## Datasets & References
- **SROIE Receipt Dataset**: [https://rrc.cvc.uab.es/?ch=13](https://rrc.cvc.uab.es/?ch=13) (Benchmark for receipt scanning)
- **Kaggle Invoice Data Extraction**: [Invoice Dataset](https://www.kaggle.com/datasets/humansintheloop/invoice-data-extraction)
- **RVL-CDIP Dataset**: [Hugging Face RVL-CDIP](https://huggingface.co/datasets/rvl_cdip) (Document type classification benchmark)
- **Deployment URL**: *Pending deployment*
