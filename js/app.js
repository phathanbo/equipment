// Main Application Logic for Hospital Equipment Management
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, collection, addDoc, getDocs, getDoc, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { firebaseConfig, defaultFields, isFirebaseConfigured } from './config.js';
import { parseQuickDate, parseNoidRange } from './utils.js';
import { initImportExport } from './importExport.js';

// Initialize Firebase with Long Polling support and Local Cache Persistence (saves read quota on F5 refresh)
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});
const equipCollection = collection(db, "hospital_equipments");
const configDocRef = doc(db, "settings", "field_configurations");

// State
let activeFields = getStoredFields();
let tempFields = [];
let currentData = getStoredData(); // Always load from local storage first (instant & 0 Reads!)
let pendingChanges = getStoredPendingChanges(); // Track IDs of items modified locally
let currentSortField = 'noid';
let currentSortAsc = true;
let editingId = null;

// Helpers to track pending changes in local storage
function getStoredPendingChanges() {
    try {
        const s = localStorage.getItem('pending_sync_ids');
        return s ? new Set(JSON.parse(s)) : new Set();
    } catch (e) {
        return new Set();
    }
}

function savePendingChanges() {
    try {
        localStorage.setItem('pending_sync_ids', JSON.stringify([...pendingChanges]));
        updateSyncBadge();
    } catch (e) {}
}

function markItemPending(id) {
    pendingChanges.add(id);
    savePendingChanges();
}

function updateSyncBadge() {
    const badge = document.getElementById('pendingSyncBadge');
    if (!badge) return;
    if (pendingChanges.size > 0) {
        badge.textContent = pendingChanges.size;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Helper to order fields according to defaultFields specification
function sortFieldsAccordingToDefault(fields) {
    const defaultOrder = defaultFields.map(d => d.key);
    return [...fields].sort((a, b) => {
        let idxA = defaultOrder.indexOf(a.key === 'money' ? 'tmoney' : a.key);
        let idxB = defaultOrder.indexOf(b.key === 'money' ? 'tmoney' : b.key);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });
}

// ===== FIELD STORAGE HELPERS =====
function getStoredFields() {
    const saved = localStorage.getItem('field_configurations');
    if (saved) {
        try {
            let parsed = JSON.parse(saved);
            let hasChanges = false;

            defaultFields.forEach(def => {
                let idx = parsed.findIndex(f => f.key === def.key || (def.key === 'tmoney' && f.key === 'money'));
                if (idx !== -1) {
                    if (def.key === 'tmoney' && parsed[idx].key === 'money') {
                        parsed[idx].key = 'tmoney';
                        hasChanges = true;
                    }
                    if (parsed[idx].required !== def.required) {
                        parsed[idx].required = def.required;
                        hasChanges = true;
                    }
                    if (def.type === 'select' || def.type === 'combo') {
                        if (parsed[idx].type !== def.type ||
                            !parsed[idx].options ||
                            JSON.stringify(parsed[idx].options) !== JSON.stringify(def.options) ||
                            parsed[idx].label !== def.label) {
                            parsed[idx].type = def.type;
                            parsed[idx].options = [...def.options];
                            parsed[idx].label = def.label;
                            parsed[idx].description = def.description;
                            hasChanges = true;
                        }
                    } else if (parsed[idx].label !== def.label) {
                        parsed[idx].label = def.label;
                        parsed[idx].description = def.description;
                        hasChanges = true;
                    }
                } else {
                    parsed.push({ ...def });
                    hasChanges = true;
                }
            });

            const sorted = sortFieldsAccordingToDefault(parsed);
            if (hasChanges || JSON.stringify(sorted.map(f => f.key)) !== JSON.stringify(parsed.map(f => f.key))) {
                localStorage.setItem('field_configurations', JSON.stringify(sorted));
            }
            return sorted;
        } catch (e) {
            return JSON.parse(JSON.stringify(defaultFields));
        }
    }
    return JSON.parse(JSON.stringify(defaultFields));
}

function getStoredData() {
    try {
        const saved = localStorage.getItem('hospital_equipments');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

// ===== RENDER DYNAMIC FORM =====
function renderForm() {
    const form = document.getElementById('equipmentForm');
    form.innerHTML = '';

    activeFields.forEach(f => {
        const wrapper = document.createElement('div');

        const labelContainer = document.createElement('div');
        labelContainer.className = "flex items-center gap-1 mb-1";

        const label = document.createElement('label');
        label.className = "block text-sm font-semibold text-gray-700";
        label.innerHTML = `${f.label} ${f.required ? '<span class="text-red-500 font-bold">*</span>' : ''}`;
        labelContainer.appendChild(label);

        if (f.description) {
            const infoSpan = document.createElement('span');
            infoSpan.className = "text-xs bg-gray-200 text-gray-600 rounded-full w-4 h-4 inline-flex items-center justify-center cursor-help";
            infoSpan.title = f.description;
            infoSpan.innerText = "?";
            labelContainer.appendChild(infoSpan);
        }

        wrapper.appendChild(labelContainer);

        let input;
        if (f.type === 'select') {
            input = document.createElement('select');
            input.className = "w-full border p-2 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none";

            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.innerText = f.required ? `-- เลือก${f.label} * --` : `-- เลือก${f.label} --`;
            input.appendChild(defaultOption);

            (f.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.innerText = opt;
                input.appendChild(option);
            });
        } else if (f.type === 'combo') {
            const datalistId = `dl_${f.key}`;
            input = document.createElement('input');
            input.type = 'text';
            input.setAttribute('list', datalistId);
            input.placeholder = f.required ? `พิมพ์หรือเลือก... *` : `พิมพ์หรือเลือก...`;
            input.className = "w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none";

            const datalist = document.createElement('datalist');
            datalist.id = datalistId;
            (f.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                datalist.appendChild(option);
            });
            wrapper.appendChild(datalist);
        } else {
            input = document.createElement('input');
            input.type = f.type || 'text';
            input.className = "w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none";
            if (f.type === 'number') input.step = "any";
        }

        input.id = f.key;
        if (f.required) input.required = true;

        if (f.description) {
            const descText = document.createElement('p');
            descText.className = "text-[11px] text-gray-400 mt-0.5";
            descText.innerText = f.description;
            wrapper.appendChild(input);
            wrapper.appendChild(descText);
        } else {
            wrapper.appendChild(input);
        }

        form.appendChild(wrapper);
    });

    attachNoidChecker();
    attachDateQuickInput();
}

// ===== DATE INPUT FORMATTER =====
function attachDateQuickInput() {
    const dateInput = document.getElementById('receiveTm');
    if (!dateInput) return;

    dateInput.addEventListener('blur', () => {
        const parsed = parseQuickDate(dateInput.value);
        if (parsed) dateInput.value = parsed;
    });

    dateInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const parsed = parseQuickDate(dateInput.value);
            if (parsed) dateInput.value = parsed;
        }
    });
}

// ===== NOID DUPLICATE CHECKER =====
function checkNoidDuplicate(value) {
    if (!value || value.trim() === '') return null;
    const normalized = value.trim().toLowerCase();
    const incomingRange = parseNoidRange(value);

    for (const item of currentData) {
        if (editingId && item.id === editingId) continue;
        const existingNoid = (item.noid || '').trim().toLowerCase();
        if (!existingNoid) continue;

        // Exact match
        if (existingNoid === normalized) return item;

        // If incoming value is a range (e.g. 12-17พห...), does it overlap existing item?
        if (incomingRange && incomingRange.expanded.some(en => en.toLowerCase() === existingNoid)) {
            return item;
        }

        // If existing item in DB is a range, does incoming value fall inside it?
        const existingRange = parseNoidRange(item.noid);
        if (existingRange && existingRange.expanded.some(en => en.toLowerCase() === normalized)) {
            return item;
        }
    }

    return null;
}

