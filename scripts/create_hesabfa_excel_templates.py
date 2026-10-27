#!/usr/bin/env python3
"""Create example Hesabfa Excel exports accepted by convert_hesabfa_to_json.py."""

from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "templates"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
ElementTree.register_namespace("", MAIN_NS)
ElementTree.register_namespace("r", REL_NS)


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def build_workbook(path: Path, headers: list[str], example: list[str | int]) -> None:
    workbook = ElementTree.Element(f"{{{MAIN_NS}}}workbook")
    sheets = ElementTree.SubElement(workbook, f"{{{MAIN_NS}}}sheets")
    ElementTree.SubElement(
        sheets,
        f"{{{MAIN_NS}}}sheet",
        {"name": "اطلاعات", "sheetId": "1", f"{{{REL_NS}}}id": "rId1"},
    )

    worksheet = ElementTree.Element(f"{{{MAIN_NS}}}worksheet")
    ElementTree.SubElement(
        worksheet,
        f"{{{MAIN_NS}}}sheetViews",
    )
    sheet_view = ElementTree.SubElement(
        worksheet.find(f"{{{MAIN_NS}}}sheetViews"),
        f"{{{MAIN_NS}}}sheetView",
        {"workbookViewId": "0", "rightToLeft": "1"},
    )
    ElementTree.SubElement(
        sheet_view,
        f"{{{MAIN_NS}}}pane",
        {"ySplit": "1", "topLeftCell": "A2", "activePane": "bottomLeft", "state": "frozen"},
    )
    sheet_data = ElementTree.SubElement(worksheet, f"{{{MAIN_NS}}}sheetData")
    for row_number, values in enumerate((headers, example), start=1):
        row = ElementTree.SubElement(sheet_data, f"{{{MAIN_NS}}}row", {"r": str(row_number)})
        for column, value in enumerate(values, start=1):
            cell = ElementTree.SubElement(
                row,
                f"{{{MAIN_NS}}}c",
                {"r": f"{column_name(column)}{row_number}"},
            )
            if isinstance(value, int):
                ElementTree.SubElement(cell, f"{{{MAIN_NS}}}v").text = str(value)
            else:
                cell.set("t", "inlineStr")
                inline = ElementTree.SubElement(cell, f"{{{MAIN_NS}}}is")
                ElementTree.SubElement(inline, f"{{{MAIN_NS}}}t").text = value
    ElementTree.SubElement(
        worksheet,
        f"{{{MAIN_NS}}}autoFilter",
        {"ref": f"A1:{column_name(len(headers))}2"},
    )

    content_types = ElementTree.Element(f"{{{CONTENT_NS}}}Types")
    ElementTree.SubElement(
        content_types,
        f"{{{CONTENT_NS}}}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ElementTree.SubElement(
        content_types,
        f"{{{CONTENT_NS}}}Default",
        {"Extension": "xml", "ContentType": "application/xml"},
    )
    ElementTree.SubElement(
        content_types,
        f"{{{CONTENT_NS}}}Override",
        {"PartName": "/xl/workbook.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"},
    )
    ElementTree.SubElement(
        content_types,
        f"{{{CONTENT_NS}}}Override",
        {"PartName": "/xl/worksheets/sheet1.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"},
    )
    relationships = ElementTree.Element(f"{{{PKG_REL_NS}}}Relationships")
    ElementTree.SubElement(
        relationships,
        f"{{{PKG_REL_NS}}}Relationship",
        {"Id": "rId1", "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "Target": "xl/workbook.xml"},
    )
    workbook_relationships = ElementTree.Element(f"{{{PKG_REL_NS}}}Relationships")
    ElementTree.SubElement(
        workbook_relationships,
        f"{{{PKG_REL_NS}}}Relationship",
        {"Id": "rId1", "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", "Target": "worksheets/sheet1.xml"},
    )
    with ZipFile(path, "w", ZIP_DEFLATED) as workbook_file:
        workbook_file.writestr("[Content_Types].xml", ElementTree.tostring(content_types, encoding="utf-8", xml_declaration=True))
        workbook_file.writestr("_rels/.rels", ElementTree.tostring(relationships, encoding="utf-8", xml_declaration=True))
        workbook_file.writestr("xl/workbook.xml", ElementTree.tostring(workbook, encoding="utf-8", xml_declaration=True))
        workbook_file.writestr("xl/_rels/workbook.xml.rels", ElementTree.tostring(workbook_relationships, encoding="utf-8", xml_declaration=True))
        workbook_file.writestr("xl/worksheets/sheet1.xml", ElementTree.tostring(worksheet, encoding="utf-8", xml_declaration=True))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    templates = {
        "1_Hesabfa_Contacts_Sample.xlsx": (
            ["کد شخص", "نام شخص", "نوع", "نقش", "شماره موبایل", "توضیحات"],
            ["DEMO-C-001", "مشتری نمونه", "حقیقی", "مشتری", "09120000000", "ردیف نمونه؛ پیش از ورود حذف شود"],
        ),
        "2_Hesabfa_Products_Sample.xlsx": (
            ["کد کالا", "نام در فاکتور (تگ والد)", "طعم / مشخصه جزئیات", "عنوان کالا", "دسته‌بندی", "وضعیت کالا", "موجودی اول دوره", "واحد سنجش", "قیمت خرید پیش‌فرض", "قیمت فروش"],
            ["DEMO-P-001", "سالت ویگاد ۳۰ میل", "انبه یخ ۲۵ میل", "سالت ویگاد ۳۰ میل — انبه یخ ۲۵ میل", "جویس و سالت", "آکبند", 10, "عدد", 100000, 150000],
        ),
        "3_Hesabfa_Sales_Invoices_Sample.xlsx": (
            ["شماره فاکتور", "کد کالا", "نام مشتری", "تاریخ فاکتور", "مبلغ کل (تومان)", "مبلغ پرداختی", "وضعیت فاکتور", "عنوان کالا", "تعداد", "قیمت واحد (تومان)"],
            ["DEMO-I-001", "DEMO-P-001", "مشتری نمونه", "۱۴۰۵/۰۷/۰۱", 300000, 300000, "تسویه‌شده", "کالای نمونه", 2, 150000],
        ),
    }
    for filename, (headers, example) in templates.items():
        build_workbook(OUTPUT_DIR / filename, headers, example)
        print(OUTPUT_DIR / filename)


if __name__ == "__main__":
    main()
