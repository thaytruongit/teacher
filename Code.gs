/**
 * ============================================================================
 * HỆ THỐNG BÀI GIẢNG TƯƠNG TÁC 4 PHA, KAHOOT & TỰ HỌC E-LEARNING (5.0)
 * - Lưu trữ bài giảng phân cấp theo: KHỐI LỚP - HỌC KỲ - TIẾT PPCT
 * - Lưu nhanh tức thì 1 Slide đang sửa (saveSingleSlideQuickServer - 0.3s)
 * - Chế độ Học sinh Tự học E-Learning theo Khối & Tiết mong muốn + Lưu bảng điểm riêng
 * - Hỗ trợ 6 loại hoạt động: QUIZ (1 ĐA), MULTI (Nhiều ĐA), SLIDE, VIDEO, POLL, WORDCLOUD
 * ============================================================================
 */

var SHEET_QUESTIONS = 'NganHangBaiGiang';
var SHEET_CATALOG   = 'DanhMucBaiGiang';
var SHEET_RESULTS   = 'KetQuaChiTiet';
var SHEET_SESSIONS  = 'LichSuPhongThi';
var SHEET_ELEARNING = 'KetQuaTuHoc_ELearning';
var SHEET_KTGK      = 'TongHop_KTGK';
var PROP_DB_ID_KEY  = 'KAHOOT_DB_SHEET_ID';
var PROP_CAT_BACKUP = 'KAHOOT_CATALOG_BACKUP_JSON';
var PROP_GEMINI_KEY = 'KAHOOT_GEMINI_API_KEY';

var IMG_CHUNK_COLS  = 12;    // 12 cột x 45.000 ký tự = 540.000 ký tự Base64/slide
var IMG_CHUNK_SIZE  = 45000;
var CACHE_CHUNK_SZ  = 60000; // Chia nhỏ Cache < 100KB của Google


/**
 * ============================================================================
 * HÀM CẤP QUYỀN TRUY CẬP (CHẠY 1 LẦN DUY NHẤT TRONG TRÌNH SOẠN THẢO APPS SCRIPT)
 * Hướng dẫn: Tại thanh công cụ Apps Script trên cùng, chọn hàm "capQuyenTruyCapChoHeThong"
 * rồi bấm nút ▶️ "Chạy" (Run) ➔ bấm "Xem lại quyền" ➔ "Nâng cao" ➔ "Cho phép"
 * ============================================================================
 */
function capQuyenTruyCapChoHeThong() {
  initDatabase();
  try {
    var resp = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
    Logger.log('✅ XÁC NHẬN: Dự án đã được cấp quyền gọi mạng UrlFetchApp và truy cập Google Sheets thành công! HTTP ' + resp.getResponseCode());
    return '✅ ĐÃ CẤP QUYỀN THÀNH CÔNG!';
  } catch (e) {
    var errMsg = (e && e.message ? e.message : String(e));
    Logger.log('----------------------------------------------------');
    Logger.log('⚠️ NGUYÊN NHÂN CHƯA CẤP ĐƯỢC QUYỀN:');
    Logger.log('Tệp appsscript.json của bạn chưa có quyền: https://www.googleapis.com/auth/script.external_request');
    Logger.log('HÃY LÀM THEO 3 BƯỚC ĐỂ KHAI BÁO:');
    Logger.log('1. Nhấp biểu tượng bánh răng ⚙️ "Cài đặt dự án" ở menu bên trái.');
    Logger.log('2. Tích vào ô: "Hiển thị tệp kê khai appsscript.json trong trình chỉnh sửa".');
    Logger.log('3. Quay lại trình chỉnh sửa, mở tệp appsscript.json và dán cấu hình có oauthScopes external_request.');
    Logger.log('4. Sau khi Lưu appsscript.json, bấm Chạy lại hàm này để Google hiện cửa sổ "Xem lại quyền"!');
    Logger.log('----------------------------------------------------');
    throw new Error('CẦN THÊM QUYỀN VÀO TỆP appsscript.json: Mở Cài đặt dự án ⚙️ -> Bật tệp appsscript.json và thêm https://www.googleapis.com/auth/script.external_request vào oauthScopes.');
  }
}

function doGet(e) {
  // Hỗ trợ cổng REST API JSON cho Website trên GitHub Pages (?action=...)
  if (e && e.parameter && e.parameter.action) {
    return handleGitHubRestApiGet(e);
  }
  var page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page).toLowerCase() : 'student';
  var templateName = (page === 'teacher' || page === 'host' || page === 'admin') ? 'Teacher' : 'Student';
  return HtmlService.createHtmlOutputFromFile(templateName)
    .setTitle(templateName === 'Teacher'
      ? 'Giáo Viên - Quản Lý Bài Giảng Theo Khối, E-Learning & Trình Chiếu 4 Pha'
      : 'Học Sinh - Thi Đấu Trực Tiếp & Tự Học E-Learning Theo Tiết')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSystemInfo() {
  var baseUrl = '';
  try {
    baseUrl = ScriptApp.getService().getUrl();
  } catch (e) {}
  var sheetUrl = '';
  var sheetName = '';
  try {
    var ss = getDatabaseSpreadsheet();
    if (ss) {
      sheetUrl = ss.getUrl();
      sheetName = ss.getName();
    }
  } catch (e) {}
  var hasGeminiKey = false;
  var savedGeminiKey = '';
  try {
    var gKey = PropertiesService.getScriptProperties().getProperty(PROP_GEMINI_KEY);
    if (gKey && String(gKey).trim().length > 10) {
      hasGeminiKey = true;
      savedGeminiKey = String(gKey).trim();
    }
  } catch (e) {}
  return {
    ok: true,
    hasGeminiKey: hasGeminiKey,
    savedGeminiKey: savedGeminiKey,
    studentUrl: baseUrl,
    elearningUrl: baseUrl ? (baseUrl + (baseUrl.indexOf('?') > -1 ? '&mode=elearning' : '?mode=elearning')) : '',
    teacherUrl: baseUrl ? (baseUrl + (baseUrl.indexOf('?') > -1 ? '&page=teacher' : '?page=teacher')) : '',
    sheetUrl: sheetUrl,
    sheetName: sheetName
  };
}

function getDatabaseSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty(PROP_DB_ID_KEY);
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {}
  }

  var newSs = SpreadsheetApp.create('CSDL_BaiGiang_TuongTac_Kahoot_ELearning_HD');
  props.setProperty(PROP_DB_ID_KEY, newSs.getId());
  return newSs;
}

function initDatabase() {
  var ss = getDatabaseSpreadsheet();

  // 1. Sheet Ngân hàng câu hỏi & slide chi tiết
  var qSheet = ss.getSheetByName(SHEET_QUESTIONS);
  if (!qSheet) {
    qSheet = ss.insertSheet(SHEET_QUESTIONS);
    var headers = [
      'Topic', 'Order', 'Question', 'OptA', 'OptB', 'OptC', 'OptD', 'CorrectIndex', 'TimeLimit',
      'Img_1', 'Img_2', 'Img_3', 'Img_4', 'Img_5', 'Img_6',
      'Img_7', 'Img_8', 'Img_9', 'Img_10', 'Img_11', 'Img_12',
      'StepConfig_JSON'
    ];
    qSheet.appendRow(headers);
    qSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#311b92').setFontColor('#ffffff');
    qSheet.setFrozenRows(1);
  } else {
    var maxCols = qSheet.getMaxColumns();
    if (maxCols < 22) {
      qSheet.insertColumnsAfter(maxCols, 22 - maxCols);
    }
  }

  // 2. Sheet Danh mục bài giảng theo Khối - Học kỳ - Tiết PPCT
  var catSheet = ss.getSheetByName(SHEET_CATALOG);
  if (!catSheet) {
    catSheet = ss.insertSheet(SHEET_CATALOG);
    var catHeaders = [
      'LessonKey', 'Grade', 'Semester', 'Period', 'PeriodNum',
      'Title', 'SlideCount', 'PhaseSummary_JSON', 'UpdatedAt'
    ];
    catSheet.appendRow(catHeaders);
    catSheet.getRange(1, 1, 1, catHeaders.length).setFontWeight('bold').setBackground('#00695c').setFontColor('#ffffff');
    catSheet.setFrozenRows(1);
  }

  // 3. Sheet Kết quả chi tiết
  var rSheet = ss.getSheetByName(SHEET_RESULTS);
  if (!rSheet) {
    rSheet = ss.insertSheet(SHEET_RESULTS);
    rSheet.appendRow([
      'Timestamp', 'PIN', 'Grade', 'Period', 'Topic', 'Phase', 'SlideType',
      'StudentName', 'StudentClass', 'QuestionIndex', 'AnswerGiven',
      'IsCorrect', 'TimeMs', 'PointsEarned', 'TotalScore', 'Streak'
    ]);
    rSheet.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#1b5e20').setFontColor('#ffffff');
    rSheet.setFrozenRows(1);
  }

  // 4. Sheet Lịch sử phòng thi
  var sSheet = ss.getSheetByName(SHEET_SESSIONS);
  if (!sSheet) {
    sSheet = ss.insertSheet(SHEET_SESSIONS);
    sSheet.appendRow(['Timestamp', 'PIN', 'Grade', 'Period', 'Topic', 'TotalQuestions', 'HostStatus']);
    sSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#b71c1c').setFontColor('#ffffff');
    sSheet.setFrozenRows(1);
  }

  // 5. Sheet Kết quả Tự học E-Learning
  var elSheet = ss.getSheetByName(SHEET_ELEARNING);
  if (!elSheet) {
    elSheet = ss.insertSheet(SHEET_ELEARNING);
    elSheet.appendRow([
      'Timestamp', 'Grade', 'Semester', 'Period', 'LessonTitle', 'LessonKey',
      'StudentName', 'StudentClass', 'CompletedSteps', 'TotalSteps',
      'CorrectQuizCount', 'TotalQuizCount', 'AccuracyPercent', 'TotalScore', 'DurationSec', 'Status'
    ]);
    elSheet.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#0d47a1').setFontColor('#ffffff');
    elSheet.setFrozenRows(1);
  }

  // 6. Sheet Tổng hợp Kết quả Kiểm tra Giữa kỳ & Thường xuyên (Từ Website GitHub)
  var ktgkSheet = ss.getSheetByName(SHEET_KTGK);
  if (!ktgkSheet) {
    ktgkSheet = ss.insertSheet(SHEET_KTGK);
    var ktgkHeaders = [
      'STT', 'Thời Gian Nộp', 'Khối', 'Lớp', 'Số Máy', 'Họ và Tên', 'Ngày Sinh',
      'Kỳ Kiểm Tra / Tiết', 'Mã Đề', 'Điểm TN (5đ)', 'Điểm Điền Khuyết (3đ)',
      'Điểm Tự Luận (2đ)', 'Trừ Gian Lận', 'Tổng Điểm (10đ)', 'Số Lần Rời Tab',
      'Thời Gian Làm (s)', 'Nhận Xét / Trạng Thái', 'Chi Tiết Bài Làm (JSON)'
    ];
    ktgkSheet.appendRow(ktgkHeaders);
    ktgkSheet.getRange(1, 1, 1, ktgkHeaders.length).setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff');
    ktgkSheet.setFrozenRows(1);
  }

  return ss;
}