function attachNoidChecker() {
    const noidInput = document.getElementById('noid');
    if (!noidInput) return;

    let warnEl = document.getElementById('noid_dup_warn');
    if (!warnEl) {
        warnEl = document.createElement('div');
        warnEl.id = 'noid_dup_warn';
        warnEl.className = 'hidden mt-1 p-2 rounded text-xs font-semibold bg-red-50 border border-red-400 text-red-700';
        noidInput.parentNode.insertBefore(warnEl, noidInput.nextSibling);
    }

    noidInput.addEventListener('input', () => {
        const val = noidInput.value;
        const dup = checkNoidDuplicate(val);
        if (dup) {
            const dupName = dup.name || dup.noid || '(ไม่มีชื่อ)';
            const dupDiv  = dup.div  ? ` | แผนก: ${dup.div}`  : '';
            warnEl.innerHTML = `⚠️ รหัส <strong>"${val}"</strong> ซ้ำกับ: <strong>${dupName}</strong>${dupDiv}`;
            warnEl.classList.remove('hidden');
            noidInput.classList.add('border-red-500', 'ring-1', 'ring-red-400');
        } else {
            warnEl.classList.add('hidden');
            noidInput.classList.remove('border-red-500', 'ring-1', 'ring-red-400');
            if (val.trim() !== '') {
                noidInput.classList.add('border-green-500');
            } else {
                noidInput.classList.remove('border-green-500');
            }
        }
    });

    noidInput.addEventListener('change', () => {
        if (!noidInput.value.trim()) {
            noidInput.classList.remove('border-green-500', 'border-red-500', 'ring-1', 'ring-red-400');
        }
    });
}

// ===== TABLE SORTING & RENDERING =====
let searchQuery = '';
let selectedFilterDiv = '';
let selectedFilterType = '';
let mobileViewMode = 'card'; // 'card' or 'table'

// ฟังก์ชันเปรียบเทียบ Noid แบบอัจฉริยะ (แยกชุดรหัสตัวหลัง กับเลขลำดับเครื่องตัวหน้า)
// เช่น '20พห4110-001-0003' vs '21พห4110-001-0003' -> จัดกลุ่ม 'พห4110-001-0003' ให้อยู่ด้วยกัน แล้วเรียง 20, 21
function compareHospitalNoid(strA, strB) {
    const sA = String(strA || '').trim();
    const sB = String(strB || '').trim();
    if (!sA && !sB) return 0;
    if (!sA) return 1;
    if (!sB) return -1;

    // หาเลขลำดับหน้าสุด (ถ้ามี) เช่น "20" ใน "20พห4110-001-0003"
    const matchA = sA.match(/^(\d+)(.*)$/);
    const matchB = sB.match(/^(\d+)(.*)$/);

    if (matchA && matchB) {
        const prefixA = Number(matchA[1]);
        const suffixA = matchA[2];
        const prefixB = Number(matchB[1]);
        const suffixB = matchB[2];

        // ถ้าชุดรหัสตัวหลังเหมือนกัน ให้เปรียบเทียบเลขลำดับตัวหน้า (20, 21, 22...)
        if (suffixA && suffixB && suffixA === suffixB) {
            return prefixA - prefixB;
        }

        // ถ้าชุดรหัสตัวหลังต่างกัน ให้เรียงตามรหัสตัวหลังก่อน เพื่อให้เครื่องชนิดเดียวกันเกาะกลุ่มกัน
        if (suffixA && suffixB) {
            const cmpSuffix = suffixA.localeCompare(suffixB, 'th', { numeric: true, sensitivity: 'base' });
            if (cmpSuffix !== 0) return cmpSuffix;
            return prefixA - prefixB;
        }
    }

    return sA.localeCompare(sB, 'th', { numeric: true, sensitivity: 'base' });
}

// ===== POPULATE FILTER DROPDOWNS =====
function updateFilterDropdownOptions() {
    const divSelect = document.getElementById('filterDivSelect');
    const typeSelect = document.getElementById('filterTypeSelect');
    if (!divSelect || !typeSelect) return;

    // Collect unique Divs from activeFields and currentData
    const divSet = new Set();
    const divField = activeFields.find(f => f.key === 'div');
    if (divField && divField.options) {
        divField.options.forEach(opt => divSet.add(opt));
    }
    currentData.forEach(item => {
        if (item.div && String(item.div).trim()) divSet.add(String(item.div).trim());
    });

    // Collect unique Types from activeFields and currentData
    const typeSet = new Set();
    const typeField = activeFields.find(f => f.key === 'type');
    if (typeField && typeField.options) {
        typeField.options.forEach(opt => typeSet.add(opt));
    }
    currentData.forEach(item => {
        if (item.type && String(item.type).trim()) typeSet.add(String(item.type).trim());
    });

    // Populate Div options
    const curDiv = divSelect.value;
    divSelect.innerHTML = '<option value="">🏢 ทุกแผนก/กลุ่มงาน</option>' +
        [...divSet].sort((a, b) => a.localeCompare(b, 'th')).map(d => `<option value="${d}">${d}</option>`).join('');
    divSelect.value = curDiv;

    // Populate Type options
    const curType = typeSelect.value;
    typeSelect.innerHTML = '<option value="">🏷️ ทุกประเภท</option>' +
        [...typeSet].sort((a, b) => a.localeCompare(b, 'th')).map(t => `<option value="${t}">${t}</option>`).join('');
    typeSelect.value = curType;

    // Toggle reset filter button visibility
    const resetBtn = document.getElementById('resetFilterBtn');
    if (resetBtn) {
        if (selectedFilterDiv || selectedFilterType || searchQuery) {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('flex');
        } else {
            resetBtn.classList.add('hidden');
            resetBtn.classList.remove('flex');
        }
    }
}

// ===== TABLE SORTING & RENDERING =====
function getFilteredAndSortedData() {
    let list = [...currentData];

    // Filter by Div (แผนก)
    if (selectedFilterDiv) {
        list = list.filter(item => (item.div || '').trim() === selectedFilterDiv);
    }

    // Filter by Type (ประเภทครุภัณฑ์)
    if (selectedFilterType) {
        list = list.filter(item => (item.type || '').trim() === selectedFilterType);
    }

    // Filter by Search text
    if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        list = list.filter(item => {
            return Object.values(item).some(val => {
                if (val === null || val === undefined) return false;
                return String(val).toLowerCase().includes(q);
            });
        });
    }

    if (currentSortField) {
        list.sort((a, b) => {
            let valA = a[currentSortField] !== undefined ? a[currentSortField] : '';
            let valB = b[currentSortField] !== undefined ? b[currentSortField] : '';

            let cmp = 0;
            if (currentSortField === 'noid') {
                cmp = compareHospitalNoid(valA, valB);
                if (!currentSortAsc) cmp = -cmp;
            } else {
                const f = activeFields.find(field => field.key === currentSortField);
                if (f && f.type === 'number') {
                    const numA = Number(valA) || 0;
                    const numB = Number(valB) || 0;
                    cmp = currentSortAsc ? numA - numB : numB - numA;
                } else {
                    cmp = currentSortAsc 
                        ? String(valA).localeCompare(String(valB), 'th', { numeric: true, sensitivity: 'base' })
                        : String(valB).localeCompare(String(valA), 'th', { numeric: true, sensitivity: 'base' });
                }
            }

            // ถ้าค่าในฟิลด์หลักเหมือนกัน (cmp === 0) และไม่ใช่การเรียงตาม noid
            // ให้เรียงลำดับรอง (Secondary Sort) ตาม Noid แบบจัดกลุ่มให้อัตโนมัติ
            if (cmp === 0 && currentSortField !== 'noid') {
                return compareHospitalNoid(a.noid, b.noid);
            }

            return cmp;
        });
    }
    return list;
}

