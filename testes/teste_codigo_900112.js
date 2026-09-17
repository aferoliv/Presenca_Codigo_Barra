/**
 * Codigo 900112 - lido DEPOIS do cracha do aluno.
 * Descarta os registros anteriores daquele aluno e transforma a leitura
 * recem-feita na entrada dele.
 *
 *   node testes/teste_codigo_900112.js
 */
const { criarManager, relogio, resumoDe, verificar, secao, resumo } = require("./harness");

const ALUNO = "100001";
const OUTRO = "100002";

function managerComAlunos() {
  const m = criarManager();
  m.studentNames.set(ALUNO, "MARIA SILVA SANTOS");
  m.studentNames.set(OUTRO, "JOANA PEREIRA COSTA");
  return m;
}

// ---------------------------------------------------------------------------
secao("Cenario principal: saiu sem registrar e voltou");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00 entrada
  verificar("entrou as 08:00", m.currentSession.currentOccupancy, 1);

  // sai da sala sem registrar; volta as 08:40 e bipa
  relogio.avancar(40);
  const leituraErrada = m.registerEvent(ALUNO);
  verificar("a volta virou saida", leituraErrada.status, "Saída");
  verificar("creditaria o tempo fora da sala", Math.round(leituraErrada.permanencia), 40);
  verificar("e liberou a vaga", m.currentSession.currentOccupancy, 0);

  // operador ve o erro na tela e le o 900112
  const correcao = m.registerEvent("900112");
  verificar("900112: status", correcao.status, "Nova Entrada");
  verificar("900112: mostra o aluno", correcao.primeiroNome, "MARIA");
  verificar("900112: hora da nova entrada", correcao.horaEntrada, "08:40:00");

  verificar("sobrou um unico evento", m.currentSession.eventLog.length, 1);
  verificar("e ele e uma entrada", m.currentSession.eventLog[0].tipo, "entrada");
  verificar("na hora da releitura", m.currentSession.eventLog[0].hora, "08:40:00");
  verificar("permanencia zerada", m.currentSession.eventLog[0].permanencia, 0);
  verificar("observacao no CSV", m.currentSession.eventLog[0].observacao, "Entrada anterior anulada");
  verificar("sem entradaOriginal", "entradaOriginal" in m.currentSession.eventLog[0], false);

  verificar("aluno de volta a sala", m.currentSession.currentOccupancy, 1);
  verificar("consta como ativo", m.currentSession.activeStudents.has(ALUNO), true);
  verificar("nao consta como saido", m.currentSession.exitedStudents.has(ALUNO), false);

  // sai de verdade as 09:30
  relogio.avancar(50);
  const saida = m.registerEvent(ALUNO);
  verificar("permanencia conta do retorno", Math.round(saida.permanencia), 50);
  verificar("e nao os 90 min desde 08:00", Math.round(saida.permanencia) !== 90, true);
  verificar("vaga liberada", m.currentSession.currentOccupancy, 0);

  const resumoSessao = resumoDe(m);
  verificar("resumo: uma linha", resumoSessao.length, 1);
  verificar("resumo: 50 min", Math.round(resumoSessao[0].permanenciaTotal), 50);
}

// ---------------------------------------------------------------------------
secao("Nao mexe nos outros alunos");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00
  relogio.avancar(5);
  m.registerEvent(OUTRO); // 08:05
  verificar("dois na sala", m.currentSession.currentOccupancy, 2);

  relogio.avancar(35);
  m.registerEvent(ALUNO); // 08:40, saida indevida
  verificar("um saiu", m.currentSession.currentOccupancy, 1);

  m.registerEvent("900112");
  verificar("os dois na sala de novo", m.currentSession.currentOccupancy, 2);
  verificar("o outro continua ativo", m.currentSession.activeStudents.has(OUTRO), true);

  const doOutro = m.currentSession.eventLog.filter(e => e.matricula === OUTRO);
  verificar("evento do outro intacto", doOutro.length, 1);
  verificar("e continua sendo entrada", doOutro[0].tipo, "entrada");
  verificar("na hora original", doOutro[0].hora, "08:05:00");
}