function extractPeriodNumber(periodStr) {
  var s = String(periodStr || '');
  var m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function buildCanonicalLessonKey(meta) {
  if (typeof meta === 'string') {
    return meta.trim() || '[Khối 6 | HK1 | Tiết 1] Bài giảng mới';
  }
  var grade = String(meta.grade || 'Khối 6').trim();
  var semester = String(meta.semester || 'HK1').trim();
  var period = String(meta.period || 'Tiết 1').trim();
  var title = String(meta.title || meta.topic || 'Bài giảng mới').trim();
  return '[' + grade + ' | ' + semester + ' | ' + period + '] ' + title;
}

function parseLessonKeyMeta(rawTopic, optionalCfg) {
  var raw = String(rawTopic || '').trim();
  var cfg = optionalCfg || {};

  if (cfg.grade && cfg.period && cfg.title) {
    return {
      lessonKey: raw || buildCanonicalLessonKey(cfg),
      grade: String(cfg.grade).trim(),
      semester: String(cfg.semester || 'HK1').trim(),
      period: String(cfg.period).trim(),
      periodNum: extractPeriodNumber(cfg.period),
      title: String(cfg.title).trim()
    };
  }

  var match3 = raw.match(/^\[([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\s*(.+)$/);
  if (match3) {
    var grade3 = match3[1].trim();
    var semester3 = match3[2].trim();
    var period3 = match3[3].trim();
    var title3 = match3[4].trim();
    return {
      lessonKey: raw,
      grade: grade3,
      semester: semester3,
      period: period3,
      periodNum: extractPeriodNumber(period3),
      title: title3
    };
  }

  var match2 = raw.match(/^\[([^\-\]]+)\-([^\]]+)\]\s*(.+)$/);
  if (match2) {
    var grade2 = match2[1].trim();
    var period2 = match2[2].trim();
    var title2 = match2[3].trim();
    return {
      lessonKey: raw,
      grade: grade2,
      semester: 'HK1',
      period: period2,
      periodNum: extractPeriodNumber(period2),
      title: title2
    };
  }

  return {
    lessonKey: raw || '[Khối 6 | HK1 | Tiết 1] Bài giảng mới',
    grade: cfg.grade || 'Khối 6',
    semester: cfg.semester || 'HK1',
    period: cfg.period || 'Tiết 1',
    periodNum: extractPeriodNumber(cfg.period || 'Tiết 1'),
    title: raw || 'Bài giảng mới'
  };
}

function normalizeMetaInput(metaOrString) {
  if (typeof metaOrString === 'object' && metaOrString !== null) {
    var grade = String(metaOrString.grade || 'Khối 6').trim();
    var semester = String(metaOrString.semester || 'HK1').trim();
    var period = String(metaOrString.period || 'Tiết 1').trim();
    var title = String(metaOrString.title || metaOrString.topic || 'Bài giảng mới').trim();
    var lessonKey = String(metaOrString.lessonKey || buildCanonicalLessonKey({
      grade: grade, semester: semester, period: period, title: title
    })).trim();
    return {
      lessonKey: lessonKey,
      grade: grade,
      semester: semester,
      period: period,
      periodNum: extractPeriodNumber(period),
      title: title
    };
  }
  return parseLessonKeyMeta(String(metaOrString || ''));
}

function splitImageToColumns(imgBase64) {
  var str = String(imgBase64 || '');
  var chunks = [];
  for (var i = 0; i < IMG_CHUNK_COLS; i++) {
    var part = str.substring(i * IMG_CHUNK_SIZE, (i + 1) * IMG_CHUNK_SIZE);
    chunks.push(part || '');
  }
  return chunks;
}

function joinColumnsToImage(row, startColIndex) {
  var parts = [];
  for (var i = 0; i < IMG_CHUNK_COLS; i++) {
    var cellVal = row[startColIndex + i];
    if (cellVal) parts.push(String(cellVal));
  }
  return parts.join('');
}

function putLargeCache(key, objOrStr, ttlSeconds) {
  var cache = CacheService.getScriptCache();
  var str = (typeof objOrStr === 'string') ? objOrStr : JSON.stringify(objOrStr);
  var ttl = ttlSeconds || 21600;

  if (str.length <= CACHE_CHUNK_SZ) {
    cache.put(key, str, ttl);
    return;
  }

  var totalChunks = Math.ceil(str.length / CACHE_CHUNK_SZ);
  var batchObj = {};
  for (var i = 0; i < totalChunks; i++) {
    batchObj[key + '_p' + i] = str.substring(i * CACHE_CHUNK_SZ, (i + 1) * CACHE_CHUNK_SZ);
  }
  batchObj[key] = '__CHUNKED__:' + totalChunks;
  cache.putAll(batchObj, ttl);
}

function getLargeCache(key) {
  var cache = CacheService.getScriptCache();
  var head = cache.get(key);
  if (!head) return null;

  if (head.indexOf('__CHUNKED__:') !== 0) {
    return head;
  }

  var totalChunks = parseInt(head.split(':')[1], 10) || 0;
  if (totalChunks <= 0) return null;

  var keys = [];
  for (var i = 0; i < totalChunks; i++) {
    keys.push(key + '_p' + i);
  }
  var map = cache.getAll(keys);
  var full = '';
  for (var j = 0; j < totalChunks; j++) {
    var part = map[key + '_p' + j];
    if (part === undefined || part === null) return null;
    full += part;
  }
  return full;
}

function formatNowVN() {
  try {
    return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  } catch (e) {
    return new Date().toLocaleString('vi-VN');
  }
}

function makeTopicHash(lessonKey) {
  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(lessonKey || ''));
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
      if (b.length === 1) hex += '0';
      hex += b;
    }
    return hex.substring(0, 20);
  } catch (e) {
    return String(lessonKey || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
  }
}

function saveBackupCatalogList(lessonsArray) {
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_CAT_BACKUP, JSON.stringify(lessonsArray || []));
  } catch (e) {}
}

function loadBackupCatalogList() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROP_CAT_BACKUP);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function upsertCatalogEntry(meta, slideCount, phaseSummaryObj) {
  var nowStr = formatNowVN();
  var phaseObj = phaseSummaryObj || { P1: 0, P2: 0, P3: 0, P4: 0 };

  var backupList = loadBackupCatalogList();
  var foundIdx = -1;
  for (var b = 0; b < backupList.length; b++) {
    if (backupList[b].lessonKey === meta.lessonKey) {
      foundIdx = b;
      break;
    }
  }
  var entryObj = {
    lessonKey: meta.lessonKey,
    grade: meta.grade,
    semester: meta.semester,
    period: meta.period,
    periodNum: meta.periodNum,
    title: meta.title,
    slideCount: slideCount,
    phaseSummary: phaseObj,
    updatedAt: nowStr
  };
  if (foundIdx > -1) backupList[foundIdx] = entryObj;
  else backupList.push(entryObj);
  saveBackupCatalogList(backupList);

  try {
    var ss = initDatabase();
    var catSheet = ss.getSheetByName(SHEET_CATALOG);
    var lastRow = catSheet.getLastRow();
    var phaseJson = JSON.stringify(phaseObj);

    if (lastRow > 1) {
      var keysCol = catSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < keysCol.length; i++) {
        if (String(keysCol[i][0]).trim() === meta.lessonKey) {
          catSheet.getRange(i + 2, 1, 1, 9).setValues([[
            meta.lessonKey, meta.grade, meta.semester, meta.period, meta.periodNum,
            meta.title, slideCount, phaseJson, nowStr
          ]]);
          return;
        }
      }
    }

    catSheet.appendRow([
      meta.lessonKey, meta.grade, meta.semester, meta.period, meta.periodNum,
      meta.title, slideCount, phaseJson, nowStr
    ]);
  } catch (e) {}
}

function rebuildCatalogFromQuestionsSheet() {
  var ss = initDatabase();
  var qSheet = ss.getSheetByName(SHEET_QUESTIONS);
  var catSheet = ss.getSheetByName(SHEET_CATALOG);
  var lastRow = qSheet.getLastRow();
  if (lastRow <= 1) return [];

  var topicCol = qSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var cfgCol   = qSheet.getRange(2, 22, lastRow - 1, 1).getValues();

  var map = {};
  var keysOrder = [];

  for (var i = 0; i < topicCol.length; i++) {
    var rawKey = String(topicCol[i][0] || '').trim();
    if (!rawKey) continue;

    var stepCfg = {};
    try {
      if (cfgCol[i][0]) stepCfg = JSON.parse(String(cfgCol[i][0]));
    } catch (e) {}

    if (!map[rawKey]) {
      var meta = parseLessonKeyMeta(rawKey, stepCfg);
      map[rawKey] = {
        lessonKey: rawKey,
        grade: meta.grade,
        semester: meta.semester,
        period: meta.period,
        periodNum: meta.periodNum,
        title: meta.title,
        slideCount: 0,
        phaseSummary: { P1: 0, P2: 0, P3: 0, P4: 0 },
        updatedAt: formatNowVN()
      };
      keysOrder.push(rawKey);
    }

    map[rawKey].slideCount++;
    var ph = String(stepCfg.phase || 'Pha 3: Luyện tập');
    if (ph.indexOf('Pha 1') === 0) map[rawKey].phaseSummary.P1++;
    else if (ph.indexOf('Pha 2') === 0) map[rawKey].phaseSummary.P2++;
    else if (ph.indexOf('Pha 4') === 0) map[rawKey].phaseSummary.P4++;
    else map[rawKey].phaseSummary.P3++;
  }

  var catLastRow = catSheet.getLastRow();
  if (catLastRow > 1) {
    catSheet.deleteRows(2, catLastRow - 1);
  }

  var rows = [];
  var resultList = [];
  for (var k = 0; k < keysOrder.length; k++) {
    var item = map[keysOrder[k]];
    resultList.push(item);
    rows.push([
      item.lessonKey,
      item.grade,
      item.semester,
      item.period,
      item.periodNum,
      item.title,
      item.slideCount,
      JSON.stringify(item.phaseSummary),
      item.updatedAt
    ]);
  }

  if (rows.length > 0) {
    catSheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  saveBackupCatalogList(resultList);
  return resultList;
}

function getLessonCatalog() {
  var lessons = [];
  try {
    var ss = initDatabase();
    var catSheet = ss.getSheetByName(SHEET_CATALOG);
    var qSheet = ss.getSheetByName(SHEET_QUESTIONS);
    var catLastRow = catSheet.getLastRow();

    if (catLastRow <= 1 && qSheet.getLastRow() > 1) {
      lessons = rebuildCatalogFromQuestionsSheet();
    } else if (catLastRow > 1) {
      var catData = catSheet.getRange(2, 1, catLastRow - 1, 9).getValues();
      for (var i = 0; i < catData.length; i++) {
        var lessonKey = String(catData[i][0] || '').trim();
        if (!lessonKey) continue;
        var phaseSummary = { P1: 0, P2: 0, P3: 0, P4: 0 };
        try {
          if (catData[i][7]) phaseSummary = JSON.parse(String(catData[i][7]));
        } catch (e) {}

        lessons.push({
          lessonKey: lessonKey,
          grade: String(catData[i][1] || 'Khối 6'),
          semester: String(catData[i][2] || 'HK1'),
          period: String(catData[i][3] || 'Tiết 1'),
          periodNum: Number(catData[i][4]) || extractPeriodNumber(catData[i][3]),
          title: String(catData[i][5] || lessonKey),
          slideCount: Number(catData[i][6]) || 0,
          phaseSummary: phaseSummary,
          updatedAt: String(catData[i][8] || '')
        });
      }
      saveBackupCatalogList(lessons);
    }
  } catch (err) {
    lessons = loadBackupCatalogList();
  }

  lessons.sort(function(a, b) {
    if (a.grade !== b.grade) return a.grade.localeCompare(b.grade, 'vi');
    if (a.semester !== b.semester) return a.semester.localeCompare(b.semester, 'vi');
    if (a.periodNum !== b.periodNum) return a.periodNum - b.periodNum;
    return a.title.localeCompare(b.title, 'vi');
  });

  var topics = [];
  for (var t = 0; t < lessons.length; t++) {
    topics.push(lessons[t].lessonKey);
  }

  return {
    ok: true,
    lessons: lessons,
    topics: topics
  };
}

function getTopicsList() {
  var res = getLessonCatalog();
  return res.topics;
}

function normalizeCorrectList(q) {
  var list = [];
  if (Array.isArray(q.correctList) && q.correctList.length > 0) {
    for (var i = 0; i < q.correctList.length; i++) {
      var n = Number(q.correctList[i]);
      if (!isNaN(n) && n >= 0 && n <= 3) list.push(n);
    }
  } else if (typeof q.correct === 'string' && q.correct.indexOf(',') > -1) {
    var parts = q.correct.split(',');
    for (var j = 0; j < parts.length; j++) {
      var p = parseInt(parts[j].trim(), 10);
      if (!isNaN(p) && p >= 0 && p <= 3) list.push(p);
    }
  } else {
    var single = Number(q.correct);
    list = (!isNaN(single) && single >= 0 && single <= 3) ? [single] : [0];
  }
  var unique = [];
  for (var k = 0; k < list.length; k++) {
    if (unique.indexOf(list[k]) === -1) unique.push(list[k]);
  }
  unique.sort();
  return unique.length > 0 ? unique : [0];
}

function buildQuestionRowValues(cleanTopic, meta, orderNumber, q) {
  var imgChunks = splitImageToColumns(q.img || '');
  var cList = normalizeCorrectList(q);
  var isMulti = (q.slideType === 'MULTI' || cList.length > 1);
  var sType = isMulti ? 'MULTI' : (q.slideType || 'QUIZ');

  var stepConfig = JSON.stringify({
    phase: q.phase || 'Pha 3: Luyện tập',
    slideType: sType,
    isGhiVo: Boolean(q.isGhiVo),
    aiExplanation: String(q.aiExplanation || ''),
    aiSlideCategory: String(q.aiSlideCategory || ''),
    videoUrl: q.videoUrl || '',
    startSec: Number(q.startSec) || 0,
    endSec: Number(q.endSec) || 0,
    videoNote: q.videoNote || '',
    multiMode: q.multiMode || 'EXACT',
    correctList: cList,
    grade: meta.grade,
    semester: meta.semester,
    period: meta.period,
    title: meta.title
  });

  var correctColVal = cList.join(',');

  return [
    cleanTopic,
    orderNumber,
    q.q || ('Slide ' + orderNumber),
    (q.opts && q.opts[0]) ? q.opts[0] : 'Đáp án A',
    (q.opts && q.opts[1]) ? q.opts[1] : 'Đáp án B',
    (q.opts && q.opts[2]) ? q.opts[2] : 'Đáp án C',
    (q.opts && q.opts[3]) ? q.opts[3] : 'Đáp án D',
    correctColVal,
    Number(q.time) || 20
  ].concat(imgChunks).concat([stepConfig]);
}

/**
 * ============================================================================
 * LƯU NHANH 1 SLIDE ĐƠN LẺ TẠI THỜI ĐIỂM ĐANG SỬA (SIÊU TỐC 0.3s)
 * ============================================================================
 */
function saveSingleSlideQuickServer(metaOrString, slideIndex0Based, slideObj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var meta = normalizeMetaInput(metaOrString);
    var cleanTopic = meta.lessonKey;
    var idx = Number(slideIndex0Based) || 0;
    var orderNum = idx + 1;

    if (!slideObj) {
      return { ok: false, msg: 'Dữ liệu slide trống!' };
    }

    var rowVals = buildQuestionRowValues(cleanTopic, meta, orderNum, slideObj);

    // Cập nhật cache ảnh E-Learning cho slide này luôn
    var tHash = makeTopicHash(cleanTopic);
    if (slideObj.img && String(slideObj.img).length > 20) {
      putLargeCache('ELIMG_' + tHash + '_' + idx, String(slideObj.img), 21600);
    }

    // Cập nhật trong Backup Cache nếu có
    try {
      var existingRaw = getLargeCache('LESSON_BACKUP_' + cleanTopic);
      var existingArr = existingRaw ? JSON.parse(existingRaw) : [];
      existingArr[idx] = slideObj;
      putLargeCache('LESSON_BACKUP_' + cleanTopic, existingArr, 21600);
    } catch (e) {}

    // Cập nhật đúng 1 dòng trong Google Sheet (không xóa các dòng khác)
    try {
      var ss = initDatabase();
      var sheet = ss.getSheetByName(SHEET_QUESTIONS);
      var lastRow = sheet.getLastRow();
      var updatedExisting = false;

      if (lastRow > 1) {
        var topOrdCols = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (var i = 0; i < topOrdCols.length; i++) {
          if (String(topOrdCols[i][0]).trim() === cleanTopic && Number(topOrdCols[i][1]) === orderNum) {
            sheet.getRange(i + 2, 1, 1, 22).setValues([rowVals]);
            updatedExisting = true;
            break;
          }
        }
      }

      if (!updatedExisting) {
        sheet.getRange(lastRow + 1, 1, 1, 22).setValues([rowVals]);
      }

      syncSingleTopicCatalogStats(cleanTopic, meta);
      SpreadsheetApp.flush();
    } catch (sheetErr) {}

    return {
      ok: true,
      lessonKey: cleanTopic,
      order: orderNum,
      updatedAt: formatNowVN()
    };
  } finally {
    lock.releaseLock();
  }
}