window.toggleSort = (fieldKey) => {
    if (currentSortField === fieldKey) {
        currentSortAsc = !currentSortAsc;
    } else {
        currentSortField = fieldKey;
        currentSortAsc = true;
    }
    renderTableHeader();
    renderDataViews();
};

// Column width state (with default sensible widths)
const columnWidths = {
    'noid': 130,
    'name': 220,
    'div': 160,
    'type': 150,
    'location': 150,
    'perUnit': 120,
    'receiveTm': 120
};

// Load saved column widths from localStorage
try {
    const savedWidths = localStorage.getItem('table_col_widths');
    if (savedWidths) Object.assign(columnWidths, JSON.parse(savedWidths));
} catch (e) {}

function renderTableHeader() {
    const thead = document.getElementById('tableHead');
    if (!thead) return;
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    tr.className = 'bg-gray-100 select-none';

    activeFields.forEach((f, colIdx) => {
        const isSorted = currentSortField === f.key;
        const arrow = isSorted ? (currentSortAsc ? ' 🔼' : ' 🔽') : ' ↕️';
        const sortClass = isSorted ? 'text-blue-700 bg-blue-50 font-bold' : 'hover:bg-gray-200';
        const customWidth = columnWidths[f.key] ? `${columnWidths[f.key]}px` : (f.key === 'name' ? '220px' : 'auto');

        const th = document.createElement('th');
        th.className = `resizable-th p-2.5 border font-semibold whitespace-nowrap cursor-pointer ${sortClass} transition-colors`;
        th.style.width = customWidth;
        th.style.minWidth = '80px';
        th.title = `คลิกเพื่อเรียงตาม ${f.label} (ลากขอบขวาเพื่อปรับขนาด)`;
        th.innerHTML = `
            <span class="truncate block pr-2">${f.label} ${f.required ? '<span class="text-red-500">*</span>' : ''}<span class="text-xs ml-1">${arrow}</span></span>
            <div class="resizer-handle" title="ลากเพื่อขยาย/ย่อคอลัมน์"></div>
        `;

        // Click sort on header (prevent when clicking resizer)
        th.addEventListener('click', (e) => {
            if (e.target.classList.contains('resizer-handle')) return;
            window.toggleSort(f.key);
        });

        // Drag to resize column
        const resizer = th.querySelector('.resizer-handle');
        if (resizer) {
            let startX = 0;
            let startWidth = 0;

            const onMouseMove = (e) => {
                const diff = e.clientX - startX;
                const newWidth = Math.max(70, startWidth + diff);
                th.style.width = `${newWidth}px`;
                columnWidths[f.key] = newWidth;
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = 'default';
                resizer.classList.remove('resizing');
                try {
                    localStorage.setItem('table_col_widths', JSON.stringify(columnWidths));
                } catch (e) {}
            };

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startWidth = th.offsetWidth;
                document.body.style.cursor = 'col-resize';
                resizer.classList.add('resizing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        tr.appendChild(th);
    });

    const manageTh = document.createElement('th');
    manageTh.className = 'p-2.5 border text-center whitespace-nowrap min-w-[160px]';
    manageTh.textContent = 'จัดการ';
    tr.appendChild(manageTh);

    thead.appendChild(tr);
}

function renderTableBody() {
    const displayList = getFilteredAndSortedData();
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${activeFields.length + 1}" class="p-8 text-center text-gray-400">
            ${searchQuery ? '🔍 ไม่พบข้อมูลที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการครุภัณฑ์ในระบบ'}
        </td></tr>`;
        return;
    }

    displayList.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = `hover:bg-blue-50/60 border-b cursor-pointer transition-colors duration-150 ${editingId === item.id ? 'bg-blue-100 font-medium' : ''}`;
        tr.title = "คลิกที่แถวเพื่อแก้ไขข้อมูล";
        
        tr.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            window.editItem(item.id);
        });

        let rowHtml = '';
        activeFields.forEach(f => {
            let val = item[f.key] !== undefined ? item[f.key] : (f.key === 'tmoney' && item['money'] !== undefined ? item['money'] : '');
            if (f.key === 'risk' && val) {
                const m = String(val).trim().match(/^[1-3]/);
                if (m) val = m[0];
            }
            const displayVal = f.type === 'number' && val !== '' ? Number(val).toLocaleString() : (val || '-');
            const cellClass = f.key === 'name' ? 'cell-name' : (f.key === 'location' ? 'cell-location' : (f.key === 'div' ? 'cell-div' : (f.key === 'type' ? 'cell-type' : '')));
            
            rowHtml += `<td class="p-2.5 border text-xs whitespace-nowrap ${cellClass}" title="${String(val || '')}">${displayVal}</td>`;
        });

        rowHtml += `
            <td class="p-2.5 border text-center whitespace-nowrap">
                <button onclick="event.stopPropagation(); window.spreadItem('${item.id}')" class="bg-amber-600 text-white px-2 py-1 rounded text-xs hover:bg-amber-700 mr-1 shadow-sm font-medium" title="กระจายข้อมูล (แยก Noid ที่เป็นช่วง เช่น 12-17 ออกเป็นหลายรายการ)">🔄 กระจาย</button>
                <button onclick="event.stopPropagation(); window.duplicateItem('${item.id}')" class="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700 mr-1 shadow-sm font-medium" title="ทำซ้ำรายการนี้ (คัดลอกข้อมูลทั้งหมด เพื่อแก้ไขเฉพาะจุด)">📋 ทำซ้ำ</button>
                <button onclick="event.stopPropagation(); window.editItem('${item.id}')" class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 mr-1 shadow-sm font-medium">✏️ แก้ไข</button>
                <button onclick="event.stopPropagation(); window.deleteItem('${item.id}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 shadow-sm font-medium">🗑 ลบ</button>
            </td>
        `;
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });
}

// ===== MOBILE CARD VIEW RENDERING =====
function renderMobileCards() {
    const container = document.getElementById('mobileCardContainer');
    if (!container) return;
    const displayList = getFilteredAndSortedData();
    container.innerHTML = '';

    if (displayList.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-gray-400 bg-gray-50 rounded-lg border border-dashed">
            ${searchQuery ? '🔍 ไม่พบข้อมูลที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการครุภัณฑ์ในระบบ'}
        </div>`;
        return;
    }

    displayList.forEach(item => {
        const isEditing = editingId === item.id;
        const card = document.createElement('div');
        card.className = `mobile-card bg-white border ${isEditing ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'} rounded-lg p-3.5 shadow-sm hover:shadow transition-shadow`;

        // Essential quick fields
        const name = item.name || '(ไม่มีชื่อรายการ)';
        const noid = item.noid || '-';
        const type = item.type || '-';
        const div = item.div || '-';
        const receiveTm = item.receiveTm || '-';
        const perUnit = item.perUnit !== undefined && item.perUnit !== '' ? Number(item.perUnit).toLocaleString() + ' บาท' : '-';
        const location = item.location || '-';

        let fieldsHtml = '';
        // Other fields
        activeFields.forEach(f => {
            if (['name', 'noid', 'type', 'div'].includes(f.key)) return;
            let val = item[f.key];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                if (f.key === 'risk') {
                    const m = String(val).trim().match(/^[1-3]/);
                    if (m) val = m[0];
                }
                const displayVal = f.type === 'number' ? Number(val).toLocaleString() : val;
                fieldsHtml += `
                    <div class="flex justify-between text-xs py-0.5 border-b border-gray-100 last:border-b-0">
                        <span class="text-gray-500 font-medium">${f.label}:</span>
                        <span class="text-gray-800 font-medium text-right ml-2">${displayVal}</span>
                    </div>
                `;
            }
        });

        card.innerHTML = `
            <div class="flex justify-between items-start gap-2 mb-2">
                <div class="flex-1">
                    <span class="inline-block bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full mb-1">
                        🆔 ${noid}
                    </span>
                    <h3 class="font-bold text-gray-900 text-sm leading-tight">${name}</h3>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="window.spreadItem('${item.id}')" class="bg-amber-600 text-white p-2 rounded-lg text-xs hover:bg-amber-700 shadow-sm" title="กระจายข้อมูล">
                        🔄
                    </button>
                    <button onclick="window.duplicateItem('${item.id}')" class="bg-indigo-600 text-white p-2 rounded-lg text-xs hover:bg-indigo-700 shadow-sm" title="ทำซ้ำรายการนี้">
                        📋
                    </button>
                    <button onclick="window.editItem('${item.id}')" class="bg-blue-600 text-white p-2 rounded-lg text-xs hover:bg-blue-700 shadow-sm" title="แก้ไข">
                        ✏️
                    </button>
                    <button onclick="window.deleteItem('${item.id}')" class="bg-red-500 text-white p-2 rounded-lg text-xs hover:bg-red-600 shadow-sm" title="ลบ">
                        🗑
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-x-2 gap-y-1 bg-gray-50 rounded-lg p-2.5 mb-2 text-xs">
                <div><span class="text-gray-500">ประเภท:</span> <span class="font-semibold text-gray-700">${type}</span></div>
                <div><span class="text-gray-500">แผนก:</span> <span class="font-semibold text-gray-700">${div}</span></div>
                <div><span class="text-gray-500">วันที่รับ:</span> <span class="font-semibold text-gray-700">${receiveTm}</span></div>
                <div><span class="text-gray-500">ราคา:</span> <span class="font-bold text-emerald-600">${perUnit}</span></div>
                ${location !== '-' ? `<div class="col-span-2"><span class="text-gray-500">สถานที่:</span> <span class="font-semibold text-gray-700">${location}</span></div>` : ''}
            </div>

            ${fieldsHtml ? `
                <details class="text-xs group">
                    <summary class="cursor-pointer text-blue-600 hover:text-blue-800 font-medium py-1 select-none flex items-center gap-1">
                        <span>ดูข้อมูลเพิ่มเติม</span>
                        <span class="group-open:rotate-180 transition-transform text-[10px]">▼</span>
                    </summary>
                    <div class="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
                        ${fieldsHtml}
                    </div>
                </details>
            ` : ''}
        `;

        container.appendChild(card);
    });
}

