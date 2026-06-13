import os
import io
import pytest
import json
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from app import app
import db

FIXTURE_DIR = "tests/fixtures"

def create_pdf(filename, vendor, inv_num, date_str, total, vat, items):
    os.makedirs(FIXTURE_DIR, exist_ok=True)
    filepath = os.path.join(FIXTURE_DIR, filename)
    
    c = canvas.Canvas(filepath, pagesize=letter)
    # Simple, clear structure for OCR
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, "INVOICE")
    
    c.setFont("Helvetica", 10)
    c.drawString(100, 720, f"Vendor: {vendor}")
    c.drawString(100, 700, f"Invoice #: {inv_num}")
    c.drawString(100, 680, f"Invoice Date: {date_str}")
    
    y = 620
    c.setFont("Helvetica-Bold", 10)
    c.drawString(100, y, "Description")
    c.drawString(300, y, "Qty")
    c.drawString(350, y, "Price")
    c.drawString(450, y, "Subtotal")
    
    c.setFont("Helvetica", 10)
    for item in items:
        y -= 20
        c.drawString(100, y, item["description"])
        c.drawString(300, y, str(item["qty"]))
        c.drawString(350, y, f"${item['unit_price']:.2f}")
        c.drawString(450, y, f"${item['subtotal']:.2f}")
        
    y -= 40
    c.drawString(350, y, f"VAT / Tax: ${vat:.2f}")
    y -= 20
    c.setFont("Helvetica-Bold", 10)
    c.drawString(350, y, f"Total Amount: ${total:.2f}")
    
    c.save()
    return filepath

@pytest.fixture(scope="session", autouse=True)
def generate_fixtures():
    # 1. Normal invoice (expecting no anomaly flags)
    create_pdf(
        "fixture_normal.pdf",
        vendor="ACME Logistics",
        inv_num="INV-1001",
        date_str="2026-06-01",
        total=120.00,
        vat=20.00,
        items=[{"description": "Delivery Charge", "qty": 1, "unit_price": 100.00, "subtotal": 100.00}]
    )
    
    # 2. Duplicate invoice (run twice, should flag DUPLICATE)
    create_pdf(
        "fixture_duplicate.pdf",
        vendor="ACME Logistics",
        inv_num="INV-1001",
        date_str="2026-06-01",
        total=120.00,
        vat=20.00,
        items=[{"description": "Delivery Charge", "qty": 1, "unit_price": 100.00, "subtotal": 100.00}]
    )

    # 3. Missing VAT invoice (total > 100, no VAT)
    create_pdf(
        "fixture_missing_vat.pdf",
        vendor="Deluxe Consulting",
        inv_num="INV-1002",
        date_str="2026-06-02",
        total=250.00,
        vat=0.00,
        items=[{"description": "Consulting Services", "qty": 1, "unit_price": 250.00, "subtotal": 250.00}]
    )

    # 4. Large amount (total > 50000 global threshold)
    create_pdf(
        "fixture_large_amount.pdf",
        vendor="Heavy Machinery Ltd",
        inv_num="INV-1003",
        date_str="2026-06-03",
        total=75200.00,
        vat=12200.00,
        items=[{"description": "Excavator Rental", "qty": 1, "unit_price": 63000.00, "subtotal": 63000.00}]
    )

    # 5. Math error (total != subtotal + VAT)
    create_pdf(
        "fixture_math_error.pdf",
        vendor="Office Supplies Inc",
        inv_num="INV-1004",
        date_str="2026-06-04",
        total=500.00,
        vat=20.00,
        items=[{"description": "Office Chairs", "qty": 2, "unit_price": 100.00, "subtotal": 200.00}]
    )
    
    yield
    
    # Clean up generated files
    for f in os.listdir(FIXTURE_DIR):
        os.remove(os.path.join(FIXTURE_DIR, f))
    os.rmdir(FIXTURE_DIR)

@pytest.fixture
def client():
    # Force mock database configuration
    db.DB_PATH = "data/test_invoiceai.db"
    if os.path.exists(db.DB_PATH):
        os.remove(db.DB_PATH)
    
    db.init_db()
    app.config["TESTING"] = True
    
    with app.test_client() as test_client:
        yield test_client
        
    if os.path.exists(db.DB_PATH):
        os.remove(db.DB_PATH)

def test_pipeline_normal(client):
    filepath = os.path.join(FIXTURE_DIR, "fixture_normal.pdf")
    with open(filepath, "rb") as f:
        data = {
            "file": (f, "fixture_normal.pdf")
        }
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert response.status_code == 200
        res_json = response.json
        assert res_json["vendor"] == "ACME Logistics"
        assert res_json["invoice_number"] == "INV-1001"
        assert res_json["total_amount"] == 120.00
        assert res_json["vat_amount"] == 20.00
        assert "DUPLICATE" not in res_json["flags"]
        assert "MISSING_VAT" not in res_json["flags"]
        assert res_json["risk_score"] == 0.0

def test_pipeline_duplicate(client):
    filepath = os.path.join(FIXTURE_DIR, "fixture_duplicate.pdf")
    
    # Upload first time (seeds the db)
    with open(filepath, "rb") as f:
        client.post("/api/upload", data={"file": (f, "fixture_duplicate.pdf")}, content_type="multipart/form-data")
        
    # Upload second time (should trigger duplicate anomaly)
    with open(filepath, "rb") as f:
        response = client.post("/api/upload", data={"file": (f, "fixture_duplicate.pdf")}, content_type="multipart/form-data")
        assert response.status_code == 200
        res_json = response.json
        assert "DUPLICATE" in res_json["flags"]
        assert res_json["risk_score"] >= 0.40

def test_pipeline_missing_vat(client):
    filepath = os.path.join(FIXTURE_DIR, "fixture_missing_vat.pdf")
    with open(filepath, "rb") as f:
        response = client.post("/api/upload", data={"file": (f, "fixture_missing_vat.pdf")}, content_type="multipart/form-data")
        assert response.status_code == 200
        res_json = response.json
        assert "MISSING_VAT" in res_json["flags"]
        assert res_json["risk_score"] >= 0.20

def test_pipeline_large_amount(client):
    filepath = os.path.join(FIXTURE_DIR, "fixture_large_amount.pdf")
    with open(filepath, "rb") as f:
        response = client.post("/api/upload", data={"file": (f, "fixture_large_amount.pdf")}, content_type="multipart/form-data")
        assert response.status_code == 200
        res_json = response.json
        assert "LARGE_AMOUNT" in res_json["flags"]
        assert res_json["risk_score"] >= 0.25

def test_pipeline_math_error(client):
    filepath = os.path.join(FIXTURE_DIR, "fixture_math_error.pdf")
    with open(filepath, "rb") as f:
        response = client.post("/api/upload", data={"file": (f, "fixture_math_error.pdf")}, content_type="multipart/form-data")
        assert response.status_code == 200
        res_json = response.json
        assert "MATH_ERROR" in res_json["flags"]
        assert res_json["risk_score"] >= 0.20
