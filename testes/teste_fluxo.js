/**
 * Ciclo de leituras:
 *   1a leitura ............ Entrada, ocupacao +1
 *   2a leitura ............ Saida,   ocupacao -1, permanencia = 2a - entrada
 *   3a leitura em diante .. Saida,   ocupacao inalterada, permanencia = ultima - entrada
 *
 *   node testes/teste_fluxo.js
 */
const { criarManager, relogio, resumoDe, verificar, secao, resumo } = require("./harness");

const ALUNO = "100001";
const OUTRO = "100002";

// ---------------------------------------------------------------------------
secao("Ciclo entrada -> saida -> releituras");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");

  const entrada = m.registerEvent(ALUNO);
  verificar("1a leitura: status", entrada.status, "Entrada");
  verificar("1a leitura: permanencia", entrada.permanencia, 0);
  verificar("1a leitura: ocupacao", m.currentSession.currentOccupancy, 1);
  verificar("1a leitura: nome resolvido", entrada.primeiroNome, "MARIA");

  relogio.avancar(50);
  const saida = m.registerEvent(ALUNO);
  verificar("2a leitura: status", saida.status, "Saída");
  verificar("2a leitura: permanencia", Math.round(saida.permanencia), 50);
  verificar("2a leitura: libera a vaga", m.currentSession.currentOccupancy, 0);
  verificar("2a leitura: hora de entrada preservada", saida.horaEntrada, "08:00:00");

  relogio.avancar(20);
  const rele1 = m.registerEvent(ALUNO);
  verificar("3a leitura: status continua Saida", rele1.status, "Saída");
  verificar("3a leitura: permanencia contada da entrada original", Math.round(rele1.permanencia), 70);
  verificar("3a leitura: ocupacao inalterada", m.currentSession.currentOccupancy, 0);

  relogio.avancar(15);
  const rele2 = m.registerEvent(ALUNO);
  verificar("4a leitura: status continua Saida", rele2.status, "Saída");
  verificar("4a leitura: permanencia", Math.round(rele2.permanencia), 85);
  verificar("4a leitura: ocupacao inalterada", m.currentSession.currentOccupancy, 0);

  const tipos = m.currentSession.eventLog.map((e) => e.tipo);
  verificar("log da sessao", tipos, ["entrada", "saida", "saida", "saida"]);

  const obs = m.currentSession.eventLog.map((e) => e.observacao);
  verificar("observacao das releituras", obs, ["", "", "Saída revisada", "Saída revisada"]);

  const resumoSessao = resumoDe(m);
  verificar("resumo: uma linha por aluno", resumoSessao.length, 1);
  verificar("resumo: matricula", resumoSessao[0].matricula, ALUNO);
  verificar("resumo: ultima saida - primeira entrada", Math.round(resumoSessao[0].permanenciaTotal), 85);
}

// ---------------------------------------------------------------------------
secao("Permanencia curta tambem libera a vaga");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");

  m.registerEvent(ALUNO);
  verificar("entrou", m.currentSession.currentOccupancy, 1);

  relogio.avancar(10);
  const saida = m.registerEvent(ALUNO);
  verificar("saida com 10 min: status", saida.status, "Saída");
  verificar("saida com 10 min: permanencia", Math.round(saida.permanencia), 10);
  verificar("saida com 10 min: vaga liberada", m.currentSession.currentOccupancy, 0);
  verificar("abaixo do minimo (cor vermelha na tela)", saida.permanencia < m.minStayTime, true);

  relogio.avancar(60);
  const rele = m.registerEvent(ALUNO);
  verificar("releitura depois da saida curta", Math.round(rele.permanencia), 70);
  verificar("ocupacao nao fica negativa", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("Dois alunos na sala ao mesmo tempo");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  m.studentNames.set(OUTRO, "JOANA PEREIRA COSTA");

  m.registerEvent(ALUNO);
  relogio.avancar(5);
  m.registerEvent(OUTRO);
  verificar("dois na sala", m.currentSession.currentOccupancy, 2);

  relogio.avancar(50);
  m.registerEvent(ALUNO);
  verificar("um sai, outro fica", m.currentSession.currentOccupancy, 1);

  relogio.avancar(10);
  m.registerEvent(ALUNO); // releitura do que ja saiu
  verificar("releitura nao mexe em quem ficou", m.currentSession.currentOccupancy, 1);
  verificar("o outro continua ativo", m.currentSession.activeStudents.has(OUTRO), true);

  relogio.avancar(5);
  m.registerEvent(OUTRO);
  verificar("sala vazia", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("Desfazer (900300) e remover matricula");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO);
  verificar("antes de desfazer: fora da sala", m.currentSession.currentOccupancy, 0);

  const desfeito = m.registerEvent("900300");
  verificar("desfazer: status", desfeito.status, "Desfeito");
  verificar("desfazer a saida devolve o aluno a sala", m.currentSession.currentOccupancy, 1);
  verificar("estado reconstruido: ativo", m.currentSession.activeStudents.has(ALUNO), true);
  verificar("estado reconstruido: nao consta como saido", m.currentSession.exitedStudents.has(ALUNO), false);

  relogio.avancar(10);
  const novaSaida = m.registerEvent(ALUNO);
  verificar("proxima leitura conta como 1a saida de novo", Math.round(novaSaida.permanencia), 60);
  verificar("e libera a vaga", m.currentSession.currentOccupancy, 0);

  verificar("remover matricula existente", m.removeEventByMatricula(ALUNO), true);
  verificar("log vazio apos remocao", m.currentSession.eventLog.length, 0);
  verificar("estado zerado", m.currentSession.currentOccupancy, 0);
  verificar("exitedStudents limpo", m.currentSession.exitedStudents.size, 0);
  verificar("remover matricula inexistente", m.removeEventByMatricula("999999"), false);
}

// ---------------------------------------------------------------------------
secao("Persistencia no localStorage");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO);

  const bruto = m.__store.get(`studentData_session_${m.currentSession.id}`);
  const salvo = JSON.parse(bruto);
  verificar("exitedStudents e serializado", Array.isArray(salvo.exitedStudents), true);
  verificar("exitedStudents tem o aluno", salvo.exitedStudents[0][0], ALUNO);

  const recarregado = m._deserializeSession(salvo);
  verificar("exitedStudents volta como Map", recarregado.exitedStudents instanceof Map, true);
  verificar("ocupacao preservada", recarregado.currentOccupancy, 0);
}

resumo();
