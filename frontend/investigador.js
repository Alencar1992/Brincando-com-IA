(function () {
  "use strict";

  var VERSAO_DEBUG = "2026-09-08.1";
  var CHAVE_CLIENTE = "tapimovel_debug_client_id";
  var errosRecentes = Object.create(null);

  function textoSeguro(valor, limite) {
    return String(valor == null ? "" : valor)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/\b(token|pin|senha)\b\s*[:=]\s*["']?[^,\s"']+/gi, "$1=[REMOVIDO]")
      .replace(/\b(?:55)?\d{10,11}\b/g, "[TELEFONE_REMOVIDO]")
      .replace(/[?#].*?(?=\s|$)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, limite || 500);
  }

  function obterClienteId() {
    try {
      var existente = localStorage.getItem(CHAVE_CLIENTE);
      if (existente) return existente;
      var novo = window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : "web-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem(CHAVE_CLIENTE, novo);
      return novo;
    } catch (_) {
      return "web-sem-storage";
    }
  }

  function obterOrigem() {
    if (/cliente\.html/i.test(window.location.pathname)) return "CARDAPIO";
    if (new URLSearchParams(window.location.search).get("acesso") === "eliel") return "CEO";
    return "PDV";
  }

  function montarFalha(tipo, erro, extras) {
    extras = extras || {};
    var mensagem = erro && erro.message ? erro.message : String(erro || "Erro sem mensagem.");
    return {
      clienteId: obterClienteId(),
      origem: obterOrigem(),
      tipo: textoSeguro(tipo, 50),
      tela: textoSeguro(window.location.pathname + window.location.hash, 120),
      acao: textoSeguro(extras.acao || (erro && erro.tapimovelAction), 100),
      codigo: textoSeguro(extras.codigo || (erro && erro.code), 80),
      mensagem: textoSeguro(mensagem, 700),
      detalhe: textoSeguro(extras.detalhe || (erro && erro.stack), 1200),
      linha: textoSeguro(extras.linha, 30),
      arquivo: textoSeguro(extras.arquivo, 220),
      dispositivo: textoSeguro(navigator.userAgent, 300),
      versao: VERSAO_DEBUG
    };
  }

  function registrarFalha(falha) {
    var assinatura = [falha.tipo, falha.acao, falha.codigo, falha.mensagem, falha.linha].join("|");
    var agora = Date.now();
    if (errosRecentes[assinatura] && agora - errosRecentes[assinatura] < 60000) return;
    errosRecentes[assinatura] = agora;

    Object.keys(errosRecentes).forEach(function (chave) {
      if (agora - errosRecentes[chave] > 300000) delete errosRecentes[chave];
    });

    try {
      var runner = window.google && window.google.script && window.google.script.run;
      if (!runner || typeof runner.withFailureHandler !== "function") return;
      runner
        .withFailureHandler(function () {})
        .registrarFalhaSistema(JSON.stringify(falha));
    } catch (_) {
      // O monitor nunca pode interromper a operação principal.
    }
  }

  function mostrarErro(titulo, detalhe) {
    var texto = document.getElementById("textoErroSistema");
    var modal = document.getElementById("modalErroSistema");
    if (!texto || !modal) return;

    texto.textContent = titulo + "\n\n" + detalhe;
    modal.style.display = "flex";
  }

  window.addEventListener("tapimovel:api-error", function (event) {
    var detalhe = event.detail || {};
    var erro = detalhe.error || new Error("Falha de comunicação sem detalhe.");
    registrarFalha(montarFalha("API", erro, {
      acao: detalhe.action,
      codigo: erro.code
    }));
  });

  window.addEventListener("error", function (event) {
    if (!event.message || event.message === "Script error." || !event.filename) return;
    var erro = event.error || new Error(event.message);
    registrarFalha(montarFalha("NAVEGADOR", erro, {
      linha: event.lineno + ":" + event.colno,
      arquivo: event.filename
    }));
    mostrarErro(
      "Erro no navegador",
      event.message + "\nLinha: " + event.lineno + ", coluna: " + event.colno
    );
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    registrarFalha(montarFalha("COMUNICAÇÃO", reason));
    mostrarErro(
      "Erro de comunicação",
      reason && reason.message ? reason.message : String(reason)
    );
  });
})();
