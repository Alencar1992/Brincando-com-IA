const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("scripts locais e scripts embutidos compilam", () => {
  const localScripts = [
    "frontend/api-client.js",
    "frontend/vendor-loader.js",
    "frontend/catalogo-base.js",
    "frontend/catalogo-runtime.js",
    "frontend/configuracao.js",
    "frontend/eliel.js",
    "frontend/investigador.js"
  ];
  localScripts.forEach(file => {
    new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
  });

  ["frontend/index.html", "frontend/cliente.html"].forEach(file => {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    let count = 0;
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      if (!match[1].trim()) continue;
      count += 1;
      new vm.Script(match[1], { filename: `${file}#inline-${count}` });
    }
    assert.ok(count > 0);
  });
});

test("administrador e cliente usam o mesmo catálogo inicial", () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "frontend/catalogo-base.js"), "utf8"),
    sandbox
  );
  const catalog = sandbox.window.TapimovelCatalogoBase.criar();
  assert.equal(Object.values(catalog).flat().length, 67);
  assert.equal(catalog.salgadas.find(item => item.nome === "Baiana").preco, 18);

  ["frontend/index.html", "frontend/cliente.html"].forEach(file => {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /src="\.\/catalogo-base\.js(?:\?v=[^"]+)?"/);
    assert.doesNotMatch(html, /const bdCatalogo = \{/);
  });
});

