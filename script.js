const homeScreen = document.getElementById("homeScreen");
const chatScreen = document.getElementById("chatScreen");
const openChat = document.getElementById("openChat");
const homeInput = document.getElementById("homeInput");
const homeMic = document.getElementById("homeMic");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const micBtn = document.getElementById("micBtn");
const history = document.querySelector(".history");
const historyToggle = document.getElementById("historyToggle");
const historyOverlay = document.getElementById("historyOverlay");

// ============================================================
// CONFIGURAÇÃO DA API
// Carrega API_URL, API_TOKEN e API_MODEL do arquivo config.env.
// O arquivo config.env precisa estar na mesma pasta do index.html.
// ============================================================
let API_URL = "";
let API_TOKEN = "";
let API_MODEL = "";

function parseEnv(text) {
  const values = {};

  text.split(/\r?\n/).forEach(line => {
    line = line.trim();

    // Ignora linhas vazias e comentários
    if (!line || line.startsWith("#")) return;

    const separator = line.indexOf("=");
    if (separator === -1) return;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    // Aceita valores com aspas
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  });

  return values;
}

function loadSavedApiConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("fridayApiConfig") || "{}");

    if (saved.apiKey) API_TOKEN = saved.apiKey;
    if (saved.endpoint) API_URL = saved.endpoint;
    if (saved.deployment) API_MODEL = saved.deployment;
  } catch (error) {
    console.warn("Não foi possível ler a configuração salva da API.");
  }
}

