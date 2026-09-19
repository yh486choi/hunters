async function requireWritePassword(req, res, sheets, spreadsheetId, configSheet) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: '실패', error: 'POST 요청 필요' });
    return false;
  }
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    res.status(401).json({ status: '실패', error: '비밀번호 필요' });
    return false;
  }
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${configSheet}!B1`
  });
  if (password !== (result.data.values?.[0]?.[0] || '')) {
    res.status(403).json({ status: '실패', error: '비밀번호 불일치' });
    return false;
  }
  return true;
}

module.exports = { requireWritePassword };
