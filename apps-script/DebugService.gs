// =========================================================
// MONITORAMENTO LEVE DE FALHAS — ISSUE #81
// Registra somente metadados técnicos, sem PIN, token ou dados do pedido.
// =========================================================

const NOME_ABA_LOG_DEBUG_ = "LOG_DEBUG";
const LIMITE_LOG_DEBUG_POR_10_MIN_ = 20;
const CABECALHO_LOG_DEBUG_ = [
  "ID",
  "Registrado em",
  "Origem",
  "Tipo",
  "Tela",
  "Ação",
  "Código",
  "Mensagem",
  "Detalhes",
  "Linha",
  "Arquivo",
  "Dispositivo",
  "Versão"
];

function textoLogDebugSeguro_(valor, limite) {
  return String(valor == null ? "" : valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\b(token|pin|senha)\b\s*[:=]\s*["']?[^,\s"']+/gi, "$1=[REMOVIDO]")
    .replace(/\b(?:55)?\d{10,11}\b/g, "[TELEFONE_REMOVIDO]")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, limite || 300);
}

function normalizarFalhaSistema_(payload) {
  const origemRecebida = textoLogDebugSeguro_(payload.origem, 20).toUpperCase();
  const origensPermitidas = ["PDV", "CARDAPIO", "CEO"];
  return {
    clienteId: textoLogDebugSeguro_(payload.clienteId, 80) || "anonimo",
    origem: origensPermitidas.indexOf(origemRecebida) !== -1 ? origemRecebida : "SISTEMA",
    tipo: textoLogDebugSeguro_(payload.tipo, 50) || "ERRO",
    tela: textoLogDebugSeguro_(payload.tela, 120),
    acao: textoLogDebugSeguro_(payload.acao, 100),
    codigo: textoLogDebugSeguro_(payload.codigo, 80),
    mensagem: textoLogDebugSeguro_(payload.mensagem, 700) || "Erro sem mensagem.",
    detalhe: textoLogDebugSeguro_(payload.detalhe, 1200),
    linha: textoLogDebugSeguro_(payload.linha, 30),
    arquivo: textoLogDebugSeguro_(payload.arquivo, 220).replace(/[?#].*$/, ""),
    dispositivo: textoLogDebugSeguro_(payload.dispositivo, 300),
    versao: textoLogDebugSeguro_(payload.versao, 50)
  };
}

function registrarFalhaSistema(payloadJSON) {
  let lock = null;
  try {
    const payload = JSON.parse(payloadJSON || "{}");
    const falha = normalizarFalhaSistema_(payload);
    const cache = CacheService.getScriptCache();
    const assinatura = hashSeguro_([
      falha.origem,
      falha.tipo,
      falha.acao,
      falha.codigo,
      falha.mensagem,
      falha.linha
    ].join("|"));
    const chaveDuplicada = "log_debug_dup_" + assinatura;
    if (cache.get(chaveDuplicada)) {
      return { registrado: false, motivo: "duplicado" };
    }

    const chaveLimite = "log_debug_limite_" + hashSeguro_(falha.clienteId);
    const quantidade = Number(cache.get(chaveLimite) || 0);
    if (quantidade >= LIMITE_LOG_DEBUG_POR_10_MIN_) {
      return { registrado: false, motivo: "limite" };
    }

    // Usa um lock curto e independente. O log nunca deve atrasar o PDV.
    lock = LockService.getDocumentLock();
    if (!lock.tryLock(1200)) {
      registrarErroAplicacao_("LOG_DEBUG_OCUPADO", new Error("Log não registrado: planilha ocupada."));
      return { registrado: false, motivo: "ocupado" };
    }

    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    let aba = planilha.getSheetByName(NOME_ABA_LOG_DEBUG_);
    if (!aba) {
      aba = planilha.insertSheet(NOME_ABA_LOG_DEBUG_);
      aba.getRange(1, 1, 1, CABECALHO_LOG_DEBUG_.length)
        .setValues([CABECALHO_LOG_DEBUG_])
        .setFontWeight("bold")
        .setBackground("#f4cccc");
      aba.setFrozenRows(1);
    }

    const registradoEm = Utilities.formatDate(
      new Date(),
      obterFusoAplicacao_(),
      "dd/MM/yyyy HH:mm:ss"
    );
    const valores = [
      Utilities.getUuid(),
      registradoEm,
      falha.origem,
      falha.tipo,
      falha.tela,
      falha.acao,
      falha.codigo,
      falha.mensagem,
      falha.detalhe,
      falha.linha,
      falha.arquivo,
      falha.dispositivo,
      falha.versao
    ].map(function(valor) {
      return valorSeguroPlanilha_(valor);
    });

    aba.getRange(aba.getLastRow() + 1, 1, 1, valores.length).setValues([valores]);
    cache.put(chaveDuplicada, "1", 300);
    cache.put(chaveLimite, String(quantidade + 1), 600);
    return { registrado: true };
  } catch (erro) {
    registrarErroAplicacao_("REGISTRAR_FALHA_SISTEMA", erro);
    return { registrado: false, motivo: "erro_interno" };
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