// ---------------------------------------------------------------------------
secao("Aluno que ja tinha saido de verdade: recomeca a contagem");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00 entrada
  relogio.avancar(60);
  m.registerEvent(ALUNO); // 09:00 saida legitima, 60 min
  verificar("saiu", m.currentSession.currentOccupancy, 0);

  relogio.avancar(30);
  const rele = m.registerEvent(ALUNO); // 09:30, releitura
  verificar("releitura conta 90 min", Math.round(rele.permanencia), 90);

  m.registerEvent("900112");
  verificar("volta a ocupar vaga", m.currentSession.currentOccupancy, 1);
  verificar("um unico evento restou", m.currentSession.eventLog.length, 1);
  verificar("cronometro zerado", m.currentSession.eventLog[0].permanencia, 0);
  verificar("nova entrada as 09:30", m.currentSession.eventLog[0].hora, "09:30:00");

  relogio.avancar(45);
  const saida = m.registerEvent(ALUNO);
  verificar("conta a partir das 09:30", Math.round(saida.permanencia), 45);
}

// ---------------------------------------------------------------------------
secao("Uso sem registro anterior");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  const entrada = m.registerEvent(ALUNO); // primeira leitura do dia
  verificar("entrada normal", entrada.status, "Entrada");

  const correcao = m.registerEvent("900112");
  verificar("900112 aceita mesmo assim", correcao.status, "Nova Entrada");
  verificar("continua uma entrada so", m.currentSession.eventLog.length, 1);
  verificar("registra que foi usado a toa", m.currentSession.eventLog[0].observacao, "Entrada (sem registro anterior para anular)");
  verificar("ocupacao inalterada", m.currentSession.currentOccupancy, 1);
}

// ---------------------------------------------------------------------------
secao("Uso com a sessao vazia");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  const erro = m.registerEvent("900112");
  verificar("avisa que nao ha o que converter", erro.status, "Erro");
  verificar("mensagem", erro.primeiroNome, "ERRO");
  verificar("log continua vazio", m.currentSession.eventLog.length, 0);
  verificar("ocupacao continua zero", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("900112 duas vezes seguidas e inofensivo");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(40);
  m.registerEvent(ALUNO);
  m.registerEvent("900112");
  const segunda = m.registerEvent("900112");

  verificar("segue como nova entrada", segunda.status, "Nova Entrada");
  verificar("continua um evento so", m.currentSession.eventLog.length, 1);
  verificar("ocupacao nao dobra", m.currentSession.currentOccupancy, 1);
  verificar("observacao passa a dizer que nao havia o que anular", m.currentSession.eventLog[0].observacao, "Entrada (sem registro anterior para anular)");
}

// ---------------------------------------------------------------------------
secao("Matricula com digito verificador");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([[
    { nome: "PAULO", sobrenome: "RIBEIRO SOUZA", nmerodeidentificao: "1234-5" },
  ]]));

  m.registerEvent("12345"); // 08:00, lido com o verificador
  relogio.avancar(40);
  m.registerEvent("1234"); // 08:40, lido sem ele
  m.registerEvent("900112");

  verificar("um evento so", m.currentSession.eventLog.length, 1);
  verificar("matricula canonica", m.currentSession.eventLog[0].matricula, "1234");
  verificar("virou entrada", m.currentSession.eventLog[0].tipo, "entrada");
  verificar("na sala", m.currentSession.currentOccupancy, 1);
}

// ---------------------------------------------------------------------------
secao("Outros codigos especiais sem regressao");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  const naoEstudou = m.registerEvent("900150");
  verificar("900150 continua armando acao pendente", naoEstudou.status, "Código");
  m.registerEvent(ALUNO);
  verificar("observacao aplicada", m.currentSession.eventLog[0].observacao, "Não estudou");

  // 900260 tambem age sobre a leitura anterior (ver teste_codigo_900260.js)
  relogio.avancar(30);
  m.registerEvent(ALUNO); // saida com 30 min
  const ajuste = m.registerEvent("900260");
  verificar("900260 corrige a leitura anterior", ajuste.status, "Tempo Ajustado");
  verificar("para o minimo + 1", ajuste.permanencia, m.minStayTime + 1);

  const desfeito = m.registerEvent("900300");
  verificar("900300 continua desfazendo", desfeito.status, "Desfeito");
  verificar("aluno de volta a sala", m.currentSession.currentOccupancy, 1);
}

resumo();
