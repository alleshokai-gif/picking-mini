const SPREADSHEET_ID = '1ZKoNHTX9t3MgtdC3JdHWT6sYDQM2aD9_lDuB3KZt6e4';
const SHEET_NAME = 'DrugMaster';
const HEADERS = [
  'id',
  'displayName',
  'genericName',
  'aliases',
  'location',
  'note',
  'imageUrl',
  'favorite',
  'createdAt',
  'updatedAt',
];
const SEARCH_LIMIT = 20;

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const params = getParams_(e);
    const action = params.action;

    if (method === 'GET' && action === 'search') {
      return jsonResponse_(true, searchDrugs_(params.q || ''), '');
    }

    if (method === 'GET' && action === 'detail') {
      return jsonResponse_(true, getDrugDetail_(params.id), '');
    }

    if (method === 'POST' && action === 'save') {
      return jsonResponse_(true, saveDrug_(params), '保存しました');
    }

    if (method === 'POST' && action === 'update') {
      return jsonResponse_(true, updateDrug_(params), '更新しました');
    }

    return jsonResponse_(false, null, 'Unknown action');
  } catch (error) {
    return jsonResponse_(false, null, error.message || String(error));
  }
}

function getParams_(e) {
  const params = Object.assign({}, e && e.parameter ? e.parameter : {});
  const contents = e && e.postData && e.postData.contents ? e.postData.contents : '';

  if (contents) {
    try {
      const body = JSON.parse(contents);
      return Object.assign(params, body);
    } catch (error) {
      // Form POSTs are already available in e.parameter.
    }
  }

  return params;
}

function jsonResponse_(success, data, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success, data, message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_SPREADSHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID is not configured');
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  const values = range.getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => values[index] === header);

  if (!hasHeaders) {
    range.setValues([HEADERS]);
  }
}

function readRecords_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .map((row, index) => ({
      rowNumber: index + 2,
      record: rowToRecord_(row),
      isBlank: row.every(value => value === ''),
    }))
    .filter(item => !item.isBlank)
    .map(item => ({
      rowNumber: item.rowNumber,
      record: item.record,
    }));
}

function rowToRecord_(row) {
  const record = {};

  HEADERS.forEach((header, index) => {
    record[header] = normalizeValue_(header, row[index]);
  });

  return record;
}

function normalizeValue_(header, value) {
  if (header === 'favorite') {
    return value === true || String(value).toLowerCase() === 'true';
  }

  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  return value == null ? '' : String(value);
}

function recordToRow_(record) {
  return HEADERS.map(header => {
    if (header === 'favorite') {
      return record.favorite === true || String(record.favorite).toLowerCase() === 'true';
    }

    return record[header] == null ? '' : record[header];
  });
}

function searchDrugs_(query) {
  const needle = String(query || '').trim().toLowerCase();
  const records = readRecords_().map(item => item.record);

  if (!needle) {
    return records.slice(0, SEARCH_LIMIT);
  }

  return records
    .filter(record => [
      record.displayName,
      record.genericName,
      record.aliases,
      record.location,
      record.note,
    ].join(' ').toLowerCase().indexOf(needle) !== -1)
    .slice(0, SEARCH_LIMIT);
}

function getDrugDetail_(id) {
  if (!id) {
    throw new Error('id is required');
  }

  const hit = readRecords_().find(item => item.record.id === id);

  if (!hit) {
    throw new Error('Drug not found');
  }

  return hit.record;
}

function saveDrug_(params) {
  const now = now_();
  const displayName = String(params.displayName || '').trim();

  if (!displayName) {
    throw new Error('displayName is required');
  }

  const record = {
    id: params.id || Utilities.getUuid(),
    displayName,
    genericName: params.genericName || '',
    aliases: params.aliases || '',
    location: params.location || '',
    note: params.note || '',
    imageUrl: params.imageUrl || '',
    favorite: params.favorite === true || String(params.favorite).toLowerCase() === 'true',
    createdAt: now,
    updatedAt: now,
  };

  const sheet = getSheet_();
  sheet.appendRow(recordToRow_(record));
  return record;
}

function updateDrug_(params) {
  const id = String(params.id || '').trim();

  if (!id) {
    throw new Error('id is required');
  }

  const sheet = getSheet_();
  const rows = readRecords_();
  const hit = rows.find(item => item.record.id === id);

  if (!hit) {
    throw new Error('Drug not found');
  }

  const updated = Object.assign({}, hit.record, {
    displayName: params.displayName != null ? String(params.displayName).trim() : hit.record.displayName,
    genericName: params.genericName != null ? params.genericName : hit.record.genericName,
    aliases: params.aliases != null ? params.aliases : hit.record.aliases,
    location: params.location != null ? params.location : hit.record.location,
    note: params.note != null ? params.note : hit.record.note,
    imageUrl: params.imageUrl != null ? params.imageUrl : hit.record.imageUrl,
    favorite: params.favorite != null
      ? params.favorite === true || String(params.favorite).toLowerCase() === 'true'
      : hit.record.favorite,
    updatedAt: now_(),
  });

  if (!updated.displayName) {
    throw new Error('displayName is required');
  }

  sheet.getRange(hit.rowNumber, 1, 1, HEADERS.length).setValues([recordToRow_(updated)]);
  return updated;
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}