function renderDashboard() {
    const dashSection = document.getElementById('dashboardSection');
    if (!dashSection) return;

    const totalCount = currentData.length;
    let totalValue = 0;
    const typeMap = {};
    const divMap = {};

    currentData.forEach(item => {
        // Price
        const price = Number(item.perUnit) || 0;
        totalValue += price;

        // Type
        const t = (item.type || 'ไม่ระบุประเภท').trim();
        if (!typeMap[t]) typeMap[t] = { count: 0, value: 0 };
        typeMap[t].count++;
        typeMap[t].value += price;

        // Div
        const d = (item.div || 'ไม่ระบุแผนก').trim();
        if (!divMap[d]) divMap[d] = { count: 0, value: 0 };
        divMap[d].count++;
        divMap[d].value += price;
    });

    const elTotalCount = document.getElementById('dashTotalCount');
    const elTotalValue = document.getElementById('dashTotalValue');
    const elTypeCount = document.getElementById('dashTypeCount');
    const elDivCount = document.getElementById('dashDivCount');

    if (elTotalCount) elTotalCount.textContent = totalCount.toLocaleString();
    if (elTotalValue) elTotalValue.textContent = totalValue.toLocaleString();
    if (elTypeCount) elTypeCount.textContent = Object.keys(typeMap).length.toLocaleString();
    if (elDivCount) elDivCount.textContent = Object.keys(divMap).length.toLocaleString();

    // Render Type Breakdown
    const typeContainer = document.getElementById('dashTypeBreakdown');
    if (typeContainer) {
        const sortedTypes = Object.entries(typeMap).sort((a, b) => b[1].count - a[1].count);
        if (sortedTypes.length === 0) {
            typeContainer.innerHTML = '<p class="text-gray-400 py-3 text-center">ไม่มีข้อมูล</p>';
        } else {
            typeContainer.innerHTML = sortedTypes.map(([name, data]) => {
                const pct = totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0;
                const isSelected = selectedFilterType === name;
                return `
                    <div onclick="window.filterByType('${name.replace(/'/g, "\\'")}')" class="hover:bg-purple-100/70 p-1.5 rounded transition-colors cursor-pointer ${isSelected ? 'bg-purple-100 ring-1 ring-purple-400 font-semibold' : ''}" title="คลิกเพื่อกรองเฉพาะประเภทนี้">
                        <div class="flex justify-between items-center text-xs mb-1 font-medium">
                            <span class="text-gray-800 truncate" title="${name}">${name}</span>
                            <div class="text-right shrink-0 ml-2">
                                <span class="font-bold text-purple-700">${data.count.toLocaleString()} ชิ้น</span>
                                <span class="text-gray-400 text-[10px] ml-1">(${pct}%)</span>
                                <span class="text-emerald-600 font-semibold ml-1.5">${data.value > 0 ? data.value.toLocaleString() + ' ฿' : ''}</span>
                            </div>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-purple-600 h-1.5 rounded-full" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Div Breakdown
    const divContainer = document.getElementById('dashDivBreakdown');
    if (divContainer) {
        const sortedDivs = Object.entries(divMap).sort((a, b) => b[1].count - a[1].count);
        if (sortedDivs.length === 0) {
            divContainer.innerHTML = '<p class="text-gray-400 py-3 text-center">ไม่มีข้อมูล</p>';
        } else {
            divContainer.innerHTML = sortedDivs.map(([name, data]) => {
                const pct = totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0;
                const isSelected = selectedFilterDiv === name;
                return `
                    <div onclick="window.filterByDiv('${name.replace(/'/g, "\\'")}')" class="hover:bg-blue-100/70 p-1.5 rounded transition-colors cursor-pointer ${isSelected ? 'bg-blue-100 ring-1 ring-blue-400 font-semibold' : ''}" title="คลิกเพื่อกรองเฉพาะแผนกนี้">
                        <div class="flex justify-between items-center text-xs mb-1 font-medium">
                            <span class="text-gray-800 truncate" title="${name}">${name}</span>
                            <div class="text-right shrink-0 ml-2">
                                <span class="font-bold text-blue-700">${data.count.toLocaleString()} ชิ้น</span>
                                <span class="text-gray-400 text-[10px] ml-1">(${pct}%)</span>
                                <span class="text-emerald-600 font-semibold ml-1.5">${data.value > 0 ? data.value.toLocaleString() + ' ฿' : ''}</span>
                            </div>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function renderDataViews() {
    updateFilterDropdownOptions();
    renderTableBody();
    renderMobileCards();
    renderDashboard();

    // Update total items count (show filtered count if filtering)
    const totalEl = document.getElementById('totalItems');
    if (totalEl) {
        const filteredCount = getFilteredAndSortedData().length;
        if (selectedFilterDiv || selectedFilterType || searchQuery) {
            totalEl.innerHTML = `${filteredCount} <span class="text-xs text-gray-500 font-normal">/ ทั้งหมด ${currentData.length}</span>`;
        } else {
            totalEl.textContent = currentData.length;
        }
    }
}

// ===== EDIT & DELETE HANDLERS =====
function setEditMode(on, item = null) {
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const deleteBtn = document.getElementById('deleteCurrentEditBtn');
    const duplicateBtn = document.getElementById('duplicateCurrentBtn');
    const spreadBtn = document.getElementById('spreadCurrentBtn');
    const formCard = document.getElementById('equipmentForm').closest('.bg-white');
    if (on && item) {
        editingId = item.id;
        submitBtn.innerHTML = '💾 <span>อัปเดตข้อมูล (Update)</span>';
        submitBtn.className = 'w-full sm:w-auto bg-blue-600 text-white px-6 py-2.5 sm:py-2 rounded-lg shadow hover:bg-blue-700 text-sm font-bold flex items-center justify-center gap-1';
        cancelBtn.classList.remove('hidden');
        if (duplicateBtn) {
            duplicateBtn.classList.remove('hidden');
            duplicateBtn.classList.add('flex');
        }
        if (spreadBtn) {
            spreadBtn.classList.remove('hidden');
            spreadBtn.classList.add('flex');
        }
        deleteBtn.classList.remove('hidden');
        deleteBtn.classList.add('flex');
        formCard.classList.add('ring-2', 'ring-blue-400');
        activeFields.forEach(f => {
            const el = document.getElementById(f.key);
            if (!el) return;
            const val = item[f.key] !== undefined ? item[f.key] : (f.key === 'tmoney' && item['money'] !== undefined ? item['money'] : '');
            el.value = val;
        });
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        editingId = null;
        submitBtn.innerHTML = '💾 <span>บันทึกข้อมูล (Save)</span>';
        submitBtn.className = 'w-full sm:w-auto bg-green-600 text-white px-6 py-2.5 sm:py-2 rounded-lg shadow hover:bg-green-700 text-sm font-bold flex items-center justify-center gap-1';
        cancelBtn.classList.add('hidden');
        if (duplicateBtn) {
            duplicateBtn.classList.add('hidden');
            duplicateBtn.classList.remove('flex');
        }
        if (spreadBtn) {
            spreadBtn.classList.add('hidden');
            spreadBtn.classList.remove('flex');
        }
        deleteBtn.classList.add('hidden');
        deleteBtn.classList.remove('flex');
        formCard.classList.remove('ring-2', 'ring-blue-400');
        document.getElementById('equipmentForm').reset();
        renderDataViews();
    }
}

window.duplicateItem = (id) => {
    const item = currentData.find(i => i.id === id);
    if (!item) return;

    // Exit edit mode first so we create a NEW item
    setEditMode(false);

    // Populate all fields into the form
    activeFields.forEach(f => {
        const el = document.getElementById(f.key);
        if (!el) return;
        const val = item[f.key] !== undefined ? item[f.key] : (f.key === 'tmoney' && item['money'] !== undefined ? item['money'] : '');
        
        // Clear unique identifier fields so user fills new ones or avoids duplicate error
        if (f.key === 'noid' || f.key === 'serialNo' || f.key === 'pasaduId') {
            el.value = '';
        } else {
            el.value = val;
        }
    });

    const formCard = document.getElementById('equipmentForm').closest('.bg-white');
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Focus Noid input for user to type the new item's code
    const noidEl = document.getElementById('noid');
    if (noidEl) {
        noidEl.focus();
        noidEl.classList.add('ring-2', 'ring-indigo-400');
        setTimeout(() => noidEl.classList.remove('ring-2', 'ring-indigo-400'), 2500);
    }

    // Friendly hint notice
    const statusMsg = document.getElementById('noid_dup_warn');
    if (statusMsg) {
        statusMsg.innerHTML = `📋 <strong>คัดลอกข้อมูลจาก "${item.name || item.noid}" แล้ว!</strong><br>กรุณากรอกรหัส Noid ใหม่ และปรับเปลี่ยนรายละเอียดที่ต้องการ แล้วกด "บันทึกข้อมูล"`;
        statusMsg.className = 'mt-1 p-2 rounded text-xs font-semibold bg-indigo-50 border border-indigo-400 text-indigo-800';
        statusMsg.classList.remove('hidden');
    }
};

// ===== SPREAD/EXPAND ITEM (กระจายข้อมูล) =====
window.spreadItem = async (id) => {
    const item = currentData.find(i => i.id === id);
    if (!item) return;

    const noid = String(item.noid || '').trim();
    if (!noid) {
        alert('❌ รายการนี้ไม่มีรหัส Noid ไม่สามารถกระจายข้อมูลได้');
        return;
    }

    // Parse range pattern: "12-17พห7110-006-0014" → start=12, end=17, suffix="พห7110-006-0014"
    // Also support: "12-17 พห7110-006-0014" (with space)
    const rangeMatch = noid.match(/^(\d+)\s*-\s*(\d+)\s*(.+)$/);

    let startNum, endNum, suffix;

    if (rangeMatch) {
        // Has range pattern in Noid
        startNum = parseInt(rangeMatch[1], 10);
        endNum = parseInt(rangeMatch[2], 10);
        suffix = rangeMatch[3];
    } else {
        // No range pattern — ask user to input manually
        const input = prompt(
            `🔢 กระจายข้อมูลรายการ: "${item.name || noid}"\n\n` +
            `Noid ปัจจุบัน: ${noid}\n\n` +
            `กรุณาระบุช่วงเลขนำหน้าที่ต้องการกระจาย\nตัวอย่าง: ถ้าพิมพ์ "12-17" จะสร้างรายการ:\n` +
            `  12${noid.replace(/^\d+/, '')}, 13${noid.replace(/^\d+/, '')}, ... 17${noid.replace(/^\d+/, '')}\n\n` +
            `พิมพ์ช่วงตัวเลข (เช่น 12-17):`
        );
        if (!input || !input.trim()) return;

        const manualMatch = input.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (!manualMatch) {
            alert('❌ รูปแบบไม่ถูกต้อง กรุณาพิมพ์เป็นช่วง เช่น "12-17"');
            return;
        }
        startNum = parseInt(manualMatch[1], 10);
        endNum = parseInt(manualMatch[2], 10);

        // Extract suffix from current Noid (remove leading digits)
        const suffixMatch = noid.match(/^(\d+)(.+)$/);
        if (suffixMatch) {
            suffix = suffixMatch[2];
        } else {
            suffix = noid; // Use entire Noid as suffix if no leading digits
        }
    }

    if (startNum > endNum) {
        alert('❌ เลขเริ่มต้นต้องน้อยกว่าหรือเท่ากับเลขสิ้นสุด');
        return;
    }

    const totalItems = endNum - startNum + 1;
    if (totalItems > 100) {
        alert('❌ จำนวนรายการมากเกินไป (มากกว่า 100 ชิ้น) กรุณาตรวจสอบตัวเลขอีกครั้ง');
        return;
    }
    if (totalItems <= 1) {
        alert('ℹ️ ช่วงตัวเลขมีแค่ 1 รายการ ไม่จำเป็นต้องกระจาย');
        return;
    }

    // Determine padding width from startNum and endNum
    const maxLen = Math.max(String(startNum).length, String(endNum).length);

    // Generate preview list
    const previewItems = [];
    for (let n = startNum; n <= endNum; n++) {
        const prefix = String(n).padStart(maxLen, '0');
        previewItems.push(`${prefix}${suffix}`);
    }

    const confirmMsg =
        `🔄 กระจายข้อมูล "${item.name || noid}"\n\n` +
        `จะสร้างทั้งหมด ${totalItems} รายการ:\n` +
        previewItems.slice(0, 10).map((p, i) => `  ${i + 1}. ${p}`).join('\n') +
        (previewItems.length > 10 ? `\n  ... และอีก ${previewItems.length - 10} รายการ` : '') +
        `\n\nรายการแรก (${previewItems[0]}) จะอัปเดตจากรายการเดิม\nอีก ${totalItems - 1} รายการจะถูกสร้างใหม่โดยคัดลอกข้อมูลทั้งหมด\n\nยืนยันหรือไม่?`;

    if (!confirm(confirmMsg)) return;

    // Build base data (copy all fields except id)
    const baseData = {};
    activeFields.forEach(f => {
        const val = item[f.key] !== undefined ? item[f.key] : (f.key === 'tmoney' && item['money'] !== undefined ? item['money'] : '');
        if (f.key !== 'pasaduId') { // Clear unique IDs for copies
            baseData[f.key] = val;
        }
    });

    let successCount = 0;
    let failCount = 0;

    for (let n = startNum; n <= endNum; n++) {
        const prefix = String(n).padStart(maxLen, '0');
        const newNoid = `${prefix}${suffix}`;

        if (n === startNum) {
            // Update the original item's Noid
            item.noid = newNoid;
            markItemPending(item.id);
            successCount++;
        } else {
            // Create new item with copied data
            const newData = { ...baseData, id: 'local_' + Date.now() + '_spread_' + n, noid: newNoid, pasaduId: '', serialNo: '', createdAt: new Date().toISOString() };
            currentData.push(newData);
            markItemPending(newData.id);
            successCount++;
        }
    }

    localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
    document.getElementById('totalItems').innerText = currentData.length;
    renderDataViews();

    setEditMode(false);

    let resultMsg = `✅ กระจายข้อมูลเสร็จสิ้น!\n\n`;
    resultMsg += `สำเร็จ: ${successCount} รายการ`;
    if (failCount > 0) resultMsg += `\n❌ ผิดพลาด: ${failCount} รายการ`;
    alert(resultMsg);
};

window.editItem = (id) => {
    const item = currentData.find(i => i.id === id);
    if (item) {
        setEditMode(true, item);
        renderDataViews();
    }
};

window.deleteItem = async (id) => {
    if (!confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) return;
    if (editingId === id) setEditMode(false);

    if (isFirebaseConfigured && !id.startsWith('local_')) {
        try {
            await deleteDoc(doc(db, "hospital_equipments", id));
        } catch (err) {
            console.error(err);
        }
    }
    pendingChanges.delete(id);
    savePendingChanges();
    currentData = currentData.filter(item => item.id !== id);
    localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
    document.getElementById('totalItems').innerText = currentData.length;
    renderDataViews();
};

// Form submission (Local-First: Save locally instantly, mark for sync)
document.getElementById('equipmentForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const noidInput = document.getElementById('noid');
    if (noidInput && noidInput.value.trim() !== '') {
        const dup = checkNoidDuplicate(noidInput.value);
        if (dup) {
            const dupName = dup.name || dup.noid || '(ไม่มีชื่อ)';
            const dupDiv  = dup.div  ? ` แผนก: ${dup.div}` : '';
            alert(`❌ ไม่สามารถบันทึกได้!\n\nรหัส Noid "${noidInput.value}" ซ้ำกับรายการ:\n📌 ${dupName}${dupDiv}\n\nกรุณาแก้ไขรหัสก่อนบันทึก`);
            noidInput.focus();
            return;
        }
    }

    const data = {};
    activeFields.forEach(f => {
        const el = document.getElementById(f.key);
        if (el) {
            data[f.key] = f.type === 'number' ? (Number(el.value) || 0) : el.value;
        }
    });

    if (editingId) {
        const idx = currentData.findIndex(item => item.id === editingId);
        if (idx !== -1) {
            currentData[idx] = { ...currentData[idx], ...data };
            markItemPending(editingId);
            localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
            renderDataViews();
        }
        alert('✅ บันทึกการแก้ไขลงในเครื่องเรียบร้อยแล้ว!\n(สามารถกดปุ่ม "☁️ ส่งขึ้น Cloud" เมื่อต้องการอัปเดต)');
        setEditMode(false);
    } else {
        data.createdAt = new Date().toISOString();
        data.id = 'local_' + Date.now();
        currentData.unshift(data);
        markItemPending(data.id);
        localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
        document.getElementById('totalItems').innerText = currentData.length;
        renderDataViews();
        alert('✅ บันทึกรายการใหม่ลงในเครื่องเรียบร้อยแล้ว!\n(สามารถกดปุ่ม "☁️ ส่งขึ้น Cloud" เมื่อต้องการอัปเดต)');
        document.getElementById('equipmentForm').reset();
    }
});

// Delete All
document.getElementById('deleteAllBtn').addEventListener('click', async () => {
    if (currentData.length === 0) return alert('ไม่มีรายการข้อมูลให้ลบ');

    const total = currentData.length;
    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการ "ลบข้อมูลทั้งหมด" (${total} รายการ)?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้!`)) return;
    if (!confirm(`⚠️ ยืนยันอีกครั้ง! ลบข้อมูลทั้งหมด ${total} รายการ ออกจากระบบอย่างถาวร?`)) return;

    setEditMode(false);

    if (isFirebaseConfigured) {
        const btn = document.getElementById('deleteAllBtn');
        btn.disabled = true;
        btn.textContent = 'กำลังลบทั้งหมด...';
        try {
            const chunks = [];
            for (let i = 0; i < currentData.length; i += 450) {
                chunks.push(currentData.slice(i, i + 450));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(item => {
                    if (!item.id.startsWith('local_')) {
                        batch.delete(doc(db, "hospital_equipments", item.id));
                    }
                });
                await batch.commit();
            }
            alert('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว');
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาดในการลบข้อมูลทั้งหมด: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '🗑️ ลบทั้งหมด';
        }
    } else {
        currentData = [];
        localStorage.setItem('hospital_equipments', JSON.stringify([]));
        document.getElementById('totalItems').innerText = '0';
        renderDataViews();
        alert('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว');
    }
});

document.getElementById('resetBtn').addEventListener('click', () => setEditMode(false));
document.getElementById('cancelEditBtn').addEventListener('click', () => setEditMode(false));
document.getElementById('deleteCurrentEditBtn').addEventListener('click', () => {
    if (editingId) window.deleteItem(editingId);
});
const duplicateCurrentBtn = document.getElementById('duplicateCurrentBtn');
if (duplicateCurrentBtn) {
    duplicateCurrentBtn.addEventListener('click', () => {
        if (editingId) {
            window.duplicateItem(editingId);
        }
    });
}
const spreadCurrentBtn = document.getElementById('spreadCurrentBtn');
if (spreadCurrentBtn) {
    spreadCurrentBtn.addEventListener('click', () => {
        if (editingId) {
            window.spreadItem(editingId);
        }
    });
}

// ===== FIELD CONFIGURATION MODAL =====
const configModal = document.getElementById('configModal');
document.getElementById('openConfigModalBtn').addEventListener('click', () => {
    tempFields = JSON.parse(JSON.stringify(activeFields));
    renderConfigList();
    configModal.classList.remove('hidden');
});
document.getElementById('closeConfigModalBtn').addEventListener('click', () => configModal.classList.add('hidden'));

document.getElementById('newFieldType').addEventListener('change', (e) => {
    const group = document.getElementById('selectOptionGroup');
    if (e.target.value === 'select' || e.target.value === 'combo') {
        group.classList.remove('hidden');
    } else {
        group.classList.add('hidden');
    }
});

document.getElementById('addNewFieldBtn').addEventListener('click', () => {
    const key = document.getElementById('newFieldKey').value.trim();
    const label = document.getElementById('newFieldLabel').value.trim();
    const type = document.getElementById('newFieldType').value;
    const desc = document.getElementById('newFieldDesc').value.trim();
    const rawOpts = document.getElementById('newFieldOptions').value.trim();

    if (!key || !label) {
        return alert('กรุณากรอกรหัสฟิลด์ (Key) และชื่อฟิลด์ที่แสดง (Label)');
    }

    if (tempFields.some(f => f.key === key)) {
        return alert('รหัสฟิลด์ (Key) นี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น');
    }

    const newFieldObj = {
        key: key,
        label: label,
        type: type,
        description: desc,
        required: false
    };

    if (type === 'select' || type === 'combo') {
        newFieldObj.options = rawOpts ? rawOpts.split(',').map(s => s.trim()).filter(Boolean) : ['ตัวเลือก 1', 'ตัวเลือก 2'];
    }

    tempFields.push(newFieldObj);
    document.getElementById('newFieldKey').value = '';
    document.getElementById('newFieldLabel').value = '';
    document.getElementById('newFieldDesc').value = '';
    document.getElementById('newFieldOptions').value = '';
    renderConfigList();
});

function renderConfigList() {
    const container = document.getElementById('configList');
    container.innerHTML = '';

    tempFields.forEach((f, idx) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "p-3 border rounded bg-gray-50 grid grid-cols-1 md:grid-cols-12 gap-2 items-center";
        itemDiv.innerHTML = `
            <div class="md:col-span-3 text-xs font-bold text-gray-600">
                Key: <span class="text-blue-600">${f.key}</span> (${f.type})
                ${f.required ? '<span class="text-red-500 font-bold ml-1">*จำเป็น</span>' : ''}
            </div>
            <div class="md:col-span-4">
                <label class="block text-[11px] font-semibold text-gray-600">ชื่อฟิลด์ที่แสดง (Label)</label>
                <input type="text" id="cfg_label_${idx}" value="${f.label}" class="w-full border p-1.5 rounded text-sm bg-white">
            </div>
            <div class="md:col-span-4">
                <label class="block text-[11px] font-semibold text-gray-600">คำอธิบายเพิ่มเติม (Description)</label>
                <input type="text" id="cfg_desc_${idx}" value="${f.description || ''}" class="w-full border p-1.5 rounded text-sm bg-white">
            </div>
            <div class="md:col-span-1 flex justify-end">
                <button onclick="window.removeTempField(${idx})" class="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600" title="ลบช่องนี้">ลบ</button>
            </div>
            ${(f.type === 'select' || f.type === 'combo') ? `
            <div class="md:col-span-12 mt-1">
                <label class="block text-[11px] font-semibold text-gray-600">ตัวเลือก (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
                <input type="text" id="cfg_options_${idx}" value="${(f.options || []).join(', ')}" class="w-full border p-1.5 rounded text-sm bg-white">
            </div>
            ` : ''}
        `;
        container.appendChild(itemDiv);
    });
}

window.removeTempField = (idx) => {
    if (confirm(`คุณต้องการลบช่อง "${tempFields[idx].label}" ออกใช่หรือไม่?`)) {
        tempFields.splice(idx, 1);
        renderConfigList();
    }
};

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    tempFields.forEach((f, idx) => {
        const lbl = document.getElementById(`cfg_label_${idx}`);
        const desc = document.getElementById(`cfg_desc_${idx}`);
        const opts = document.getElementById(`cfg_options_${idx}`);
        if (lbl) f.label = lbl.value;
        if (desc) f.description = desc.value;
        if (opts && (f.type === 'select' || f.type === 'combo')) {
            f.options = opts.value.split(',').map(s => s.trim()).filter(Boolean);
        }
    });

    activeFields = JSON.parse(JSON.stringify(tempFields));
    localStorage.setItem('field_configurations', JSON.stringify(activeFields));
    renderForm();
    renderTableHeader();
    renderDataViews();

    if (isFirebaseConfigured) {
        try {
            await setDoc(configDocRef, { fields: tempFields });
            alert('บันทึกการปรับแต่งช่องกรอกข้อมูลเรียบร้อยแล้ว!');
        } catch (err) {
            console.error(err);
            alert('บันทึกในเครื่องแล้ว แต่ไม่สามารถบันทึกลง Firebase ได้');
        }
    } else {
        alert('บันทึกการปรับแต่งช่องกรอกข้อมูลเรียบร้อยแล้ว!');
    }
    configModal.classList.add('hidden');
});

document.getElementById('resetDefaultConfigBtn').addEventListener('click', async () => {
    if (confirm('คุณต้องการคืนค่าช่องกรอกข้อมูลทั้งหมดเป็นค่าเริ่มต้นใช่หรือไม่?')) {
        activeFields = JSON.parse(JSON.stringify(defaultFields));
        localStorage.removeItem('field_configurations');
        renderForm();
        renderTableHeader();
        renderDataViews();

        if (isFirebaseConfigured) {
            try {
                await setDoc(configDocRef, { fields: defaultFields });
                alert('คืนค่าเริ่มต้นเรียบร้อยแล้ว');
            } catch (err) {
                console.error(err);
            }
        } else {
            alert('คืนค่าเริ่มต้นเรียบร้อยแล้ว');
        }
        configModal.classList.add('hidden');
    }
});

// ===== SEARCH & MOBILE VIEW TOGGLES =====
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (clearSearchBtn) {
            if (searchQuery.trim()) {
                clearSearchBtn.classList.remove('hidden');
            } else {
                clearSearchBtn.classList.add('hidden');
            }
        }
        renderDataViews();
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.classList.add('hidden');
        renderDataViews();
    });
}

// Filter Dropdowns Listeners
const filterDivSelect = document.getElementById('filterDivSelect');
const filterTypeSelect = document.getElementById('filterTypeSelect');
const resetFilterBtn = document.getElementById('resetFilterBtn');

if (filterDivSelect) {
    filterDivSelect.addEventListener('change', (e) => {
        selectedFilterDiv = e.target.value;
        renderDataViews();
    });
}

if (filterTypeSelect) {
    filterTypeSelect.addEventListener('change', (e) => {
        selectedFilterType = e.target.value;
        renderDataViews();
    });
}

if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => {
        selectedFilterDiv = '';
        selectedFilterType = '';
        searchQuery = '';
        if (filterDivSelect) filterDivSelect.value = '';
        if (filterTypeSelect) filterTypeSelect.value = '';
        if (searchInput) searchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
        renderDataViews();
    });
}

// Quick filter helpers (callable from dashboard or table)
window.filterByDiv = (divName) => {
    if (selectedFilterDiv === divName) {
        selectedFilterDiv = ''; // Toggle off
    } else {
        selectedFilterDiv = divName;
    }
    if (filterDivSelect) filterDivSelect.value = selectedFilterDiv;
    renderDataViews();
};

window.filterByType = (typeName) => {
    if (selectedFilterType === typeName) {
        selectedFilterType = ''; // Toggle off
    } else {
        selectedFilterType = typeName;
    }
    if (filterTypeSelect) filterTypeSelect.value = selectedFilterType;
    renderDataViews();
};

const viewModeCardBtn = document.getElementById('viewModeCardBtn');
const viewModeTableBtn = document.getElementById('viewModeTableBtn');
const mobileCardContainer = document.getElementById('mobileCardContainer');
const tableContainerWrap = document.getElementById('tableContainerWrap');

if (viewModeCardBtn && viewModeTableBtn) {
    viewModeCardBtn.addEventListener('click', () => {
        mobileViewMode = 'card';
        viewModeCardBtn.className = 'px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-l-lg border border-blue-300';
        viewModeTableBtn.className = 'px-2.5 py-1 text-xs font-medium text-gray-700 bg-white rounded-r-lg border border-gray-300';
        if (mobileCardContainer) mobileCardContainer.classList.remove('hidden');
        if (tableContainerWrap) {
            tableContainerWrap.classList.add('hidden');
            tableContainerWrap.classList.remove('block');
        }
    });

    viewModeTableBtn.addEventListener('click', () => {
        mobileViewMode = 'table';
        viewModeTableBtn.className = 'px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-r-lg border border-blue-300';
        viewModeCardBtn.className = 'px-2.5 py-1 text-xs font-medium text-gray-700 bg-white rounded-l-lg border border-gray-300';
        if (mobileCardContainer) mobileCardContainer.classList.add('hidden');
        if (tableContainerWrap) {
            tableContainerWrap.classList.remove('hidden');
            tableContainerWrap.classList.add('block');
        }
    });
}

// ===== DASHBOARD TOGGLE =====
const toggleDashboardBtn = document.getElementById('toggleDashboardBtn');
const dashboardSection = document.getElementById('dashboardSection');
if (toggleDashboardBtn && dashboardSection) {
    toggleDashboardBtn.addEventListener('click', () => {
        const isHidden = dashboardSection.classList.contains('hidden');
        if (isHidden) {
            dashboardSection.classList.remove('hidden');
            toggleDashboardBtn.innerHTML = '✕ <span>ปิดแดชบอร์ด</span>';
            toggleDashboardBtn.className = 'flex-1 sm:flex-initial bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-lg shadow text-xs sm:text-sm hover:bg-gray-700 flex items-center justify-center gap-1 font-semibold transition-all';
            renderDashboard();
        } else {
            dashboardSection.classList.add('hidden');
            toggleDashboardBtn.innerHTML = '📊 <span>สรุปแดชบอร์ด</span>';
            toggleDashboardBtn.className = 'flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg shadow text-xs sm:text-sm hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center gap-1 font-semibold transition-all';
        }
    });
}

// ===== CLOUD SYNC & PULL LOGIC (LOCAL-FIRST / ON-DEMAND) =====
async function pullFromCloud(showNotice = true) {
    if (!isFirebaseConfigured) return alert('ยังไม่ได้ตั้งค่า Firebase');
    const btn = document.getElementById('pullCloudBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ <span>กำลังดึงข้อมูล...</span>';
    }

    try {
        const snapshot = await getDocs(equipCollection);
        const cloudData = [];
        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            item.id = docSnap.id;
            cloudData.push(item);
        });

        // Merge: keep locally created items that haven't been pushed yet
        const pendingItems = currentData.filter(item => pendingChanges.has(item.id) || item.id.startsWith('local_'));
        const cloudIds = new Set(cloudData.map(c => c.id));
        const mergedData = [...cloudData];
        pendingItems.forEach(p => {
            if (!cloudIds.has(p.id)) {
                mergedData.unshift(p);
            }
        });

        currentData = mergedData;
        localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
        document.getElementById('totalItems').innerText = currentData.length;
        renderDataViews();
        if (showNotice) {
            alert(`✅ ดึงข้อมูลจาก Cloud เรียบร้อยแล้ว! (พบ ${cloudData.length} รายการ)`);
        }
    } catch (err) {
        console.error('Pull from Cloud error:', err);
        alert('เกิดข้อผิดพลาดในการดึงข้อมูลจาก Cloud: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '📥 <span>ดึงจาก Cloud</span>';
        }
    }
}

async function pushToCloud() {
    if (!isFirebaseConfigured) return alert('ยังไม่ได้ตั้งค่า Firebase');
    if (pendingChanges.size === 0) {
        return alert('ℹ️ ข้อมูลในเครื่องตรงกับ Cloud แล้ว ไม่มีรายการใหม่ที่รอส่ง');
    }

    const totalToPush = pendingChanges.size;
    if (!confirm(`☁️ ยืนยันการส่งข้อมูลที่แก้ไข/เพิ่มใหม่ (${totalToPush} รายการ) ขึ้น Cloud?`)) return;

    const btn = document.getElementById('syncCloudBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ <span>กำลังส่ง...</span>';
    }

    try {
        const itemsToPush = currentData.filter(item => pendingChanges.has(item.id));
        const chunks = [];
        for (let i = 0; i < itemsToPush.length; i += 400) {
            chunks.push(itemsToPush.slice(i, i + 400));
        }

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => {
                const isNewLocal = item.id.startsWith('local_');
                const docRef = isNewLocal ? doc(equipCollection) : doc(db, "hospital_equipments", item.id);
                if (isNewLocal) item.id = docRef.id; // Upgrade local ID to real Firebase ID
                const { ...dataPayload } = item;
                delete dataPayload.id;
                batch.set(docRef, dataPayload, { merge: true });
            });
            await batch.commit();
        }

        pendingChanges.clear();
        savePendingChanges();
        localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
        renderDataViews();
        alert(`✅ ส่งข้อมูลขึ้น Cloud สำเร็จทั้งหมด ${itemsToPush.length} รายการ!`);
    } catch (err) {
        console.error('Push to Cloud error:', err);
        alert('เกิดข้อผิดพลาดในการส่งข้อมูลขึ้น Cloud: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '☁️ <span>ส่งขึ้น Cloud</span> <span id="pendingSyncBadge" class="hidden bg-white text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ml-0.5">0</span>';
            updateSyncBadge();
        }
    }
}

// Bind Sync Buttons
document.getElementById('pullCloudBtn')?.addEventListener('click', () => pullFromCloud(true));
document.getElementById('syncCloudBtn')?.addEventListener('click', pushToCloud);

// Initial UI Render
renderForm();
renderTableHeader();
renderDataViews();
updateSyncBadge();
document.getElementById('totalItems').innerText = currentData.length;

// If local data is completely empty on first run, auto-pull once
if (isFirebaseConfigured && currentData.length === 0) {
    pullFromCloud(false);
}

// Initialize Import/Export module
initImportExport({
    getActiveFields: () => activeFields,
    getCurrentData: () => currentData,
    isFirebaseConfigured,
    db,
    doc,
    setDoc,
    writeBatch,
    equipCollection,
    addDoc,
    onImportComplete: (newItems) => {
        newItems.forEach(item => {
            currentData.unshift(item);
            markItemPending(item.id);
        });
        localStorage.setItem('hospital_equipments', JSON.stringify(currentData));
        document.getElementById('totalItems').innerText = currentData.length;
        renderDataViews();
        updateSyncBadge();
    }
});
