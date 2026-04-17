const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
const SHEET_NAME = 'proofreading';
const SHARED_SECRET = 'YOUR_SHARED_SECRET';

const HEADERS = [
  'post_id',
  'site_name',
  'title',
  'post_status',
  'author',
  'categories',
  'tags',
  'updated_at',
  'preview_url',
  'edit_url',
  'excerpt',
  'content',
  'proofreading_status',
  'reviewed_content',
  'review_comment',
  'last_received_at',
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    if (SHARED_SECRET && payload.secret !== SHARED_SECRET) {
      return jsonResponse({ status: 'error', message: 'Unauthorized' }, 401);
    }

    if (!payload.post_id) {
      return jsonResponse({ status: 'error', message: 'Missing post_id' }, 400);
    }

    const sheet = getSheet();
    ensureHeaders(sheet);

    const rowIndex = findRowByPostId(sheet, String(payload.post_id));
    const currentValues = rowIndex > 0 ? sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0] : createEmptyRow();

    const nextValues = [
      String(payload.post_id || ''),
      String(payload.site_name || ''),
      String(payload.title || ''),
      String(payload.post_status || ''),
      String(payload.author || ''),
      toCell(payload.categories),
      toCell(payload.tags),
      String(payload.updated_at || ''),
      String(payload.preview_url || ''),
      String(payload.edit_url || ''),
      String(payload.excerpt || ''),
      String(payload.content || ''),
      currentValues[12] || 'pending',
      currentValues[13] || '',
      currentValues[14] || '',
      new Date().toISOString(),
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([nextValues]);
    } else {
      sheet.appendRow(nextValues);
    }

    return jsonResponse({ status: 'synced', post_id: payload.post_id });
  } catch (error) {
    return jsonResponse({ status: 'error', message: String(error) }, 500);
  }
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  return existing || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const headerValues = headerRange.getValues()[0];
  const hasHeaders = headerValues.some(Boolean);

  if (!hasHeaders) {
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function findRowByPostId(sheet, postId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return -1;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === postId) {
      return i + 2;
    }
  }

  return -1;
}

function createEmptyRow() {
  return new Array(HEADERS.length).fill('');
}

function toCell(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value || '');
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
