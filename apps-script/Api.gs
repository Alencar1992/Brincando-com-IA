// =========================================================
// P6 — CAMADA DE API
// Entrada HTTP, roteamento seguro de ações e resposta JSON.
// =========================================================

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action) {
      const permitidasViaGet = [
        "obterDisponibilidadeCardapio",
        "obterCatalogoCardapio",
        "obterStatusCardapio",
        "obterConfiguracaoOperacional"
      ];
      if (permitidasViaGet.indexOf(e.parameter.action) === -1) {
        return responderApi_({
          ok: false,
          code: "METHOD_NOT_ALLOWED",
          error: "Esta ação exige uma requisição POST."
        });
      }
      return responderApi_(executarAcaoApi_(e.parameter.action, [], ""));
    }

    return responderApi_({
      ok: true,
      data: {
        servico: "Tapimóvel 2.0 API",
        status: "online"
      }
    });
  } catch (erro) {
    return responderApi_({
      ok: false,
      code: erro && erro.code ? erro.code : "SERVER_ERROR",
      error: erro && erro.message ? erro.message : String(erro)
    });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    return responderApi_(
      executarAcaoApi_(body.action, body.args || [], String(body.token || ""))
    );
  } catch (erro) {
    return responderApi_({
      ok: false,
      code: erro && erro.code ? erro.code : "SERVER_ERROR",
      error: erro && erro.message ? erro.message : String(erro)
    });
  }
}

function executarAcaoApi_(action, args, token) {
  const acoesPublicas = [
    "obterDisponibilidadeCardapio",
    "obterCatalogoCardapio",
    "obterStatusCardapio",
    "registrarPedidoOnline",
    "registrarFalhaSistema",
    "obterConfiguracaoOperacional",
    "loginAcesso",
    "loginAdministrador",
    "validarSessaoAcesso",
    "validarSessaoAdministrador",
    "encerrarSessaoAdministrador"
  ];

  const acoesEliel = [
    "salvarDisponibilidadeCardapio",
    "inicializarCatalogoConfiguracao",
    "salvarItemCatalogo",
    "removerItemCatalogo",
    "salvarConfiguracaoOperacional",
    "obterRelatorioEliel",
    "registrarAcessoRelatorioEliel",
    "obterConfiguracoesRelatorioEliel",
    "obterHistoricoVendasEliel",
    "obterPreviaFechamentoRelatorioEliel",
    "fecharMesRelatorioEliel"
  ];

  const acoesAdministrativas = [
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "carregarDadosNuvem",
    "salvarNuvemCompleta",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
    "registrarPedidoPdv",
    "atualizarPedidoPdv",
    "excluirVendaRealTime",
    "removerDaBaseDeVendasBackend",
    "lancarPedidoPlanilha",
    "moverParaHistorico",
    "moverParaCancelados",
    "reabrirPedidoBackend",
    "obterResumoMesPlanilha",
    "calcularEstimativaSalarioLucas",
    "registrarDiaSemTrabalhoPlanilha",
    "buscarFolgasBackend",
    "salvarCombustivelPlanilha",
    "buscarHistoricoCombustivel",
    "buscarRankingRotasBackend",
    "buscarTopProdutosBackend",
    "buscarDadosEspelhoBackend",
    "salvarFechamentoDiaPlanilha",
    "obterStatusFechamentoDiario",
    "fecharDiaSeguro",
    "salvarDisponibilidadeCardapio",
    "inicializarCatalogoConfiguracao",
    "salvarItemCatalogo",
    "removerItemCatalogo",
    "salvarConfiguracaoOperacional",
    "excluirContadorTapiocasHoje",
    "obterRelatorioEliel",
    "registrarAcessoRelatorioEliel",
    "obterConfiguracoesRelatorioEliel",
    "obterHistoricoVendasEliel",
    "salvarConfiguracoesRelatorioEliel",
    "obterPreviaFechamentoRelatorioEliel",
    "fecharMesRelatorioEliel",
    "obterAvisosPdv"
  ];

  const permitidas = acoesPublicas.concat(acoesAdministrativas);
  if (!action || permitidas.indexOf(action) === -1) {
    throw erroApi_("ACTION_NOT_ALLOWED", "Ação não permitida: " + action);
  }

  if (acoesAdministrativas.indexOf(action) !== -1) {
    const sessao = obterSessaoAcesso_(token, true);
    if (!sessao) {
      throw erroApi_("AUTH_REQUIRED", "Acesso não autorizado.");
    }
    if (action === "fecharMesRelatorioEliel" && sessao.perfil !== "eliel") {
      throw erroApi_(
        "PERMISSION_DENIED",
        "O fechamento mensal é exclusivo do perfil CEO Eliel."
      );
    }
    if (sessao.perfil !== "admin" && acoesEliel.indexOf(action) === -1) {
      throw erroApi_("PERMISSION_DENIED", "O perfil " + sessao.nome + " não possui permissão para esta ação.");
    }
    if (sessao.perfil === "eliel") {
      if (action === "salvarDisponibilidadeCardapio") args[1] = NOME_PERFIL_ELIEL_;
      if (action === "inicializarCatalogoConfiguracao") args[1] = NOME_PERFIL_ELIEL_;
      if (action === "salvarItemCatalogo") args[2] = NOME_PERFIL_ELIEL_;
      if (action === "removerItemCatalogo") args[1] = NOME_PERFIL_ELIEL_;
      if (action === "salvarConfiguracaoOperacional") args[1] = NOME_PERFIL_ELIEL_;
      if (action === "fecharMesRelatorioEliel") args[3] = NOME_PERFIL_ELIEL_;
    }
  }

  const fn = action === "obterConfiguracaoOperacional"
    ? this.obterConfiguracaoOperacionalConfiavel_
    : action === "obterStatusCardapio"
      ? this.obterStatusCardapioConfiavel_
      : this[action];
  if (typeof fn !== "function") {
    throw erroApi_("ACTION_NOT_FOUND", "Função não encontrada no backend: " + action);
  }

  const argumentos = Array.isArray(args) ? args : [];
  if (
    action === "validarSessaoAcesso" ||
    action === "validarSessaoAdministrador" ||
    action === "encerrarSessaoAdministrador"
  ) {
    return { ok: true, data: fn.call(this, token) };
  }
  return { ok: true, data: fn.apply(this, argumentos) };
}

function responderApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
