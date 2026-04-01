// ====================================================
// 学習塾 出席管理システム - Google Apps Script
// ====================================================
//
// 【セットアップ手順】
// 1. Google スプレッドシートを新規作成する
// 2. 拡張機能 → Apps Script でこのファイルを貼り付けて保存
// 3. 右上の「デプロイ」→「新しいデプロイ」をクリック
// 4. 種類：「ウェブアプリ」を選択
// 5. 実行するユーザー：「自分」
//    アクセスできるユーザー：「全員」  ← 重要！
// 6. 「デプロイ」をクリック → URLをコピーして attendance.html の GAS_URL に貼り付ける
//
// ※ コードを修正したら「デプロイ」→「既存のデプロイを管理」→「編集（鉛筆マーク）」
//    →「バージョン：新しいバージョン」を選んで更新してください
// ====================================================

const SHEET_STUDENTS = "生徒一覧";
const SHEET_RECORDS  = "出席記録";
const ADMIN_PASSWORD = "admin1234"; // ← HTML側の ADMIN_PW と合わせてください

// ===== メインエントリーポイント =====
function doPost(e) {
  // CORS対応（どのオリジンからでも呼べるようにする）
  const output = handleRequest(e);
  return output;
}

// GETリクエストも受け付ける（テスト用）
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "GAS is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "getStudents")   return res(getStudents());
    if (action === "addStudent")    return res(addStudent(data));
    if (action === "deleteStudent") return res(deleteStudent(data));
    if (action === "attend")        return res(attend(data));
    if (action === "getRecords")    return res(getRecords(data));
    if (action === "checkPassword") return res(checkPassword(data));

    return res({ ok: false, error: "不明なアクション: " + action });
  } catch(err) {
    return res({ ok: false, error: err.message });
  }
}

function res(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== シート取得（なければ作成） =====
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_STUDENTS) {
      sheet.appendRow(["学生番号", "氏名"]);
      sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    }
    if (name === SHEET_RECORDS) {
      sheet.appendRow(["ID", "学生番号", "氏名", "日時"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
    }
  }
  return sheet;
}

// ===== パスワード確認 =====
function checkPassword(data) {
  return { ok: data.password === ADMIN_PASSWORD };
}

// ===== 生徒一覧取得 =====
function getStudents() {
  const sheet = getOrCreateSheet(SHEET_STUDENTS);
  const rows = sheet.getDataRange().getValues();
  const students = {};
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0]).trim();
    const name = String(rows[i][1]).trim();
    if (id && name) students[id] = name;
  }
  return { ok: true, students };
}

// ===== 生徒追加 =====
function addStudent(data) {
  const sheet = getOrCreateSheet(SHEET_STUDENTS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.studentId)) {
      return { ok: false, error: "この学生番号はすでに存在します。" };
    }
  }
  sheet.appendRow([String(data.studentId), String(data.name)]);
  return { ok: true };
}

// ===== 生徒削除 =====
function deleteStudent(data) {
  const sheet = getOrCreateSheet(SHEET_STUDENTS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.studentId)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: "生徒が見つかりません。" };
}

// ===== 出席登録 =====
function attend(data) {
  const studentsResult = getStudents();
  const studentId = String(data.studentId);

  if (!studentsResult.students[studentId]) {
    return { ok: false, error: "学生番号が見つかりません。\n先生に確認してください。" };
  }

  const sheet = getOrCreateSheet(SHEET_RECORDS);
  const rows = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");

  // 本日すでに出席済みかチェック
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][3]) continue; // 日時が空の行はスキップ
    let rowDate;
    try {
      rowDate = Utilities.formatDate(new Date(rows[i][3]), "Asia/Tokyo", "yyyy/MM/dd");
    } catch(e) { continue; }

    if (String(rows[i][1]).trim() === studentId && rowDate === today) {
      return {
        ok: false,
        duplicate: true,
        name: studentsResult.students[studentId],
        time: Utilities.formatDate(new Date(rows[i][3]), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss")
      };
    }
  }

  // 出席登録
  const now = new Date();
  const id = Utilities.getUuid();
  const name = studentsResult.students[studentId];
  const timeStr = Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
  sheet.appendRow([id, studentId, name, timeStr]);

  return { ok: true, name, time: timeStr };
}

// ===== 出席記録取得 =====
function getRecords(data) {
  const sheet = getOrCreateSheet(SHEET_RECORDS);
  const rows = sheet.getDataRange().getValues();
  let records = [];

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue; // 空行スキップ
    records.push({
      id:        String(rows[i][0]),
      studentId: String(rows[i][1]),
      name:      String(rows[i][2]),
      timestamp: String(rows[i][3])
    });
  }

  // 新しい順に並べる
  records.reverse();

  // 日付フィルター（yyyy/MM/dd 形式）
  if (data && data.filterDate) {
    records = records.filter(r => {
      if (!r.timestamp) return false;
      try {
        const d = Utilities.formatDate(new Date(r.timestamp), "Asia/Tokyo", "yyyy/MM/dd");
        return d === data.filterDate;
      } catch(e) { return false; }
    });
  }

  return { ok: true, records };
}