async function loadConfig() {
  // Configuração salva pelo usuário tem prioridade sobre o config.env.
  loadSavedApiConfig();

  try {
    const response = await fetch("config.env", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Não foi possível carregar config.env (HTTP ${response.status}).`);
    }

    const env = parseEnv(await response.text());

    API_URL = env.Azure_API_URL || "";
    API_TOKEN = env.Azure_API_TOKEN || env.Azure_API_Token || "";
    API_MODEL = env.API_MODEL || "";

    if (!API_URL || !API_TOKEN || !API_MODEL) {
      throw new Error(
        "Configure a API pelo botão CADASTRAR API ou preencha o config.env."
      );
    }

    console.log("F.R.I.D.A.Y.: configuração da API carregada.");
  } catch (error) {
    console.error("Erro ao carregar config.env:", error);
  }
}

// O chat espera o carregamento do config.env antes de chamar a API.
const configReady = loadConfig();

// ============================================================
// CADASTRO DA API — SOMENTE CHAT E ÁUDIO
// ============================================================
const fridayApiModal = document.getElementById("fridayApiModal");
const fridayApiClose = document.getElementById("fridayApiClose");
const fridayApiCancel = document.getElementById("fridayApiCancel");
const fridayApiSave = document.getElementById("fridayApiSave");
const fridayApiKey = document.getElementById("fridayApiKey");
const fridayApiEndpoint = document.getElementById("fridayApiEndpoint");
const fridayApiModel = document.getElementById("fridayApiModel");
const fridayApiStatus = document.getElementById("fridayApiStatus");
const chatApiConfigButton = document.getElementById("chatApiConfigButton");
const audioApiConfigButton = document.getElementById("audioApiConfigButton");

function openApiConfigModal() {
  const saved = JSON.parse(localStorage.getItem("fridayApiConfig") || "{}");

  fridayApiKey.value = saved.apiKey || API_TOKEN || "";
  fridayApiEndpoint.value = saved.endpoint || API_URL || "";
  fridayApiModel.value = saved.deployment || API_MODEL || "";
  fridayApiStatus.textContent = "";

  fridayApiModal.classList.add("open");
  fridayApiModal.setAttribute("aria-hidden", "false");
  setTimeout(() => fridayApiKey.focus(), 0);
}

function closeApiConfigModal() {
  fridayApiModal.classList.remove("open");
  fridayApiModal.setAttribute("aria-hidden", "true");
}

chatApiConfigButton?.addEventListener("click", openApiConfigModal);
audioApiConfigButton?.addEventListener("click", openApiConfigModal);
fridayApiClose?.addEventListener("click", closeApiConfigModal);
fridayApiCancel?.addEventListener("click", closeApiConfigModal);

fridayApiModal?.addEventListener("click", event => {
  if (event.target === fridayApiModal) closeApiConfigModal();
});

fridayApiSave?.addEventListener("click", () => {
  const apiKey = fridayApiKey.value.trim();
  const endpoint = fridayApiEndpoint.value.trim();
  const deployment = fridayApiModel.value.trim();

  if (!apiKey || !endpoint || !deployment) {
    fridayApiStatus.textContent = "Preencha API Key, Endpoint e Deployment / Model.";
    fridayApiStatus.className = "error";
    return;
  }

  const saved = { apiKey, endpoint, deployment };
  localStorage.setItem("fridayApiConfig", JSON.stringify(saved));

  API_TOKEN = apiKey;
  API_URL = endpoint;
  API_MODEL = deployment;

  fridayApiStatus.textContent = "Configuração salva com sucesso.";
  fridayApiStatus.className = "success";

  setTimeout(closeApiConfigModal, 500);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && fridayApiModal?.classList.contains("open")) {
    closeApiConfigModal();
  }
});

async function getAIReply(userText) {
  await configReady;
  const conversation = getCurrentConversation();
  const messagesForAPI = conversation
    ? conversation.messages.map(message => ({
        role: message.type === "bot" ? "assistant" : "user",
        content: message.text
      }))
    : [{ role: "user", content: userText }];

  const headers = {
    "Content-Type": "application/json"
  };

  if (API_TOKEN.trim()) {
    headers["Authorization"] = `Bearer ${API_TOKEN.trim()}`;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: messagesForAPI,
      max_completion_tokens: 16384,
      reasoning_effort: "low",
      model: API_MODEL
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Erro ${response.status}${errorText ? `: ${errorText.slice(0, 180)}` : ""}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data?.content;

  if (Array.isArray(content)) {
    return content.map(item => item?.text || "").join("").trim();
  }

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  throw new Error("A API não retornou uma resposta de texto válida.");
}

// ============================================================
// HISTÓRICO NO ESTILO DE UM CHAT:
// UMA ENTRADA = UMA CONVERSA, NÃO UMA ENTRADA POR MENSAGEM.
// As conversas ficam salvas no navegador com localStorage.
// ============================================================
const STORAGE_KEY = "friday_conversations";
let conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let currentConversationId = null;

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function createTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 32 ? clean.slice(0, 32) + "..." : clean;
}

function renderHistory() {
  history.innerHTML = `<div class="history-head"><div class="history-title">↻ &nbsp; HISTÓRICO</div><button id="newChatBtn" class="new-chat-btn" type="button" title="Voltar e iniciar um novo chat">＋</button></div>`;
  document.getElementById("newChatBtn").addEventListener("click", resetChat);

  [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(conversation => {
      const button = document.createElement("button");
      button.type = "button";
      button.title = conversation.title;
      button.innerHTML = `⌕ <span>${escapeHtml(conversation.title)}</span>`;

      if (conversation.id === currentConversationId) {
        button.classList.add("selected");
      }

      button.addEventListener("click", () => loadConversation(conversation.id));
      history.appendChild(button);
    });
}

function resetChat() {
  // Limpa somente a conversa atual e volta para a tela inicial.
  // O histórico salvo continua disponível para ser aberto novamente.
  currentConversationId = null;
  messages.innerHTML = `
    <article class="message bot">
      <div class="avatar">▣</div>
      <div class="bubble">
        <strong>Initializing secure connection...</strong>
        <p>Hello. How can I assist you today?</p>
      </div>
    </article>
  `;
  chatInput.value = "";
  renderHistory();
  chatScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  homeInput.value = "";
  homeInput.focus();
}

function createConversation(firstMessage) {
  const now = Date.now();
  const conversation = {
    id: String(now),
    title: createTitle(firstMessage),
    messages: [],
    createdAt: now,
    updatedAt: now
  };

  conversations.push(conversation);
  currentConversationId = conversation.id;
  saveConversations();
  renderHistory();

  return conversation;
}

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}

function addMessage(text, type, save = true) {
  const article = document.createElement("article");
  article.className = `message ${type}`;
  article.innerHTML = `
    <div class="avatar">${type === "bot" ? "▣" : "♙"}</div>
    <div class="bubble"><p>${escapeHtml(text)}</p></div>
  `;

  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;

  if (save && currentConversationId) {
    const conversation = getCurrentConversation();
    if (conversation) {
      conversation.messages.push({ type, text });
      conversation.updatedAt = Date.now();
      saveConversations();
    }
  }
}

function loadConversation(id) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return;

  currentConversationId = id;
  messages.innerHTML = "";

  // Recria somente as mensagens daquela conversa.
  conversation.messages.forEach(message => {
    addMessage(message.text, message.type, false);
  });

  renderHistory();
  chatInput.focus();
}

function showChat(initialText = "") {
  homeScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  // Se não houver conversas salvas, o histórico aparece vazio.
  renderHistory();

  if (initialText.trim()) {
    chatInput.value = initialText.trim();
    chatForm.requestSubmit();
  }

  setTimeout(() => chatInput.focus(), 100);
}

openChat.addEventListener("click", () => showChat());

const chatBackDashboard = document.getElementById("chatBackDashboard");
chatBackDashboard?.addEventListener("click", () => resetChat());

homeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") showChat(homeInput.value);
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function botReply(text) {
  const t = text.toLowerCase();

  if (t.includes("status"))
    return "Todos os sistemas principais estão operacionais. CPU OK · NET OK · SEC OK";

  if (t.includes("olá") || t.includes("oi"))
    return "Olá. F.R.I.D.A.Y. pronta para receber seu comando.";

  if (t.includes("quem é você"))
    return "Sou a F.R.I.D.A.Y., sua interface virtual de assistência.";

  if (t.includes("hora"))
    return `O horário local do navegador é ${new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit"
    })}.`;

  return `Comando recebido: "${text}". Estou processando sua solicitação.`;
}

chatForm.addEventListener("submit", async e => {
  e.preventDefault();

  const text = chatInput.value.trim();
  if (!text) return;

  if (!currentConversationId) {
    createConversation(text);
    messages.innerHTML = "";
  }

  addMessage(text, "user");
  chatInput.value = "";
  renderHistory();

  const loading = document.createElement("article");
  loading.className = "message bot";
  loading.innerHTML = `
    <div class="avatar">▣</div>
    <div class="bubble"><p>Processando...</p></div>
  `;
  messages.appendChild(loading);
  messages.scrollTop = messages.scrollHeight;

  try {
    const response = await getAIReply(text);
    loading.remove();
    addMessage(response, "bot");
    renderHistory();
  } catch (error) {
    loading.remove();
    addMessage(`Não foi possível conectar à IA. ${error.message}`, "bot");
    renderHistory();
  }
});

// Entrada por voz.
function startVoice(input) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Seu navegador não oferece reconhecimento de voz. Use Chrome ou Edge para testar essa função.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = false;

  recognition.onresult = event => {
    input.value = event.results[0][0].transcript;
    if (input === homeInput) showChat(input.value);
  };

  recognition.start();
}

homeMic.addEventListener("click", () => startVoice(homeInput));
micBtn.addEventListener("click", () => startVoice(chatInput));

function applyVisualFilters() {
  const hue = document.body.classList.contains("red-theme") ? "hue-rotate(180deg)" : "";
  document.body.style.filter = hue || "none";
}

// Troca o esquema de cores de TODAS as interfaces: azul <-> vermelho.
const colorSwapBtn = document.getElementById("colorSwapBtn");
const COLOR_THEME_KEY = "friday_color_theme";

function applyColorTheme(theme) {
  document.body.classList.toggle("red-theme", theme === "red");
  applyVisualFilters();
  if (colorSwapBtn) {
    colorSwapBtn.title = theme === "red"
      ? "Voltar para azul"
      : "Trocar azul e vermelho";
  }
}

applyColorTheme(localStorage.getItem(COLOR_THEME_KEY) || "blue");

colorSwapBtn?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("red-theme") ? "blue" : "red";
  applyColorTheme(nextTheme);
  localStorage.setItem(COLOR_THEME_KEY, nextTheme);
});

// O histórico é carregado vazio caso não exista nenhuma conversa.
renderHistory();


// ============================================================
// F.R.I.D.A.Y. VOICE MODE
// Conversa por microfone usando Web Speech API.
// A fala reconhecida aparece no transcript, é respondida pela
// F.R.I.D.A.Y. e a resposta é lida em voz alta pelo navegador.
// ============================================================

const audioScreen = document.getElementById("audioScreen");
const openAudio = document.getElementById("openAudio");
const audioBack = document.getElementById("audioBack");
const voiceMainBtn = document.getElementById("voiceMainBtn");
const audioStatus = document.getElementById("audioStatus");
const audioSubtitle = document.getElementById("audioSubtitle");
const voiceText = document.getElementById("voiceText");

let voiceRecognition = null;
let voiceListening = false;
let voiceStopping = false;

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function openVoiceMode() {
  homeScreen.classList.add("hidden");
  chatScreen.classList.add("hidden");
  audioScreen.classList.remove("hidden");

  stopVoiceMode();
  voiceText.textContent = "Aguardando comando de voz...";
  audioStatus.textContent = "VOICE MODE · STANDBY";
  audioSubtitle.textContent =
    "Pressione o microfone para iniciar a conversa por voz";
}

function closeVoiceMode() {
  stopVoiceMode();
  audioScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}

function setVoiceListening(state) {
  voiceListening = state;
  audioScreen.classList.toggle("listening", state);

  if (state) {
    audioStatus.textContent = "VOICE MODE · LISTENING";
    audioSubtitle.textContent = "F.R.I.D.A.Y. está ouvindo...";
    voiceMainBtn.innerHTML = "<span>■</span> PARAR CONVERSA";
  } else {
    audioStatus.textContent = "VOICE MODE · STANDBY";
    audioSubtitle.textContent =
      "Pressione o microfone para iniciar a conversa por voz";
    voiceMainBtn.innerHTML = "<span>♩</span> INICIAR CONVERSA";
  }
}

function speakFriday(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}

async function handleVoiceResult(transcript) {
  const text = transcript.trim();

  if (!text) return;

  voiceText.textContent = "Você: " + text;

  // A conversa por voz usa a mesma API do chat.
  try {
    const response = await getAIReply(text);
    voiceText.textContent = "F.R.I.D.A.Y.: " + response;
    speakFriday(response);
  } catch (error) {
    const response = `Não foi possível conectar à IA. ${error.message}`;
    voiceText.textContent = "F.R.I.D.A.Y.: " + response;
    speakFriday(response);
  }
}

function startVoiceMode() {
  const SpeechRecognition = getSpeechRecognition();

  if (!SpeechRecognition) {
    alert(
      "O reconhecimento de voz não está disponível neste navegador. Use Google Chrome ou Microsoft Edge."
    );
    return;
  }

  if (voiceListening) {
    stopVoiceMode();
    return;
  }

  voiceStopping = false;

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "pt-BR";
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 1;

  voiceRecognition.onstart = () => {
    setVoiceListening(true);
  };

  voiceRecognition.onresult = event => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (interimText) {
      voiceText.textContent = "Você: " + interimText;
    }

    if (finalText.trim()) {
      handleVoiceResult(finalText);
    }
  };

  voiceRecognition.onerror = event => {
    // "no-speech" e "aborted" podem ocorrer normalmente.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      alert("O acesso ao microfone foi bloqueado. Permita o microfone nas configurações do navegador.");
      stopVoiceMode();
      return;
    }

    if (event.error !== "no-speech" && event.error !== "aborted") {
      voiceText.textContent = "Erro no reconhecimento de voz: " + event.error;
    }
  };

  voiceRecognition.onend = () => {
    // Alguns navegadores encerram o reconhecimento automaticamente.
    // Reinicia enquanto o modo de voz estiver ativo.
    if (voiceListening && !voiceStopping) {
      try {
        voiceRecognition.start();
      } catch (error) {
        // Evita erro caso o navegador ainda esteja finalizando a sessão.
      }
    } else {
      setVoiceListening(false);
    }
  };

  try {
    voiceRecognition.start();
  } catch (error) {
    voiceText.textContent = "Não foi possível iniciar o microfone.";
    setVoiceListening(false);
  }
}

function stopVoiceMode() {
  voiceStopping = true;
  voiceListening = false;
  audioScreen?.classList.remove("listening");

  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch (error) {}
    voiceRecognition = null;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (audioStatus) {
    audioStatus.textContent = "VOICE MODE · STANDBY";
  }

  if (audioSubtitle) {
    audioSubtitle.textContent =
      "Pressione o microfone para iniciar a conversa por voz";
  }

  if (voiceMainBtn) {
    voiceMainBtn.innerHTML = "<span>♩</span> INICIAR CONVERSA";
  }
}

openAudio?.addEventListener("click", event => {
  event.preventDefault();
  openVoiceMode();
});

audioBack?.addEventListener("click", event => {
  event.preventDefault();
  closeVoiceMode();
});

voiceMainBtn?.addEventListener("click", event => {
  event.preventDefault();

  if (voiceListening) {
    stopVoiceMode();
  } else {
    startVoiceMode();
  }
});
