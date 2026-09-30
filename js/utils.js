// Helper & Utility functions for dates, departments, and validation

// ===== QUICK DATE AUTO-FORMATTER =====
export function parseQuickDate(inputStr) {
    if (!inputStr) return null;
    let str = String(inputStr).trim();

    // Already in DD/MM/YYYY format?
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const parts = str.split('/');
        const d = String(parts[0]).padStart(2, '0');
        const m = String(parts[1]).padStart(2, '0');
        const y = parts[2];
        return `${d}/${m}/${y}`;
    }

    // Only process if it's numbers without slashes or separators
    const clean = str.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 5) return null;

    let day = null, month = null, year = null;

    if (clean.length === 6) {
        // Case A: D + M + YYYY (e.g. 122567 -> 1 / 2 / 2567)
        const last4YearA = Number(clean.slice(2));
        if (last4YearA >= 2400 && last4YearA <= 2650) {
            const d = Number(clean[0]);
            const m = Number(clean[1]);
            if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                day = d; month = m; year = last4YearA;
            }
        }
        // Case B: DD + MM + YY (e.g. 150758 -> 15 / 07 / 2558)
        if (!day) {
            const d = Number(clean.slice(0, 2));
            const m = Number(clean.slice(2, 4));
            const yy = Number(clean.slice(4));
            if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                day = d; month = m; year = 2500 + yy;
            }
        }
    } else if (clean.length === 7) {
        // Option 1: D + MM + YYYY (e.g. 2122557 -> 2 / 12 / 2557)
        const last4Year1 = Number(clean.slice(3));
        const d1 = Number(clean.slice(0, 1));
        const m1 = Number(clean.slice(1, 3));
        const valid1 = (last4Year1 >= 2400 && last4Year1 <= 2650) && (d1 >= 1 && d1 <= 9) && (m1 >= 1 && m1 <= 12);

        // Option 2: DD + M + YYYY (e.g. 2122557 -> 21 / 2 / 2557)
        const last4Year2 = Number(clean.slice(3));
        const d2 = Number(clean.slice(0, 2));
        const m2 = Number(clean.slice(2, 3));
        const valid2 = (last4Year2 >= 2400 && last4Year2 <= 2650) && (d2 >= 1 && d2 <= 31) && (m2 >= 1 && m2 <= 9);

        if (valid1 && !valid2) {
            day = d1; month = m1; year = last4Year1;
        } else if (!valid1 && valid2) {
            day = d2; month = m2; year = last4Year2;
        } else if (valid1 && valid2) {
            if (m1 >= 10 && m1 <= 12) {
                day = d1; month = m1; year = last4Year1;
            } else {
                day = d2; month = m2; year = last4Year2;
            }
        }
    } else if (clean.length === 8) {
        // DD + MM + YYYY (e.g. 15072558 -> 15 / 07 / 2558)
        const d = Number(clean.slice(0, 2));
        const m = Number(clean.slice(2, 4));
        let y = Number(clean.slice(4));
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            if (y < 2400) y += 543;
            day = d; month = m; year = y;
        }
    }

    if (day && month && year) {
        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        return `${dd}/${mm}/${year}`;
    }

    return null;
}