function beginTopicSave(metaOrString) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var meta = normalizeMetaInput(metaOrString);
    var cleanTopic = meta.lessonKey;

    putLargeCache('LESSON_BACKUP_' + cleanTopic, '[]', 21600);

    try {
      var ss = initDatabase();
      var sheet = ss.getSheetByName(SHEET_QUESTIONS);
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var topicCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = topicCol.length - 1; i >= 0; i--) {
          if (String(topicCol[i][0]).trim() === cleanTopic) {
            sheet.deleteRow(i + 2);
          }
        }
      }
      SpreadsheetApp.flush();
    } catch (e) {}

    upsertCatalogEntry(meta, 0, { P1: 0, P2: 0, P3: 0, P4: 0 });
    return { ok: true, topic: cleanTopic, meta: meta };
  } finally {
    lock.releaseLock();
  }
}

function saveBatchSlidesChunk(metaOrString, slidesChunk, startOrderIndex) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var meta = normalizeMetaInput(metaOrString);
    var cleanTopic = meta.lessonKey;
    var baseIdx = Number(startOrderIndex) || 0;

    if (!slidesChunk || !slidesChunk.length) {
      return { ok: true, savedInChunk: 0, lessonKey: cleanTopic };
    }

    try {
      var existingRaw = getLargeCache('LESSON_BACKUP_' + cleanTopic);
      var existingArr = existingRaw ? JSON.parse(existingRaw) : [];
      for (var c = 0; c < slidesChunk.length; c++) {
        existingArr.push(slidesChunk[c]);
      }
      putLargeCache('LESSON_BACKUP_' + cleanTopic, existingArr, 21600);
    } catch (e) {}

    var tHash = makeTopicHash(cleanTopic);
    var rowsToInsert = [];
    for (var i = 0; i < slidesChunk.length; i++) {
      var q = slidesChunk[i];
      if (q.img && String(q.img).length > 20) {
        putLargeCache('ELIMG_' + tHash + '_' + (baseIdx + i), String(q.img), 21600);
      }
      rowsToInsert.push(buildQuestionRowValues(cleanTopic, meta, baseIdx + i + 1, q));
    }

    try {
      var ss = initDatabase();
      var sheet = ss.getSheetByName(SHEET_QUESTIONS);
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToInsert.length, 22).setValues(rowsToInsert);
      syncSingleTopicCatalogStats(cleanTopic, meta);
      SpreadsheetApp.flush();
    } catch (sheetErr) {
      var rawBack = getLargeCache('LESSON_BACKUP_' + cleanTopic);
      var arrBack = rawBack ? JSON.parse(rawBack) : [];
      var pSum = { P1: 0, P2: 0, P3: 0, P4: 0 };
      for (var m = 0; m < arrBack.length; m++) {
        var ph = String(arrBack[m].phase || 'Pha 3');
        if (ph.indexOf('Pha 1') === 0) pSum.P1++;
        else if (ph.indexOf('Pha 2') === 0) pSum.P2++;
        else if (ph.indexOf('Pha 4') === 0) pSum.P4++;
        else pSum.P3++;
      }
      upsertCatalogEntry(meta, arrBack.length, pSum);
    }

    return {
      ok: true,
      savedInChunk: rowsToInsert.length,
      lessonKey: cleanTopic,
      meta: meta
    };
  } finally {
    lock.releaseLock();
  }
}

function syncSingleTopicCatalogStats(lessonKey, fallbackMeta) {
  var ss = getDatabaseSpreadsheet();
  var qSheet = ss.getSheetByName(SHEET_QUESTIONS);
  var lastRow = qSheet.getLastRow();
  var count = 0;
  var phaseSummary = { P1: 0, P2: 0, P3: 0, P4: 0 };
  var detectedMeta = fallbackMeta || parseLessonKeyMeta(lessonKey);

  if (lastRow > 1) {
    var topicCol = qSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var cfgCol   = qSheet.getRange(2, 22, lastRow - 1, 1).getValues();

    for (var i = 0; i < topicCol.length; i++) {
      if (String(topicCol[i][0]).trim() === lessonKey) {
        count++;
        var cfg = {};
        try {
          if (cfgCol[i][0]) cfg = JSON.parse(String(cfgCol[i][0]));
        } catch (e) {}
        var ph = String(cfg.phase || 'Pha 3: Luyện tập');
        if (ph.indexOf('Pha 1') === 0) phaseSummary.P1++;
        else if (ph.indexOf('Pha 2') === 0) phaseSummary.P2++;
        else if (ph.indexOf('Pha 4') === 0) phaseSummary.P4++;
        else phaseSummary.P3++;
      }
    }
  }

  upsertCatalogEntry(detectedMeta, count, phaseSummary);
}

function saveFullLessonToSheet(metaOrString, questionsArray) {
  var resBegin = beginTopicSave(metaOrString);
  if (questionsArray && questionsArray.length > 0) {
    saveBatchSlidesChunk(resBegin.meta, questionsArray, 0);
  }
  var catalog = getLessonCatalog();
  return {
    ok: true,
    topic: resBegin.topic,
    meta: resBegin.meta,
    count: questionsArray ? questionsArray.length : 0,
    topics: catalog.topics,
    lessons: catalog.lessons
  };
}

function loadTopicQuestions(topicName) {
  var cleanTopic = String(topicName || '').trim();
  var result = [];

  try {
    var ss = initDatabase();
    var sheet = ss.getSheetByName(SHEET_QUESTIONS);
    var lastRow = sheet.getLastRow();

    if (lastRow > 1) {
      var topicCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < topicCol.length; i++) {
        if (String(topicCol[i][0]).trim() === cleanTopic) {
          var rowVals = sheet.getRange(i + 2, 1, 1, 22).getValues()[0];
          var fullImg = joinColumnsToImage(rowVals, 9);
          var stepCfg = {
            phase: 'Pha 3: Luyện tập',
            slideType: 'QUIZ',
            isGhiVo: false,
            aiExplanation: '',
            aiSlideCategory: '',
            videoUrl: '',
            startSec: 0,
            endSec: 0,
            videoNote: '',
            multiMode: 'EXACT',
            correctList: null
          };
          if (rowVals[21]) {
            try {
              var parsed = JSON.parse(String(rowVals[21]));
              for (var k in parsed) stepCfg[k] = parsed[k];
            } catch (e) {}
          }

          var rawCorrectCell = String(rowVals[7] !== undefined ? rowVals[7] : '0');
          var cList = [];
          if (Array.isArray(stepCfg.correctList) && stepCfg.correctList.length > 0) {
            cList = stepCfg.correctList.map(Number);
          } else if (rawCorrectCell.indexOf(',') > -1) {
            var sp = rawCorrectCell.split(',');
            for (var s = 0; s < sp.length; s++) {
              var num = parseInt(sp[s].trim(), 10);
              if (!isNaN(num)) cList.push(num);
            }
          } else {
            var single = parseInt(rawCorrectCell, 10);
            cList = [!isNaN(single) ? single : 0];
          }

          result.push({
            order: Number(rowVals[1]) || result.length + 1,
            q: String(rowVals[2] || ''),
            opts: [
              String(rowVals[3] || 'Đáp án A'),
              String(rowVals[4] || 'Đáp án B'),
              String(rowVals[5] || 'Đáp án C'),
              String(rowVals[6] || 'Đáp án D')
            ],
            correct: cList[0] || 0,
            correctList: cList,
            time: Number(rowVals[8]) || 20,
            img: fullImg,
            phase: stepCfg.phase,
            slideType: stepCfg.slideType,
            isGhiVo: Boolean(stepCfg.isGhiVo),
            aiExplanation: String(stepCfg.aiExplanation || ''),
            aiSlideCategory: String(stepCfg.aiSlideCategory || ''),
            videoUrl: stepCfg.videoUrl,
            startSec: stepCfg.startSec,
            endSec: stepCfg.endSec,
            videoNote: stepCfg.videoNote,
            multiMode: stepCfg.multiMode || 'EXACT',
            grade: stepCfg.grade || '',
            semester: stepCfg.semester || '',
            period: stepCfg.period || '',
            title: stepCfg.title || ''
          });
        }
      }
    }
  } catch (e) {}

  if (result.length === 0) {
    try {
      var rawBack = getLargeCache('LESSON_BACKUP_' + cleanTopic);
      if (rawBack) result = JSON.parse(rawBack);
    } catch (e) {}
  }

  result.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  return result;
}

/**
 * ============================================================================
 * CHẾ ĐỘ TỰ HỌC E-LEARNING THEO KHỐI & TIẾT MONG MUỐN CHO HỌC SINH
 * ============================================================================
 */
function getElearningLessonPackage(lessonKey) {
  var cleanKey = String(lessonKey || '').trim();
  if (!cleanKey) return { ok: false, msg: 'Chưa chọn bài giảng tự học!' };

  var fullQuestions = loadTopicQuestions(cleanKey);
  if (!fullQuestions || fullQuestions.length === 0) {
    return { ok: false, msg: 'Bài giảng này chưa có nội dung hoặc câu hỏi!' };
  }

  var meta = parseLessonKeyMeta(cleanKey, fullQuestions[0] || {});
  var tHash = makeTopicHash(cleanKey);

  var steps = fullQuestions.map(function(q, idx) {
    var hasImg = Boolean(q.img && String(q.img).length > 20);
    if (hasImg) {
      putLargeCache('ELIMG_' + tHash + '_' + idx, String(q.img), 21600);
    }
    var cList = normalizeCorrectList(q);
    return {
      order: idx + 1,
      q: q.q || ('Bước ' + (idx + 1)),
      opts: q.opts || ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
      correct: cList[0],
      correctList: cList,
      multiMode: q.multiMode || 'EXACT',
      time: Number(q.time) || 20,
      hasImg: hasImg,
      phase: q.phase || 'Pha 3: Luyện tập',
      slideType: (q.slideType === 'MULTI' || cList.length > 1) ? 'MULTI' : (q.slideType || 'QUIZ'),
      isGhiVo: Boolean(q.isGhiVo),
      aiExplanation: String(q.aiExplanation || ''),
      aiSlideCategory: String(q.aiSlideCategory || ''),
      videoUrl: q.videoUrl || '',
      startSec: Number(q.startSec) || 0,
      endSec: Number(q.endSec) || 0,
      videoNote: q.videoNote || ''
    };
  });

  return {
    ok: true,
    lessonKey: cleanKey,
    grade: meta.grade,
    semester: meta.semester,
    period: meta.period,
    lessonTitle: meta.title,
    totalSteps: steps.length,
    steps: steps
  };
}

