import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../firebase/functions-v2/write-auth.js';

function setup(password = 'secret') {
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [[password]] } }) } } };
  return { response, sheets };
}

test('write authorization rejects non-POST and missing or wrong passwords', async () => {
  for (const [method, password, expected] of [['GET','secret',405],['POST','',401],['POST','wrong',403]]) {
    const { response, sheets } = setup();
    const allowed = await auth.requireWritePassword({ method, body: { password } }, response, sheets, 'id', '설정');
    assert.equal(allowed, false);
    assert.equal(response.code, expected);
  }
});

test('write authorization accepts password checked against the settings sheet', async () => {
  const { response, sheets } = setup();
  const allowed = await auth.requireWritePassword({ method:'POST', body:{ password:'secret' } }, response, sheets, 'id', '설정');
  assert.equal(allowed, true);
  assert.equal(response.code, 200);
});
