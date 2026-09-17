/**
 * Apagar as listas de alunos (todas de uma vez, porque elas se somam).
 *
 *   node testes/teste_limpar_lista.js
 */
const { criarManager, relogio, resumoDe, verificar, secao, resumo } = require("./harness");

function lista(alunos) {
  return JSON.stringify([alunos]);
}

const QUI112 = lista([
  { nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" },
  { nome: "PAULO", sobrenome: "RIBEIRO SOUZA", nmerodeidentificao: "1234-5" },
]);

const QUI318 = lista([
  { nome: "JOAO", sobrenome: "DA SILVA", nmerodeidentificao: "ES999999" },
]);

// ---------------------------------------------------------------------------
secao("Informacao mostrada antes de apagar");
{
  const m = criarManager();
  verificar("sem lista: zero", m.getStudentListInfo().total, 0);
  verificar("sem lista: sem etiqueta", m.getStudentListInfo().listaTag, "");

  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  m.loadStudentNamesFromJson(QUI318, "QUI318 - lista.csv");

  const info = m.getStudentListInfo();
  verificar("as duas listas somadas", info.total, 3);
  verificar("apelidos do digito verificador", info.apelidos, 1);
  verificar("etiqueta e a da ultima carregada", info.listaTag, "QUI318");
}

// ---------------------------------------------------------------------------
secao("Apagar limpa tudo");
{
  const m = criarManager();
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  m.loadStudentNamesFromJson(QUI318, "QUI318 - lista.csv");

  verificar("antes: reconhece a QUI112", m.getStudentName("100001"), "MARIA SILVA SANTOS");
  verificar("antes: reconhece a QUI318", m.getStudentName("999999"), "JOAO DA SILVA");
  verificar("antes: apelido funciona", m.getStudentName("12345"), "PAULO RIBEIRO SOUZA");

  verificar("devolve quantos foram removidos", m.clearStudentNames(), 3);

  verificar("depois: nao reconhece ninguem", m.getStudentName("100001"), null);
  verificar("depois: nem pelo apelido", m.getStudentName("12345"), null);
  verificar("mapa vazio", m.studentNames.size, 0);
  verificar("apelidos vazios", m.matriculaAliases.size, 0);
  verificar("etiqueta limpa", m.listaTag, "");
}

// ---------------------------------------------------------------------------
secao("Some do localStorage");
{
  const m = criarManager();
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  verificar("gravado antes", JSON.parse(m.__store.get("studentData_studentNames")).length, 2);

  m.clearStudentNames();
  verificar("gravado vazio depois", JSON.parse(m.__store.get("studentData_studentNames")), []);
  verificar("apelidos vazios", JSON.parse(m.__store.get("studentData_matriculaAliases")), []);
  verificar("etiqueta vazia", m.__store.get("studentData_listaTag"), "");
}

// ---------------------------------------------------------------------------
secao("Nao destroi o que ja foi registrado");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");

  m.registerEvent("100001");
  relogio.avancar(50);
  m.registerEvent("100001");

  const idSessao = m.currentSession.id;
  m.clearStudentNames();

  verificar("nomes do log preservados", m.currentSession.eventLog.map(e => e.nome),
    ["MARIA SILVA SANTOS", "MARIA SILVA SANTOS"]);
  verificar("tabela preservada", m.getRealTimeTableData()[0].Nome, "MARIA SILVA SANTOS");
  verificar("resumo preservado", resumoDe(m)[0].nome, "MARIA SILVA SANTOS");
  verificar("etiqueta da sessao preservada", m.currentSession.listaTag, "QUI112");

  // e o arquivo dela continua saindo com o nome da disciplina certa
  let nome = null;
  m._downloadFile = (conteudo, arquivo) => { nome = arquivo; };
  m.saveEventLog(m.currentSession.eventLog);
  verificar("arquivo ainda sai como QUI112", nome.startsWith("QUI112_log_eventos_sessao_"), true);
  verificar("e da sessao certa", nome.includes(idSessao), true);
}

// ---------------------------------------------------------------------------
secao("Historico arquivado tambem fica intacto");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  m.registerEvent("100001");
  relogio.avancar(50);
  m.registerEvent("100001");
  const id = m.currentSession.id;
  m.endCurrentSession();
  m.startNewSession(false);

  m.clearStudentNames();

  verificar("sessao arquivada continua la", m.archivedSessions.length, 1);
  verificar("com os nomes", m.archivedSessions[0].eventLog[0].nome, "MARIA SILVA SANTOS");
  verificar("e a etiqueta", m.archivedSessions[0].listaTag, "QUI112");

  let nome = null;
  m._downloadFile = (conteudo, arquivo) => { nome = arquivo; };
  m.exportArchivedSessionLog(id);
  verificar("exporta com a etiqueta da epoca", nome.startsWith("QUI112_"), true);
}

// ---------------------------------------------------------------------------
secao("Bipar depois de apagar");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  m.clearStudentNames();

  const entrada = m.registerEvent("100001");
  verificar("ainda registra o evento", entrada.status, "Entrada");
  verificar("mas sem nome", m.currentSession.eventLog[0].nome, null);
  verificar("tela mostra 'Sem nome'", entrada.primeiroNome, "Sem nome");
  verificar("tabela tambem", m.getRealTimeTableData()[0].Nome, "Sem nome");

  // recarregar a lista realinha (item 11)
  m.loadStudentNamesFromJson(QUI112, "QUI112 - lista.csv");
  verificar("nome recuperado ao recarregar", m.currentSession.eventLog[0].nome, "MARIA SILVA SANTOS");
}

// ---------------------------------------------------------------------------
secao("Apagar com a lista ja vazia");
{
  const m = criarManager();
  verificar("nada a remover", m.clearStudentNames(), 0);
  verificar("continua vazio", m.studentNames.size, 0);
}

resumo();
