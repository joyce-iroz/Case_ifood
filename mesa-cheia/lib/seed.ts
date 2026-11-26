// Gerador determinístico dos dados da demo. Função pura: recebe a data de hoje
// e devolve as linhas; quem insere no banco é a rota /api/reset.
import { hashTelefone } from "./hash";
import {
  RESTAURANTE_DEMO_ID,
  diaDaSemana,
  horasDeFuncionamento,
  somarDias,
  type Restaurante,
} from "./dominio";

const SEMENTE = 20260601;
export const DIAS_DE_HISTORICO = 60;

/** PRNG mulberry32: rápido, reprodutível, bom o bastante para dados de demo. */
function mulberry32(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RESTAURANTE_DEMO: Restaurante = {
  id: RESTAURANTE_DEMO_ID,
  nome: "Cantina do Bairro",
  cozinha: "italiana",
  capacidade: 64,
  ticket_medio: 78,
  abre: "11:00:00",
  fecha: "23:00:00",
  pausa_inicio: "15:00:00",
  pausa_fim: "18:00:00",
  dias_abertos: [0, 2, 3, 4, 5, 6], // terça a domingo
};

export const REGRAS_DEMO = {
  restaurante_id: RESTAURANTE_DEMO_ID,
  teto_mes: 1200,
  desconto_max: 20,
  dias_entre_ofertas: 15,
  ocupacao_min: 50,
};

// ---------------------------------------------------------------- ocupação

type Turno = "almoco" | "jantar";
const turnoDaHora = (h: number): Turno => (h < 16 ? "almoco" : "jantar");

// Fator do dia por turno (1 = casa cheia no pico). Terça e quarta fracas, fim de semana cheio.
const FATOR_DIA: Record<number, Record<Turno, number>> = {
  2: { almoco: 0.5, jantar: 0.45 },
  3: { almoco: 0.55, jantar: 0.5 },
  4: { almoco: 0.68, jantar: 0.72 },
  5: { almoco: 0.78, jantar: 0.95 },
  6: { almoco: 1.0, jantar: 1.08 },
  0: { almoco: 1.08, jantar: 0.9 },
};

// Curva dentro do turno: picos 12h–14h e 19h–21h30.
const FATOR_HORA: Record<number, number> = {
  11: 0.45, 12: 0.92, 13: 1.0, 14: 0.68,
  18: 0.5, 19: 0.9, 20: 1.0, 21: 0.88, 22: 0.5,
};

const RUIDO = 0.15; // até 15% para cima ou para baixo

export type LinhaOcupacao = { restaurante_id: string; data: string; hora: number; pessoas: number };

/**
 * 60 dias encerrados ontem. O ruído é sorteado por (dia da semana, n-ésima ocorrência
 * desse dia contando de trás para frente, hora): a terça mais recente recebe sempre o
 * mesmo ruído, então a grade quase não muda de um dia para o outro.
 */
export function gerarOcupacao(hoje: string, r: Restaurante = RESTAURANTE_DEMO): LinhaOcupacao[] {
  const horas = horasDeFuncionamento(r);
  const linhas: LinhaOcupacao[] = [];
  const ocorrencias: Record<number, number> = {};

  for (let atras = 1; atras <= DIAS_DE_HISTORICO; atras++) {
    const data = somarDias(hoje, -atras);
    const dow = diaDaSemana(data);
    if (!r.dias_abertos.includes(dow)) continue;
    const k = (ocorrencias[dow] = (ocorrencias[dow] ?? 0) + 1);
    const fatores = FATOR_DIA[dow];
    if (!fatores) continue;

    for (const hora of horas) {
      const rand = mulberry32(SEMENTE ^ (dow * 1_000_003 + k * 1_009 + hora));
      rand(); // descarta o primeiro valor, pouco espalhado para sementes vizinhas
      const ruido = 1 + (rand() * 2 - 1) * RUIDO;
      const taxa = fatores[turnoDaHora(hora)] * (FATOR_HORA[hora] ?? 0.5) * ruido;
      const pessoas = Math.max(0, Math.min(r.capacidade, Math.round(taxa * r.capacidade)));
      linhas.push({ restaurante_id: r.id, data, hora, pessoas });
    }
  }
  return linhas.sort((a, b) => (a.data === b.data ? a.hora - b.hora : a.data < b.data ? -1 : 1));
}

// ---------------------------------------------------------------- clientes

const PRIMEIROS = [
  "Ana", "Beatriz", "Bruno", "Camila", "Carlos", "Daniela", "Diego", "Eduarda", "Felipe", "Fernanda",
  "Gabriel", "Giovanna", "Gustavo", "Helena", "Igor", "Isabela", "João", "Juliana", "Larissa", "Leonardo",
  "Letícia", "Lucas", "Luiza", "Marcelo", "Mariana", "Matheus", "Natália", "Otávio", "Paula", "Pedro",
  "Rafael", "Renata", "Rodrigo", "Sabrina", "Sérgio", "Tatiana", "Thiago", "Vanessa", "Vinícius", "Yasmin",
];
const SOBRENOMES = [
  "Almeida", "Alves", "Araújo", "Barbosa", "Cardoso", "Carvalho", "Castro", "Costa", "Dias", "Ferreira",
  "Gomes", "Lima", "Lopes", "Martins", "Melo", "Moreira", "Nascimento", "Oliveira", "Pereira", "Ribeiro",
  "Rocha", "Rodrigues", "Santos", "Silva", "Soares", "Souza", "Teixeira", "Vieira",
];
const DDDS = ["11", "11", "11", "11", "11", "11", "13", "19", "21", "31"];

export type LinhaCliente = {
  restaurante_id: string;
  telefone_hash: string;
  telefone_final: string;
  nome: string;
  visitas: number;
  ultima_visita: string | null;
  origem: "delivery" | "salao";
  dia_habitual: number | null;
  turno_habitual: Turno | null;
  pedidos_delivery: number;
};

/** n-ésima ocorrência (0 = mais recente) do dia da semana antes de hoje. */
function ultimaOcorrencia(hoje: string, dow: number, n: number): string {
  let atras = ((diaDaSemana(hoje) - dow + 7) % 7) || 7;
  atras += n * 7;
  return somarDias(hoje, -atras);
}

/**
 * Cliente gerado: a linha que vai para o banco, o telefone em claro (que nunca vai
 * para o banco, serve só ao painel "Telefones de teste") e o histórico de visitas.
 */
export type ClienteGerado = {
  linha: LinhaCliente;
  telefone: string;
  visitas: { data: string; hora: number }[];
};

const HORAS_TURNO: Record<Turno, number[]> = {
  almoco: [12, 12, 13, 13, 14],
  jantar: [19, 19, 20, 20, 21],
};

/**
 * Visitas ao salão coerentes com a linha: `visitas` registros, o mais recente em
 * `ultima_visita`, os anteriores 1 a 3 semanas antes, sempre na janela habitual.
 * PRNG próprio por cliente, para não mexer na sequência que gera os telefones.
 */
function gerarVisitas(c: LinhaCliente, indice: number): { data: string; hora: number }[] {
  if (!c.ultima_visita || !c.turno_habitual || c.visitas === 0) return [];
  const rand = mulberry32(SEMENTE + 7919 * (indice + 1));
  const horas = HORAS_TURNO[c.turno_habitual];
  const visitas: { data: string; hora: number }[] = [];
  let data = c.ultima_visita;
  for (let i = 0; i < c.visitas; i++) {
    visitas.push({ data, hora: horas[Math.floor(rand() * horas.length)] });
    data = somarDias(data, -7 * (1 + Math.floor(rand() * 3)));
  }
  return visitas;
}

/** Telefones são os mesmos em qualquer data: o PRNG não depende de `hoje`. */
export function gerarClientesCompletos(hoje: string, r: Restaurante = RESTAURANTE_DEMO): ClienteGerado[] {
  const telefones: string[] = [];
  const linhas = gerarLinhasClientes(hoje, r, telefones);
  return linhas.map((linha, i) => ({ linha, telefone: telefones[i], visitas: gerarVisitas(linha, i) }));
}

export function gerarClientes(hoje: string, r: Restaurante = RESTAURANTE_DEMO): LinhaCliente[] {
  return gerarLinhasClientes(hoje, r, []);
}

function gerarLinhasClientes(hoje: string, r: Restaurante, telefones: string[]): LinhaCliente[] {
  const rand = mulberry32(SEMENTE);
  const inteiro = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const escolher = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const usados = new Set<string>();

  const novoTelefone = () => {
    for (;;) {
      const digitos = `55${escolher(DDDS)}9${String(inteiro(0, 99_999_999)).padStart(8, "0")}`;
      if (!usados.has(digitos)) {
        usados.add(digitos);
        return digitos;
      }
    }
  };

  const base = (): Pick<LinhaCliente, "restaurante_id" | "telefone_hash" | "telefone_final" | "nome"> => {
    const tel = novoTelefone();
    telefones.push(tel);
    return {
      restaurante_id: r.id,
      telefone_hash: hashTelefone(tel),
      telefone_final: tel.slice(-4),
      nome: `${escolher(PRIMEIROS)} ${escolher(SOBRENOMES)}`,
    };
  };

  const clientes: LinhaCliente[] = [];

  // 60 frequentadores de terça à noite, vieram numa das últimas 4 terças.
  for (let i = 0; i < 60; i++) {
    clientes.push({
      ...base(),
      visitas: inteiro(3, 24),
      ultima_visita: ultimaOcorrencia(hoje, 2, inteiro(0, 3)),
      origem: "salao",
      dia_habitual: 2,
      turno_habitual: "jantar",
      pedidos_delivery: rand() < 0.3 ? inteiro(1, 6) : 0,
    });
  }

  // 120 frequentadores de outras janelas, com visita nos últimos 60 dias.
  const outrasJanelas: { dia: number; turno: Turno }[] = r.dias_abertos
    .flatMap((dia) => (["almoco", "jantar"] as const).map((turno) => ({ dia, turno })))
    .filter((j) => !(j.dia === 2 && j.turno === "jantar"));
  for (let i = 0; i < 120; i++) {
    const j = escolher(outrasJanelas);
    clientes.push({
      ...base(),
      visitas: inteiro(2, 20),
      ultima_visita: ultimaOcorrencia(hoje, j.dia, inteiro(0, 7)), // no máximo 56 dias atrás
      origem: "salao",
      dia_habitual: j.dia,
      turno_habitual: j.turno,
      pedidos_delivery: rand() < 0.3 ? inteiro(1, 6) : 0,
    });
  }

  // 150 que só pedem delivery: nunca vieram ao salão.
  for (let i = 0; i < 150; i++) {
    clientes.push({
      ...base(),
      visitas: 0,
      ultima_visita: null,
      origem: "delivery",
      dia_habitual: null,
      turno_habitual: null,
      pedidos_delivery: inteiro(1, 30),
    });
  }

  // 70 sumidos: última visita ao salão há mais de 60 dias.
  for (let i = 0; i < 70; i++) {
    const j = escolher(outrasJanelas.concat({ dia: 2, turno: "jantar" }));
    clientes.push({
      ...base(),
      visitas: inteiro(1, 12),
      ultima_visita: somarDias(hoje, -inteiro(61, 240)),
      origem: "salao",
      dia_habitual: j.dia,
      turno_habitual: j.turno,
      pedidos_delivery: 0,
    });
  }

  return clientes;
}
