import statistics
import sqlite3
import json
from db import get_db_connection, get_vendor_history_amounts, is_vendor_vat_exempt

def run_anomaly_detection(invoice_data, line_items):
    """
    Runs deterministic rules for fraud and error detection on an invoice.
    
    invoice_data: dict with keys: vendor, invoice_number, invoice_date, total_amount, vat_amount
    line_items: list of dicts with keys: description, qty, unit_price, subtotal
    
    Returns:
    {
      "risk_score": float,
      "risk_level": "Low" | "Medium" | "High",
      "flags": list of str,
      "reasons": list of str
    }
    """
    flags = []
    reasons = []
    triggered_weights = 0.0
    
    vendor = invoice_data.get("vendor")
    invoice_number = invoice_data.get("invoice_number")
    invoice_date = invoice_data.get("invoice_date")
    total_amount = invoice_data.get("total_amount")
    vat_amount = invoice_data.get("vat_amount") or 0.0
    
    # --- Rule 1: Duplicate invoice number (weight 0.40) ---
    if invoice_number and vendor:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM invoices WHERE invoice_number = ? AND LOWER(vendor) = ?",
            (invoice_number, vendor.strip().lower())
        )
        duplicate = cursor.fetchone()
        conn.close()
        
        if duplicate:
            flags.append("DUPLICATE")
            triggered_weights += 0.40
            dup_date = duplicate["invoice_date"] or "unknown date"
            dup_amount = duplicate["total_amount"] or 0.0
            reasons.append(
                f"Invoice #{invoice_number} was previously submitted by {vendor} on {dup_date} for ${dup_amount:,.2f}"
            )
            
    # --- Rule 2: Missing VAT (weight 0.20) ---
    if (vat_amount is None or vat_amount == 0.0) and total_amount and total_amount > 100:
        # Check if vendor is exempt
        exempt = False
        if vendor:
            exempt = is_vendor_vat_exempt(vendor)
            
        if not exempt:
            flags.append("MISSING_VAT")
            triggered_weights += 0.20
            reasons.append(f"No VAT detected on invoice over $100 for vendor '{vendor or 'Unknown'}'")
            
    # --- Rule 3: Unusually large amount (weight 0.25) ---
    if total_amount is not None:
        vendor_history = []
        if vendor:
            vendor_history = get_vendor_history_amounts(vendor)
            
        if len(vendor_history) >= 3:
            mean = statistics.mean(vendor_history)
            std = statistics.stdev(vendor_history) if len(vendor_history) > 1 else 0.0
            
            if std > 0:
                threshold = mean + 2.5 * std
                if total_amount > threshold:
                    flags.append("LARGE_AMOUNT")
                    triggered_weights += 0.25
                    sigma = (total_amount - mean) / std
                    reasons.append(
                        f"Amount ${total_amount:,.2f} is {sigma:.1f}σ above vendor avg of ${mean:,.2f} ({len(vendor_history)} past invoices)"
                    )
            else:
                # Standard deviation is 0 (all previous invoices had identical amounts)
                if total_amount > mean:
                    flags.append("LARGE_AMOUNT")
                    triggered_weights += 0.25
                    reasons.append(
                        f"Amount ${total_amount:,.2f} exceeds typical fixed vendor amount of ${mean:,.2f} ({len(vendor_history)} past invoices)"
                    )
        else:
            # Fall back to global threshold if history < 3
            if total_amount > 50000:
                flags.append("LARGE_AMOUNT")
                triggered_weights += 0.25
                reasons.append(f"Amount ${total_amount:,.2f} exceeds global high-value threshold of $50,000.00")
                
    # --- Rule 4: Missing invoice date (weight 0.15) ---
    if not invoice_date:
        flags.append("MISSING_DATE")
        triggered_weights += 0.15
        reasons.append("Invoice date is missing or could not be parsed")
        
    # --- Rule 5: Suspiciously round number (weight 0.10) ---
    if total_amount and total_amount > 5000 and total_amount % 1000 == 0:
        flags.append("ROUND_AMOUNT")
        triggered_weights += 0.10
        reasons.append(f"Amount ${total_amount:,.2f} is suspiciously round for a high-value invoice")
        
    # --- Rule 6: VAT math mismatch (weight 0.20) ---
    if line_items and total_amount is not None:
        subtotal_sum = sum(item.get("subtotal") or 0.0 for item in line_items)
        expected_total = subtotal_sum + vat_amount
        if abs(expected_total - total_amount) > 0.50:
            flags.append("MATH_ERROR")
            triggered_weights += 0.20
            reasons.append(
                f"Subtotal ${subtotal_sum:,.2f} + VAT ${vat_amount:,.2f} = ${expected_total:,.2f} ≠ stated ${total_amount:,.2f}"
            )
            
    # Calculate risk score (max 1.0) and level
    risk_score = min(1.0, triggered_weights)
    risk_score = round(risk_score, 2)
    
    if risk_score < 0.30:
        risk_level = "Low"
    elif risk_score < 0.60:
        risk_level = "Medium"
    else:
        risk_level = "High"
        
    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "flags": flags,
        "reasons": reasons
    }