function getElearningSlideImage(lessonKey, qIndex) {
  var cleanKey = String(lessonKey || '').trim();
  var idx = Number(qIndex) || 0;
  var tHash = makeTopicHash(cleanKey);
  var cacheKey = 'ELIMG_' + tHash + '_' + idx;
  var cached = getLargeCache(cacheKey);
  if (cached) {
    return { ok: true, qIndex: idx, img: cached };
  }

  try {
    var ss = initDatabase();
    var sheet = ss.getSheetByName(SHEET_QUESTIONS);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var topOrd = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < topOrd.length; i++) {
        if (String(topOrd[i][0]).trim() === cleanKey && Number(topOrd[i][1]) === (idx + 1)) {
          var imgRow = sheet.getRange(i + 2, 10, 1, IMG_CHUNK_COLS).getValues()[0];
          var fullImg = joinColumnsToImage(imgRow, 0);
          if (fullImg) {
            putLargeCache(cacheKey, fullImg, 21600);
          }
          return { ok: Boolean(fullImg), qIndex: idx, img: fullImg || '' };
        }
      }
    }
  } catch (e) {}

  return { ok: false, qIndex: idx, img: '' };
}

function saveElearningResult(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(12000);
  try {
    var data = payload || {};
    var meta = parseLessonKeyMeta(data.lessonKey || '');
    var studentName = String(data.studentName || 'Học sinh').trim();
    var studentClass = String(data.studentClass || 'Lớp').trim();
    var completedSteps = Number(data.completedSteps) || 0;
    var totalSteps = Number(data.totalSteps) || 1;
    var correctQuiz = Number(data.correctQuizCount) || 0;
    var totalQuiz = Number(data.totalQuizCount) || 0;
    var accuracy = totalQuiz > 0 ? Math.round((correctQuiz / totalQuiz) * 100) : 100;
    var totalScore = Number(data.totalScore) || 0;
    var durationSec = Number(data.durationSec) || 0;
    var statusText = accuracy >= 80 ? 'ĐẠT XUẤT SẮC' : (accuracy >= 50 ? 'ĐẠT YÊU CẦU' : 'CẦN ÔN LẠI');

    try {
      var ss = initDatabase();
      var elSheet = ss.getSheetByName(SHEET_ELEARNING);
      elSheet.appendRow([
        new Date(),
        data.grade || meta.grade,
        data.semester || meta.semester,
        data.period || meta.period,
        data.lessonTitle || meta.title,
        meta.lessonKey,
        studentName,
        studentClass,
        completedSteps,
        totalSteps,
        correctQuiz,
        totalQuiz,
        accuracy + '%',
        totalScore,
        durationSec,
        statusText
      ]);

      var rSheet = ss.getSheetByName(SHEET_RESULTS);
      rSheet.appendRow([
        new Date(),
        'E-LEARNING',
        data.grade || meta.grade,
        data.period || meta.period,
        data.lessonTitle || meta.title,
        'Hoàn thành Tự học',
        'ELEARNING',
        studentName,
        studentClass,
        totalSteps,
        correctQuiz + '/' + totalQuiz + ' câu đúng (' + accuracy + '%)',
        statusText,
        durationSec * 1000,
        totalScore,
        totalScore,
        correctQuiz
      ]);
      SpreadsheetApp.flush();
    } catch (e) {}

    return {
      ok: true,
      accuracy: accuracy,
      statusText: statusText,
      savedAt: formatNowVN()
    };
  } finally {
    lock.releaseLock();
  }
}

function getElearningHistoryList() {
  var rows = [];
  try {
    var ss = initDatabase();
    var elSheet = ss.getSheetByName(SHEET_ELEARNING);
    var lastRow = elSheet.getLastRow();
    if (lastRow > 1) {
      var startRow = Math.max(2, lastRow - 99);
      var numRows = lastRow - startRow + 1;
      var data = elSheet.getRange(startRow, 1, numRows, 16).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var r = data[i];
        var timeStr = '';
        try {
          timeStr = Utilities.formatDate(new Date(r[0]), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
        } catch (e) {
          timeStr = String(r[0] || '');
        }
        rows.push({
          time: timeStr,
          grade: String(r[1] || ''),
          semester: String(r[2] || ''),
          period: String(r[3] || ''),
          lessonTitle: String(r[4] || ''),
          lessonKey: String(r[5] || ''),
          studentName: String(r[6] || ''),
          studentClass: String(r[7] || ''),
          completedSteps: Number(r[8]) || 0,
          totalSteps: Number(r[9]) || 0,
          correctQuizCount: Number(r[10]) || 0,
          totalQuizCount: Number(r[11]) || 0,
          accuracy: String(r[12] || '100%'),
          totalScore: Number(r[13]) || 0,
          durationSec: Number(r[14]) || 0,
          status: String(r[15] || '')
        });
      }
    }
  } catch (e) {}
  return { ok: true, records: rows };
}

function cloneLessonInSheet(sourceLessonKey, newMetaInput) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var srcKey = String(sourceLessonKey || '').trim();
    var targetMeta = normalizeMetaInput(newMetaInput);
    var targetKey = targetMeta.lessonKey;

    if (!srcKey) return { ok: false, msg: 'Chưa chọn bài giảng nguồn để nhân bản!' };
    if (srcKey === targetKey) return { ok: false, msg: 'Khối/Tiết/Tên bài mới trùng với bài giảng gốc!' };

    var srcQuestions = loadTopicQuestions(srcKey);
    if (!srcQuestions || srcQuestions.length === 0) {
      return { ok: false, msg: 'Không tìm thấy dữ liệu slide trong bài giảng nguồn!' };
    }

    beginTopicSave(targetMeta);
    saveBatchSlidesChunk(targetMeta, srcQuestions, 0);

    var catalog = getLessonCatalog();
    return {
      ok: true,
      newLessonKey: targetKey,
      meta: targetMeta,
      slideCount: srcQuestions.length,
      lessons: catalog.lessons
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteLessonByKey(lessonKey) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cleanKey = String(lessonKey || '').trim();

    var backupList = loadBackupCatalogList().filter(function(item) {
      return item.lessonKey !== cleanKey;
    });
    saveBackupCatalogList(backupList);

    try {
      var ss = initDatabase();
      var qSheet = ss.getSheetByName(SHEET_QUESTIONS);
      var catSheet = ss.getSheetByName(SHEET_CATALOG);

      var qLast = qSheet.getLastRow();
      if (qLast > 1) {
        var qTopics = qSheet.getRange(2, 1, qLast - 1, 1).getValues();
        for (var i = qTopics.length - 1; i >= 0; i--) {
          if (String(qTopics[i][0]).trim() === cleanKey) {
            qSheet.deleteRow(i + 2);
          }
        }
      }

      var cLast = catSheet.getLastRow();
      if (cLast > 1) {
        var cTopics = catSheet.getRange(2, 1, cLast - 1, 1).getValues();
        for (var j = cTopics.length - 1; j >= 0; j--) {
          if (String(cTopics[j][0]).trim() === cleanKey) {
            catSheet.deleteRow(j + 2);
          }
        }
      }
      SpreadsheetApp.flush();
    } catch (e) {}

    var catalog = getLessonCatalog();
    return { ok: true, deletedKey: cleanKey, lessons: catalog.lessons };
  } finally {
    lock.releaseLock();
  }
}

function createGameRoom(topicName, customQuestions) {
  var questions = [];

  if (customQuestions && customQuestions.length > 0) {
    questions = customQuestions;
  } else {
    questions = loadTopicQuestions(topicName);
  }

  if (!questions || questions.length === 0) {
    return { ok: false, msg: 'Bài giảng chưa có bước/slide nào! Hãy thêm slide hoặc câu hỏi trước.' };
  }

  var meta = parseLessonKeyMeta(topicName, questions[0] || {});
  var pin = String(Math.floor(100000 + Math.random() * 900000));

  var lightQuestions = questions.map(function(q, idx) {
    var hasImg = Boolean(q.img && String(q.img).length > 20);
    if (hasImg) {
      putLargeCache('IMG_' + pin + '_' + idx, String(q.img), 21600);
    }
    var cList = normalizeCorrectList(q);
    return {
      order: idx + 1,
      q: q.q || ('Hoạt động câu ' + (idx + 1)),
      opts: q.opts || ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
      correct: cList[0],
      correctList: cList,
      multiMode: q.multiMode || 'EXACT',
      time: Number(q.time) || 20,
      hasImg: hasImg,
      phase: q.phase || 'Pha 3: Luyện tập',
      slideType: (q.slideType === 'MULTI' || cList.length > 1) ? 'MULTI' : (q.slideType || 'QUIZ'),
      isGhiVo: Boolean(q.isGhiVo),
      aiExplanation: String(q.aiExplanation || ''),
      aiSlideCategory: String(q.aiSlideCategory || ''),
      videoUrl: q.videoUrl || '',
      startSec: Number(q.startSec) || 0,
      endSec: Number(q.endSec) || 0,
      videoNote: q.videoNote || ''
    };
  });

  var roomState = {
    pin: pin,
    topic: meta.lessonKey,
    grade: meta.grade,
    semester: meta.semester,
    period: meta.period,
    lessonTitle: meta.title,
    status: 'LOBBY',
    currentQ: 0,
    qStartTime: 0,
    questions: lightQuestions,
    players: {},
    wordCloudList: [],
    scoreOnTimeUpOnly: false, // Phiên bản 8.1: Tính điểm ngay khi học sinh chọn đáp án (mặc định)
    scoredQuestions: {}
  };

  putLargeCache('ROOM_' + pin, roomState, 21600);

  try {
    var ss = initDatabase();
    var sSheet = ss.getSheetByName(SHEET_SESSIONS);
    sSheet.appendRow([new Date(), pin, meta.grade, meta.period, meta.title, lightQuestions.length, 'CREATED']);
  } catch (e) {}

  var sUrl = '';
  try { sUrl = ScriptApp.getService().getUrl(); } catch (e) {}

  return {
    ok: true,
    pin: pin,
    total: lightQuestions.length,
    topic: meta.lessonKey,
    grade: meta.grade,
    semester: meta.semester,
    period: meta.period,
    lessonTitle: meta.title,
    studentUrl: sUrl
  };
}

function getStudentSlideImage(pin, qIndex) {
  var cleanPin = String(pin || '').trim();
  var idx = Number(qIndex) || 0;
  var imgData = getLargeCache('IMG_' + cleanPin + '_' + idx);
  return { ok: Boolean(imgData), qIndex: idx, img: imgData || '' };
}

/**
 * ============================================================================
 * TÍNH NĂNG: HẾT THỜI GIAN MỚI ĐƯỢC CỘNG ĐIỂM (awardPointsForCurrentQuestion)
 * - Khi học sinh trả lời trong thời gian câu hỏi, điểm chỉ được tính tạm (pending)
 * - CHỈ KHI HẾT THỜI GIAN (hoặc khi Giáo viên chốt REVEAL / chuyển bước):
 *   Hệ thống mới chính thức cộng điểm vào tổng điểm của học sinh (player.score)
 *   và ghi nhận kết quả vào Google Sheets (KetQuaChiTiet)
 * ============================================================================
 */
