/**
 * Codigo 900260 - lido DEPOIS do cracha do aluno.
 * Sobe a permanencia da ultima leitura para o tempo minimo + 1, e SO para quem
 * ficou abaixo do tempo minimo. O ajuste e feito no timestamp da saida, para o
 * log, a tela e o resumo contarem a mesma coisa.
 *
 *   node testes/teste_codigo_900260.js
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
secao("Cenario principal: 30 min viram 46");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00 entrada
  relogio.avancar(30);
  const saida = m.registerEvent(ALUNO); // 08:30 saida, 30 min
  verificar("saida abaixo do minimo", Math.round(saida.permanencia), 30);

  const ajuste = m.registerEvent("900260");
  verificar("900260: status", ajuste.status, "Tempo Ajustado");
  verificar("900260: permanencia devolvida", ajuste.permanencia, 46);
  verificar("900260: mostra o aluno", ajuste.primeiroNome, "MARIA");

  const ev = m.currentSession.eventLog[1];
  verificar("log: permanencia", ev.permanencia, 46);
  verificar("log: hora da saida empurrada para entrada + 46", ev.hora, "08:46:00");
  verificar("log: continua sendo saida", ev.tipo, "saida");
  verificar("log: observacao registra o ajuste", ev.observacao, "Tempo ajustado para 46 min (saída lida às 08:30:00)");
  verificar("log: entradaOriginal preservada", ev.entradaOriginal, "08:00:00");
  verificar("nao criou evento novo", m.currentSession.eventLog.length, 2);
  verificar("ocupacao nao muda", m.currentSession.currentOccupancy, 0);
}

// ---------------------------------------------------------------------------
secao("O resumo agora enxerga o ajuste");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(30);
  m.registerEvent(ALUNO);

  const antes = resumoDe(m)[0];
  verificar("antes do 900260 o resumo diz 30", Math.round(antes.permanenciaTotal), 30);

  m.registerEvent("900260");

  const depois = resumoDe(m)[0];
  verificar("depois do 900260 o resumo diz 46", depois.permanenciaTotal, 46);
  verificar("resumo: ultima saida ajustada", depois.ultimaSaida, new Date(m.currentSession.eventLog[1].timestamp).toLocaleTimeString());
  verificar("log e resumo concordam", m.currentSession.eventLog[1].permanencia, depois.permanenciaTotal);
}

// ---------------------------------------------------------------------------
secao("Acima do minimo: preserva");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(50);
  m.registerEvent(ALUNO); // 50 min

  const ajuste = m.registerEvent("900260");
  verificar("900260: avisa que nao ajustou", ajuste.status, "Aviso");
  verificar("900260: devolve a permanencia real", Math.round(ajuste.permanencia), 50);

  const ev = m.currentSession.eventLog[1];
  verificar("log intacto: permanencia", ev.permanencia, 50);
  verificar("log intacto: hora", ev.hora, "08:50:00");
  verificar("log intacto: sem observacao", ev.observacao, "");
  verificar("resumo continua 50", Math.round(resumoDe(m)[0].permanenciaTotal), 50);
}

// ---------------------------------------------------------------------------
secao("Fronteira dos 45 min");
{
  // exatamente 45: nao esta ABAIXO do minimo, entao preserva
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();
  m.registerEvent(ALUNO);
  relogio.avancar(45);
  m.registerEvent(ALUNO);
  const exato = m.registerEvent("900260");
  verificar("45 min exatos: preserva", exato.status, "Aviso");
  verificar("45 min exatos: permanencia", Math.round(exato.permanencia), 45);

  // 44 min: abaixo do minimo, ajusta
  relogio.definir("2026-04-12T10:00:00");
  const m2 = managerComAlunos();
  m2.registerEvent(ALUNO);
  relogio.avancar(44);
  m2.registerEvent(ALUNO);
  const abaixo = m2.registerEvent("900260");
  verificar("44 min: ajusta", abaixo.status, "Tempo Ajustado");
  verificar("44 min: vira 46", abaixo.permanencia, 46);
}

// ---------------------------------------------------------------------------
secao("Preserva observacao que ja existia");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(30);
  m.registerEvent("900150"); // marca "Não estudou" na proxima leitura
  m.registerEvent(ALUNO);
  verificar("observacao original", m.currentSession.eventLog[1].observacao, "Não estudou");

  m.registerEvent("900260");
  verificar("observacoes concatenadas", m.currentSession.eventLog[1].observacao,
    "Não estudou; Tempo ajustado para 46 min (saída lida às 08:30:00)");
}

// ---------------------------------------------------------------------------
secao("Sobre uma saida revisada (3a leitura)");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00 entrada
  relogio.avancar(10);
  m.registerEvent(ALUNO); // 08:10 saida, 10 min
  relogio.avancar(10);
  const rele = m.registerEvent(ALUNO); // 08:20 saida revisada, 20 min
  verificar("saida revisada", Math.round(rele.permanencia), 20);

  const ajuste = m.registerEvent("900260");
  verificar("ajusta a revisada", ajuste.status, "Tempo Ajustado");
  verificar("para 46", ajuste.permanencia, 46);
  verificar("observacao concatenada a 'Saída revisada'", m.currentSession.eventLog[2].observacao,
    "Saída revisada; Tempo ajustado para 46 min (saída lida às 08:20:00)");
  verificar("resumo usa a ultima saida", resumoDe(m)[0].permanenciaTotal, 46);
}

// ---------------------------------------------------------------------------
secao("Usos invalidos");
{
  relogio.definir("2026-04-12T08:00:00");
  const vazio = managerComAlunos();
  const semLog = vazio.registerEvent("900260");
  verificar("sessao vazia: erro", semLog.status, "Erro");
  verificar("sessao vazia: nada no log", vazio.currentSession.eventLog.length, 0);

  const m = managerComAlunos();
  m.registerEvent(ALUNO); // entrada
  const sobreEntrada = m.registerEvent("900260");
  verificar("ultima leitura e entrada: erro", sobreEntrada.status, "Erro");
  verificar("entrada intacta: permanencia", m.currentSession.eventLog[0].permanencia, 0);
  verificar("entrada intacta: hora", m.currentSession.eventLog[0].hora, "08:00:00");
  verificar("entrada intacta: sem observacao", m.currentSession.eventLog[0].observacao, "");
  verificar("aluno continua na sala", m.currentSession.currentOccupancy, 1);
}

// ---------------------------------------------------------------------------
secao("Nao mexe nos outros alunos");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO); // 08:00
  m.registerEvent(OUTRO); // 08:00
  relogio.avancar(30);
  m.registerEvent(ALUNO); // saida de 30 min
  m.registerEvent("900260");

  const doOutro = m.currentSession.eventLog.filter(e => e.matricula === OUTRO);
  verificar("o outro tem um evento so", doOutro.length, 1);
  verificar("e continua entrada", doOutro[0].tipo, "entrada");
  verificar("na hora original", doOutro[0].hora, "08:00:00");
  verificar("o outro continua na sala", m.currentSession.currentOccupancy, 1);

  const linhas = resumoDe(m);
  const linhaOutro = linhas.find(l => l.matricula === OUTRO);
  const linhaAluno = linhas.find(l => l.matricula === ALUNO);
  verificar("resumo do ajustado", linhaAluno.permanenciaTotal, 46);
  verificar("resumo do outro conta ate o fim da sessao", Math.round(linhaOutro.permanenciaTotal), 30);
}

// ---------------------------------------------------------------------------
secao("900260 duas vezes seguidas");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(30);
  m.registerEvent(ALUNO);
  m.registerEvent("900260");
  const segunda = m.registerEvent("900260");

  verificar("a segunda nao ajusta de novo", segunda.status, "Aviso");
  verificar("permanencia continua 46", m.currentSession.eventLog[1].permanencia, 46);
  verificar("observacao nao duplica", m.currentSession.eventLog[1].observacao,
    "Tempo ajustado para 46 min (saída lida às 08:30:00)");
}

// ---------------------------------------------------------------------------
secao("Desfazer depois do ajuste");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = managerComAlunos();

  m.registerEvent(ALUNO);
  relogio.avancar(30);
  m.registerEvent(ALUNO);
  m.registerEvent("900260");

  const desfeito = m.registerEvent("900300");
  verificar("900300 remove a saida ajustada", desfeito.status, "Desfeito");
  verificar("aluno volta a sala", m.currentSession.currentOccupancy, 1);
  verificar("sobrou so a entrada", m.currentSession.eventLog.length, 1);
  verificar("e ela e a entrada", m.currentSession.eventLog[0].tipo, "entrada");
}

resumo();
