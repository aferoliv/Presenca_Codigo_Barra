/**
 * Etiqueta da disciplina no nome dos arquivos de saida: as 7 primeiras letras
 * do arquivo usado para subir a lista de alunos.
 *
 *   node testes/teste_nome_arquivo.js
 */
const { criarManager, relogio, verificar, secao, resumo } = require("./harness");

const ALUNO = "100001";

/** Captura o nome do arquivo em vez de baixar. */
function capturar(m) {
  const saidas = [];
  m._downloadFile = (conteudo, nome) => saidas.push({ nome, conteudo });
  return saidas;
}

function comEventos(m) {
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO);
  return m;
}

// ---------------------------------------------------------------------------
secao("Etiqueta a partir do nome do arquivo");
{
  const m = criarManager();
  const casos = [
    ["QUI112 - 04set25-matriculas.csv", "QUI112"],
    ["QUI112 - matriculas.csv", "QUI112"],
    ["courseid_28451_11abr26.json", "coursei"],
    ["courseid_28451_11abr26.xlsx", "coursei"],
    ["BIO231-turma A.xlsx", "BIO231"],
    ["QUI112.xlsx", "QUI112"],
    ["ABC.csv", "ABC"],
    ["Química Geral.xlsx", "Quimica"],
    ["___.csv", ""],
    ["", ""],
    [null, ""],
  ];
  casos.forEach(([entrada, esperado]) => {
    verificar(`_buildListTag(${JSON.stringify(entrada)})`, m._buildListTag(entrada), esperado);
  });
}

// ---------------------------------------------------------------------------
secao("Nome dos arquivos de saida");
{
  relogio.definir("2026-09-16T10:59:07");
  const m = criarManager();
  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" }]]),
    "QUI112 - 04set25-matriculas.csv"
  );
  verificar("etiqueta guardada", m.listaTag, "QUI112");
  verificar("carimbada na sessao", m.currentSession.listaTag, "QUI112");

  comEventos(m);
  const saidas = capturar(m);

  m.saveEventLog(m.currentSession.eventLog);
  verificar("log comeca pela etiqueta", saidas[0].nome.startsWith("QUI112_log_eventos_sessao_"), true);
  verificar("log termina em .csv", saidas[0].nome.endsWith(".csv"), true);
  verificar("log traz o id da sessao", saidas[0].nome.includes(m.currentSession.id), true);

  m.saveSummaryLog(true);
  verificar("resumo comeca pela etiqueta", saidas[1].nome.startsWith("QUI112_resumo_permanencia_sessao_"), true);
}

// ---------------------------------------------------------------------------
secao("Duas disciplinas na mesma instalacao");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  const saidas = capturar(m);

  // manha: QUI112
  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" }]]),
    "QUI112 - 04set25-matriculas.csv"
  );
  comEventos(m);
  m.saveEventLog(m.currentSession.eventLog);
  const daManha = saidas[0].nome;

  // tarde: outra disciplina, nova sessao e nova lista
  m.startNewSession(false);
  relogio.avancar(120);
  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "JOAO", sobrenome: "DA SILVA", nmerodeidentificao: "ES999999" }]]),
    "BIO231-turma A.xlsx"
  );
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO);
  m.saveEventLog(m.currentSession.eventLog);
  const daTarde = saidas[1].nome;

  verificar("arquivo da manha", daManha.startsWith("QUI112_"), true);
  verificar("arquivo da tarde", daTarde.startsWith("BIO231_"), true);
  verificar("nomes diferentes", daManha !== daTarde, true);
  verificar("ordenados por nome, agrupam por disciplina",
    [daTarde, daManha].sort()[0].startsWith("BIO231_"), true);
}

// ---------------------------------------------------------------------------
secao("Sessao arquivada leva a etiqueta dela, nao a atual");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  const saidas = capturar(m);

  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" }]]),
    "QUI112 - 04set25-matriculas.csv"
  );
  m.setMinStayTime(60);
  comEventos(m);
  const idArquivada = m.currentSession.id;

  m.endCurrentSession();
  m.startNewSession(false);

  // agora a instalacao esta na outra disciplina
  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "JOAO", sobrenome: "DA SILVA", nmerodeidentificao: "ES999999" }]]),
    "BIO231-turma A.xlsx"
  );
  verificar("sessao atual e BIO231", m.currentSession.listaTag, "BIO231");

  m.exportArchivedSessionLog(idArquivada);
  const nome = saidas[saidas.length - 1].nome;
  verificar("o log arquivado sai como QUI112", nome.startsWith("QUI112_"), true);
  verificar("com o id da sessao arquivada", nome.includes(idArquivada), true);

  const rodape = saidas[saidas.length - 1].conteudo.split("\n").pop();
  verificar("rodape traz o minimo daquela sessao, nao o atual", rodape.includes("Tempo mínimo: 60 min"), true);

  m.exportArchivedSessionSummary(idArquivada);
  const nomeResumo = saidas[saidas.length - 1].nome;
  verificar("o resumo arquivado tambem", nomeResumo.startsWith("QUI112_resumo_permanencia_sessao_arquivada_"), true);
}

// ---------------------------------------------------------------------------
secao("Sem lista carregada, nome sai como antes");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  const saidas = capturar(m);
  comEventos(m);

  m.saveEventLog(m.currentSession.eventLog);
  verificar("sem etiqueta na frente", saidas[0].nome.startsWith("log_eventos_sessao_"), true);
  verificar("sem underscore solto", saidas[0].nome.startsWith("_"), false);
}

// ---------------------------------------------------------------------------
secao("Etiqueta sobrevive ao localStorage");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(
    JSON.stringify([[{ nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" }]]),
    "QUI112 - 04set25-matriculas.csv"
  );

  verificar("guardada no localStorage", m.__store.get("studentData_listaTag"), "QUI112");

  const salvo = JSON.parse(m.__store.get(`studentData_session_${m.currentSession.id}`));
  verificar("e tambem na sessao", salvo.listaTag, "QUI112");
  verificar("volta na desserializacao", m._deserializeSession(salvo).listaTag, "QUI112");

  const antiga = m._deserializeSession({ id: "x", eventLog: [], activeStudents: [] });
  verificar("sessao antiga sem o campo fica vazia", antiga.listaTag, "");
}

resumo();
