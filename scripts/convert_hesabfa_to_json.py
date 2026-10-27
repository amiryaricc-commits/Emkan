import argparse
import json
import math
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NAMESPACES = {"m": MAIN_NS, "r": REL_NS}


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        raise ValueError(f"Invalid cell reference: {reference}")
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def read_first_sheet(path):
    with zipfile.ZipFile(path) as workbook:
        members = set(workbook.namelist())
        shared_strings = []
        if "xl/sharedStrings.xml" in members:
            shared_root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//m:t", NAMESPACES))
                for item in shared_root.findall("m:si", NAMESPACES)
            ]

        workbook_root = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
        sheet = workbook_root.find("m:sheets/m:sheet", NAMESPACES)
        if sheet is None:
            raise ValueError(f"No worksheet found in {path.name}")
        relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
        relationship_root = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        target = next(
            relationship.attrib["Target"]
            for relationship in relationship_root.findall(f"{{{PKG_REL_NS}}}Relationship")
            if relationship.attrib["Id"] == relationship_id
        )
        sheet_path = posixpath.normpath(posixpath.join("xl", target))
        root = ElementTree.fromstring(workbook.read(sheet_path))
        rows = []
        for row in root.findall(".//m:sheetData/m:row", NAMESPACES):
            cells = {}
            for cell in row.findall("m:c", NAMESPACES):
                value = cell.find("m:v", NAMESPACES)
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    parsed = "".join(
                        text.text or "" for text in cell.findall(".//m:t", NAMESPACES)
                    )
                elif value is None:
                    parsed = ""
                elif cell_type == "s":
                    parsed = shared_strings[int(value.text)]
                else:
                    parsed = value.text or ""
                cells[column_index(cell.attrib["r"])] = parsed
            if cells:
                rows.append([cells.get(index, "") for index in range(max(cells) + 1)])

    if not rows:
        raise ValueError(f"No rows found in {path.name}")
    headers = [str(value).strip() for value in rows[0]]
    records = []
    for row in rows[1:]:
        records.append(
            {
                header: row[index] if index < len(row) else ""
                for index, header in enumerate(headers)
                if header
            }
        )
    return records


def normalize_str(value):
    s = str(value or "").strip()
    s = s.replace("ي", "ی").replace("ك", "ک")
    return s


def normalize_digits(value):
    s = normalize_str(value)
    for p, l in [('۰', '0'), ('۱', '1'), ('۲', '2'), ('۳', '3'), ('۴', '4'),
                 ('۵', '5'), ('۶', '6'), ('۷', '7'), ('۸', '8'), ('۹', '9'),
                 ('٠', '0'), ('١', '1'), ('٢', '2'), ('٣', '3'), ('٤', '4'),
                 ('٥', '5'), ('٦', '6'), ('٧', '7'), ('٨', '8'), ('٩', '9')]:
        s = s.replace(p, l)
    return s.replace(',', '').replace('،', '').replace(' ', '').strip()


def text(value):
    return normalize_str(value)


def get_field(row, *field_names):
    for f in field_names:
        norm_f = normalize_str(f)
        for k, v in row.items():
            if normalize_str(k) == norm_f:
                return v
    return ""


def amount(value, field_name):
    norm = normalize_digits(value)
    if not norm:
        return 0
    try:
        parsed = float(norm)
    except ValueError as error:
        raise ValueError(f"Invalid amount in {field_name}: {value}") from error
    if not math.isfinite(parsed):
        raise ValueError(f"Invalid amount in {field_name}: {value}")
    return int(parsed) if parsed.is_integer() else parsed


