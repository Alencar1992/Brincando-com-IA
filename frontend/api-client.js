(function () {
  "use strict";

  var accessMode = new URLSearchParams(window.location.search).get("acesso") === "eliel"
    ? "eliel"
    : "admin";
  var STORAGE_PREFIX = "tapimovel_" + accessMode + "_";
  var TOKEN_KEY = STORAGE_PREFIX + "token";
  var TOKEN_DAY_KEY = STORAGE_PREFIX + "token_day";
  var TOKEN_LAST_ACTIVITY_KEY = STORAGE_PREFIX + "last_activity";
  var TOKEN_PROFILE_KEY = STORAGE_PREFIX + "profile";
  var TOKEN_NAME_KEY = STORAGE_PREFIX + "name";
  var DEFAULT_INACTIVITY_MS = 4 * 60 * 60 * 1000;
  var REQUEST_TIMEOUT_MS = 25000;
  var SAFE_RETRY_LIMIT = 1;
  var ACTIVITY_PERSIST_INTERVAL_MS = 30000;
  var SAFE_READ_ACTION_PATTERN = /^(validar|carregar|obter|listar|buscar|calcular|verificar|consultar)/;
  var SAFE_ACTION_PATTERN = SAFE_READ_ACTION_PATTERN; // alias legado para testes/diagnóstico existentes
  var inactivityMs = DEFAULT_INACTIVITY_MS;
  var connectionTimer = null;
  var pendingReadRequests = Object.create(null);
  var lastActivityPersistedAt = Number(localStorage.getItem(TOKEN_LAST_ACTIVITY_KEY) || 0);

  function getLocalDay() {
    var now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getToken() {
    var token = localStorage.getItem(TOKEN_KEY) || "";
    var sessionDay = localStorage.getItem(TOKEN_DAY_KEY) || "";
    var lastActivity = Number(localStorage.getItem(TOKEN_LAST_ACTIVITY_KEY) || 0);
    var inactive = !lastActivity || Date.now() - lastActivity >= inactivityMs;
    if (!token || sessionDay !== getLocalDay() || inactive) {
      clearToken();
      return "";
    }
    return token;
  }

  function saveToken(session) {
    if (!session || !session.token) return;
    var sessionMode = session.perfil === "eliel" ? "eliel" : accessMode;
    var sessionPrefix = "tapimovel_" + sessionMode + "_";
    inactivityMs = Math.max(
      60 * 1000,
      Number(session.inatividadeSegundos || 0) * 1000 || DEFAULT_INACTIVITY_MS
    );
    var agora = Date.now();
    localStorage.setItem(sessionPrefix + "token", String(session.token));
    localStorage.setItem(sessionPrefix + "token_day", String(session.diaSessao || getLocalDay()));
    localStorage.setItem(sessionPrefix + "last_activity", String(agora));
    localStorage.setItem(sessionPrefix + "profile", String(session.perfil || sessionMode));
    localStorage.setItem(sessionPrefix + "name", String(session.nome || ""));
    if (sessionMode === accessMode) lastActivityPersistedAt = agora;
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_DAY_KEY);
    localStorage.removeItem(TOKEN_LAST_ACTIVITY_KEY);
    localStorage.removeItem(TOKEN_PROFILE_KEY);
    localStorage.removeItem(TOKEN_NAME_KEY);
    lastActivityPersistedAt = 0;
  }

  function registerActivity() {
    if (!getToken()) return;
    var agora = Date.now();
    if (agora - lastActivityPersistedAt < ACTIVITY_PERSIST_INTERVAL_MS) return;
    localStorage.setItem(TOKEN_LAST_ACTIVITY_KEY, String(agora));
    lastActivityPersistedAt = agora;
  }

  function emitAuthRequired(message) {
    clearToken();
    window.dispatchEvent(new CustomEvent("tapimovel:auth-required", {
      detail: { message: message || "Sua sessão expirou. Entre novamente." }
    }));
  }

  function getApiUrl() {
    var config = window.TAPIMOVEL_CONFIG || {};
    var url = String(config.apiUrl || "").trim();
    if (!url || url.indexOf("COLE_AQUI") !== -1) {
      throw new Error("A URL da API do Apps Script ainda não foi configurada.");
    }
    return url;
  }

  function updateConnectionStatus(state, message) {
    var status = document.getElementById("tapimovelConnectionStatus");
    if (status) {
      status.hidden = false;
      status.dataset.state = state;
      var label = status.querySelector("span:last-child");
      if (label) label.textContent = message;
      clearTimeout(connectionTimer);
      if (state === "online") {
        connectionTimer = setTimeout(function () { status.hidden = true; }, 2200);
      }
    }
    window.dispatchEvent(new CustomEvent("tapimovel:connection", {
      detail: { state: state, message: message }
    }));
  }

  function retryUrl(url, attempt) {
    if (!attempt) return url;
    var parsed = new URL(url);
    parsed.searchParams.set("tentativa", String(Date.now()));
    return parsed.toString();
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function friendlyConnectionError(error) {
    if (!navigator.onLine) {
      return new Error("Sem internet no aparelho. Verifique a rede e tente novamente.");
    }
    if (error && error.name === "AbortError") {
      return new Error("A conexão demorou mais de 25 segundos. Tente novamente.");
    }
    if (error && error.httpStatus === 404) {
      return new Error("O serviço ficou temporariamente indisponível (HTTP 404). Tente novamente.");
    }
    if (error && error.httpStatus) {
      return new Error("O serviço respondeu com falha HTTP " + error.httpStatus + ". Tente novamente.");
    }
    if (error instanceof SyntaxError) {
      return new Error("O serviço enviou uma resposta inválida. Tente novamente.");
    }
    return error && error.message
      ? error
      : new Error("Não foi possível conectar ao serviço. Verifique a internet e tente novamente.");
  }

  function requestApi(action, args, token, attempt) {
    var safeToRetry = SAFE_READ_ACTION_PATTERN.test(action);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    updateConnectionStatus(
      attempt ? "retrying" : "connecting",
      attempt ? "Reconectando ao sistema…" : "Conectando ao sistema…"
    );

    return fetch(retryUrl(getApiUrl(), attempt), {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, args: args, token: token }),
      signal: controller.signal
    })
      .then(function (response) {
        clearTimeout(timeout);
        if (!response.ok) {
          var httpError = new Error("Falha HTTP " + response.status);
          httpError.httpStatus = response.status;
          httpError.retryable = response.status === 404 || response.status === 408 ||
            response.status === 429 || response.status >= 500;
          throw httpError;
        }
        return response.json();
      })
      .then(function (payload) {
        updateConnectionStatus("online", "Sistema conectado");
        return payload;
      })
      .catch(function (error) {
        clearTimeout(timeout);
        var retryable = error && (
          error.retryable || error.name === "AbortError" || error instanceof TypeError || error instanceof SyntaxError
        );
        if (safeToRetry && retryable && attempt < SAFE_RETRY_LIMIT && navigator.onLine) {
          updateConnectionStatus("retrying", "Instabilidade detectada. Tentando novamente…");
          return wait(900).then(function () {
            return requestApi(action, args, token, attempt + 1);
          });
        }
        var friendly = friendlyConnectionError(error);
        updateConnectionStatus("offline", friendly.message);
        throw friendly;
      });
  }

  function requestKey(action, args, token) {
    try {
      return action + "\n" + String(token || "") + "\n" + JSON.stringify(args || []);
    } catch (_) {
      return "";
    }
  }

  function requestApiShared(action, args, token) {
    if (!SAFE_READ_ACTION_PATTERN.test(action)) {
      return requestApi(action, args, token, 0);
    }

    var key = requestKey(action, args, token);
    if (!key) return requestApi(action, args, token, 0);
    if (pendingReadRequests[key]) return pendingReadRequests[key];

    var request = requestApi(action, args, token, 0);
    pendingReadRequests[key] = request.then(
      function (payload) {
        delete pendingReadRequests[key];
        return payload;
      },
      function (error) {
        delete pendingReadRequests[key];
        throw error;
      }
    );
    return pendingReadRequests[key];
  }

  function createRunner(successHandler, failureHandler) {
    var target = {
      withSuccessHandler: function (handler) {
        return createRunner(handler, failureHandler);
      },
      withFailureHandler: function (handler) {
        return createRunner(successHandler, handler);
      }
    };

    return new Proxy(target, {
      get: function (obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop !== "string") return undefined;

        return function () {
          var args = Array.prototype.slice.call(arguments);
          return requestApiShared(prop, args, getToken())
            .then(function (payload) {
              if (!payload || payload.ok !== true) {
                var apiError = new Error(
                  (payload && payload.error) || "Resposta inválida da API."
                );
                apiError.code = payload && payload.code;
                throw apiError;
              }
              if (prop === "loginAcesso" || prop === "loginAdministrador") saveToken(payload.data);
              if (prop === "encerrarSessaoAdministrador") clearToken();
              if (typeof successHandler === "function") successHandler(payload.data);
              return payload.data;
            })
            .catch(function (error) {
              if (prop !== "registrarFalhaSistema") {
                try {
                  error.tapimovelAction = prop;
                  window.dispatchEvent(new CustomEvent("tapimovel:api-error", {
                    detail: { action: prop, error: error }
                  }));
                } catch (_) {}
              }
              if (error && error.code === "AUTH_REQUIRED") {
                emitAuthRequired(error.message);
              }
              if (typeof failureHandler === "function") {
                failureHandler(error);
                return;
              }
              window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
                promise: Promise.reject(error),
                reason: error
              }));
              throw error;
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner();
  ["pointerdown", "keydown", "touchstart"].forEach(function (eventName) {
    window.addEventListener(eventName, registerActivity, { passive: true });
  });
  window.addEventListener("offline", function () {
    updateConnectionStatus("offline", "Sem internet no aparelho");
  });
  window.addEventListener("online", function () {
    updateConnectionStatus("connecting", "Internet restabelecida. Reconectando…");
  });
  window.TapimovelAuth = {
    clear: clearToken,
    hasToken: function () { return Boolean(getToken()); },
    getAccessMode: function () { return accessMode; },
    getSession: function () {
      if (!getToken()) return null;
      return {
        perfil: localStorage.getItem(TOKEN_PROFILE_KEY) || accessMode,
        nome: localStorage.getItem(TOKEN_NAME_KEY) || ""
      };
    }
  };
})();