function awardPointsForCurrentQuestion(room) {
  if (!room || !room.questions || !room.players) return;
  var qIdx = room.currentQ;
  if (!room.scoredQuestions) room.scoredQuestions = {};
  if (room.scoredQuestions[qIdx]) return; // Đã chốt điểm câu này rồi, tránh cộng lặp lại

  var qObj = room.questions[qIdx];
  if (!qObj) return;
  var sType = qObj.slideType || 'QUIZ';
  var pNames = Object.keys(room.players);
  var rowsToLog = [];

  for (var i = 0; i < pNames.length; i++) {
    var p = room.players[pNames[i]];
    if (!p) continue;
    if (p.scoreAwarded) continue; // Đã được cộng điểm

    var earnedPoints = 0;
    var correctStatus = false;
    var ansLabel = p.lastAnswerText || '';

    if (p.lastAnswer !== -1) {
      // Học sinh đã nộp bài trong thời gian quy định
      correctStatus = Boolean(p.pendingCorrect);
      earnedPoints = Number(p.pendingPoints) || 0;

      if (correctStatus) {
        p.streak = (Number(p.streak) || 0) + 1;
      } else {
        p.streak = 0;
      }
      p.score = (Number(p.score) || 0) + earnedPoints;
      p.lastCorrect = correctStatus;
      p.lastPoints = earnedPoints;
      p.scoreAwarded = true;
    } else {
      // Hết thời gian mà học sinh chưa kịp nộp câu trả lời (Timeout)
      p.streak = 0;
      p.lastAnswer = -1;
      p.lastAnswerText = 'Hết giờ';
      p.lastCorrect = false;
      p.lastPoints = 0;
      p.scoreAwarded = true;
      earnedPoints = 0;
      correctStatus = false;
      ansLabel = 'Hết giờ';
    }

    if (p.lastAnswer !== -1 || sType === 'QUIZ' || sType === 'MULTI') {
      rowsToLog.push([
        new Date(),
        room.pin,
        room.grade || 'Khối 6',
        room.period || 'Tiết 1',
        room.lessonTitle || room.topic,
        qObj.phase || 'Pha 3',
        sType,
        p.name,
        p.className,
        qIdx + 1,
        ansLabel || 'Không chọn',
        correctStatus ? 'ĐÚNG' : (p.lastAnswer === -1 ? 'HẾT GIỜ' : 'SAI'),
        p.elapsedMs || ((Number(qObj.time) || 20) * 1000),
        earnedPoints,
        p.score,
        p.streak
      ]);
    }
  }

  room.scoredQuestions[qIdx] = true;

  if (rowsToLog.length > 0) {
    try {
      var ss = getDatabaseSpreadsheet();
      var rSheet = ss.getSheetByName(SHEET_RESULTS);
      if (rSheet) {
        var startR = rSheet.getLastRow() + 1;
        rSheet.getRange(startR, 1, rowsToLog.length, 16).setValues(rowsToLog);
      }
    } catch (e) {}
  }
}

function hostControl(pin, action) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = 'ROOM_' + String(pin).trim();
    var raw = getLargeCache(key);
    if (!raw) return { ok: false, msg: 'Phòng học đã hết hạn hoặc không tồn tại!' };

    var room = JSON.parse(raw);

    if (action === 'START_GAME') {
      room.status = 'QUESTION';
      room.currentQ = 0;
      room.qStartTime = Date.now();
      room.wordCloudList = [];
      room.scoredQuestions = {};
      var pNames0 = Object.keys(room.players);
      for (var p0 = 0; p0 < pNames0.length; p0++) {
        room.players[pNames0[p0]].score = 0;
        room.players[pNames0[p0]].streak = 0;
      }
      resetPlayersForNewQuestion(room);
    } else if (action === 'REVEAL') {
      awardPointsForCurrentQuestion(room);
      room.status = 'REVEAL';
    } else if (action === 'LEADERBOARD') {
      awardPointsForCurrentQuestion(room);
      room.status = 'LEADERBOARD';
    } else if (action === 'NEXT_QUESTION') {
      awardPointsForCurrentQuestion(room);
      if (room.currentQ + 1 < room.questions.length) {
        room.currentQ += 1;
        room.status = 'QUESTION';
        room.qStartTime = Date.now();
        room.wordCloudList = [];
        resetPlayersForNewQuestion(room);
      } else {
        room.status = 'FINISHED';
      }
    } else if (action === 'PREV_QUESTION') {
      awardPointsForCurrentQuestion(room);
      if (room.currentQ > 0) {
        room.currentQ -= 1;
        room.status = 'QUESTION';
        room.qStartTime = Date.now();
        room.wordCloudList = [];
        resetPlayersForNewQuestion(room);
      }
    } else if (action.indexOf('JUMP_STEP|') === 0) {
      awardPointsForCurrentQuestion(room);
      var targetIdx = parseInt(action.split('|')[1], 10) || 0;
      if (targetIdx >= 0 && targetIdx < room.questions.length) {
        room.currentQ = targetIdx;
        room.status = 'QUESTION';
        room.qStartTime = Date.now();
        room.wordCloudList = [];
        resetPlayersForNewQuestion(room);
      }
    } else if (action === 'TOGGLE_SCORE_MODE') {
      room.scoreOnTimeUpOnly = !Boolean(room.scoreOnTimeUpOnly);
    }

    putLargeCache(key, room, 21600);
    return buildSyncPayload(room, 'HOST', '');
  } finally {
    lock.releaseLock();
  }
}

function resetPlayersForNewQuestion(room) {
  var names = Object.keys(room.players);
  for (var i = 0; i < names.length; i++) {
    var p = room.players[names[i]];
    p.lastAnswer = -1;
    p.lastAnswerText = '';
    p.lastCorrect = false;
    p.lastPoints = 0;
    p.pendingPoints = 0;
    p.pendingCorrect = false;
    p.scoreAwarded = false;
    p.elapsedMs = 0;
  }
}

function joinGame(pin, studentName, studentClass) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cleanPin = String(pin || '').trim();
    var cleanName = String(studentName || '').trim();
    var cleanClass = String(studentClass || '').trim() || 'Lớp';

    if (!cleanPin || !cleanName) {
      return { ok: false, msg: 'Vui lòng nhập đầy đủ Mã PIN và Họ tên!' };
    }

    var key = 'ROOM_' + cleanPin;
    var raw = getLargeCache(key);
    if (!raw) {
      return { ok: false, msg: 'Không tìm thấy phòng học có mã PIN: ' + cleanPin };
    }

    var room = JSON.parse(raw);
    if (!room.players[cleanName]) {
      room.players[cleanName] = {
        name: cleanName,
        className: cleanClass,
        score: 0,
        streak: 0,
        lastAnswer: -1,
        lastAnswerText: '',
        lastCorrect: false,
        lastPoints: 0
      };
      putLargeCache(key, room, 21600);
    }

    return buildSyncPayload(room, 'STUDENT', cleanName);
  } finally {
    lock.releaseLock();
  }
}

function submitAnswer(pin, studentName, ansIndexOrPayload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = 'ROOM_' + String(pin).trim();
    var raw = getLargeCache(key);
    if (!raw) return { ok: false, msg: 'Phòng học không tồn tại!' };

    var room = JSON.parse(raw);
    var player = room.players[studentName];
    if (!player) return { ok: false, msg: 'Bạn chưa tham gia phòng này!' };

    if (room.status !== 'QUESTION') {
      return { ok: false, msg: 'Đã hết giờ hoặc bước này đã đóng!' };
    }

    if (player.lastAnswer !== -1) {
      return buildSyncPayload(room, 'STUDENT', studentName);
    }

    var qObj = room.questions[room.currentQ];
    var sType = qObj.slideType || 'QUIZ';
    var elapsedMs = Math.max(200, Date.now() - room.qStartTime);
    var limitMs = (Number(qObj.time) || 20) * 1000;

    var isCorrect = false;
    var points = 0;
    var answerLabel = '';

    if (sType === 'WORDCLOUD') {
      var textVal = String(ansIndexOrPayload || '').trim().substring(0, 60);
      player.lastAnswer = 0;
      player.lastAnswerText = textVal || 'Đã gửi';
      isCorrect = true;
      points = 200;
      answerLabel = textVal;
      if (!room.wordCloudList) room.wordCloudList = [];
      if (textVal) room.wordCloudList.push({ name: studentName, text: textVal });
    } else if (sType === 'SLIDE' || sType === 'VIDEO') {
      player.lastAnswer = 0;
      player.lastAnswerText = 'Đã xem/Đã hiểu';
      isCorrect = true;
      points = 0; // SLIDE & VIDEO: BỎ QUA TÍNH ĐIỂM
      answerLabel = 'Đã xem';
    } else if (sType === 'POLL') {
      var idxPoll = Number(ansIndexOrPayload);
      player.lastAnswer = idxPoll;
      isCorrect = true;
      points = 150;
      answerLabel = ['A', 'B', 'C', 'D'][idxPoll] || 'A';
    } else if (sType === 'MULTI') {
      var chosen = [];
      if (Array.isArray(ansIndexOrPayload)) {
        chosen = ansIndexOrPayload.map(Number);
      } else if (typeof ansIndexOrPayload === 'string') {
        var sp = ansIndexOrPayload.split(',');
        for (var s = 0; s < sp.length; s++) {
          var n = parseInt(sp[s].trim(), 10);
          if (!isNaN(n)) chosen.push(n);
        }
      } else if (typeof ansIndexOrPayload === 'number') {
        chosen = [ansIndexOrPayload];
      }
      var cleanChosen = [];
      for (var c = 0; c < chosen.length; c++) {
        if (chosen[c] >= 0 && chosen[c] <= 3 && cleanChosen.indexOf(chosen[c]) === -1) {
          cleanChosen.push(chosen[c]);
        }
      }
      cleanChosen.sort();

      var targetList = normalizeCorrectList(qObj);
      var multiMode = qObj.multiMode || 'EXACT';

      var correctHits = 0;
      var wrongHits = 0;
      for (var i = 0; i < cleanChosen.length; i++) {
        if (targetList.indexOf(cleanChosen[i]) > -1) correctHits++;
        else wrongHits++;
      }

      var isExactMatch = (correctHits === targetList.length && wrongHits === 0);
      var speedRatio = Math.max(0, Math.min(1, 1 - (elapsedMs / limitMs)));

      if (isExactMatch) {
        isCorrect = true;
        points = Math.round(500 + 500 * speedRatio);
        if ((player.streak || 0) >= 2) points += 100;
      } else if (multiMode === 'PARTIAL' && correctHits > 0 && wrongHits === 0) {
        isCorrect = true;
        var partialRatio = correctHits / targetList.length;
        points = Math.round((400 + 300 * speedRatio) * partialRatio);
      } else {
        isCorrect = false;
        points = 0;
      }

      player.lastAnswer = cleanChosen.length > 0 ? cleanChosen[0] : 0;
      player.lastAnswerText = cleanChosen.map(function(idx) { return ['A', 'B', 'C', 'D'][idx]; }).join(',');
      answerLabel = player.lastAnswerText || 'Không chọn';
    } else {
      var idxSingle = Number(ansIndexOrPayload);
      var targetSingle = normalizeCorrectList(qObj);
      isCorrect = (targetSingle.indexOf(idxSingle) > -1 && elapsedMs <= limitMs + 2500);
      if (isCorrect) {
        var speedRatioSingle = Math.max(0, Math.min(1, 1 - (elapsedMs / limitMs)));
        points = Math.round(500 + 500 * speedRatioSingle);
        if ((player.streak || 0) >= 2) points += 100;
      } else {
        points = 0;
      }
      player.lastAnswer = idxSingle;
      player.lastAnswerText = ['A', 'B', 'C', 'D'][idxSingle] || '?';
      answerLabel = player.lastAnswerText;
    }

    player.elapsedMs = elapsedMs;

    // TÍNH NĂNG: HẾT THỜI GIAN MỚI ĐƯỢC CỘNG ĐIỂM (scoreOnTimeUpOnly)
    var isScoreOnTimeUp = (room.scoreOnTimeUpOnly === true);
    if (isScoreOnTimeUp && sType !== 'SLIDE' && sType !== 'VIDEO') {
      // Lưu lại kết quả dự kiến, CHƯA CỘNG VÀO player.score và CHƯA CỘNG streak
      player.pendingPoints = points;
      player.pendingCorrect = isCorrect;
      player.scoreAwarded = false;
      player.lastCorrect = false;
      player.lastPoints = 0;
    } else {
      // Chế độ tính điểm ngay khi học sinh chọn đáp án (Mặc định Phiên bản 8.1)
      player.score = (Number(player.score) || 0) + points;
      if (isCorrect) {
        player.streak = (Number(player.streak) || 0) + 1;
      } else {
        player.streak = 0;
      }
      player.pendingPoints = points;
      player.pendingCorrect = isCorrect;
      player.lastCorrect = isCorrect;
      player.lastPoints = points;
      player.scoreAwarded = true;

      try {
        var ss = getDatabaseSpreadsheet();
        var rSheet = ss.getSheetByName(SHEET_RESULTS);
        rSheet.appendRow([
          new Date(),
          room.pin,
          room.grade || 'Khối 6',
          room.period || 'Tiết 1',
          room.lessonTitle || room.topic,
          qObj.phase || 'Pha 3',
          sType,
          player.name,
          player.className,
          room.currentQ + 1,
          answerLabel,
          isCorrect ? 'ĐÚNG' : 'SAI',
          elapsedMs,
          points,
          player.score,
          player.streak
        ]);
      } catch (e) {}
    }

    putLargeCache(key, room, 21600);
    return buildSyncPayload(room, 'STUDENT', studentName);
  } finally {
    lock.releaseLock();
  }
}

function getSyncState(pin, role, studentName) {
  var key = 'ROOM_' + String(pin || '').trim();
  var raw = getLargeCache(key);
  if (!raw) return { ok: false, msg: 'Phòng không tồn tại hoặc đã đóng!' };
  var room = JSON.parse(raw);

  // Kiểm tra nếu đang ở câu hỏi có tính giờ và đã HẾT THỜI GIAN:
  if (room.status === 'QUESTION' && room.questions && room.questions[room.currentQ]) {
    var curQ = room.questions[room.currentQ];
    var sType = curQ.slideType || 'QUIZ';
    var isNoTime = (sType === 'SLIDE' || sType === 'VIDEO');
    if (!isNoTime) {
      var elapsedSec = room.qStartTime ? Math.floor((Date.now() - room.qStartTime) / 1000) : 0;
      var limitSec = Number(curQ.time) || 20;
      if (elapsedSec >= limitSec) {
        // Đã hết thời gian: tự động chốt tính điểm cho học sinh
        awardPointsForCurrentQuestion(room);
        putLargeCache(key, room, 21600);
      }
    }
  }

  return buildSyncPayload(room, role, studentName);
}