def category_for(source_category):
    category = normalize_str(source_category).casefold()
    if "جویس" in category or "سالت" in category or "جوس" in category:
        return "جویس و سالت"
    if "کویل" in category or "کارتریج" in category or "المنت" in category or "اتومایزر" in category or "پنبه" in category:
        return "کویل و کارتریج"
    if (
        "پاد" in category
        or "دیسپوزبل" in category
        or "دستگاه" in category
        or "ماد" in category
        or "کیت" in category
        or "hnb" in category
        or "سیگار" in category
        or "باتری" in category
    ):
        return "دستگاه پاد و ماد"
    if "باندل" in category or "پکیج" in category or "جعبه ابزار" in category:
        return "پکیج باندل"
    if "کامپیوتر" in category or "سخت‌افزار" in category or "آداپتور" in category:
        return "قطعات کامپیوتر و سخت‌افزار"
    if "کارت هدیه" in category or "خدمات" in category:
        return "کارت هدیه و خدمات"
    return "سایر کالاها"


def build_payload(contacts_path, products_path, invoices_path):
    contact_rows = read_first_sheet(contacts_path)
    product_rows = read_first_sheet(products_path)
    invoice_rows = read_first_sheet(invoices_path)

    contacts = []
    for row in contact_rows:
        source_code = text(get_field(row, "کد شخص"))
        full_name = text(get_field(row, "نام شخص"))
        if not source_code or not full_name:
            raise ValueError("A contact is missing its source code or name.")
        contacts.append(
            {
                "id": f"hesabfa-contact-{source_code}",
                "sourceCode": source_code,
                "fullName": full_name,
                "personType": text(get_field(row, "نوع")),
                "role": text(get_field(row, "نقش")),
                "phone": text(get_field(row, "شماره موبایل")),
                "notes": text(get_field(row, "توضیحات")),
            }
        )
    if len({contact["sourceCode"] for contact in contacts}) != len(contacts):
        raise ValueError("Duplicate contact codes found.")

    corrections = [
        "قیمت فروش، مانده و موجودی مطابق فایل‌های منبع حفظ شده‌اند؛ فاکتورهای تاریخی سند حسابداری یا گردش انبار ایجاد نمی‌کنند."
    ]
    products = []
    product_codes = set()
    for row in product_rows:
        sku = text(get_field(row, "کد کالا"))
        name = text(get_field(row, "عنوان کالا"))
        if not sku or not name or sku in product_codes:
            raise ValueError(f"Missing or duplicate product code: {sku}")
        product_codes.add(sku)
        source_category = text(get_field(row, "دسته‌بندی"))
        source_status = text(get_field(row, "وضعیت کالا"))
        raw_stock = amount(get_field(row, "موجودی اول دوره"), "موجودی کالا")
        if raw_stock < 0:
            corrections.append(f"موجودی منفی کالای «{name} ({sku})» ({raw_stock}) اصلاح و به صفر تنظیم گردید.")
            stock_qty = 0
        else:
            stock_qty = int(raw_stock)

        products.append(
            {
                "id": f"hesabfa-item-{sku}",
                "sku": sku,
                "name": name,
                "category": category_for(source_category),
                "brand": "",
                "uomPrimary": text(get_field(row, "واحد سنجش")) or "عدد",
                "stockQty": stock_qty,
                "reservedQty": 0,
                "reorderLevel": 0,
                "valuationRate": amount(get_field(row, "قیمت خرید پیش‌فرض"), "قیمت خرید پیش‌فرض"),
                "retailPrice": amount(get_field(row, "قیمت فروش"), "قیمت فروش"),
                "wholesalePrice": 0,
                "partnerPrice": 0,
                "serialNumbers": [],
                "batchNo": "",
                "expiryDate": "",
                "sourceCategory": source_category,
                "sourceStatus": source_status,
            }
        )

    sales_by_number = {}
    held_invoice_numbers = []
    for row in invoice_rows:
        invoice_number = text(get_field(row, "شماره فاکتور"))
        if not invoice_number:
            raise ValueError("An invoice is missing its invoice number.")
        sku = text(get_field(row, "کد کالا"))
        if sku not in product_codes:
            raise ValueError(f"Invoice {invoice_number} refers to unknown SKU {sku}.")
        line_amount = amount(get_field(row, "مبلغ کل (تومان)"), "مبلغ کل")
        paid = amount(get_field(row, "مبلغ پرداختی"), "مبلغ پرداختی")
        status = text(get_field(row, "وضعیت فاکتور"))
        qty = amount(get_field(row, "تعداد"), "تعداد")
        unit_price = amount(get_field(row, "قیمت واحد (تومان)"), "قیمت واحد")
        product_name = text(get_field(row, "عنوان کالا"))
        draft = status == "پیش‌نویس"

        if invoice_number in sales_by_number:
            existing = sales_by_number[invoice_number]
            line_idx = len(existing["lines"]) + 1
            existing["lines"].append(
                {
                    "id": f"hesabfa-line-{invoice_number}-{line_idx}",
                    "sku": sku,
                    "itemName": product_name,
                    "uom": "عدد",
                    "qty": qty,
                    "unitPrice": unit_price,
                    "discountPercent": 0,
                    "netLineAmount": line_amount,
                    "valuationRate": 0,
                }
            )
            existing["totalAmount"] += line_amount
            existing["paidAmount"] = max(existing["paidAmount"], paid)
            if product_name and product_name not in existing["itemsSummary"]:
                existing["itemsSummary"] += f"، {product_name}"
            if not draft:
                existing["status"] = (
                    "پرداخت‌شده"
                    if existing["paidAmount"] >= existing["totalAmount"]
                    else "معوق"
                    if existing["paidAmount"] == 0
                    else "اقساطی فعال"
                )
        else:
            normalized_status = (
                "پیش‌نویس"
                if draft
                else "پرداخت‌شده"
                if paid >= line_amount
                else "معوق"
                if paid == 0
                else "اقساطی فعال"
            )
            sales_by_number[invoice_number] = {
                "id": f"hesabfa-invoice-{invoice_number}",
                "invoiceNo": invoice_number,
                "docstatus": 0 if draft else 1,
                "isHistoricalArchive": True,
                "archiveNote": "بایگانی تاریخی حسابفا؛ بدون اثر بر دفتر کل، دریافت، برگشت یا موجودی.",
                "sourceStatus": status,
                "customerName": text(get_field(row, "نام مشتری")),
                "date": text(get_field(row, "تاریخ فاکتور")),
                "dueDate": "",
                "branchDimension": "تعیین‌نشده",
                "channelDimension": "بایگانی تاریخی حسابفا",
                "paymentTermsTemplate": "داده‌ی تاریخی",
                "updateStock": False,
                "isSubscription": False,
                "status": normalized_status,
                "totalAmount": line_amount,
                "paidAmount": paid,
                "cogsAmount": 0,
                "itemsSummary": product_name,
                "lines": [
                    {
                        "id": f"hesabfa-line-{invoice_number}-1",
                        "sku": sku,
                        "itemName": product_name,
                        "uom": "عدد",
                        "qty": qty,
                        "unitPrice": unit_price,
                        "discountPercent": 0,
                        "netLineAmount": line_amount,
                        "valuationRate": 0,
                    }
                ],
            }

    invoices = list(sales_by_number.values())
    return {
        "schemaVersion": 1,
        "inventoryBasis": "current_snapshot",
        "salesInvoiceMode": "archive_only",
        "contacts": contacts,
        "products": products,
        "salesInvoices": invoices,
        "heldInvoiceNumbers": held_invoice_numbers,
        "corrections": corrections,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Convert the three Hesabfa Excel exports to FaraPay's reviewed JSON import format."
    )
    parser.add_argument("--contacts", type=Path, required=True)
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--invoices", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    payload = build_payload(args.contacts, args.products, args.invoices)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Validated {len(payload['contacts'])} contacts, "
        f"{len(payload['products'])} products, "
        f"{len(payload['salesInvoices'])} invoices; "
        f"held {', '.join(payload['heldInvoiceNumbers'])}."
    )


if __name__ == "__main__":
    main()
