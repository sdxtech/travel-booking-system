"""Validate browser-generated XLSX files using independent ZIP/XML readers.

Run with Python and Node installed; no third-party test dependencies are needed.
"""
import base64
import io
import json
from pathlib import Path
import subprocess
import unittest
import xml.etree.ElementTree as ET
import zipfile


class ExcelExportTests(unittest.TestCase):
    def workbook(self, headers, rows, name='History'):
        module = (Path(__file__).resolve().parents[1] / 'src/utils/excelExport.js').as_uri()
        script = f'''import {{ createExcelWorkbook }} from {json.dumps(module)};
const bytes = createExcelWorkbook({json.dumps(headers)}, {json.dumps(rows)}, {json.dumps(name)});
console.log(Buffer.from(bytes).toString('base64'));'''
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, check=True, text=True)
        return zipfile.ZipFile(io.BytesIO(base64.b64decode(result.stdout)))

    def test_archive_crc_relationships_and_xml_are_valid(self):
        with self.workbook(['No', 'Name'], [[1, 'Test']], 'Driver History') as archive:
            self.assertIsNone(archive.testzip())
            for path in archive.namelist():
                ET.fromstring(archive.read(path))
            workbook = ET.fromstring(archive.read('xl/workbook.xml'))
            self.assertEqual(next(node for node in workbook.iter() if node.tag.endswith('}sheet')).get('name'), 'Driver History')
            content_types = archive.read('[Content_Types].xml').decode()
            self.assertIn('spreadsheetml.sheet.main+xml', content_types)
            rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
            for rel in rels:
                self.assertIn('xl/' + rel.get('Target'), archive.namelist())

    def test_values_preserve_zero_leading_zeros_unicode_and_formula_like_text(self):
        headers = ['Zero', 'Phone', 'NIK', 'Text', 'Formula-like', 'Blank', 'Distance']
        values = [0, '0812345', '001234567890123456789', 'A & B <Site> 日本 🚗\x00', '=1+1', None, 27.5]
        with self.workbook(headers, [values]) as archive:
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            cells = sheet.findall('s:sheetData/s:row', ns)[1].findall('s:c', ns)
            self.assertEqual(cells[0].find('s:v', ns).text, '0')
            self.assertEqual(cells[1].get('t'), 'inlineStr')
            self.assertEqual(cells[1].find('s:is/s:t', ns).text, values[1])
            self.assertEqual(cells[2].find('s:is/s:t', ns).text, values[2])
            self.assertEqual(cells[3].find('s:is/s:t', ns).text, values[3].replace('\x00', ''))
            self.assertEqual(cells[4].find('s:is/s:t', ns).text, '=1+1')
            self.assertFalse(sheet.findall('.//s:f', ns))
            self.assertEqual(cells[6].get('t'), 'n')
            self.assertEqual(cells[6].find('s:v', ns).text, '27.5')

    def test_history_width_order_and_empty_export(self):
        headers = [f'Column {i}' for i in range(27)]
        rows = [[str(i) for i in range(27)], [str(i + 27) for i in range(27)]]
        with self.workbook(headers, rows) as archive:
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            self.assertEqual(sheet.find('s:dimension', ns).get('ref'), 'A1:AA3')
            self.assertEqual(sheet.find('s:autoFilter', ns).get('ref'), 'A1:AA3')
            self.assertEqual(sheet.find('.//s:pane', ns).get('state'), 'frozen')
            last_row = sheet.findall('s:sheetData/s:row', ns)[-1]
            self.assertEqual(last_row[-1].get('r'), 'AA3')
            self.assertEqual(last_row[-1].find('s:is/s:t', ns).text, '53')
        with self.workbook(['No'], []) as archive:
            self.assertIsNone(archive.testzip())


if __name__ == '__main__':
    unittest.main()
