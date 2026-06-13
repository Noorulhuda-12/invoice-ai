import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", "data/invoiceai.db")

def get_db_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Invoices Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT,
        invoice_number TEXT,
        invoice_date TEXT,
        total_amount REAL,
        vat_amount REAL,
        raw_text TEXT,
        ocr_confidence REAL,
        extraction_method TEXT,
        risk_score REAL,
        risk_level TEXT,
        flags TEXT, -- JSON array of flags
        reasons TEXT, -- JSON array of reasons
        invoice_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Line Items Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS line_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        description TEXT,
        qty REAL,
        unit_price REAL,
        subtotal REAL,
        FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
    )
    """)
    
    # 3. Vendor Memory Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendor_memory (
        vendor TEXT PRIMARY KEY,
        invoice_count INTEGER DEFAULT 0,
        avg_amount REAL DEFAULT 0.0,
        typical_vat_rate REAL DEFAULT 0.0,
        last_seen TEXT
    )
    """)
    
    # 4. VAT Exempt Vendors Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vat_exempt_vendors (
        vendor TEXT PRIMARY KEY
    )
    """)
    
    # Seed default VAT exempt vendors if empty
    cursor.execute("SELECT COUNT(*) FROM vat_exempt_vendors")
    if cursor.fetchone()[0] == 0:
        default_exempt = [
            ("google",), ("aws",), ("amazon web services",), 
            ("github",), ("vercel",), ("railway",), ("stripe",)
        ]
        cursor.executemany("INSERT INTO vat_exempt_vendors (vendor) VALUES (?)", default_exempt)
    
    conn.commit()
    conn.close()

def save_invoice(invoice_data, line_items, risk_data, invoice_type):
    """
    Saves an invoice, its line items, updates vendor memory, and commits everything in a single transaction.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Save invoice
        cursor.execute("""
        INSERT INTO invoices (
            vendor, invoice_number, invoice_date, total_amount, vat_amount, 
            raw_text, ocr_confidence, extraction_method, risk_score, risk_level, 
            flags, reasons, invoice_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            invoice_data.get("vendor"),
            invoice_data.get("invoice_number"),
            invoice_data.get("invoice_date"),
            invoice_data.get("total_amount"),
            invoice_data.get("vat_amount"),
            invoice_data.get("raw_text"),
            invoice_data.get("ocr_confidence", 0.0),
            invoice_data.get("extraction_method"),
            risk_data.get("risk_score", 0.0),
            risk_data.get("risk_level", "Low"),
            json.dumps(risk_data.get("flags", [])),
            json.dumps(risk_data.get("reasons", [])),
            invoice_type
        ))
        invoice_id = cursor.lastrowid
        
        # Save line items
        for item in line_items:
            cursor.execute("""
            INSERT INTO line_items (invoice_id, description, qty, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?)
            """, (
                invoice_id,
                item.get("description"),
                item.get("qty"),
                item.get("unit_price"),
                item.get("subtotal")
            ))
            
        # Update vendor memory
        vendor = invoice_data.get("vendor")
        if vendor:
            vendor_clean = vendor.strip().lower()
            # Calculate VAT rate if applicable
            current_vat_rate = 0.0
            total = invoice_data.get("total_amount")
            vat = invoice_data.get("vat_amount")
            if total and vat and total > 0:
                # Approximate VAT percentage
                current_vat_rate = round((vat / (total - vat)) * 100, 2) if (total - vat) > 0 else 0.0
                
            # Get existing vendor stats
            cursor.execute("SELECT * FROM vendor_memory WHERE LOWER(vendor) = ?", (vendor_clean,))
            row = cursor.fetchone()
            
            if row:
                count = row["invoice_count"] + 1
                # Cumulative moving average
                new_avg = round(((row["avg_amount"] * row["invoice_count"]) + (total or 0.0)) / count, 2)
                # Simple average for VAT rate if current_vat_rate is non-zero
                new_vat_rate = row["typical_vat_rate"]
                if current_vat_rate > 0:
                    new_vat_rate = round(((row["typical_vat_rate"] * row["invoice_count"]) + current_vat_rate) / count, 2)
                
                cursor.execute("""
                UPDATE vendor_memory 
                SET invoice_count = ?, avg_amount = ?, typical_vat_rate = ?, last_seen = ?, vendor = ?
                WHERE LOWER(vendor) = ?
                """, (count, new_avg, new_vat_rate, invoice_data.get("invoice_date") or datetime.now().strftime("%Y-%m-%d"), vendor, vendor_clean))
            else:
                cursor.execute("""
                INSERT INTO vendor_memory (vendor, invoice_count, avg_amount, typical_vat_rate, last_seen)
                VALUES (?, 1, ?, ?, ?)
                """, (
                    vendor,
                    round(total or 0.0, 2),
                    current_vat_rate,
                    invoice_data.get("invoice_date") or datetime.now().strftime("%Y-%m-%d")
                ))
                
        conn.commit()
        return invoice_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_vendor_stats(vendor_name):
    if not vendor_name:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM vendor_memory WHERE LOWER(vendor) = ?", (vendor_name.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            "vendor": row["vendor"],
            "invoice_count": row["invoice_count"],
            "avg_amount": row["avg_amount"],
            "typical_vat_rate": row["typical_vat_rate"],
            "last_seen": row["last_seen"]
        }
    return None

def get_vendor_invoices(vendor_name):
    if not vendor_name:
        return []
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM invoices 
    WHERE LOWER(vendor) = ? 
    ORDER BY invoice_date DESC, created_at DESC
    """, (vendor_name.strip().lower(),))
    rows = cursor.fetchall()
    conn.close()
    
    invoices = []
    for row in rows:
        invoices.append({
            "id": row["id"],
            "vendor": row["vendor"],
            "invoice_number": row["invoice_number"],
            "invoice_date": row["invoice_date"],
            "total_amount": row["total_amount"],
            "vat_amount": row["vat_amount"],
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "flags": json.loads(row["flags"]) if row["flags"] else [],
            "reasons": json.loads(row["reasons"]) if row["reasons"] else [],
            "invoice_type": row["invoice_type"]
        })
    return invoices

def get_invoice_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM invoices ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    history = []
    for row in rows:
        history.append({
            "id": row["id"],
            "vendor": row["vendor"],
            "invoice_number": row["invoice_number"],
            "invoice_date": row["invoice_date"],
            "total_amount": row["total_amount"],
            "vat_amount": row["vat_amount"],
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "invoice_type": row["invoice_type"]
        })
    return history

def get_vendor_history_amounts(vendor_name):
    """Returns a list of float total_amounts for the vendor to compute anomaly stats."""
    if not vendor_name:
        return []
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT total_amount FROM invoices WHERE LOWER(vendor) = ?", (vendor_name.strip().lower(),))
    rows = cursor.fetchall()
    conn.close()
    return [row["total_amount"] for row in rows if row["total_amount"] is not None]

def is_vendor_vat_exempt(vendor_name):
    if not vendor_name:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM vat_exempt_vendors WHERE LOWER(vendor) = ?", (vendor_name.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    return row is not None