function buildSyncPayload(room, role, studentName) {
  var playerKeys = Object.keys(room.players);
  var playerList = [];
  var answeredCount = 0;
  var dist = [0, 0, 0, 0];

  for (var i = 0; i < playerKeys.length; i++) {
    var p = room.players[playerKeys[i]];
    playerList.push({
      name: p.name,
      className: p.className,
      score: p.score,
      streak: p.streak
    });
    if (p.lastAnswer !== -1) {
      answeredCount++;
      if (p.lastAnswerText && p.lastAnswerText.indexOf(',') > -1) {
        var parts = p.lastAnswerText.split(',');
        for (var k = 0; k < parts.length; k++) {
          var idx = ['A', 'B', 'C', 'D'].indexOf(parts[k].trim());
          if (idx >= 0 && idx <= 3) dist[idx]++;
        }
      } else if (p.lastAnswer >= 0 && p.lastAnswer <= 3) {
        dist[p.lastAnswer]++;
      }
    }
  }

  playerList.sort(function(a, b) { return b.score - a.score; });

  var qObj = room.questions[room.currentQ] || {};
  var qSlideType = qObj.slideType || 'QUIZ';
  var isNoTimerSlide = (qSlideType === 'SLIDE' || qSlideType === 'VIDEO');
  var elapsedSec = room.qStartTime ? Math.floor((Date.now() - room.qStartTime) / 1000) : 0;
  var timeLeft = isNoTimerSlide ? 0 : Math.max(0, (Number(qObj.time) || 20) - elapsedSec);
  var cList = normalizeCorrectList(qObj);

  var isScoreOnTimeUp = (room.scoreOnTimeUpOnly === true);
  var isQuestionActive = (room.status === 'QUESTION' && timeLeft > 0 && !isNoTimerSlide);

  var payload = {
    ok: true,
    pin: room.pin,
    topic: room.topic,
    grade: room.grade || 'Khối 6',
    semester: room.semester || 'HK1',
    period: room.period || 'Tiết 1',
    lessonTitle: room.lessonTitle || room.topic,
    status: room.status,
    currentQ: room.currentQ,
    totalQ: room.questions.length,
    timeLeft: timeLeft,
    scoreOnTimeUpOnly: isScoreOnTimeUp,
    totalPlayers: playerList.length,
    answeredCount: answeredCount,
    leaderboard: (role === 'STUDENT' && room.status !== 'FINISHED') ? [] : playerList.slice(0, 8),
    wordCloudList: room.wordCloudList || [],
    question: {
      q: qObj.q || '',
      opts: qObj.opts || ['A', 'B', 'C', 'D'],
      time: qObj.time || 20,
      hasImg: Boolean(qObj.hasImg),
      phase: qObj.phase || 'Pha 3: Luyện tập',
      slideType: qObj.slideType || 'QUIZ',
      isGhiVo: Boolean(qObj.isGhiVo),
      aiExplanation: (role === 'HOST' || room.status === 'REVEAL' || room.status === 'LEADERBOARD' || room.status === 'FINISHED') ? String(qObj.aiExplanation || '') : '',
      multiMode: qObj.multiMode || 'EXACT',
      videoUrl: qObj.videoUrl || '',
      startSec: Number(qObj.startSec) || 0,
      endSec: Number(qObj.endSec) || 0,
      videoNote: qObj.videoNote || '',
      correct: (role === 'HOST' || room.status === 'REVEAL' || room.status === 'LEADERBOARD' || room.status === 'FINISHED') ? cList[0] : -1,
      correctList: (role === 'HOST' || room.status === 'REVEAL' || room.status === 'LEADERBOARD' || room.status === 'FINISHED') ? cList : []
    }
  };

  if (role === 'HOST' || room.status === 'REVEAL') {
    payload.distribution = dist;
  }

  if (role === 'STUDENT' && studentName && room.players[studentName]) {
    var me = room.players[studentName];
    var myRank = 1;
    for (var r = 0; r < playerList.length; r++) {
      if (playerList[r].name === studentName) {
        myRank = r + 1;
        break;
      }
    }
    // Nếu hết giờ mới cộng điểm: trong khi câu hỏi đang đếm ngược (chưa hết giờ), ẩn điểm thưởng và kết quả câu hiện tại
    // Xoá bỏ hiển thị điểm trên màn hình học sinh trong suốt tiết học, học sinh chỉ biết điểm khi kết thúc tiết học (status === 'FINISHED')
    var isFinished = (room.status === 'FINISHED');
    var isRevealedOrDone = (room.status === 'REVEAL' || room.status === 'LEADERBOARD' || room.status === 'FINISHED');
    payload.me = {
      name: me.name,
      score: isFinished ? me.score : 0,
      streak: isFinished ? me.streak : 0,
      rank: isFinished ? myRank : 0,
      lastAnswer: me.lastAnswer,
      lastAnswerText: me.lastAnswerText || '',
      lastCorrect: isRevealedOrDone ? Boolean(me.lastCorrect || me.pendingCorrect) : false,
      lastPoints: isFinished ? me.lastPoints : 0,
      isScoredImmediately: !isScoreOnTimeUp && (me.lastAnswer !== -1),
      isPendingTimeUp: isScoreOnTimeUp && isQuestionActive && (me.lastAnswer !== -1)
    };
  }

  return payload;
}

/**
 * ============================================================================
 * HỆ THỐNG TRÍ TUỆ NHÂN TẠO (GEMINI AI MULTIMODAL VISION + TEXT)
 * - Quét thông minh bài giảng PDF / Ảnh Slide (kể cả file scan không có lớp chữ)
 * - AI tự động nhận diện đúng dạng slide (Bài giảng, Ghi vở, Trắc nghiệm 1 ĐA,
 *   Chọn nhiều ĐA, Thảo luận WordCloud, Khảo sát Poll)
 * - AI tự động suy luận & trả lời đáp án đúng kèm lời giải thích chi tiết
 * ============================================================================
 */
