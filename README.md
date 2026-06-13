<div align="center">

# 🧾 InvoiceAI

### Intelligent Invoice Analysis Platform

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-D4A017?style=flat-square)](https://anthropic.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

An enterprise-ready, AI-powered invoice analysis dashboard that ingests invoices (PDF, PNG, JPG, WebP), extracts structured data via **PaddleOCR**, runs a **deterministic fraud detection engine**, and exposes a **Claude-powered streaming chat assistant** seeded with vendor memory and transaction history.

[Architecture](#architecture) · [OCR Approach](#ocr-approach) · [AI Approach](#ai-approach) · [Anomaly Detection](#anomaly-detection-logic) · [Quickstart](#quickstart) · [Testing](#testing)

</div>

---

## Architecture

InvoiceAI is a fully containerized, four-layer system orchestrated with Docker Compose.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Port 80)                    │
│                    React SPA — Dashboard + Chat             │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│                   Nginx Reverse Proxy                       │
│         Serves static React build                           │
│         Proxies /api/* → Flask :5000                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Flask Backend API (:5000)                  │
│                                                             │
│   ┌──────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│   │  OCR Engine  │  │ Anomaly Scorer  │  │ Chat / SSE  │  │
│   │ (PaddleOCR)  │  │  (6-rule engine)│  │  (Claude)   │  │
│   └──────┬───────┘  └────────┬────────┘  └──────┬──────┘  │
│          │                   │                   │         │
│   ┌──────▼───────────────────▼───────────────────▼──────┐  │
│   │              SQLite Database                         │  │
│   │   invoices · line_items · vendor_memory              │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Anthropic Claude API  │
              │  Vision fallback + Chat │
              └─────────────────────────┘
```

### Component Responsibilities

| Component | Role |
|---|---|
| **React UI** | Invoice upload, anomaly dashboard, streaming chat interface |
| **Nginx** | Static file serving, `/api/*` reverse proxy, SSL termination |
| **Flask API** | Request handling, orchestrates OCR → anomaly → DB write pipeline |
| **PaddleOCR** | Layout-aware text extraction from invoice images |
| **SQLite** | Stores invoices, line items, vendor memory, and anomaly results |
| **Claude API** | Low-confidence OCR fallback (Vision) and conversational assistant (Chat) |

### Request Lifecycle

```
Upload invoice
     │
     ▼
Convert to image (pdf2image @ 200 DPI)
     │
     ▼
Run PaddleOCR → zone-based field extraction
     │
     ├─── Confidence ≥ 0.70 ──► Use OCR results
     │
     └─── Confidence < 0.70 ──► Claude Vision fallback → structured JSON
                                          │
                                          ▼
                              Run 6-rule anomaly scorer
                                          │
                                          ▼
                              Persist to SQLite (invoice + vendor memory)
                                          │
                                          ▼
                              Return results to React UI
```

---

## OCR Approach

InvoiceAI uses **PaddleOCR** with a custom zone-segmentation strategy, rather than treating the invoice as a flat bag of text. This dramatically improves extraction accuracy because different invoice regions follow predictable layout conventions.

### Step 1 — Document Conversion

Uploaded files are normalized to PIL images before OCR runs:

- **PDFs** → converted via `pdf2image` (Poppler backend) at **200 DPI**, page 0 only
- **Images (PNG/JPG/WebP)** → loaded directly as PIL images

200 DPI is the deliberate quality setting — high enough for accurate character recognition, low enough for fast processing.

### Step 2 — Spatial Zone Segmentation

The parsed image height is divided into four named zones based on normalized Y-coordinate. Each zone has known semantic content in typical invoice layouts:

```
┌─────────────────────────────────┐  ◄ 0%
│           HEADER ZONE           │    Vendor name, logo, address
│          (Y < 20%)              │
├─────────────────────────────────┤  ◄ 20%
│            META ZONE            │    Invoice #, issue date, PO reference
│         (20% ≤ Y < 35%)         │
├─────────────────────────────────┤  ◄ 35%
│            TABLE ZONE           │    Line items, quantities, unit prices,
│         (35% ≤ Y < 80%)         │    subtotals per row
├─────────────────────────────────┤  ◄ 80%
│           FOOTER ZONE           │    Grand total, VAT, tax, payment terms
│           (Y ≥ 80%)             │
└─────────────────────────────────┘  ◄ 100%
```

### Step 3 — Field Extraction

Two complementary strategies run on zone-specific text output:

**Regex Extraction** — pattern-matched against zone text for well-structured fields:

| Field | Pattern Target |
|---|---|
| Invoice date | ISO dates, `DD/MM/YYYY`, `Month D, YYYY` |
| Invoice number | Alphanumeric sequences prefixed by `INV`, `#`, `No.` etc. |
| Amounts | Currency-prefixed numbers, decimals, comma-separated thousands |

**Spatial Extraction** — for fields that appear as label→value pairs (e.g. `Total: $4,250.00`):
1. Locate the label text (e.g. "Total", "VAT", "Tax") in the bounding-box output
2. Search all other detected text elements within **±50px vertical distance** on the same row
3. Return the nearest numeric value to the right of the label

### Step 4 — Confidence Scoring & Claude Fallback

After extraction, a confidence score is computed as the fraction of four core fields successfully found:

```
core_fields = [vendor_name, invoice_number, invoice_date, total_amount]
confidence  = (fields_found) / 4
```

| Confidence | Action |
|---|---|
| ≥ 0.70 (3+ fields) | Use OCR results directly |
| < 0.70 (0–2 fields) | Trigger Claude Vision fallback |
| No text extracted | Trigger Claude Vision fallback |

When fallback fires, the invoice image is base64-encoded and sent to `claude-3-5-sonnet-20241022` with a structured prompt requesting clean JSON output. This handles handwritten invoices, non-standard layouts, and poor-quality scans that defeat pattern-based extraction.

---

## AI Approach

InvoiceAI uses Claude in two distinct modes, each optimized for a different task.

### Mode 1 — Vision Fallback (Structured Extraction)

**When:** OCR confidence < 0.70 or zero text extracted.

**Model:** `claude-3-5-sonnet-20241022` (multimodal)

**How it works:**

The invoice image is base64-encoded and sent in a structured prompt that instructs Claude to act as a document parser — not a conversational assistant. The system prompt constrains the output to a strict JSON schema:

```json
{
  "vendor_name": "string",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "total_amount": 0.00,
  "vat_amount": 0.00,
  "line_items": [
    { "description": "string", "quantity": 0, "unit_price": 0.00, "subtotal": 0.00 }
  ]
}
```

This deterministic output contract means the fallback result slots seamlessly into the same pipeline as the OCR result — no branching logic downstream.

**Design decision:** Claude Vision is a fallback, not the primary path. PaddleOCR is faster, cheaper, and fully deterministic. Claude Vision is reserved for the cases where rule-based extraction genuinely fails, keeping API costs proportional to document complexity.

---

### Mode 2 — Streaming Chat Assistant (Contextual Reasoning)

**When:** User opens the chat panel for any analyzed invoice.

**Model:** `claude-sonnet-4-6` (streaming via SSE)

**How it works:**

Claude has no persistent memory between sessions, so full context is injected into every request. The system prompt is dynamically assembled from four data sources:

```
System Prompt
├── Role definition (invoice analyst, fraud reviewer)
├── Current invoice fields
│   ├── vendor_name, invoice_number, invoice_date
│   ├── total_amount, vat_amount
│   └── line_items[]
├── Anomaly report
│   ├── risk_score, risk_level
│   └── triggered_rules[] (rule name + weight + reason)
└── Vendor memory (from SQLite)
    ├── invoice_count
    ├── avg_amount
    ├── typical_vat_rate
    └── last_seen
```

The vendor memory context is the key differentiator — it lets Claude reason across time:

> *"This vendor's average invoice is $3,200, but this one is $48,000 — that's the trigger for Rule 3, and here's what that likely means..."*

**Streaming delivery:** Responses are streamed token-by-token over Server-Sent Events (SSE) so the UI renders in real time, eliminating the latency of waiting for a full response before displaying anything.

**Context refresh:** Context is re-injected on every message turn. This is intentional — it ensures Claude always has the current anomaly state, even if the user asks follow-up questions after the initial analysis.

---

## Anomaly Detection Logic

Every uploaded invoice is evaluated by a **deterministic, weighted, multi-rule engine**. Rules run independently — there is no early exit. Each triggered rule adds its weight to a cumulative risk score, which is then mapped to a risk level.

### The Six Rules

---

#### Rule 1 — Duplicate Invoice `weight: 0.40`

```
TRIGGER: vendor_name + invoice_number already exists in the database
```

The highest-weighted rule, reflecting that duplicate submissions are among the most common forms of invoice fraud. The check is an exact match on the compound key `(vendor_name, invoice_number)`. A match does not block processing but sets a 0.40 risk contribution — enough to push a clean invoice into Medium Risk on its own.

---

#### Rule 2 — Missing VAT `weight: 0.20`

```
TRIGGER: total_amount > $100 AND vat_amount IS NULL OR 0.0
         AND vendor is NOT in the VAT-exempt list
```

A non-zero invoice total without declared VAT is anomalous in most jurisdictions. The $100 threshold ignores petty cash invoices. Vendors registered as VAT-exempt in the vendor memory table are excluded from this check, preventing false positives for legitimate zero-VAT suppliers.

---

#### Rule 3 — Unusually Large Amount `weight: 0.25`

```
IF vendor has ≥ 3 prior invoices in DB:
    TRIGGER: amount > vendor_avg + (2.5 × vendor_stddev)

ELSE (insufficient history):
    TRIGGER: amount > $50,000 (global fallback threshold)
```

This is the only rule that adapts to per-vendor behaviour. For established vendors, it uses a **2.5σ statistical threshold** — a value more than 2.5 standard deviations above the vendor's historical mean is flagged. For new vendors (fewer than 3 invoices), the engine falls back to a fixed $50,000 global threshold.

The dual-path design prevents the rule from firing trivially on vendors that legitimately invoice large amounts, while still catching anomalies for unknown suppliers.

---

#### Rule 4 — Missing Date `weight: 0.15`

```
TRIGGER: invoice_date IS NULL
```

An invoice without a date cannot be reconciled against accounting periods, payment terms, or aged debt tracking. This is the lowest-weighted rule because a missing date is more likely to be a scanning/extraction failure than deliberate fraud. It is still flagged to prompt manual review.

---

#### Rule 5 — Round Number `weight: 0.10`

```
TRIGGER: total_amount > $5,000 AND total_amount % 1,000 == 0
```

Fraudulent invoices are disproportionately round numbers — they are easier to fabricate without access to actual pricing data. The $5,000 floor avoids penalizing legitimate round-number contracts at low amounts (e.g. a $1,000 monthly retainer). At high values, a round number warrants a flag even if the risk contribution is low.

---

#### Rule 6 — VAT Math Mismatch `weight: 0.20`

```
TRIGGER: |Σ(line_item subtotals) + vat_amount − total_amount| > $0.50
```

The sum of all line item subtotals plus the declared VAT must equal the stated invoice total. A discrepancy greater than $0.50 (to account for rounding differences) indicates either a data extraction error or deliberate manipulation of the totals. This rule only fires when line items are present — invoices with no itemization are not penalized.

---

### Risk Score Aggregation

```
risk_score = Σ weight(r) for each triggered rule r

Score < 0.30  →  🟢 Low Risk     (no action required)
Score < 0.60  →  🟡 Medium Risk  (review recommended)
Score ≥ 0.60  →  🔴 High Risk    (hold for manual approval)
```

**Worst-case score:** Rules 1 + 2 + 3 + 4 + 5 + 6 = `0.40 + 0.20 + 0.25 + 0.15 + 0.10 + 0.20 = 1.30`

The score is uncapped — it can exceed 1.0 when multiple high-weight rules fire simultaneously. This is intentional: a document triggering both duplicate detection (0.40) and a VAT math mismatch (0.20) should carry more urgency than either rule alone at the 0.60 High Risk boundary.

---

## Quickstart

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- An [Anthropic API Key](https://console.anthropic.com/)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-org/invoice-ai.git
cd invoice-ai

# 2. Configure
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run
docker compose up --build
```

| Service | URL |
|---|---|
| Web Dashboard | http://localhost |
| API Health Check | http://localhost:5000/api/health |

---

## Testing

```bash
# Run full pipeline tests with synthetic PDFs
docker compose exec backend pytest tests/test_pipeline.py

# With coverage report
docker compose exec backend pytest tests/test_pipeline.py -v --cov=app
```

Tests validate the complete pipeline: document ingestion → OCR zone extraction → anomaly scoring → database persistence.

---

## Project Structure

```
invoice-ai/
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── components/         # Dashboard, InvoiceViewer, ChatPanel
│   │   └── App.jsx
│   └── Dockerfile
├── backend/                    # Flask API
│   ├── app/
│   │   ├── ocr/                # PaddleOCR + zone segmentation + regex
│   │   ├── anomaly/            # 6-rule weighted scoring engine
│   │   ├── chat/               # SSE stream + Claude context builder
│   │   └── models/             # SQLite schema, vendor memory queries
│   ├── tests/
│   │   └── test_pipeline.py
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## Datasets & References

| Dataset | Purpose |
|---|---|
| [SROIE Receipt Dataset](https://rrc.cvc.uab.es/?ch=13) | OCR benchmark for scanned receipts |
| [Kaggle Invoice Data Extraction](https://www.kaggle.com/datasets/humansintheloop/invoice-data-extraction) | Real-world invoice extraction ground truth |
| [RVL-CDIP (Hugging Face)](https://huggingface.co/datasets/rvl_cdip) | Document type classification benchmark |

---

## Roadmap

- [ ] Multi-page PDF support (currently page 0 only)
- [ ] Batch upload via ZIP archive
- [ ] Export anomaly reports as PDF / CSV
- [ ] Role-based access control
- [ ] ERP webhook integration
- [ ] Cloud deployment (AWS / GCP)

---

<div align="center">

Built with ❤️ using [Anthropic Claude](https://anthropic.com), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), and [React](https://react.dev)

</div>
