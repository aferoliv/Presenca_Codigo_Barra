/**
 * Trocar a lista de alunos no meio da sessao: os nomes ja registrados sao
 * realinhados com a lista carregada agora (modo "completo").
 *
 *   node testes/teste_troca_lista.js
 */
const { criarManager, relogio, resumoDe, verificar, secao, resumo } = require("./harness");

function lista(alunos) {
  return JSON.stringify([alunos]);
}

const LISTA_A = lista([
  { nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" },
]);

const LISTA_B = lista([
  { nome: "MARIA", sobrenome: "SILVA SANTOS JUNIOR", nmerodeidentificao: "ES100001" },
  { nome: "JOAO", sobrenome: "DA SILVA", nmerodeidentificao: "ES999999" },
]);

function nomesDoLog(m) {
  return m.currentSession.eventLog.map(e => e.nome);
}

// ---------------------------------------------------------------------------
secao("Aluno que bipou antes da lista ganha nome");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();

  m.registerEvent("999999"); // sem lista nenhuma carregada
  verificar("sem nome no momento do bipe", m.currentSession.eventLog[0].nome, null);
  verificar("na tela sai 'Sem nome'", m.getRealTimeTableData()[0].Nome, "Sem nome");

  m.loadStudentNamesFromJson(LISTA_B, "BIO231-turma.xlsx");
  verificar("o evento foi preenchido", m.currentSession.eventLog[0].nome, "JOAO DA SILVA");
  verificar("a tabela acompanha", m.getRealTimeTableData()[0].Nome, "JOAO DA SILVA");
  verificar("o aluno ativo tambem", m.currentSession.activeStudents.get("999999").nome, "JOAO DA SILVA");
}

// ---------------------------------------------------------------------------
secao("Lista corrigida no meio da sessao");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(LISTA_A, "QUI112 - lista.csv");

  m.registerEvent("100001");
  relogio.avancar(50);
  m.registerEvent("100001");
  verificar("nomes da lista A", nomesDoLog(m), ["MARIA SILVA SANTOS", "MARIA SILVA SANTOS"]);

  m.loadStudentNamesFromJson(LISTA_B, "QUI112 - lista corrigida.csv");
  verificar("entrada e saida realinhadas", nomesDoLog(m),
    ["MARIA SILVA SANTOS JUNIOR", "MARIA SILVA SANTOS JUNIOR"]);
  verificar("quem ja saiu tambem", m.currentSession.exitedStudents.get("100001").nome, "MARIA SILVA SANTOS JUNIOR");

  const linha = resumoDe(m)[0];
  verificar("o resumo sai com o nome novo", linha.nome, "MARIA SILVA SANTOS JUNIOR");
  verificar("e a permanencia nao muda", Math.round(linha.permanenciaTotal), 50);
}

// ---------------------------------------------------------------------------
secao("Servidor que bipou o digito verificador antes da lista");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();

  // sem lista, o apelido 12345 -> 1234 ainda nao existe
  m.registerEvent("12345");
  verificar("gravado como veio do leitor", m.currentSession.eventLog[0].matricula, "12345");
  verificar("sem nome", m.currentSession.eventLog[0].nome, null);
  verificar("na sala", m.currentSession.currentOccupancy, 1);

  m.loadStudentNamesFromJson(
    lista([{ nome: "PAULO", sobrenome: "RIBEIRO SOUZA", nmerodeidentificao: "1234-5" }]),
    "QUI112 - lista.csv"
  );

  verificar("matricula virou a canonica", m.currentSession.eventLog[0].matricula, "1234");
  verificar("e ganhou nome", m.currentSession.eventLog[0].nome, "PAULO RIBEIRO SOUZA");
  verificar("continua uma pessoa so na sala", m.currentSession.currentOccupancy, 1);
  verificar("ativo sob a canonica", m.currentSession.activeStudents.has("1234"), true);
  verificar("e nao sob a forma antiga", m.currentSession.activeStudents.has("12345"), false);

  // agora o bipe de saida encontra a mesma pessoa, em vez de abrir outra entrada
  relogio.avancar(50);
  const saida = m.registerEvent("1234");
  verificar("a proxima leitura e saida", saida.status, "Saída");
  verificar("com o tempo certo", Math.round(saida.permanencia), 50);
  verificar("e nao virou entrada nova", m.currentSession.eventLog.length, 2);
  verificar("sala vazia", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("A lista nova se soma a anterior");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(LISTA_A, "QUI112 - lista.csv");
  verificar("lista A", m.studentNames.size, 1);

  m.loadStudentNamesFromJson(
    lista([{ nome: "JOAO", sobrenome: "DA SILVA", nmerodeidentificao: "ES999999" }]),
    "BIO231-turma.xlsx"
  );
  verificar("os dois sao conhecidos", m.studentNames.size, 2);
  verificar("aluno da lista antiga continua", m.getStudentName("100001"), "MARIA SILVA SANTOS");
  verificar("etiqueta trocou para a nova", m.listaTag, "BIO231");
}

// ---------------------------------------------------------------------------
secao("Aluno fora de qualquer lista");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(LISTA_A, "QUI112 - lista.csv");

  m.registerEvent("123123"); // nao esta em lista nenhuma
  relogio.avancar(50);
  m.registerEvent("123123");

  verificar("nome continua nulo por dentro", m.currentSession.eventLog[0].nome, null);
  verificar("tela mostra 'Sem nome'", m.getRealTimeTableData()[0].Nome, "Sem nome");
  verificar("resumo mostra 'Sem nome'", resumoDe(m)[0].nome, "Sem nome");

  let csv = null;
  m._downloadFile = (conteudo) => { csv = conteudo; };
  m.saveEventLog(m.currentSession.eventLog);
  verificar("CSV nao escreve null", csv.includes('"null"'), false);
  verificar("CSV escreve 'Sem nome'", csv.includes('"Sem nome"'), true);

  // recarregar lista sem esse aluno nao apaga nome de quem tem
  m.registerEvent("100001");
  m.loadStudentNamesFromJson(LISTA_A, "QUI112 - lista.csv");
  verificar("quem tem nome mantem", m.currentSession.eventLog[2].nome, "MARIA SILVA SANTOS");
  verificar("quem nao tem continua sem", m.currentSession.eventLog[0].nome, null);
}

// ---------------------------------------------------------------------------
secao("Historico arquivado nao e reescrito");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(LISTA_A, "QUI112 - lista.csv");

  m.registerEvent("100001");
  relogio.avancar(50);
  m.registerEvent("100001");
  m.endCurrentSession();
  m.startNewSession(false);

  m.loadStudentNamesFromJson(LISTA_B, "QUI112 - lista corrigida.csv");
  verificar("a sessao arquivada guarda o nome da epoca",
    m.archivedSessions[0].eventLog[0].nome, "MARIA SILVA SANTOS");
  verificar("e a sessao atual esta vazia", m.currentSession.eventLog.length, 0);
}

resumo();