test("Monte a Sua e bebidas exibem fotos e preservam pausa individual", () => {
  const html = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");
  const catalogo = fs.readFileSync(path.join(root, "frontend/catalogo-base.js"), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(catalogo, sandbox);
  const bebidas = sandbox.window.TapimovelCatalogoBase.criar().bebidas;

  assert.equal(bebidas.length, 8);
  assert.equal(new Set(bebidas.map(item => item.nome)).size, 8);
  bebidas.forEach(item => {
    assert.equal(item.preco, 6);
    assert.match(item.imagem, /^bebida-.+\.webp$/);
    assert.ok(fs.existsSync(path.join(root, "frontend/assets/menu", item.imagem)));
  });

  ["Calabresa", "Frango", "Carne Seca", "Salame", "Bacon", "Peito de Peru"].forEach(nome => {
    assert.match(html, new RegExp(`'${nome}': 'monte-`));
  });
  ["monte-catupiry.webp", "monte-cheddar.webp", "monte-cream-cheese.webp", "monte-mucarela.webp", "monte-queijo-branco.webp"].forEach(imagem => {
    assert.match(html, new RegExp(imagem.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(root, "frontend/assets/menu", imagem)));
  });
  assert.match(html, /itensIndisponiveis\.includes\(p\.nome\)/);
});

test("agente local sugere complementos, preserva carrinho e confirma em prévia", () => {
  const html = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");
  assert.match(html, /timeZone: 'America\/Sao_Paulo'/);
  assert.match(html, /status-aberta/);
  assert.match(html, /status-encerrando/);
  assert.match(html, /status-fechada/);
  assert.match(html, /function classificarTapiocaUnica\(/);
  assert.match(html, /itensIndisponiveis\.includes\(item\.nome\)/);
  assert.match(html, /function voltarAoCardapioDaSugestao\(/);
  assert.match(html, /function finalizarSemSugestao\(/);
  assert.match(html, /id="previaPedidoCompleta"/);
  assert.match(html, /Enviar para a chapa/);
  assert.match(html, /Editar\/adicionar mais/);
  assert.match(html, /if \(envioEmAndamento\) return/);
  assert.match(html, /atendimento online encerrou às <b>22h<\/b>/);
});

test("modo de teste abre o cardápio sem enviar pedidos reais", () => {
  const html = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");
  assert.match(html, /parametrosTeste\.get\('modo'\) === 'teste'/);
  assert.match(html, /MODO TESTE · nenhum pedido será enviado/);
  assert.match(html, /return \{ dia: diaSimulado, hora: horaSimulada \}/);
  assert.match(html, /if \(modoTeste\) \{[\s\S]{0,900}Nenhum pedido real foi criado/);
  const blocoTeste = html.match(/if \(modoTeste\) \{[\s\S]{0,1200}?\n\s*\}/);
  assert.ok(blocoTeste);
  assert.doesNotMatch(blocoTeste[0], /registrarPedidoOnline/);
});

test("tema respeita a cor da logo e catálogo migra a bebida genérica", () => {
  const css = fs.readFileSync(path.join(root, "frontend/professional.css"), "utf8");
  const runtime = fs.readFileSync(path.join(root, "frontend/catalogo-runtime.js"), "utf8");
  assert.match(css, /body\.app-cliente \.header-logo\.status-aberta[\s\S]{0,160}#36c96b/);
  assert.match(css, /body\.app-cliente \.header-logo\.status-encerrando[\s\S]{0,160}#f4c542/);
  assert.match(css, /body\.app-cliente \.header-logo\.status-fechada[\s\S]{0,160}var\(--danger\)/);
  assert.match(runtime, /imagem: String\(item\.imagem \|\| ""\)/);
  assert.match(runtime, /contemBebidaGenericaLegada/);
  assert.match(runtime, /normalizado\.bebidas = bebidasPadrao/);
});

test("cardápio administrativo exibe fotos somente em Monte a Sua e bebidas", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "frontend/professional.css"), "utf8");
  assert.match(html, /function obterImagemProdutoAdmin\(/);
  assert.match(html, /const exibirFoto = prod\.tipo === 'bebida'/);
  assert.match(html, /const foto = exibirFoto/);
  assert.match(html, /imagensMonteSuaAdmin\.carnes\[carne\]/);
  assert.match(html, /imagensMonteSuaAdmin\.queijos\[queijo\]/);
  assert.match(html, /Catupiry \(Original\)/);
  assert.match(html, /Cheddar \(Scala\)/);
  assert.match(eliel, /item\.tipo === "bebida"[\s\S]{0,160}obterImagemProdutoAdmin\(item\)/);
  assert.match(eliel, /class="gestao-item-imagem"/);
  assert.match(css, /body\.app-admin \.produto-btn\.produto-btn-com-foto/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.gestao-item-imagem/);
});

test("interface administrativa força arquivos compatíveis e remove adicional legado", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const catalogo = fs.readFileSync(path.join(root, "frontend/catalogo-runtime.js"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");

  assert.match(html, /catalogo-runtime\.js\?v=\d{8}\.\d+/);
  assert.match(html, /eliel\.css\?v=\d{8}\.\d+/);
  assert.match(html, /eliel\.js\?v=\d{8}\.\d+/);
  assert.match(catalogo, /ehAdicionalLegado/);
  assert.match(catalogo, /normalizarBusca\(item && item\.nome\) === "\+ adicional"/);
  assert.match(eliel, /normalizarBusca\(item && item\.nome\) !== "\+ adicional"/);
});

test("dependências externas carregam somente sob demanda e mantêm integridade", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "frontend/vendor-loader.js"), "utf8");
  assert.doesNotMatch(html, /<script src="https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(html, /src="\.\/vendor-loader\.js"/);
  assert.equal((loader.match(/integrity: "sha384-/g) || []).length, 3);
  assert.match(loader, /script\.crossOrigin = "anonymous"/);
  assert.doesNotMatch(loader, /jspdf\/2\.5\.2/);
  assert.doesNotMatch(loader, /autotable/);
});

test("cliente da API tolera instabilidade sem repetir operações de escrita", () => {
  const apiClient = fs.readFileSync(path.join(root, "frontend/api-client.js"), "utf8");
  assert.match(apiClient, /REQUEST_TIMEOUT_MS = 25000/);
  assert.match(apiClient, /SAFE_RETRY_LIMIT = 1/);
  assert.match(apiClient, /SAFE_ACTION_PATTERN/);
  assert.match(apiClient, /response\.status === 404/);
  assert.match(apiClient, /controller\.abort\(\)/);
  assert.match(apiClient, /tapimovel:connection/);
  assert.match(apiClient, /Sem internet no aparelho/);
});

test("login inicia sem aguardar bibliotecas e mídias externas", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  assert.match(html, /DOMContentLoaded', iniciarAutenticacaoAdmin/);
  assert.doesNotMatch(html, /window\.onload = iniciarAutenticacaoAdmin/);
  assert.equal((html.match(/preload="none"/g) || []).length, 2);
});

test("regra de pausa diária permanece implementada", () => {
  const code = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
  assert.match(
    code,
    /if \(dataPausa !== hoje\) \{[\s\S]*cardapio_itens_indisponiveis", "\[\]"/
  );
});

test("avisos administrativos aguardam a autenticação", () => {
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.doesNotMatch(
    eliel,
    /DOMContentLoaded[\s\S]{0,300}verificarAvisoPdv\(\)/
  );
  assert.match(
    index,
    /function liberarAplicacaoAcesso\(sessao\)[\s\S]{0,900}!acessoEhEliel\(\)[\s\S]{0,200}window\.verificarAvisoPdv\(\)/
  );
});

test("sessão do navegador persiste somente no dia e expira por inatividade", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.match(
    apiClient,
    /localStorage\.setItem\((?:TOKEN_KEY|sessionPrefix \+ "token")/
  );
  assert.doesNotMatch(apiClient, /sessionStorage/);
  assert.match(apiClient, /sessionDay !== getLocalDay\(\)/);
  assert.match(apiClient, /4 \* 60 \* 60 \* 1000/);
  assert.match(apiClient, /\["pointerdown", "keydown", "touchstart"\]/);
  assert.match(index, /expira após 4 horas sem uso/);
});

test("acesso exclusivo do CEO Eliel limita navegação e mantém sessão separada", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const restricted = fs.readFileSync(
    path.join(root, "frontend/relatorio-eliel.html"),
    "utf8"
  );

  assert.match(restricted, /index\.html\?acesso=eliel/);
  assert.match(apiClient, /"tapimovel_" \+ accessMode \+ "_"/);
  assert.match(apiClient, /TOKEN_PROFILE_KEY/);
  assert.match(index, /CEO Eliel/);
  assert.match(index, /\['view-relatorio-eliel', 'view-itens', 'view-configuracao'\]/);
  assert.match(index, /\.loginAcesso\(pin, modoAcessoEsperado\)/);
  assert.match(index, /class="[^"]*eliel-owner-only[^"]*"[^>]*>Revisar e fechar mês/);
});

test("PIN do CEO Eliel no PDV preserva a sessão restrita e redireciona", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.match(apiClient, /session\.perfil === "eliel" \? "eliel" : accessMode/);
  assert.match(apiClient, /sessionPrefix \+ "token"/);
  assert.match(
    index,
    /modoAcessoEsperado === 'admin' && sessao && sessao\.perfil === 'eliel'/
  );
  assert.match(index, /window\.location\.replace\('\.\/relatorio-eliel\.html\?origem=pdv'\)/);
});

test("configuração usa identidade CEO Eliel sem solicitar nome manual", () => {
  const configuracao = fs.readFileSync(
    path.join(root, "frontend/configuracao.js"),
    "utf8"
  );
  assert.match(configuracao, /sessao\.perfil === "eliel"/);
  assert.match(configuracao, /responsavelAtual = "CEO Eliel"/);
});

test("Relatório Eliel premium mantém indicadores interativos e gráficos responsivos", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "frontend/eliel.css"), "utf8");

  assert.match(html, /Resumo de lucros do mês/);
  assert.match(html, /alternarDetalheMetricaEliel\('taxas'/);
  assert.match(html, /mudarGraficoEliel\('semana'/);
  assert.match(eliel, /detalhesTaxas/);
  assert.match(eliel, /combustivelTrailer/);
  assert.match(eliel, /mesesComparacao/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /\.eliel-podio/);
  assert.match(css, /@media \(max-width: 430px\)/);
});

test("fechamento mensal é exclusivo do Relatório Eliel e exige prévia", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const appsScriptDir = path.join(root, "apps-script");
  const backend = fs.readdirSync(appsScriptDir)
    .filter(nome => nome.endsWith(".gs"))
    .sort()
    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
    .join("\n\n");

  assert.match(html, /Prévia do fechamento mensal/);
  assert.match(html, /Confirmar fechamento/);
  assert.match(html, /id="previaElielCombustivelTotal"/);
  assert.match(html, /Combustível total · 100%/);
  assert.match(html, /Liquidez Mensal · consulta/);
  assert.doesNotMatch(html, /Fechar Mês \(Drive\)/);
  assert.doesNotMatch(html, /function confirmarFechamentoMes\(/);
  assert.doesNotMatch(backend, /function fecharMesESalvarDrive\(/);
  assert.match(eliel, /\.obterPreviaFechamentoRelatorioEliel\(/);
  assert.match(
    eliel,
    /previaElielCombustivelTotal"\)\.textContent = moeda\(custos\.combustivelTotal\)/
  );
  assert.match(eliel, /\.fecharMesRelatorioEliel\(\s*mes,\s*ano,/);
  assert.match(backend, /O fechamento mensal é exclusivo do perfil CEO Eliel/);
  assert.match(backend, /pedidosPendentes/);
  assert.match(backend, /obterAbaFechamentosMensais_/);
  assert.match(backend, /Fechamentos_Mensais_v2/);
  assert.match(backend, /Controle_Operacoes/);
  assert.match(backend, /STATUS_OPERACAO_ERRO_/);
  assert.match(eliel, /Recuperação segura disponível/);
  assert.match(eliel, /Pedidos de outros meses não interferem/);
  assert.match(backend, /Responsável/);
  assert.match(html, /Produtos vendidos · Histórico Diário/);
  assert.match(html, /visualizarHistoricoEliel\(\)/);
  assert.match(eliel, /baixarHistoricoEliel/);
  assert.match(backend, /function obterHistoricoVendasEliel/);
  assert.doesNotMatch(backend, /setProperty\("pdv_vendas_ativas", "\[\]"\)/);
  assert.match(html, /Pedidos e dados de outros meses não serão apagados ou alterados/);
});

test("gestão de itens usa pausa de 2 segundos, busca completa e ações em massa", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "frontend/configuracao.js"), "utf8");
  const catalogo = fs.readFileSync(path.join(root, "frontend/catalogo-runtime.js"), "utf8");

  assert.match(html, /DURACAO_PRESSAO_ITEM = 2000/);
  assert.match(eliel, /DURACAO_PRESSAO_GESTAO_ITEM = 2000/);
  assert.match(html, /id="itensAcoesMassa"/);
  assert.match(eliel, /definirEstadoResultadosItens/);
  assert.match(eliel, /item-switch/);
  assert.match(eliel, /correspondeBusca\(item, busca\)/);
  assert.match(config, /correspondeBusca\(item, busca, categorias\[item\.categoria\]\)/);
  assert.match(catalogo, /normalize\("NFD"\)/);
  assert.match(catalogo, /item && item\.ing/);

  const sandbox = { window: {}, CustomEvent: function () {} };
  vm.createContext(sandbox);
  vm.runInContext(catalogo, sandbox);
  assert.equal(sandbox.window.TapimovelCatalogo.normalizarBusca("MUÇARELA"), "mucarela");
  assert.equal(
    sandbox.window.TapimovelCatalogo.correspondeBusca(
      { nome: "Caipira II", ing: "Frango, catupiry e milho" },
      "frango"
    ),
    true
  );
});

test("adicionais pagos ficam vinculados à tapioca e respeitam a categoria", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const appsScriptDir = path.join(root, "apps-script");
const backend = fs.readdirSync(appsScriptDir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
  .join("\n\n");

  assert.match(html, /id="listaAdicionais"/);
  assert.doesNotMatch(html, /id="inputDescAdicional"/);
  assert.match(eliel, /let PRECO_ADICIONAL = 4/);
  assert.match(eliel, /let adicionaisSalgados/);
  assert.match(eliel, /let adicionaisDoces/);
  assert.match(eliel, /item\.precoBase \+ item\.adicionais\.length \* PRECO_ADICIONAL/);
  assert.match(html, /item\.adicionais\.map\(escaparHtml\)/);
  assert.match(backend, /adicionaisPermitidos/);
  assert.match(backend, /precoBase \+ adicionais\.length \* valorAdicional/);
  assert.match(eliel, /obterConfiguracaoOperacional/);
});

test("cardápio do cliente usa as rotas atualizadas e endereço completo obrigatório", () => {
  const cliente = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");

  assert.doesNotMatch(cliente, /JD VAZ DE LIMA/);
  assert.match(cliente, /5: \["JD SOUZA", "COPACABANA", "TUPI"\]/);
  assert.match(cliente, /id="cliEndereco"/);
  assert.match(cliente, /id="cliNum"/);
  assert.match(cliente, /if\(!endereco\)/);
  assert.match(cliente, /if\(!num\)/);
  assert.match(cliente, /id="previaPedidoCompleta"/);
  assert.match(cliente, /enderecoCliente: rotaFinal/);
  assert.match(cliente, /selectRota \+ " \| " \+ endereco \+ ", Nº " \+ num/);
});

test("cardápio informa horários, fim de semana, rotas e contato após as 22h", () => {
  const cliente = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");

  assert.match(cliente, /id="modalStatusAtendimento"/);
  assert.match(cliente, /diaAtualInt === 0 \|\| diaAtualInt === 6/);
  assert.match(cliente, /Ótimo sábado!/);
  assert.match(cliente, /Ótimo domingo!/);
  assert.match(cliente, /segunda a sexta-feira, das 18h às 22h/);
  assert.match(cliente, /function montarResumoRotas\(/);
  assert.match(cliente, /horaAtualInt < 18/);
  assert.match(cliente, /a partir das 18h/);
  assert.match(cliente, /Pedidos online encerrados por hoje/);
  assert.match(cliente, /btnWhatsappPosRota/);
  assert.match(cliente, /5511932180290/);
  assert.match(cliente, /id="btnSairCardapio"/);
  assert.match(cliente, /status-atendimento-fechar/);
});

test("fluxo de pedidos online aguarda aceite, alerta o PDV e prepara WhatsApp", () => {
  const cliente = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");
  const pdv = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const appsScriptDir = path.join(root, "apps-script");
const backend = fs.readdirSync(appsScriptDir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
  .join("\n\n");

  assert.match(cliente, /id="cliTelefone"/);
  assert.match(cliente, /btnEnviarPedidoWhatsapp/);
  assert.match(cliente, /PEDIDO ONLINE/);
  assert.match(pdv, /id="btnTopoOnline"/);
  assert.match(pdv, /class="app-view"[^>]*>[\s\S]*Pedidos Online/);
  assert.match(pdv, /tem-pedidos/);
  assert.match(pdv, /ativarCampainhaOnline/);
  assert.match(pdv, /aceitarPedidoOnlineTela/);
  assert.match(pdv, /recusarPedidoOnlineTela/);
  assert.match(backend, /pedidos_online_pendentes/);
  assert.match(backend, /function aceitarPedidoOnline/);
  assert.match(backend, /ORDER_ALREADY_PROCESSED/);
});

test("produção ignora com segurança item alterado pela sincronização", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const inicio = html.indexOf("function marcarItemEExtrasPronto");
  const fim = html.indexOf("function renderizarPainelPedidos", inicio);
  assert.ok(inicio >= 0 && fim > inicio, "função de conclusão não encontrada");
  const funcao = html.slice(inicio, fim);

  const eventos = [];
  const sandbox = {
    historicoNuvem: [{
      numero: 7,
      itens: [{ tipo: "tapioca", pronto: false }],
      produzido: false
    }],
    travarSyncTemporariamente: () => eventos.push("travar"),
    mostrarToast: () => eventos.push("toast"),
    atualizarTudo: () => eventos.push("renderizar"),
    checarBaixaCache: () => eventos.push("baixar"),
    console: { warn: () => eventos.push("aviso") }
  };
  vm.createContext(sandbox);
  vm.runInContext(funcao, sandbox);

  assert.doesNotThrow(() => {
    vm.runInContext("marcarItemEExtrasPronto('7', 3)", sandbox);
  });
  assert.deepEqual(eventos, ["aviso", "toast", "renderizar"]);
  assert.equal(sandbox.historicoNuvem[0].itens[0].pronto, false);
});
