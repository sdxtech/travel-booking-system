// Small OOXML workbook writer: inline strings and an uncompressed ZIP container.
// Text is always stored as text, including phone/NIK leading zeros and formula-like input.
const encoder = new TextEncoder()
const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const xml = (value) => Array.from(String(value ?? '')).filter((character) => {
  const code = character.codePointAt(0)
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000
}).join('')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

function columnName(index) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
  return name
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(entries) {
  const localParts = []
  const directory = []
  let offset = 0
  let directorySize = 0
  for (const [path, text] of Object.entries(entries)) {
    const name = encoder.encode(path)
    const data = encoder.encode(text)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x800, true)
    header.setUint16(12, 33, true) // 1980-01-01, the ZIP epoch.
    header.setUint32(14, crc, true)
    header.setUint32(18, data.length, true)
    header.setUint32(22, data.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    localParts.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const record = new DataView(central.buffer)
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(8, 0x800, true)
    record.setUint16(14, 33, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, data.length, true)
    record.setUint32(24, data.length, true)
    record.setUint16(28, name.length, true)
    record.setUint32(42, offset, true)
    central.set(name, 46)
    directory.push(central)
    offset += local.length + data.length
    directorySize += central.length
  }
  const end = new Uint8Array(22)
  const endRecord = new DataView(end.buffer)
  endRecord.setUint32(0, 0x06054b50, true)
  endRecord.setUint16(8, directory.length, true)
  endRecord.setUint16(10, directory.length, true)
  endRecord.setUint32(12, directorySize, true)
  endRecord.setUint32(16, offset, true)
  const result = new Uint8Array(offset + directorySize + end.length)
  let position = 0
  for (const part of [...localParts, ...directory, end]) {
    result.set(part, position)
    position += part.length
  }
  return result
}

export function createExcelWorkbook(headers, rows, sheetName = 'History') {
  if (!headers.length || headers.length > 16384 || rows.length > 1048575) throw new Error('Export exceeds Excel worksheet limits.')
  const name = sheetName.replace(/[\\/*?:[\]]/g, ' ').replace(/^'+|'+$/g, '').slice(0, 31) || 'History'
  const range = `A1:${columnName(headers.length - 1)}${rows.length + 1}`
  const sheetRows = [headers, ...rows].map((row, rowIndex) => {
    if (row.length !== headers.length) throw new Error('Export row does not match its column headings.')
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`
      const style = rowIndex === 0 ? 1 : 0
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`
      return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? '').slice(0, 32767))}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="30" customHeight="1"' : ''}>${cells}</row>`
  }).join('')
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zip({
    '[Content_Types].xml': `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${declaration}<workbook xmlns="${spreadsheetNs}" xmlns:r="${relationshipNs}"><sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relationshipNs}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${declaration}<styleSheet xmlns="${spreadsheetNs}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E2B67"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${declaration}<worksheet xmlns="${spreadsheetNs}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="6" customWidth="1"/>${headers.length > 1 ? `<col min="2" max="${headers.length}" width="22" customWidth="1"/>` : ''}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="${range}"/></worksheet>`,
  })
}

export function downloadExcel(headers, rows, filename, sheetName) {
  const bytes = createExcelWorkbook(headers, rows, sheetName)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/\.(?:xlsx|xls)$/i, '') + '.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
