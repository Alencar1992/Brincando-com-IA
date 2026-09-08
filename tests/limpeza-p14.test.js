const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P14 remove helpers e endpoints sem consumidor atual', () => {
  const code = read('apps-script/Code.gs');
  const api = read('apps-script/Api.gs');
  assert.doesNotMatch(code, /function include\s*\(/);
  assert.doesNotMatch(code, /function salvarMultiplosFechamentos\s*\(/);
  assert.doesNotMatch(api, /"salvarMultiplosFechamentos"/);
});

test('P14 preserva compatibilidade do fechamento diário único', () => {
  const code = read('apps-script/Code.gs');
  const api = read('apps-script/Api.gs');
  const service = read('apps-script/FechamentoDiarioService.gs');
  const ui = read('frontend/fechamento-diario-seguro.js');
  const index = read('frontend/index.html');

  assert.match(code, /function salvarFechamentoDiaPlanilha\s*\(/);
  assert.match(api, /"salvarFechamentoDiaPlanilha"/);
  assert.match(service, /function fecharDiaSeguro\s*\(/);
  assert.match(api, /"fecharDiaSeguro"/);
  assert.match(ui, /\.fecharDiaSeguro\(dataHojePtBr\(\), "MANUAL"\)/);
  assert.match(index, /function registrarFechamentoDia\s*\(/);
  assert.match(index, /\.salvarFechamentoDiaPlanilha\(JSON\.stringify\(resumo\)\)/);
});

test('P14 preserva recursos ainda usados pelo painel administrativo', () => {
  const code = read('apps-script/Code.gs');
  const api = read('apps-script/Api.gs');
  const index = read('frontend/index.html');
  const investigador = read('frontend/investigador.js');

  assert.match(code, /function excluirContadorTapiocasHoje\s*\(/);
  assert.match(api, /"excluirContadorTapiocasHoje"/);
  assert.match(index, /\.excluirContadorTapiocasHoje\(dataHojeStr\)/);
  assert.match(index, /src="\.\/investigador\.js(?:\?v=[^"]+)?"/);
  assert.match(index, /id="textoErroSistema"/);
  assert.match(investigador, /unhandledrejection/);
});
