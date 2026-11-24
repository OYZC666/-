'use strict';

/* =========================================================
   农历换算（1900 - 2099）
   年信息表与算法移植自 lunardate（作者 LI Daobing，GPLv2）
   ========================================================= */

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
  0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
  0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
  0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
  0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
  0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573,
  0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
  0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
  0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
  0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
  0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
  0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
  0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
  0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
  0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
  0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
  0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
  0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
  0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
  0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
  0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252
];

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_START_DAY = Math.floor(Date.UTC(1900, 0, 31) / 86400000);

function utcDayNumber(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function fromDayNumber(n) {
  const t = new Date(n * 86400000);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

function lunarYearDays(info) {
  let res = 29 * 12;
  let x = info;
  const hasLeap = x % 16 !== 0;
  if (hasLeap) res += 29;
  x = Math.floor(x / 16);
  for (let i = 0; i < 12 + (hasLeap ? 1 : 0); i++) {
    if (x % 2 === 1) res += 1;
    x = Math.floor(x / 2);
  }
  return res;
}

const LUNAR_YEAR_DAYS = LUNAR_INFO.map(lunarYearDays);

function leapMonthOfYear(year) {
  if (year < 1900 || year > 2099) return 0;
  const l = LUNAR_INFO[year - 1900] % 16;
  return l >= 1 && l <= 12 ? l : 0;
}

function lunarMonthDays(year, month, isLeap) {
  if (year < 1900 || year > 2099 || month < 1 || month > 12) return 0;
  const info = LUNAR_INFO[year - 1900];
  if (isLeap) {
    return leapMonthOfYear(year) === month ? ((info >> 16) % 2) + 29 : 0;
  }
  return ((info >> (16 - month)) % 2) + 29;
}

/* 公历 -> 农历；返回 { year, month, day, isLeap } 或 null */
function solarToLunar(y, m, d) {
  let offset = utcDayNumber(y, m, d) - LUNAR_START_DAY;
  if (offset < 0) return null;
  let idx = 0;
  while (idx < LUNAR_INFO.length && offset >= LUNAR_YEAR_DAYS[idx]) {
    offset -= LUNAR_YEAR_DAYS[idx];
    idx += 1;
  }
  if (idx >= LUNAR_INFO.length) return null;

  const info = LUNAR_INFO[idx];
  const leap = leapMonthOfYear(1900 + idx);
  for (let mo = 1; mo <= 12; mo++) {
    let days = lunarMonthDays(1900 + idx, mo, false);
    if (offset < days) return { year: 1900 + idx, month: mo, day: offset + 1, isLeap: false };
    offset -= days;
    if (leap === mo) {
      days = lunarMonthDays(1900 + idx, mo, true);
      if (offset < days) return { year: 1900 + idx, month: mo, day: offset + 1, isLeap: true };
      offset -= days;
    }
  }
  return null;
}

/* 农历 -> 公历；返回本地 Date 或 null */
function lunarToSolar(year, month, day, isLeap) {
  if (year < 1900 || year > 2099) return null;
  const leap = leapMonthOfYear(year);
  if (month < 1 || month > 12) return null;

  let offset = 0;
  for (let y = 1900; y < year; y++) offset += LUNAR_YEAR_DAYS[y - 1900];

  let found = false;
  for (let mo = 1; mo <= 12 && !found; mo++) {
    if (mo === month && !isLeap) {
      const days = lunarMonthDays(year, mo, false);
      if (day < 1 || day > days) return null;
      offset += day - 1;
      found = true;
      break;
    }
    offset += lunarMonthDays(year, mo, false);
    if (leap === mo) {
      if (mo === month && isLeap) {
        const days = lunarMonthDays(year, mo, true);
        if (day < 1 || day > days) return null;
        offset += day - 1;
        found = true;
        break;
      }
      offset += lunarMonthDays(year, mo, true);
    }
  }
  if (!found) return null;
  return fromDayNumber(LUNAR_START_DAY + offset);
}

function lunarMonthName(month, isLeap) {
  if (month < 1 || month > 12) return '';
  return (isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[month - 1] + '月';
}

function lunarDayName(day) {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  const tens = ['初', '十', '廿', '三'];
  const ones = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return tens[Math.floor(day / 10)] + ones[day % 10];
}

function lunarDateName(l) {
  if (!l) return '';
  return lunarMonthName(l.month, l.isLeap) + lunarDayName(l.day);
}