function saveGeminiApiKeyServer(apiKeyInput) {
  var clean = String(apiKeyInput || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (clean) {
    props.setProperty(PROP_GEMINI_KEY, clean);
  } else {
    props.deleteProperty(PROP_GEMINI_KEY);
  }
  return {
    ok: true,
    hasKey: Boolean(clean && clean.length > 10),
    model: 'gemini-3-flash-preview',
    maskedKey: (clean && clean.length > 10) ? (clean.substring(0, 6) + '...' + clean.substring(clean.length - 4)) : ''
  };
}

function getGeminiApiKeyStatus() {
  var props = PropertiesService.getScriptProperties();
  var clean = String(props.getProperty(PROP_GEMINI_KEY) || '').trim();
  return {
    ok: true,
    hasKey: Boolean(clean && clean.length > 10),
    savedKey: clean,
    model: 'gemini-3-flash-preview',
    maskedKey: (clean && clean.length > 10) ? (clean.substring(0, 6) + '...' + clean.substring(clean.length - 4)) : ''
  };
}

function testGeminiConnectionServer(optionalTempKey) {
  try {
    var props = PropertiesService.getScriptProperties();
    var apiKey = String(optionalTempKey || props.getProperty(PROP_GEMINI_KEY) || '').trim();
    if (!apiKey || apiKey.length < 10) {
      return {
        ok: false,
        mode: 'SIMULATION',
        msg: 'Chưa nhập API Key. Hệ thống đang hoạt động ở Chế độ Mặc định: Trắc nghiệm 1 đáp án.'
      };
    }

    var models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3-flash-preview'];
    var lastErr = '';
    var startMs = Date.now();

    for (var i = 0; i < models.length; i++) {
      var modelName = models[i];
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(apiKey);
      var payload = {
        contents: [{
          parts: [{ text: 'Trả về JSON ngắn gọn: {"status":"OK","greeting":"Kết nối thành công mô hình AI giáo dục"}' }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var respBody = resp.getContentText();

      if (code === 200) {
        return {
          ok: true,
          mode: 'GEMINI_API',
          model: modelName,
          latencyMs: Date.now() - startMs,
          msg: 'Kết nối trực tiếp thành công với mô hình ' + modelName + ' (' + (Date.now() - startMs) + 'ms)!'
        };
      } else {
        lastErr = 'HTTP ' + code + ' (' + modelName + '): ' + respBody.substring(0, 160);
      }
    }

    var friendlyErr = lastErr;
    if (lastErr.indexOf('API_KEY_INVALID') > -1 || lastErr.indexOf('API key not valid') > -1 || lastErr.indexOf('HTTP 400') > -1) {
      friendlyErr = 'Mã API Key không hợp lệ trên Google AI Studio. Vui lòng kiểm tra lại: Gemini API Key phải được tạo từ https://aistudio.google.com và có tiền tố bắt đầu bằng "AIzaSy...".';
    }

    return {
      ok: false,
      mode: 'SIMULATION_FALLBACK',
      msg: friendlyErr
    };
  } catch (e) {
    var errMsg = (e && e.message ? e.message : String(e));
    var isPermErr = (errMsg.indexOf('UrlFetchApp') > -1 || errMsg.indexOf('external_request') > -1 || errMsg.indexOf('quyền') > -1);
    if (isPermErr) {
      errMsg = '⚠️ CHƯA CẤP QUYỀN TRUY CẬP CHO APPS SCRIPT: Bạn cần cấp quyền thực hiện lệnh gọi mạng (UrlFetchApp). Trong trình soạn thảo Google Apps Script, tại thanh công cụ trên cùng chọn hàm "capQuyenTruyCapChoHeThong" rồi bấm nút ▶️ "Chạy" (Run) ➔ bấm "Xem lại quyền" ➔ "Nâng cao" ➔ "Cho phép" một lần duy nhất!';
    }
    return {
      ok: false,
      isPermissionError: isPermErr,
      mode: isPermErr ? 'PERMISSION_ERROR' : 'SIMULATION_FALLBACK',
      msg: errMsg
    };
  }
}

function analyzeSlidesWithGeminiAI(slidesBatch, lessonContext, optionalTempKey, optionalTaskMode) {
  try {
    if (!slidesBatch || !slidesBatch.length) {
      return { ok: false, msg: 'Không có dữ liệu slide để phân tích AI!' };
    }

    var mode = optionalTaskMode || 'ALL';
    var props = PropertiesService.getScriptProperties();
    var apiKey = String(optionalTempKey || props.getProperty(PROP_GEMINI_KEY) || '').trim();
    if (!apiKey || apiKey.length < 10) {
      return {
        ok: false,
        needApiKey: true,
        mode: 'SIMULATION',
        msg: 'Chưa cấu hình Gemini API Key. Hệ thống sử dụng Chế độ Mô phỏng Thông minh cho Giáo dục để nhận diện dạng slide và giải đáp án!'
      };
    }

    var ctxGrade = (lessonContext && lessonContext.grade) ? lessonContext.grade : 'THCS/THPT';
    var ctxTitle = (lessonContext && lessonContext.title) ? lessonContext.title : 'Bài giảng';

    var systemInstruction = '';
    if (mode === 'CLASSIFY') {
      systemInstruction =
        'Bạn là Chuyên gia Sư phạm & Trí tuệ Nhân tạo Giáo dục (' + ctxGrade + ' - ' + ctxTitle + ').\n' +
        'NHIỆM VỤ ĐẶC THÙ: NHẬN DIỆN DẠNG SLIDE VÀ TRÍCH XUẤT PHƯƠNG ÁN (KHÔNG ĐIỀN ĐÁP ÁN ĐÚNG):\n' +
        '1. NGUYÊN TẮC QUÉT OCR BẮT BUỘC TIÊN QUYẾT: CỨ QUÉT THẤY CÁC KÝ HIỆU PHƯƠNG ÁN [A], [B], [C], [D] HOẶC A., B., C., D. (hoặc [A] [B] [C] [D] / A, B, C, D / (A), (B), (C), (D) / A) B) C) D) / A: B: C: D:) LÀ 100% SLIDE TRẮC NGHIỆM (slideType="QUIZ" hoặc "MULTI")!\n' +
        '   - TUYỆT ĐỐI KHÔNG ĐƯỢC phân loại nhầm thành Slide Bài giảng (SLIDE) khi slide có 4 chữ cái hoặc 4 phương án A, B, C, D!\n' +
        '   - CẢ 2 DẠNG BỐ CỤC ĐỀU LÀ TRẮC NGHIỆM 100% (KỂ CẢ KHI TRÊN SLIDE KHÔNG CÓ CÂU HỎI Ở TRÊN MÀ CHỈ CÓ 4 Ô/4 HÀNG ĐÁP ÁN):\n' +
        '     + Dạng 1 (4 ô nút bấm hình chữ nhật dạng lưới 2x2 như: ô A. Đọc báo điện tử | B. Gửi thư điện tử (Email) | C. Mạng xã hội & Tin nhắn trực tuyến | D. Tham gia Diễn đàn (Forum)): 100% là Slide Trắc nghiệm (QUIZ). Tự động đặt câu hỏi q phù hợp (ví dụ: "Theo em, cách trao đổi thông tin trên Internet nào đang được sử dụng nhiều nhất hiện nay?"), trích xuất 4 opts=["Đọc báo điện tử", "Gửi thư điện tử (Email)", "Mạng xã hội & Tin nhắn trực tuyến", "Tham gia Diễn đàn (Forum)"].\n' +
        '     + Dạng 2 (4 hàng dài xếp chồng dọc 1x4 như: A. Là một thư viện... | B. Là một cộng đồng trực tuyến... | C. Là phần mềm cài đặt... | D. Là một kênh truyền hình...): 100% là Slide Trắc nghiệm (QUIZ). Tự động đặt câu hỏi q phù hợp (ví dụ: "Khái niệm nào sau đây mô tả đúng nhất về Mạng xã hội?"), trích xuất 4 opts đầy đủ.\n' +
        '   - SLIDE BÀI GIẢNG LÝ THUYẾT (slideType="SLIDE", phase="Pha 2: Hình thành kiến thức", isGhiVo=false, aiSlideCategory="Slide Bài giảng"):\n' +
        '     + CHỈ phân loại là SLIDE khi KHÔNG CÓ các phương án trắc nghiệm A, B, C, D. Có đề mục lớn (1., 2.), mục nhỏ chữ thường ("a. Các kênh trao đổi...", "b. ...") và các dấu gạch/chấm tròn (•, -, +) giải thích nội dung bài học.\n' +
        '   - SLIDE MỞ ĐẦU / TIÊU ĐỀ (slideType="SLIDE", phase="Pha 1: Khởi động", isGhiVo=false, aiSlideCategory="Slide Mở đầu"): Trang tiêu đề bài học hoặc giới thiệu mục tiêu bài học, không có câu hỏi trắc nghiệm.\n' +
        '   - SLIDE GHI VỞ (slideType="SLIDE", phase="Pha 2: Hình thành kiến thức", isGhiVo=true, aiSlideCategory="Slide Ghi vở"): Chỉ đặt isGhiVo=true khi trên slide có chữ tường minh: "Ghi vở", "Ghi bài", "Nội dung ghi vở", "Em ghi nhớ", "Tóm tắt ghi vở".\n' +
        '   - SLIDE TRẮC NGHIỆM NHIỀU ĐÁP ÁN (slideType="MULTI", phase="Pha 3: Luyện tập", isGhiVo=false, aiSlideCategory="Trắc nghiệm Nhiều ĐA"): Khi câu hỏi yêu cầu chọn NHIỀU phương án đúng.\n' +
        '   - SLIDE THẢO LUẬN MỞ (slideType="WORDCLOUD") hoặc KHẢO SÁT (slideType="POLL"): Khi có câu hỏi tự luận mở/khảo sát không có 4 đáp án A, B, C, D.\n' +
        '   - LƯU Ý: Ở chế độ này KHÔNG CẦN GIẢI ĐÁP ÁN, hãy để correctList=null và aiExplanation="" để bảo lưu đáp án của giáo viên.\n' +
        'Trả về MẢNG JSON THUẦN TÚY: [{"pageIndex": 0, "phase": "Pha 2: Hình thành kiến thức", "slideType": "QUIZ", "isGhiVo": false, "aiSlideCategory": "Trắc nghiệm 1 ĐA", "q": "...", "opts": ["...","...","...","..."], "correctList": null, "aiExplanation": ""}]';
    } else if (mode === 'SOLVE') {
      systemInstruction =
        'Bạn là Chuyên gia Sư phạm & Trí tuệ Nhân tạo Giáo dục (' + ctxGrade + ' - ' + ctxTitle + ').\n' +
        'NHIỆM VỤ ĐẶC THÙ: CHUYÊN BIỆT GIẢI & ĐIỀN ĐÁP ÁN ĐÚNG CHO CÂU HỎI TRẮC NGHIỆM:\n' +
        '1. Hãy quan sát kỹ câu hỏi q và 4 phương án A, B, C, D trên hình ảnh Slide hoặc văn bản đính kèm.\n' +
        '2. Dựa vào kiến thức chuyên môn chính xác, phân tích và suy luận để tìm ra đáp án đúng nhất (hoặc các đáp án đúng nếu là câu hỏi chọn nhiều đáp án):\n' +
        '   - Trả về chỉ số đáp án đúng trong correctList (0 là A, 1 là B, 2 là C, 3 là D). Ví dụ:\n' +
        '     + Câu hỏi các cách trao đổi thông tin trên Internet với C là "Mạng xã hội & Tin nhắn trực tuyến" ➔ correctList=[2] (đáp án C).\n' +
        '     + Câu hỏi khái niệm Mạng xã hội với B là "Là một cộng đồng trực tuyến để mọi người kết nối và tương tác" ➔ correctList=[1] (đáp án B).\n' +
        '   - Viết lời giải thích ngắn gọn, sư phạm và thuyết phục vì sao chọn đáp án đó vào aiExplanation.\n' +
        'Trả về MẢNG JSON THUẦN TÚY: [{"pageIndex": 0, "correctList": [2], "aiExplanation": "Giải thích chi tiết vì sao chọn đáp án đó."}]';
    } else {
      systemInstruction =
        'Bạn là Chuyên gia Sư phạm & Trí tuệ Nhân tạo Giáo dục (' + ctxGrade + ' - ' + ctxTitle + ').\n' +
        'Hãy quan sát kỹ HÌNH ẢNH SLIDE kết hợp văn bản đính kèm của từng Slide và thực hiện chính xác 2 nhiệm vụ sau:\n' +
        '1. NGUYÊN TẮC QUÉT OCR BẮT BUỘC TIÊN QUYẾT: CỨ QUÉT THẤY CÁC KÝ HIỆU PHƯƠNG ÁN [A], [B], [C], [D] HOẶC A., B., C., D. (hoặc [A] [B] [C] [D] / A, B, C, D / (A), (B), (C), (D) / A) B) C) D) / A: B: C: D:) LÀ 100% SLIDE TRẮC NGHIỆM (slideType="QUIZ" hoặc "MULTI")!\n' +
        '   - TUYỆT ĐỐI KHÔNG ĐƯỢC phân loại nhầm thành Slide Bài giảng (SLIDE) khi slide có 4 chữ cái hoặc 4 phương án A, B, C, D!\n' +
        '   - CẢ 2 DẠNG BỐ CỤC ĐỀU LÀ TRẮC NGHIỆM 100% (KỂ CẢ KHI TRÊN SLIDE KHÔNG CÓ CÂU HỎI Ở TRÊN MÀ CHỈ CÓ 4 Ô/4 HÀNG ĐÁP ÁN):\n' +
        '     + Dạng 1 (4 ô nút bấm hình chữ nhật dạng lưới 2x2 như: ô A. Đọc báo điện tử | B. Gửi thư điện tử (Email) | C. Mạng xã hội & Tin nhắn trực tuyến | D. Tham gia Diễn đàn (Forum)): 100% là Slide Trắc nghiệm (QUIZ). Tự động đặt câu hỏi q phù hợp (ví dụ: "Theo em, cách trao đổi thông tin trên Internet nào đang được sử dụng nhiều nhất hiện nay?"), trích xuất 4 opts=["Đọc báo điện tử", "Gửi thư điện tử (Email)", "Mạng xã hội & Tin nhắn trực tuyến", "Tham gia Diễn đàn (Forum)"], chọn đáp án đúng correctList=[2] (đáp án C) và giải thích.\n' +
        '     + Dạng 2 (4 hàng dài xếp chồng dọc 1x4 như: A. Là một thư viện... | B. Là một cộng đồng trực tuyến... | C. Là phần mềm cài đặt... | D. Là một kênh truyền hình...): 100% là Slide Trắc nghiệm (QUIZ). Tự động đặt câu hỏi q phù hợp (ví dụ: "Khái niệm nào sau đây mô tả đúng nhất về Mạng xã hội?"), trích xuất 4 opts đầy đủ, chọn đáp án đúng correctList=[1] (đáp án B) và giải thích.\n' +
        '   - SLIDE BÀI GIẢNG LÝ THUYẾT (slideType="SLIDE", phase="Pha 2: Hình thành kiến thức", isGhiVo=false, aiSlideCategory="Slide Bài giảng"):\n' +
        '     + CHỈ phân loại là SLIDE khi KHÔNG CÓ các phương án trắc nghiệm A, B, C, D. Có đề mục lớn (1., 2.), mục nhỏ chữ thường ("a. Các kênh trao đổi...", "b. ...") và các dấu gạch/chấm tròn (•, -, +) giải thích nội dung bài học.\n' +
        '   - SLIDE MỞ ĐẦU / TIÊU ĐỀ (slideType="SLIDE", phase="Pha 1: Khởi động", isGhiVo=false, aiSlideCategory="Slide Mở đầu"): Trang tiêu đề bài học hoặc giới thiệu mục tiêu bài học, không có câu hỏi trắc nghiệm.\n' +
        '   - SLIDE GHI VỞ (slideType="SLIDE", phase="Pha 2: Hình thành kiến thức", isGhiVo=true, aiSlideCategory="Slide Ghi vở"): Chỉ đặt isGhiVo=true khi trên slide có chữ tường minh: "Ghi vở", "Ghi bài", "Nội dung ghi vở", "Em ghi nhớ", "Tóm tắt ghi vở".\n' +
        '   - SLIDE TRẮC NGHIỆM NHIỀU ĐÁP ÁN (slideType="MULTI", phase="Pha 3: Luyện tập", isGhiVo=false, aiSlideCategory="Trắc nghiệm Nhiều ĐA"): Khi câu hỏi yêu cầu chọn NHIỀU phương án đúng.\n' +
        '   - SLIDE THẢO LUẬN MỞ (slideType="WORDCLOUD") hoặc KHẢO SÁT (slideType="POLL"): Khi có câu hỏi tự luận mở/khảo sát không có 4 đáp án A, B, C, D.\n' +
        '2. PHÂN TÍCH & ĐƯA RA ĐÁP ÁN ĐÚNG CHO SLIDE TRẮC NGHIỆM (q, opts, correctList, aiExplanation):\n' +
        '   - Nếu trên ảnh slide chưa có tiêu đề câu hỏi (chỉ có 4 ô đáp án A, B, C, D), AI hãy tự động đặt câu hỏi q chuẩn xác theo nội dung của 4 phương án đó.\n' +
        '   - Đọc chính xác nội dung 4 ô đáp án A, B, C, D đưa vào mảng opts gồm 4 phần tử (KHÔNG lặp lại chữ "A. ", "B. ", "C. ", "D. " ở đầu mỗi phần tử).\n' +
        '   - Phân tích kiến thức chuẩn xác để xác định đáp án đúng nhất và đưa chỉ số vào mảng correctList (0 là A, 1 là B, 2 là C, 3 là D).\n' +
        '   - Viết giải thích ngắn gọn, rõ ràng vì sao đáp án đó đúng vào aiExplanation.\n' +
        '3. Trả về KẾT QUẢ DƯỚI DẠNG MẢNG JSON THUẦN TÚY (JSON Array), giữ đúng pageIndex của từng slide được gửi lên:\n' +
        '[{"pageIndex": 0, "phase": "Pha 2: Hình thành kiến thức", "slideType": "QUIZ", "isGhiVo": false, "aiSlideCategory": "Trắc nghiệm 1 ĐA", "q": "KHÁM PHÁ: CÁNH CỬA INTERNET (2) - Theo em, cách trao đổi thông tin trên Internet nào đang được sử dụng nhiều nhất hiện nay?", "opts": ["Đọc báo điện tử", "Gửi thư điện tử (Email)", "Mạng xã hội & Tin nhắn trực tuyến", "Tham gia Diễn đàn (Forum)"], "correctList": [2], "aiExplanation": "Mạng xã hội và tin nhắn trực tuyến hiện là kênh trao đổi thông tin phổ biến và được sử dụng nhiều nhất trên Internet."}]';
    }

    var parts = [{ text: systemInstruction }];

    for (var i = 0; i < slidesBatch.length; i++) {
      var item = slidesBatch[i];
      parts.push({
        text: '\n--- SLIDE INDEX: ' + item.pageIndex + ' (Trang ' + (item.pageNum || (i + 1)) + ') ---\n' +
              'Nội dung văn bản: ' + String(item.rawText || '(Không có lớp văn bản - hãy đọc trực tiếp trên hình ảnh slide)').substring(0, 2000)
      });

      if (item.imgBase64 && String(item.imgBase64).indexOf('base64,') > -1) {
        var splitBase64 = String(item.imgBase64).split('base64,');
        var mimeMatch = splitBase64[0].match(/data:(image\/[a-zA-Z0-9+.-]+);/);
        var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: splitBase64[1]
          }
        });
      }
    }

    // Ưu tiên kết nối trực tiếp mô hình gemini-3-flash-preview theo yêu cầu, có fallback an toàn
    var models = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    var lastError = '';

    for (var m = 0; m < models.length; m++) {
      var modelName = models[m];
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(apiKey);
      var reqBody = {
        contents: [{ parts: parts }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json'
        }
      };

      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(reqBody),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var bodyText = resp.getContentText();

      if (code === 200) {
        var json = JSON.parse(bodyText);
        var rawOut = '';
        if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
          rawOut = json.candidates[0].content.parts[0].text || '';
        }
        rawOut = rawOut.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        var parsedArray = JSON.parse(rawOut);
        if (!Array.isArray(parsedArray) && parsedArray.slides) {
          parsedArray = parsedArray.slides;
        }
        return {
          ok: true,
          engine: modelName,
          results: Array.isArray(parsedArray) ? parsedArray : [parsedArray]
        };
      } else {
        lastError = 'HTTP ' + code + ' (' + modelName + '): ' + bodyText.substring(0, 180);
      }
    }

    return { ok: false, msg: 'Lỗi gọi Gemini API: ' + lastError };
  } catch (err) {
    return { ok: false, msg: 'Lỗi xử lý AI: ' + (err && err.message ? err.message : String(err)) };
  }
}
/**
 * ============================================================================
 * CỔNG REST API (doGet / doPost) KẾT NỐI VỚI WEBSITE CHUYÊN NGHIỆP TRÊN GITHUB
 * - Sử dụng Content-Type: text/plain;charset=utf-8 để vượt qua CORS Preflight
 * - Tích hợp LockService.getScriptLock() chống nghẽn khi cả lớp 45 máy nộp bài cùng lúc
 * - Tự động ghi vào bảng TongHop_KTGK và tạo sheet chi tiết từng học sinh
 * ============================================================================
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGitHubRestApiGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || '').toUpperCase().trim();
    if (action === 'PING' || action === 'INFO') {
      return createJsonResponse(getSystemInfo());
    }
    if (action === 'GET_CATALOG') {
      return createJsonResponse(getLessonCatalog());
    }
    if (action === 'GET_EXAM_RESULTS') {
      var gradeFilter = (e.parameter && e.parameter.grade) ? String(e.parameter.grade) : 'ALL';
      return createJsonResponse(getExamKtgkHistoryList(gradeFilter));
    }
    if (action === 'GET_ELEARNING_HISTORY') {
      return createJsonResponse(getElearningHistoryList());
    }
    if (action === 'LOAD_LESSON') {
      var key = (e.parameter && e.parameter.lessonKey) ? String(e.parameter.lessonKey) : '';
      return createJsonResponse({ ok: true, lessonKey: key, slides: loadTopicQuestions(key) });
    }
    if (action === 'LIVE_SYNC') {
      var pin = (e.parameter && e.parameter.pin) ? String(e.parameter.pin) : '';
      var role = (e.parameter && e.parameter.role) ? String(e.parameter.role) : 'STUDENT';
      var name = (e.parameter && e.parameter.name) ? String(e.parameter.name) : '';
      return createJsonResponse(getSyncState(pin, role, name));
    }
    return createJsonResponse({ ok: false, msg: 'Action GET không hợp lệ: ' + action });
  } catch (err) {
    return createJsonResponse({ ok: false, msg: 'Lỗi API GET: ' + (err && err.message ? err.message : String(err)) });
  }
}

function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(rawBody);
    var action = String(body.action || '').toUpperCase().trim();

    if (action === 'PING' || action === 'PING_CONNECTION') {
      var sys = getSystemInfo();
      sys.msg = 'Kết nối GitHub Pages <-> Google Sheets Cloud API thành công!';
      return createJsonResponse(sys);
    }

    if (action === 'SUBMIT_EXAM_KTGK') {
      return createJsonResponse(submitExamKtgkServer(body.payload || body));
    }

    if (action === 'GET_EXAM_RESULTS') {
      return createJsonResponse(getExamKtgkHistoryList(body.grade || 'ALL'));
    }

    if (action === 'UPDATE_ESSAY_SCORE') {
      return createJsonResponse(updateExamEssayScoreServer(body.payload || body));
    }

    if (action === 'SAVE_ELEARNING') {
      return createJsonResponse(saveElearningResult(body.payload || body));
    }

    if (action === 'GET_ELEARNING_HISTORY') {
      return createJsonResponse(getElearningHistoryList());
    }

    if (action === 'GET_CATALOG') {
      return createJsonResponse(getLessonCatalog());
    }

    if (action === 'LOAD_LESSON') {
      var slides = loadTopicQuestions(body.lessonKey || '');
      return createJsonResponse({ ok: true, lessonKey: body.lessonKey, slides: slides });
    }

    if (action === 'SAVE_LESSON') {
      return createJsonResponse(saveFullLessonToSheet(body.meta || body.lessonKey, body.questions || []));
    }

    if (action === 'LIVE_CREATE_ROOM') {
      return createJsonResponse(createGameRoom(body.lessonKey || 'Bài giảng Live', body.questions || []));
    }

    if (action === 'LIVE_JOIN') {
      return createJsonResponse(joinGame(body.pin, body.studentName, body.studentClass));
    }

    if (action === 'LIVE_SUBMIT') {
      return createJsonResponse(submitAnswer(body.pin, body.studentName, body.answer));
    }

    if (action === 'LIVE_HOST_CONTROL') {
      return createJsonResponse(hostControl(body.pin, body.command));
    }

    if (action === 'LIVE_SYNC') {
      return createJsonResponse(getSyncState(body.pin, body.role || 'STUDENT', body.studentName || ''));
    }

    return createJsonResponse({ ok: false, msg: 'Action POST không được hỗ trợ: ' + action });
  } catch (err) {
    return createJsonResponse({
      ok: false,
      msg: 'Lỗi xử lý doPost API: ' + (err && err.message ? err.message : String(err))
    });
  }
}

/**
 * Lưu bài thi Kiểm tra Giữa kỳ / Thường xuyên từ Website GitHub vào Google Sheets
 * - Có LockService chống nghẽn phòng máy 45 học sinh
 * - Ghi vào sheet TongHop_KTGK + tạo tab chi tiết riêng cho học sinh (nếu bật createStudentTab)
 */
function submitExamKtgkServer(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var d = data || {};
    var ss = initDatabase();
    var sheet = ss.getSheetByName(SHEET_KTGK);
    var nextStt = Math.max(1, sheet.getLastRow());
    var nowStr = formatNowVN();

    var grade = String(d.grade || 'Khối 9').trim();
    var studentClass = String(d.studentClass || '9A1').trim();
    var machineNo = String(d.machineNo || 'Máy 01').trim();
    var studentName = String(d.studentName || 'Học sinh').trim();
    var dob = String(d.dob || '').trim();
    var examTitle = String(d.examTitle || 'Kiểm tra Giữa kỳ I (Tiết 1 - 7)').trim();
    var examCode = String(d.examCode || 'de1').trim();

    var scoreMcq = Number(d.scoreMcq) || 0;
    var scoreFill = Number(d.scoreFill) || 0;
    var scoreEssay = Number(d.scoreEssay) || 0;
    var penalty = Number(d.penalty) || 0;
    var totalScore = Number(d.totalScore) || 0;
    var tabSwitches = Number(d.tabSwitches) || 0;
    var durationSec = Number(d.durationSec) || 0;
    var statusComment = String(d.statusComment || 'Đã chấm tự động').trim();
    var detailJson = (typeof d.details === 'string') ? d.details : JSON.stringify(d.details || {});

    sheet.appendRow([
      nextStt,
      nowStr,
      grade,
      studentClass,
      machineNo,
      studentName,
      dob,
      examTitle,
      examCode.toUpperCase(),
      scoreMcq,
      scoreFill,
      scoreEssay,
      penalty > 0 ? (-penalty) : 0,
      totalScore,
      tabSwitches,
      durationSec,
      statusComment,
      detailJson
    ]);

    // Tạo hoặc cập nhật tab chi tiết bài làm của học sinh nếu được yêu cầu
    if (d.createStudentTab !== false) {
      try {
        var safeTabName = (studentClass + '_' + studentName + '_' + machineNo)
          .replace(/[\/?*\[\]:]/g, '_')
          .substring(0, 30);
        var stSheet = ss.getSheetByName(safeTabName);
        if (!stSheet) {
          stSheet = ss.insertSheet(safeTabName);
        } else {
          stSheet.clear();
        }
        stSheet.appendRow(['PHIẾU KẾT QUẢ KIỂM TRA ĐÁNH GIÁ MÔN TIN HỌC - TRƯỜNG THCS MÃO ĐIỀN']);
        stSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff');
        stSheet.appendRow(['Họ và tên:', studentName, 'Lớp:', studentClass]);
        stSheet.appendRow(['Số máy:', machineNo, 'Ngày sinh:', dob]);
        stSheet.appendRow(['Bài kiểm tra:', examTitle, 'Mã đề:', examCode.toUpperCase()]);
        stSheet.appendRow(['Điểm TN (5đ):', scoreMcq, 'Điểm Điền khuyết (3đ):', scoreFill]);
        stSheet.appendRow(['Điểm Tự luận (2đ):', scoreEssay, 'Trừ rời tab (' + tabSwitches + ' lần):', -penalty]);
        stSheet.appendRow(['TỔNG ĐIỂM:', totalScore, 'Thời gian nộp:', nowStr]);
        stSheet.getRange(7, 1, 1, 4).setFontWeight('bold').setBackground('#fff9c4');
      } catch (tabErr) {}
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      stt: nextStt,
      savedAt: nowStr,
      totalScore: totalScore,
      msg: 'Đã lưu kết quả bài thi vào Google Sheets thành công!'
    };
  } finally {
    lock.releaseLock();
  }
}

