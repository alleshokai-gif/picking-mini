const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw36dFBG28U-HpxZghaCarugA1TZ8XUn3G1qsWR4i_1zsNkCRWYoiBIRSbM5G__WDNU/exec';
const RECENT_STORAGE_KEY = 'pickingMiniRecent';
const MAX_RECENT = 20;
const SEARCH_DEBOUNCE_MS = 300;

const mockDrugs = [
  {
    id: 'demo-amlodipine',
    displayName: 'アムロジン錠5mg',
    genericName: 'アムロジピンベシル酸塩',
    aliases: 'ノルバスク,アムロジピン',
    location: '上1',
    note: '降圧薬の棚。規格違いに注意。',
    imageUrl: '',
    favorite: false,
    createdAt: '2026-07-07T00:00:00+09:00',
    updatedAt: '2026-07-07T00:00:00+09:00',
  },
  {
    id: 'demo-carisbamate',
    displayName: 'カロナール錠500',
    genericName: 'アセトアミノフェン',
    aliases: '解熱鎮痛,カロナール',
    location: '下2',
    note: '小児用とは別棚。',
    imageUrl: '',
    favorite: true,
    createdAt: '2026-07-07T00:00:00+09:00',
    updatedAt: '2026-07-07T00:00:00+09:00',
  },
];

const state = {
  currentQuery: '',
  currentDetail: null,
  lastSearchQuery: null,
  searchTimerId: null,
  searchRequestId: 0,
};

const elements = {
  searchForm: document.querySelector('#searchForm'),
  searchInput: document.querySelector('#searchInput'),
  searchLoading: document.querySelector('#searchLoading'),
  statusMessage: document.querySelector('#statusMessage'),
  suggestions: document.querySelector('#suggestions'),
  suggestionsList: document.querySelector('#suggestionsList'),
  suggestionsEmpty: document.querySelector('#suggestionsEmpty'),
  registerFromSuggestionButton: document.querySelector('#registerFromSuggestionButton'),
  recentSection: document.querySelector('#recentSection'),
  recentList: document.querySelector('#recentList'),
  clearRecentButton: document.querySelector('#clearRecentButton'),
  searchResultsSection: document.querySelector('#searchResultsSection'),
  searchResultsList: document.querySelector('#searchResultsList'),
  detailView: document.querySelector('#detailView'),
  editButton: document.querySelector('#editButton'),
  newButton: document.querySelector('#newButton'),
  drugForm: document.querySelector('#drugForm'),
  saveButton: document.querySelector('#saveButton'),
};

elements.searchForm.addEventListener('submit', event => {
  event.preventDefault();
  runSearch(elements.searchInput.value);
});

elements.searchInput.addEventListener('input', () => {
  queueSearch(elements.searchInput.value);
});

elements.registerFromSuggestionButton.addEventListener('click', () => {
  resetForm({ displayName: state.currentQuery });
  closeSuggestions();
  document.querySelector('#displayName').focus();
});

elements.editButton.addEventListener('click', () => {
  if (state.currentDetail) {
    resetForm(state.currentDetail);
    document.querySelector('#displayName').focus();
  }
});

elements.newButton.addEventListener('click', () => {
  resetForm();
  document.querySelector('#displayName').focus();
});

elements.clearRecentButton.addEventListener('click', () => {
  localStorage.removeItem(RECENT_STORAGE_KEY);
  renderRecent();
});

elements.drugForm.addEventListener('submit', async event => {
  event.preventDefault();
  await saveForm();
});

renderRecent();
resetForm();

