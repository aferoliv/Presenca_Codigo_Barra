/**
 * Codigo 900250 - ajusta o tempo minimo de permanencia DA SESSAO.
 *
 * A caixa de dialogo vive na camada de tela (App._promptNovoTempoMinimo), que
 * nao roda aqui. O que se testa e o contrato do StudentDataManager: a validacao,
 * o escopo por sessao e o efeito sobre o 900260.
 *
 *   node testes/teste_codigo_900250.js
 */
const { criarManager, relogio, verificar, secao, resumo } = require("./harness");

const ALUNO = "100001";

function managerComAluno() {
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  return m;
}

// ---------------------------------------------------------------------------
secao("O codigo pede o ajuste a camada de tela");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();

  const pedido = m.registerEvent("900250");
  verificar("status pede a caixa de dialogo", pedido.status, "Ajustar Mínimo");
  verificar("rotulo na tela", pedido.primeiroNome, "TEMPO MÍNIMO");
  verificar("nao entra no log", m.currentSession.eventLog.length, 0);
  verificar("nao arma acao pendente", m.pendingAction, null);
  verificar("nao muda nada sozinho", m.minStayTime, 45);
}

// ---------------------------------------------------------------------------
secao("Valores aceitos e recusados");
{
  const m = managerComAluno();
  verificar("padrao", m.minStayTime, 45);

  verificar("aceita 60", m.setMinStayTime(60), true);
  verificar("valor novo", m.minStayTime, 60);

  verificar("aceita string '30'", m.setMinStayTime("30"), true);
  verificar("valor novo", m.minStayTime, 30);

  verificar("aceita 1 (limite inferior)", m.setMinStayTime(1), true);
  verificar("aceita 600 (limite superior)", m.setMinStayTime(600), true);

  const antes = m.minStayTime;
  verificar("recusa 0", m.setMinStayTime(0), false);
  verificar("recusa negativo", m.setMinStayTime(-10), false);
  verificar("recusa 601", m.setMinStayTime(601), false);
  verificar("recusa fracionario", m.setMinStayTime(45.5), false);
  verificar("recusa texto", m.setMinStayTime("quarenta"), false);
  verificar("recusa vazio", m.setMinStayTime(""), false);
  verificar("recusa null", m.setMinStayTime(null), false);
  verificar("nada disso alterou o valor", m.minStayTime, antes);
}

// ---------------------------------------------------------------------------
secao("Vale por sessao");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();

  m.setMinStayTime(60);
  verificar("sessao atual com 60", m.minStayTime, 60);
  verificar("guardado na sessao", m.currentSession.minStayTime, 60);

  m.startNewSession(false);
  verificar("sessao nova volta ao padrao", m.minStayTime, 45);
  verificar("padrao exposto", m.defaultMinStayTime, 45);
}

// ---------------------------------------------------------------------------
secao("Sobrevive ao localStorage");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();
  m.setMinStayTime(90);

  const salvo = JSON.parse(m.__store.get(`studentData_session_${m.currentSession.id}`));
  verificar("serializado na sessao", salvo.minStayTime, 90);

  const recarregado = m._deserializeSession(salvo);
  verificar("volta na desserializacao", recarregado.minStayTime, 90);

  const antigo = m._deserializeSession({ id: "x", eventLog: [], activeStudents: [] });
  verificar("sessao antiga sem o campo cai no padrao", antigo.minStayTime, 45);
}

// ---------------------------------------------------------------------------
secao("Efeito sobre a cor do display");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();
  m.setMinStayTime(60);

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  const saida = m.registerEvent(ALUNO);
  verificar("50 min agora esta abaixo do minimo", saida.permanencia < m.minStayTime, true);
  verificar("permanencia registrada e a real", Math.round(saida.permanencia), 50);
  verificar("a saida libera a vaga do mesmo jeito", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("Efeito sobre o 900260");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();
  m.setMinStayTime(60);

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO); // 50 min, abaixo do novo minimo de 60

  const ajuste = m.registerEvent("900260");
  verificar("900260 ajusta para o novo minimo + 1", ajuste.permanencia, 61);
  verificar("log acompanha", m.currentSession.eventLog[1].permanencia, 61);
  verificar("observacao cita o novo alvo", m.currentSession.eventLog[1].observacao,
    "Tempo ajustado para 61 min (saída lida às 08:50:00)");
  verificar("hora empurrada para entrada + 61", m.currentSession.eventLog[1].hora, "09:01:00");
}

// ---------------------------------------------------------------------------
secao("Registros ja feitos nao sao recalculados");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO); // 50 min, valido com o minimo de 45

  m.setMinStayTime(60);
  verificar("o evento antigo continua com 50", m.currentSession.eventLog[1].permanencia, 50);
  verificar("e com a hora original", m.currentSession.eventLog[1].hora, "08:50:00");
}

// ---------------------------------------------------------------------------
secao("O minimo sai no rodape do CSV");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAluno();
  m.setMinStayTime(60);

  m.registerEvent(ALUNO);
  relogio.avancar(70);
  m.registerEvent(ALUNO);

  let capturado = null;
  m._downloadFile = (conteudo) => { capturado = conteudo; };

  m.saveEventLog(m.currentSession.eventLog);
  const rodape = capturado.split("\n").pop();
  verificar("rodape do log traz o minimo", rodape.includes("Tempo mínimo: 60 min"), true);

  m.saveSummaryLog(true);
  const rodapeResumo = capturado.split("\n").pop();
  verificar("rodape do resumo traz o minimo", rodapeResumo.includes("Tempo mínimo: 60 min"), true);
}

resumo();