function getExamKtgkHistoryList(gradeFilter) {
  var records = [];
  try {
    var ss = initDatabase();
    var sheet = ss.getSheetByName(SHEET_KTGK);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var startRow = Math.max(2, lastRow - 199);
      var numRows = lastRow - startRow + 1;
      var data = sheet.getRange(startRow, 1, numRows, 18).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var r = data[i];
        var g = String(r[2] || '');
        if (gradeFilter && gradeFilter !== 'ALL' && g !== gradeFilter) continue;
        records.push({
          rowIndex: startRow + i,
          stt: Number(r[0]) || (i + 1),
          submittedAt: String(r[1] || ''),
          grade: g,
          studentClass: String(r[3] || ''),
          machineNo: String(r[4] || ''),
          studentName: String(r[5] || ''),
          dob: String(r[6] || ''),
          examTitle: String(r[7] || ''),
          examCode: String(r[8] || ''),
          scoreMcq: Number(r[9]) || 0,
          scoreFill: Number(r[10]) || 0,
          scoreEssay: Number(r[11]) || 0,
          penalty: Number(r[12]) || 0,
          totalScore: Number(r[13]) || 0,
          tabSwitches: Number(r[14]) || 0,
          durationSec: Number(r[15]) || 0,
          statusComment: String(r[16] || ''),
          detailsJson: String(r[17] || '{}')
        });
      }
    }
  } catch (e) {}
  return { ok: true, records: records };
}

function updateExamEssayScoreServer(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var p = payload || {};
    var sttTarget = Number(p.stt) || 0;
    var newEssay = Math.max(0, Math.min(2, Number(p.scoreEssay) || 0));
    var comment = String(p.statusComment || 'Giáo viên đã duyệt tự luận').trim();

    var ss = initDatabase();
    var sheet = ss.getSheetByName(SHEET_KTGK);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { ok: false, msg: 'Chưa có dữ liệu bài thi!' };

    var data = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
    for (var i = 0; i < data.length; i++) {
      if (Number(data[i][0]) === sttTarget) {
        var rowNum = i + 2;
        var sMcq = Number(data[i][9]) || 0;
        var sFill = Number(data[i][10]) || 0;
        var pen = Math.abs(Number(data[i][12]) || 0);
        var newTotal = Math.max(0, Math.round((sMcq + sFill + newEssay - pen) * 100) / 100);
        sheet.getRange(rowNum, 12).setValue(newEssay);
        sheet.getRange(rowNum, 14).setValue(newTotal);
        sheet.getRange(rowNum, 17).setValue(comment);
        SpreadsheetApp.flush();
        return { ok: true, stt: sttTarget, scoreEssay: newEssay, totalScore: newTotal, statusComment: comment };
      }
    }
    return { ok: false, msg: 'Không tìm thấy bài thi có STT #' + sttTarget };
  } finally {
    lock.releaseLock();
  }
}