// ===== EXCEL THAI DATE NORMALIZER =====
export function normalizeThaiDate(rawDate) {
    if (rawDate === null || rawDate === undefined) return '';

    // 1. Date object or standard date string
    if (rawDate instanceof Date || (typeof rawDate === 'string' && (rawDate.includes('GMT') || rawDate.includes('(') || /^[A-Za-z]{3}\s+[A-Za-z]{3}/.test(rawDate)))) {
        const dObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
        if (!isNaN(dObj.getTime())) {
            if (dObj.getHours() === 23 && dObj.getMinutes() >= 50) {
                dObj.setMinutes(dObj.getMinutes() + 15);
            }
            const d = String(dObj.getDate()).padStart(2, '0');
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            let y = dObj.getFullYear();
            
            if (y >= 1900 && y < 2000) {
                y = 2500 + (y - 1900); // 1962 -> 2562
            } else if (y >= 2000 && y < 2100) {
                y = y + 543;
            }
            return `${d}/${m}/${y}`;
        }
    }

    let str = String(rawDate).trim();
    if (!str) return '';

    // 2. Excel Serial Number
    if (!isNaN(str) && Number(str) > 10000 && Number(str) < 100000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dObj = new Date(excelEpoch.getTime() + Number(str) * 86400000);
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        let y = dObj.getUTCFullYear() + 543;
        return `${d}/${m}/${y}`;
    }

    const thaiMonths = {
        'ม.ค.': '01', 'ม.ค': '01', 'มกราคม': '01',
        'ก.พ.': '02', 'ก.พ': '02', 'กุมภาพันธ์': '02',
        'มี.ค.': '03', 'มี.ค': '03', 'มีนาคม': '03',
        'เม.ย.': '04', 'เม.ย': '04', 'เมษายน': '04',
        'พ.ค.': '05', 'พ.ค': '05', 'พฤษภาคม': '05',
        'มิ.ย.': '06', 'มิ.ย': '06', 'มิถุนายน': '06',
        'ก.ค.': '07', 'ก.ค': '07', 'กรกฎาคม': '07',
        'ส.ค.': '08', 'ส.ค': '08', 'สิงหาคม': '08',
        'ก.ย.': '09', 'ก.ย': '09', 'กันยายน': '09',
        'ต.ค.': '10', 'ต.ค': '10', 'ตุลาคม': '10',
        'พ.ย.': '11', 'พ.ย': '11', 'พฤศจิกายน': '11',
        'ธ.ค.': '12', 'ธ.ค': '12', 'ธันวาคม': '12',
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    // 3. Text Thai / English Month format (e.g. 15-ก.ค.-58, 2-Feb-50)
    const thaiPattern = /^(\d{1,2})\s*[-/.\s]\s*([ก-๙a-zA-Z.]+)\s*[-/.\s]\s*(\d{2,4})$/;
    const match = str.match(thaiPattern);
    if (match) {
        const day = String(match[1]).padStart(2, '0');
        const monthName = match[2].trim().toLowerCase();
        let year = Number(match[3].trim());

        const month = thaiMonths[monthName] || Object.entries(thaiMonths).find(([k]) => monthName.includes(k.replace(/\./g, '')))?.[1];
        if (month) {
            if (year < 100) {
                year = 2500 + year;
            } else if (year < 2400) {
                year = year + 543;
            }
            return `${day}/${month}/${year}`;
        }
    }

    // 4. Number pattern (e.g. 15/07/58, 15/07/2558)
    const numPattern = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;
    const numMatch = str.match(numPattern);
    if (numMatch) {
        const day = String(numMatch[1]).padStart(2, '0');
        const month = String(numMatch[2]).padStart(2, '0');
        let year = Number(numMatch[3]);
        if (year < 100) {
            year = 2500 + year;
        } else if (year < 2400) {
            year = year + 543;
        }
        return `${day}/${month}/${year}`;
    }

    return str;
}

// ===== DEPARTMENT NORMALIZATION =====
export function normalizeDepartment(inputVal, fallbackSheet, availableOptions = []) {
    const raw = (inputVal || fallbackSheet || '').trim();
    if (!raw) return '';

    if (availableOptions.includes(raw)) return raw;

    const lower = raw.toLowerCase().replace(/[\s\-_/().]/g, '');

    const aliasMap = {
        'lab': 'กลุ่มงานเทคนิคการแพทย์',
        'เทคนิคการแพทย์': 'กลุ่มงานเทคนิคการแพทย์',
        'opd': 'งานการพยาบาลผู้ป่วยนอก (OPD)',
        'ผู้ป่วยนอก': 'งานการพยาบาลผู้ป่วยนอก (OPD)',
        'ipd': 'งานการพยาบาลผู้ป่วยใน (IPD)',
        'ผู้ป่วยใน': 'งานการพยาบาลผู้ป่วยใน (IPD)',
        'ward': 'งานการพยาบาลผู้ป่วยใน (IPD)',
        'ห้องคลอด': 'งานการพยาบาลผู้ป่วยคลอด',
        'คลอด': 'งานการพยาบาลผู้ป่วยคลอด',
        'er': 'งานการผู้ป่วยอุบัติเหตุฉุกเฉินและนิติเวช (ER)',
        'ห้องฉุกเฉิน': 'งานการผู้ป่วยอุบัติเหตุฉุกเฉินและนิติเวช (ER)',
        'ฉุกเฉิน': 'งานการผู้ป่วยอุบัติเหตุฉุกเฉินและนิติเวช (ER)',
        'อุบัติเหตุ': 'งานการผู้ป่วยอุบัติเหตุฉุกเฉินและนิติเวช (ER)',
        'or': 'ศูนย์เครื่องมือแพทย์',
        'ห้องผ่าตัด': 'ศูนย์เครื่องมือแพทย์',
        'ผ่าตัด': 'ศูนย์เครื่องมือแพทย์',
        'xray': 'กลุ่มงานรังสี',
        'x-ray': 'กลุ่มงานรังสี',
        'รังสี': 'กลุ่มงานรังสี',
        'เอกซเรย์': 'กลุ่มงานรังสี',
        'dent': 'กลุ่มงานทันตกรรม',
        'ทันตกรรม': 'กลุ่มงานทันตกรรม',
        'pt': 'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม',
        'กายภาพ': 'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม',
        'กายภาพบำบัด': 'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม',
        'supply': 'งานการพยาบาลหน่วยควบคุมการติดเชื้อและงานจ่ายกลาง',
        'จ่ายกลาง': 'งานการพยาบาลหน่วยควบคุมการติดเชื้อและงานจ่ายกลาง',
        'เภสัช': 'กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค',
        'เภสัชกรรม': 'กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค',
        'บริหาร': 'กลุ่มงานบริหารทั่วไป',
        'ซ่อม': 'ซ่อมเครื่องมือทั่วไป',
        'จิตเวช': 'กลุ่มงานจิตเวชและยาเสพติด',
        'ประกัน': 'กลุ่มงานประกันสุขภาพยุทธศาสตร์',
        'ดิจิทัล': 'กลุ่มงานดิจิทัล',
        'การเงิน': 'งานการเงินและบัญชี',
        'โภชนาการ': 'กลุ่มงานโภชนศาสตร์',
        'โภชน': 'กลุ่มงานโภชนศาสตร์',
        'แพทย์แผนไทย': 'แผนกการแพทย์แผนไทย',
        'แผนไทย': 'แผนกการแพทย์แผนไทย',
        'การแพทย์แผนไทย': 'แผนกการแพทย์แผนไทย',
        'เวชศาสตร์ฟื้นฟู': 'กลุ่มงานเวชศาสตร์ฟื้นฟู',
        'ฟื้นฟู': 'กลุ่มงานเวชศาสตร์ฟื้นฟู'
    };

    for (const [alias, fullDept] of Object.entries(aliasMap)) {
        if (lower === alias || lower.includes(alias)) {
            if (availableOptions.length === 0 || availableOptions.includes(fullDept)) {
                return fullDept;
            }
        }
    }

    const found = availableOptions.find(opt => opt.toLowerCase().includes(lower));
    return found || raw;
}

// ===== NOID RANGE PARSER =====
export function parseNoidRange(noidStr) {
    if (!noidStr) return null;
    const trimmed = String(noidStr).trim();
    const match = trimmed.match(/^(\d+)\s*-\s*(\d+)\s*(.+)$/);
    if (!match) return null;
    const startNum = parseInt(match[1], 10);
    const endNum = parseInt(match[2], 10);
    const suffix = match[3];
    if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) return null;
    if ((endNum - startNum + 1) > 100) return null; // Safety limit
    const maxLen = Math.max(match[1].length, match[2].length);
    const expanded = [];
    for (let n = startNum; n <= endNum; n++) {
        const prefix = String(n).padStart(maxLen, '0');
        expanded.push(`${prefix}${suffix}`);
    }
    return { startNum, endNum, suffix, expanded };
}
