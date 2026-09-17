/**
 * Harness para rodar o StudentDataManager em Node, sem navegador.
 * Stub de document/localStorage e relógio simulado (relogio.avancar).
 *
 *   const { criarManager, relogio, verificar, resumo } = require("./harness");
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP_PATH = path.join(__dirname, "..", "app.js");

// ---------------------------------------------------------------- relógio
let agora = new Date("2026-04-12T08:00:00").getTime();

const relogio = {
  definir(isoOuMs) {
    agora = typeof isoOuMs === "number" ? isoOuMs : new Date(isoOuMs).getTime();
  },
  avancar(minutos) {
    agora += minutos * 60 * 1000;
  },
  agora() {
    return agora;
  },
};

class DataSimulada extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(agora);
    } else {
      super(...args);
    }
  }
  static now() {
    return agora;
  }
}

// ---------------------------------------------------------------- sandbox
function criarManager() {
  const store = new Map();

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date: DataSimulada,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    parseFloat,
    parseInt,
    isNaN,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      addEventListener() {},
      getElementById() {
        return null;
      },
      createElement() {
        return { click() {}, style: {}, classList: { add() {}, remove() {} } };
      },
      body: { appendChild() {}, removeChild() {} },
    },
    setInterval() {},
    clearInterval() {},
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  const fonte = fs.readFileSync(APP_PATH, "utf8");
  vm.runInContext(fonte + "\n;globalThis.__SDM = StudentDataManager;", sandbox, {
    filename: "app.js",
  });

  const manager = new sandbox.__SDM();
  manager.__store = store;
  return manager;
}

/**
 * Resumo da sessão atual usando o RELÓGIO SIMULADO como fim de sessão.
 *
 * Use sempre este helper, nunca `new Date()` dentro do arquivo de teste: o Date
 * falso existe só dentro do sandbox, então `new Date()` aqui fora devolve a hora
 * real da máquina. A diferença passa despercebida enquanto todos os alunos já
 * saíram (o fim de sessão nem é consultado) e explode assim que houver um aluno
 * ativo no resumo.
 */
function resumoDe(manager) {
  return manager._generateSessionSummary(
    manager.currentSession.eventLog,
    manager.currentSession.activeStudents,
    new Date(relogio.agora()).toISOString()
  );
}

// ---------------------------------------------------------------- asserções
let total = 0;
let falhas = 0;

function verificar(descricao, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`  FALHOU  ${descricao}`);
    console.log(`          esperado: ${JSON.stringify(esperado)}`);
    console.log(`          obtido:   ${JSON.stringify(obtido)}`);
  } else {
    console.log(`  ok      ${descricao}`);
  }
}

function secao(titulo) {
  console.log(`\n${titulo}`);
}

function resumo() {
  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  if (falhas > 0) {
    process.exitCode = 1;
  }
}

module.exports = { criarManager, relogio, resumoDe, verificar, secao, resumo };