function queueSearch(query) {
  window.clearTimeout(state.searchTimerId);

  if (!query.trim()) {
    clearSearchResults();
    return;
  }

  state.searchTimerId = window.setTimeout(() => {
    runSearch(query);
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(query, options = {}) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    clearSearchResults();
    return;
  }

  if (!options.force && trimmedQuery === state.lastSearchQuery) {
    return;
  }

  state.currentQuery = trimmedQuery;
  state.lastSearchQuery = trimmedQuery;
  const requestId = ++state.searchRequestId;

  setRecentVisible(false);
  setSearchLoading(true);
  setStatus('');
  elements.suggestions.hidden = false;
  elements.suggestionsEmpty.hidden = true;
  elements.suggestionsList.innerHTML = '';

  try {
    const results = await fetchSearchCandidates(trimmedQuery);

    if (requestId !== state.searchRequestId) {
      return;
    }

    renderSuggestions(results, trimmedQuery);
    setStatus('');

    if (trimmedQuery && results.length === 0) {
      elements.suggestionsEmpty.hidden = false;
    }
  } catch (error) {
    if (requestId === state.searchRequestId) {
      setStatus(error.message);
    }
  } finally {
    if (requestId === state.searchRequestId) {
      setSearchLoading(false);
    }
  }
}

async function fetchSearchCandidates(query) {
  return apiGet('search', { q: query });
}

function clearSearchResults() {
  window.clearTimeout(state.searchTimerId);
  state.currentQuery = '';
  state.lastSearchQuery = null;
  state.searchRequestId += 1;
  closeSuggestions();
  setRecentVisible(true);
  setSearchLoading(false);
  setStatus('');
  renderRecent();
}

function closeSuggestions() {
  elements.suggestions.hidden = true;
  elements.suggestionsList.innerHTML = '';
  elements.suggestionsEmpty.hidden = true;
}

async function selectSuggestion(id) {
  await showDetail(id);
  closeSuggestions();
  elements.searchInput.blur();
}

async function showDetail(id) {
  setStatus('詳細を取得中...');

  try {
    const detail = await apiGet('detail', { id });
    state.currentDetail = detail;
    addRecent(detail);
    renderDetail(detail);
    renderRecent();
    setStatus('');
  } catch (error) {
    setStatus(error.message);
  }
}

async function saveForm() {
  const formData = new FormData(elements.drugForm);
  const payload = Object.fromEntries(formData.entries());
  payload.favorite = document.querySelector('#favorite').checked;

  const action = payload.id ? 'update' : 'save';
  setSaving(true);

  try {
    const saved = await apiPost(action, payload);
    state.currentDetail = saved;
    renderDetail(saved);
    addRecent(saved);
    renderRecent();
    resetForm(saved);
    setStatus(action === 'save' ? '保存しました' : '更新しました');

    if (state.currentQuery) {
      await runSearch(state.currentQuery, { force: true });
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    setSaving(false);
  }
}

async function apiGet(action, params) {
  if (!GAS_WEB_APP_URL) {
    return mockApi(action, params);
  }

  const url = new URL(GAS_WEB_APP_URL);
  url.searchParams.set('action', action);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  return parseApiResponse(response);
}

async function apiPost(action, payload) {
  if (!GAS_WEB_APP_URL) {
    return mockApi(action, payload);
  }

  const response = await fetch(`${GAS_WEB_APP_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  if (!response.ok) {
    throw new Error(`APIエラー: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || 'APIエラーが発生しました');
  }

  return result.data;
}

async function mockApi(action, params) {
  await new Promise(resolve => window.setTimeout(resolve, 120));

  if (action === 'search') {
    const q = String(params.q || '').toLowerCase();
    const hits = mockDrugs.filter(drug => {
      if (!q) {
        return true;
      }

      return [
        drug.displayName,
        drug.genericName,
        drug.aliases,
        drug.location,
        drug.note,
      ].join(' ').toLowerCase().includes(q);
    });

    return hits.slice(0, 20);
  }

  if (action === 'detail') {
    const drug = mockDrugs.find(item => item.id === params.id);

    if (!drug) {
      throw new Error('薬品が見つかりません');
    }

    return drug;
  }

  if (action === 'save') {
    const now = new Date().toISOString();
    const drug = {
      id: `local-${Date.now()}`,
      displayName: params.displayName,
      genericName: params.genericName || '',
      aliases: params.aliases || '',
      location: params.location || '',
      note: params.note || '',
      imageUrl: params.imageUrl || '',
      favorite: Boolean(params.favorite),
      createdAt: now,
      updatedAt: now,
    };
    mockDrugs.unshift(drug);
    return drug;
  }

  if (action === 'update') {
    const index = mockDrugs.findIndex(item => item.id === params.id);

    if (index === -1) {
      throw new Error('薬品が見つかりません');
    }

    mockDrugs[index] = {
      ...mockDrugs[index],
      ...params,
      favorite: Boolean(params.favorite),
      updatedAt: new Date().toISOString(),
    };
    return mockDrugs[index];
  }

  throw new Error('未対応の操作です');
}

function renderSuggestions(results, query = '') {
  elements.suggestions.hidden = false;
  elements.suggestionsList.innerHTML = '';
  elements.suggestionsEmpty.hidden = true;

  results.forEach(drug => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'suggestion-item';
    item.addEventListener('click', () => selectSuggestion(drug.id));

    const body = document.createElement('span');
    body.className = 'suggestion-body';
    const metaText = [drug.genericName, drug.aliases].filter(Boolean).join(' / ');
    body.append(
      highlightedEl('span', drug.location || '置き場所未設定', query, 'suggestion-location'),
      highlightedEl('strong', drug.displayName || '(名称未設定)', query, 'suggestion-name'),
      highlightedEl('span', metaText || '-', query, 'suggestion-meta'),
    );
    item.append(body);
    elements.suggestionsList.append(item);
  });
}

