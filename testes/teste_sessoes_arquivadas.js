/**
 * Sessoes arquivadas: descarte das vazias, listagem, exclusao e gravacao barata.
 *
 *   node testes/teste_sessoes_arquivadas.js
 */
const { criarManager, relogio, verificar, secao, resumo } = require("./harness");

const ALUNO = "100001";
const OUTRO = "100002";

function comAluno(m) {
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  m.studentNames.set(OUTRO, "JOANA PEREIRA COSTA");
  return m;
}

/** Uma aula: entra, fica 50 min, sai. */
function darAula(m, matricula = ALUNO) {
  m.registerEvent(matricula);
  relogio.avancar(50);
  m.registerEvent(matricula);
}

function chavesDeSessao(m) {
  return Array.from(m.__store.keys()).filter(k => k.startsWith("studentData_session_"));
}

// ---------------------------------------------------------------------------
secao("Sessao vazia nao vira arquivo");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());
  const idVazia = m.currentSession.id;

  verificar("sessao criada no localStorage", chavesDeSessao(m).length, 1);

  m.endCurrentSession();
  verificar("nada foi arquivado", m.archivedSessions.length, 0);
  verificar("a chave foi removida", chavesDeSessao(m).length, 0);
  verificar("meta sem arquivadas", JSON.parse(m.__store.get("studentData_meta")).archivedSessionIds, []);

  m.startNewSession(false);
  verificar("id novo e diferente", m.currentSession.id !== idVazia, true);
}

// ---------------------------------------------------------------------------
secao("Sessao com eventos e arquivada");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());
  const id = m.currentSession.id;
  darAula(m);

  m.endCurrentSession();
  verificar("arquivada", m.archivedSessions.length, 1);
  verificar("id preservado", m.archivedSessions[0].id, id);
  verificar("chave mantida no localStorage", chavesDeSessao(m).length, 1);

  const salva = JSON.parse(m.__store.get(`studentData_session_${id}`));
  verificar("gravada com endTime", typeof salva.endTime, "string");
  verificar("gravada com o resumo", Array.isArray(salva.summary), true);
  verificar("resumo com o aluno", salva.summary[0].matricula, ALUNO);
}

// ---------------------------------------------------------------------------
secao("Alternar sessoes vazias nao acumula lixo");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());

  // o que acontecia nos testes: abrir e fechar sessao varias vezes
  for (let i = 0; i < 5; i++) {
    m.endCurrentSession();
    m.startNewSession(false);
    relogio.avancar(1);
  }

  verificar("nenhuma arquivada", m.archivedSessions.length, 0);
  verificar("so a sessao atual no localStorage", chavesDeSessao(m).length, 1);
  verificar("e e a atual", chavesDeSessao(m)[0], `studentData_session_${m.currentSession.id}`);
}

// ---------------------------------------------------------------------------
secao("Listagem para a tela");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());
  m.setStudentListName("QUI112 - matriculas.csv");
  m.setMinStayTime(60);

  m.registerEvent(ALUNO);
  m.registerEvent(OUTRO);
  relogio.avancar(70);
  m.registerEvent(ALUNO);
  m.registerEvent(OUTRO);
  m.endCurrentSession();

  // segunda aula, outra disciplina, mais tarde
  m.startNewSession(false);
  relogio.avancar(120);
  m.setStudentListName("BIO231-turma A.xlsx");
  darAula(m);
  m.endCurrentSession();

  const lista = m.getArchivedSessionsList();
  verificar("duas sessoes", lista.length, 2);
  verificar("mais recente primeiro", lista[0].listaTag, "BIO231");
  verificar("a outra depois", lista[1].listaTag, "QUI112");

  const qui = lista[1];
  verificar("alunos distintos", qui.alunos, 2);
  verificar("eventos", qui.eventos, 4);
  verificar("tempo minimo daquela sessao", qui.minStayTime, 60);
  verificar("duracao em minutos", qui.duracao, "70 min");
  verificar("tem data", typeof qui.data, "string");
  verificar("tem hora de inicio", typeof qui.inicio, "string");

  verificar("a sessao nova voltou ao minimo padrao", m.minStayTime, 45);
}

