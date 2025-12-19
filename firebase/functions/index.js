const functions = require("firebase-functions");
const { google } = require("googleapis");
const serviceAccount = require("./service-account.json");

// Google Sheets 인증 설정
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// 시트 정보
const SPREADSHEET_ID = "1hp4oG9UZLvGVa69jA7jTMptIyjCiDAWYy44HZwssnO0";
const SHEET_DB = "선수DB";
const SHEET_CONFIG = "설정";
const SHEET_ORDERS = "Orders";

// 공통 CORS Wrapper
function withCors(handler) {
  return (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    return handler(req, res);
  };
}

/* ===========================================
   1) 비밀번호 확인 API
=========================================== */
exports.checkPassword = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const pw = req.body?.password;
      if (!pw) return res.status(400).json({ status: "실패", error: "비밀번호 필요" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_CONFIG}!B1`,
      });

      const realPw = result.data.values?.[0]?.[0] || "";
      if (pw === realPw) return res.json({ status: "성공" });

      return res.json({ status: "실패", error: "비밀번호 불일치" });
    } catch (e) {
      return res.status(500).json({ status: "실패", error: e.message });
    }
  })
);

/* ===========================================
   2) 비밀번호 변경 API
=========================================== */
exports.updatePassword = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const oldPw = req.body?.oldPassword;
      const newPw = req.body?.newPassword;

      if (!oldPw || !newPw)
        return res.status(400).json({ status: "실패", error: "파라미터 부족" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_CONFIG}!B1`,
      });

      const realPw = resp.data.values?.[0]?.[0] || "";
      if (oldPw !== realPw)
        return res.json({ status: "실패", error: "기존 비밀번호 불일치" });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_CONFIG}!B1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newPw]] },
      });

      return res.json({ status: "성공" });
    } catch (e) {
      return res.status(500).json({ status: "실패", error: e.message });
    }
  })
);

/* ===========================================
   3) 선수 목록 조회 API
=========================================== */
exports.getPlayers = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_DB}!A2:I`,
      });

      const rows = result.data.values || [];
      const players = rows.map((row) => ({
        name: row[0] || "",
        num: row[1] || "",
        p: row[2] || "0",
        c: row[3] || "0",
        "1b": row[4] || "0",
        "2b": row[5] || "0",
        "3b": row[6] || "0",
        ss: row[7] || "0",
        of: row[8] || "0",
      }));

      return res.json(players);
    } catch (e) {
      return res.status(500).json({ status: "실패", error: e.message });
    }
  })
);

/* ===========================================
   4) 선수 저장 API
=========================================== */
exports.updatePlayers = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const list = req.body;
      if (!Array.isArray(list))
        return res.status(400).json({ status: "실패", error: "배열 필요" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const header = ["name", "num", "p", "c", "1b", "2b", "3b", "ss", "of"];
      const values = [
        header,
        ...list.map((p) => [
          p.name || "",
          p.num || "",
          p.p || "0",
          p.c || "0",
          p["1b"] || "0",
          p["2b"] || "0",
          p["3b"] || "0",
          p.ss || "0",
          p.of || "0",
        ]),
      ];

      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_DB}!A1:I`,
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_DB}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });

      return res.json({ status: "성공" });
    } catch (e) {
      return res.status(500).json({ status: "실패", error: e.message });
    }
  })
);

/* ===========================================
   5) 오더 존재 여부 확인 API
=========================================== */
exports.orderExists = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const name = req.query.name;
      if (!name) return res.status(400).json({ error: "name 필요" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const rows =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ORDERS}!A2:A`,
          })
        ).data.values || [];

      return res.json({ exists: rows.some((r) => r[0] === name) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  })
);

/* ===========================================
   6) 모든 오더 조회
=========================================== */
exports.getOrders = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const rows =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ORDERS}!A2:C`,
          })
        ).data.values || [];

      const list = rows.map((r) => ({
        orderName: r[0],
        savedAt: r[1],
      }));

      return res.json(list);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  })
);

/* ===========================================
   7) 특정 오더 조회
=========================================== */
exports.getOrder = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const name = req.query.name;
      if (!name) return res.status(400).json({ error: "name 필요" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const rows =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ORDERS}!A2:C`,
          })
        ).data.values || [];

      for (let r of rows) {
        if (r[0] === name) {
          return res.json({
            orderName: r[0],
            savedAt: r[1],
            payload: JSON.parse(r[2]),   // players: [{name, num}], startingList: [{name, pos}]
          });
        }
      }

      return res.json(null);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  })
);

/* ===========================================
   8) 오더 저장 (신규/덮어쓰기)
=========================================== */
exports.saveOrder = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const { orderName, payload } = req.body;
      if (!orderName || !payload)
        return res.status(400).json({ error: "파라미터 부족" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      const savedAt = new Date().toISOString();

      // A2:C 전체 조회
      const rows =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ORDERS}!A2:C`,
          })
        ).data.values || [];

      let targetRow = -1;
      rows.forEach((r, i) => {
        if (r[0] === orderName) targetRow = i + 2;
      });

      // payload는 name+num players 구조 그대로 JSON 저장됨
      const data = [[orderName, savedAt, JSON.stringify(payload)]];

      if (targetRow === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_ORDERS}!A:C`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: data },
        });
      } else {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_ORDERS}!A${targetRow}:C${targetRow}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: data },
        });
      }

      return res.json({ status: "성공" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  })
);

/* ===========================================
   9) 오더 삭제
=========================================== */
exports.deleteOrder = functions.https.onRequest(
  withCors(async (req, res) => {
    try {
      const orderName = req.query.name;
      if (!orderName)
        return res.status(400).json({ error: "orderName 필요" });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: "v4", auth: client });

      // 모든 rows 조회
      const rowsResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_ORDERS}!A2:C`,
      });

      const rows = rowsResp.data.values || [];
      let targetRow = -1;

      rows.forEach((r, idx) => {
        if (r[0] === orderName) targetRow = idx + 2;
      });

      if (targetRow === -1) return res.json({ status: "not_found" });

      // sheetId 자동 조회
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });

      const sheet = sheetInfo.data.sheets.find(
        (s) => s.properties.title === SHEET_ORDERS
      );

      const sheetId = sheet.properties.sheetId;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: targetRow - 1,
                  endIndex: targetRow,
                },
              },
            },
          ],
        },
      });

      return res.json({ status: "deleted" });
    } catch (e) {
      return res.status(500).json({ status: "실패", error: e.message });
    }
  })
);