function renderDetail(drug) {
  elements.editButton.hidden = false;
  elements.detailView.className = 'detail-view';
  elements.detailView.innerHTML = '';

  const titleRow = document.createElement('div');
  titleRow.className = 'detail-title-row';
  titleRow.append(
    textEl('h3', drug.displayName || '(名称未設定)'),
    textEl('span', drug.location || '置き場所未設定', 'location-badge large'),
  );
  elements.detailView.append(titleRow);

  if (drug.imageUrl) {
    const image = document.createElement('img');
    image.className = 'detail-image';
    image.src = drug.imageUrl;
    image.alt = `${drug.displayName}の写真`;
    elements.detailView.append(image);
  }

  elements.detailView.append(
    detailRow('一般名', drug.genericName),
    detailRow('別名・略称', drug.aliases),
    detailRow('メモ', drug.note),
    detailRow('お気に入り', drug.favorite ? 'はい' : 'いいえ'),
    detailRow('更新日時', drug.updatedAt),
  );
}

function renderRecent() {
  const recent = getRecent();
  elements.recentList.innerHTML = '';

  if (recent.length === 0) {
    elements.recentList.append(textEl('p', 'まだありません。', 'empty-text'));
    return;
  }

  recent.forEach(drug => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-item';
    button.addEventListener('click', () => showDetail(drug.id));
    button.append(
      textEl('span', drug.displayName || '(名称未設定)'),
      textEl('strong', drug.location || '未設定'),
    );
    elements.recentList.append(button);
  });
}

function resetForm(drug = {}) {
  elements.drugForm.reset();
  document.querySelector('#drugId').value = drug.id || '';
  document.querySelector('#displayName').value = drug.displayName || '';
  document.querySelector('#genericName').value = drug.genericName || '';
  document.querySelector('#aliases').value = drug.aliases || '';
  document.querySelector('#location').value = drug.location || '';
  document.querySelector('#note').value = drug.note || '';
  document.querySelector('#imageUrl').value = drug.imageUrl || '';
  document.querySelector('#favorite').checked = Boolean(drug.favorite);
  elements.saveButton.textContent = drug.id ? '更新' : '保存';
}

function addRecent(drug) {
  const recent = getRecent().filter(item => item.id !== drug.id);
  recent.unshift({
    id: drug.id,
    displayName: drug.displayName,
    location: drug.location,
  });
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function detailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.append(textEl('dt', label), textEl('dd', value || '-'));
  return row;
}

function textEl(tagName, text, className = '') {
  const element = document.createElement(tagName);
  element.textContent = text;

  if (className) {
    element.className = className;
  }

  return element;
}

function labeledHighlightedEl(label, text, query, className = '') {
  const element = document.createElement('span');

  if (className) {
    element.className = className;
  }

  element.append(document.createTextNode(label));
  appendHighlightedText(element, text || '-', query);
  return element;
}

function highlightedEl(tagName, text, query, className = '') {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  appendHighlightedText(element, text, query);
  return element;
}

function appendHighlightedText(element, text, query) {
  const source = String(text || '');
  const needle = String(query || '').trim();

  if (!needle) {
    element.textContent = source;
    return;
  }

  const lowerSource = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let position = 0;

  while (position < source.length) {
    const index = lowerSource.indexOf(lowerNeedle, position);

    if (index === -1) {
      element.append(document.createTextNode(source.slice(position)));
      break;
    }

    if (index > position) {
      element.append(document.createTextNode(source.slice(position, index)));
    }

    const mark = document.createElement('mark');
    mark.textContent = source.slice(index, index + needle.length);
    element.append(mark);
    position = index + needle.length;
  }
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function setSearchLoading(isLoading) {
  elements.searchLoading.hidden = !isLoading;
}

function setRecentVisible(isVisible) {
  elements.recentSection.hidden = !isVisible;
}

function setSaving(isSaving) {
  elements.saveButton.disabled = isSaving;
  elements.saveButton.textContent = isSaving ? '保存中...' : (document.querySelector('#drugId').value ? '更新' : '保存');
}
