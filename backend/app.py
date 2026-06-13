import os
import json
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from werkzeug.utils import secure_filename
from anthropic import Anthropic

# Import database and pipelines
import db
import ocr
import anomaly

app = Flask(__name__)
# Enable CORS for frontend development
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Ensure upload and data folders exist
UPLOAD_FOLDER = "/tmp/invoice_uploads" if os.name != "nt" else "data/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("data", exist_ok=True)

# Initialize Database
db.init_db()

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "webp"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part in request"}), 400
        
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
        
    if not allowed_file(file.filename):
        return jsonify({"error": f"Invalid file format. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        
    try:
        filename = secure_filename(file.filename)
        file_bytes = file.read()
        
        # 1. OCR + Extraction (includes Claude fallback if confidence < 0.70)
        extracted = ocr.process_invoice_file(file_bytes, filename)
        
        invoice_data = extracted["invoice"]
        line_items = extracted["line_items"]
        invoice_type = extracted["invoice_type"]
        
        # 2. Anomaly Detection
        risk_data = anomaly.run_anomaly_detection(invoice_data, line_items)
        
        # 3. Save to Database (Invoice, line items, update vendor memory)
        invoice_id = db.save_invoice(invoice_data, line_items, risk_data, invoice_type)
        
        # 4. Construct Response JSON
        response_data = {
            "id": invoice_id,
            "vendor": invoice_data.get("vendor"),
            "invoice_number": invoice_data.get("invoice_number"),
            "invoice_date": invoice_data.get("invoice_date"),
            "total_amount": invoice_data.get("total_amount"),
            "vat_amount": invoice_data.get("vat_amount"),
            "ocr_confidence": invoice_data.get("ocr_confidence"),
            "extraction_method": invoice_data.get("extraction_method"),
            "raw_text": invoice_data.get("raw_text"),
            "risk_score": risk_data.get("risk_score"),
            "risk_level": risk_data.get("risk_level"),
            "flags": risk_data.get("flags"),
            "reasons": risk_data.get("reasons"),
            "invoice_type": invoice_type,
            "line_items": line_items
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def get_heuristic_reply(message, invoice_context):
    msg = message.lower()
    
    vendor = invoice_context.get("vendor") or "Unknown Vendor"
    total = invoice_context.get("total_amount")
    vat = invoice_context.get("vat_amount") or 0.0
    date = invoice_context.get("invoice_date") or "an unknown date"
    num = invoice_context.get("invoice_number") or "N/A"
    risk_score = invoice_context.get("risk_score") or 0.0
    risk_level = invoice_context.get("risk_level") or "Low"
    flags = invoice_context.get("flags") or []
    reasons = invoice_context.get("reasons") or []
    inv_type = invoice_context.get("invoice_type") or "other"
    line_items = invoice_context.get("line_items") or []
    vendor_stats = invoice_context.get("vendor_stats")
    
    total_str = f"${total:,.2f}" if total is not None else "missing"
    vat_str = f"${vat:,.2f}"
    
    # 1. Amount / Total
    if any(k in msg for k in ["amount", "total", "cost", "price", "how much", "pay"]):
        return f"The total amount is {total_str} (VAT: {vat_str})."
        
    # 2. Risk / Flags
    elif any(k in msg for k in ["risk", "safe", "flag", "warning", "anomaly", "suspicious", "fraud"]):
        if flags:
            flags_str = ", ".join(flags)
            return f"Yes — risk score {risk_score:.2f} ({risk_level}). Triggers: {flags_str}. Reasons: {'; '.join(reasons)}."
        else:
            return f"No — this invoice has a Low risk score ({risk_score:.2f}) and triggered no anomaly flags."
            
    # 3. Vendor / Issuer / Who
    elif any(k in msg for k in ["who", "vendor", "issuer", "company", "sender", "from"]):
        reply = f"This invoice was issued by {vendor}."
        if vendor_stats:
            avg_amt = vendor_stats.get("avg_amount", 0)
            count = vendor_stats.get("invoice_count", 1)
            reply += f" Historically, we have processed {count} invoices from them, with an average amount of ${avg_amt:,.2f}."
        return reply
        
    # 4. Math / Subtotal / Adding up
    elif any(k in msg for k in ["math", "sum", "add up", "correct", "calculate"]):
        subtotal_sum = sum(item.get("subtotal") or 0.0 for item in line_items)
        expected = subtotal_sum + vat
        if total is not None and abs(expected - total) <= 0.50:
            return f"Yes — line items sum to ${subtotal_sum:,.2f} + VAT {vat_str} = {total_str}. ✓"
        else:
            return f"No — subtotal sum ${subtotal_sum:,.2f} + VAT {vat_str} = ${expected:,.2f} ≠ stated {total_str}."
            
    # 5. Classification / Invoice type
    elif any(k in msg for k in ["type", "kind", "class", "category"]):
        type_desc = {
            "medical": "medical supplies",
            "utility": "utility service",
            "SaaS": "software subscription (SaaS)",
            "professional_services": "professional services",
            "construction": "construction / materials",
            "logistics": "shipping / logistics",
            "retail": "retail purchase",
            "other": "general business expense"
        }.get(inv_type, inv_type)
        return f"This appears to be a {type_desc} invoice based on the vendor and line items."
        
    # Default catch-all
    else:
        return f"This is invoice #{num} from {vendor} dated {date} for {total_str}. Risk level is {risk_level} ({len(flags)} flags)."

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    message = data.get("message")
    invoice_context = data.get("invoice_context", {})
    stream = data.get("stream", False)
    
    if not message:
        return jsonify({"error": "Message is required"}), 400
        
    # Query database for current vendor memory/stats to enrich assistant context
    vendor = invoice_context.get("vendor")
    vendor_stats = db.get_vendor_stats(vendor) if vendor else None
    
    # Merge context with vendor stats
    full_context = {**invoice_context}
    if vendor_stats:
        full_context["vendor_stats"] = vendor_stats
        
    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    
    system_prompt = f"""You are an expert invoice analysis assistant.

Invoice data:
{json.dumps(full_context, indent=2)}

Rules:
- Always quote actual field values from the data
- If a field is null/missing, say so clearly
- For risk questions: explain which rules fired in plain language
- Classify invoice type when relevant (utility / medical / SaaS / professional services / construction / etc.)
- If vendor history shows avg_amount, compare current invoice to it
- Be concise and direct — one paragraph max per answer"""

    if not api_key:
        reply = get_heuristic_reply(message, full_context)
        if stream:
            def generate_fallback():
                import time
                words = reply.split(" ")
                for i, word in enumerate(words):
                    space = " " if i < len(words) - 1 else ""
                    yield f"data: {json.dumps({'text': word + space})}\n\n"
                    time.sleep(0.05)
                yield "data: [DONE]\n\n"
            return Response(stream_with_context(generate_fallback()), content_type="text/event-stream")
        else:
            return jsonify({"reply": reply})

    client = Anthropic(api_key=api_key)
    
    if stream:
        def generate():
            try:
                # Use Anthropic streaming
                with client.messages.stream(
                    model=model,
                    max_tokens=1000,
                    system=system_prompt,
                    messages=[{"role": "user", "content": message}]
                ) as message_stream:
                    for text in message_stream.text_stream:
                        yield f"data: {json.dumps({'text': text})}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'text': f'Error streaming from Claude: {str(e)}'})}\n\n"
                yield "data: [DONE]\n\n"
                
        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
        return Response(stream_with_context(generate()), content_type="text/event-stream", headers=headers)
    else:
        try:
            response = client.messages.create(
                model=model,
                max_tokens=1000,
                system=system_prompt,
                messages=[{"role": "user", "content": message}]
            )
            return jsonify({"reply": response.content[0].text})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route("/api/history", methods=["GET"])
def history():
    invoice_list = db.get_invoice_history()
    return jsonify(invoice_list)

@app.route("/api/invoice/<int:invoice_id>", methods=["GET"])
def get_invoice_details(invoice_id):
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Invoice not found"}), 404
            
        cursor.execute("SELECT * FROM line_items WHERE invoice_id = ?", (invoice_id,))
        item_rows = cursor.fetchall()
        conn.close()
        
        line_items = []
        for item in item_rows:
            line_items.append({
                "description": item["description"],
                "qty": item["qty"],
                "unit_price": item["unit_price"],
                "subtotal": item["subtotal"]
            })
            
        invoice_data = {
            "id": row["id"],
            "vendor": row["vendor"],
            "invoice_number": row["invoice_number"],
            "invoice_date": row["invoice_date"],
            "total_amount": row["total_amount"],
            "vat_amount": row["vat_amount"],
            "ocr_confidence": row["ocr_confidence"],
            "extraction_method": row["extraction_method"],
            "raw_text": row["raw_text"],
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "flags": json.loads(row["flags"]) if row["flags"] else [],
            "reasons": json.loads(row["reasons"]) if row["reasons"] else [],
            "invoice_type": row["invoice_type"],
            "line_items": line_items
        }
        return jsonify(invoice_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vendor/<name>", methods=["GET"])
def vendor_details(name):
    stats = db.get_vendor_stats(name)
    invoices = db.get_vendor_invoices(name)
    return jsonify({
        "stats": stats,
        "invoices": invoices
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