// ---------------------------------------------------------------------------
secao("Apagar sessao arquivada");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());
  darAula(m);
  const primeira = m.currentSession.id;
  m.endCurrentSession();

  m.startNewSession(false);
  relogio.avancar(120);
  darAula(m);
  const segunda = m.currentSession.id;
  m.endCurrentSession();
  m.startNewSession(false);

  verificar("duas arquivadas", m.archivedSessions.length, 2);
  verificar("tres chaves (duas + a atual)", chavesDeSessao(m).length, 3);

  verificar("apagar a primeira", m.deleteArchivedSession(primeira), true);
  verificar("sobrou uma arquivada", m.archivedSessions.length, 1);
  verificar("e e a segunda", m.archivedSessions[0].id, segunda);
  verificar("chave removida", m.__store.has(`studentData_session_${primeira}`), false);
  verificar("a outra continua", m.__store.has(`studentData_session_${segunda}`), true);
  verificar("meta atualizada", JSON.parse(m.__store.get("studentData_meta")).archivedSessionIds, [segunda]);

  verificar("apagar id inexistente", m.deleteArchivedSession("session_nao_existe"), false);
  verificar("nada mudou", m.archivedSessions.length, 1);
  verificar("a sessao atual nao pode ser apagada assim", m.deleteArchivedSession(m.currentSession.id), false);
  verificar("e continua no localStorage", m.__store.has(`studentData_session_${m.currentSession.id}`), true);
}

// ---------------------------------------------------------------------------
secao("Gravacao por bipe nao regrava o historico");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());

  // tres aulas arquivadas
  for (let i = 0; i < 3; i++) {
    darAula(m);
    m.endCurrentSession();
    m.startNewSession(false);
    relogio.avancar(60);
  }
  verificar("tres arquivadas", m.archivedSessions.length, 3);

  // conta as escritas de um unico bipe
  const original = m.__store.set.bind(m.__store);
  const escritas = [];
  m.__store.set = (k, v) => { escritas.push(k); return original(k, v); };

  m.registerEvent(ALUNO);

  m.__store.set = original;

  verificar("um bipe escreve uma chave so", escritas.length, 1);
  verificar("e e a da sessao atual", escritas[0], `studentData_session_${m.currentSession.id}`);
  verificar("nao regravou a lista de alunos", escritas.includes("studentData_studentNames"), false);
  verificar("nao regravou o historico", escritas.some(k => k.includes(m.archivedSessions[0].id)), false);
}

// ---------------------------------------------------------------------------
secao("Arquivadas continuam legiveis apos recarregar");
{
  relogio.definir("2026-09-16T08:00:00");
  const m = comAluno(criarManager());
  m.setStudentListName("QUI112 - matriculas.csv");
  darAula(m);
  const id = m.currentSession.id;
  m.endCurrentSession();
  m.startNewSession(false);

  // simula o F5: le de volta o que ficou gravado
  const salva = m._deserializeSession(JSON.parse(m.__store.get(`studentData_session_${id}`)));
  verificar("eventos preservados", salva.eventLog.length, 2);
  verificar("etiqueta preservada", salva.listaTag, "QUI112");
  verificar("tempo minimo preservado", salva.minStayTime, 45);

  // e ainda exporta com o nome certo
  let nome = null;
  m._downloadFile = (conteudo, arquivo) => { nome = arquivo; };
  m.exportArchivedSessionLog(id);
  verificar("export usa a etiqueta da sessao", nome.startsWith("QUI112_log_eventos_sessao_"), true);
  verificar("e o id dela", nome.includes(id), true);
}

resumo();
