import { state } from './state.js';

// Datas comerciais fixas (mesmo mês/dia todo ano) — as que mais geram venda de presente
// pra uma consultora de cosméticos, não só feriado cívico.
const DATAS_FIXAS = [
  { mes: 3, dia: 8, nome: 'Dia Internacional da Mulher' },
  { mes: 6, dia: 12, nome: 'Dia dos Namorados' },
  { mes: 10, dia: 12, nome: 'Dia das Crianças' },
  { mes: 12, dia: 25, nome: 'Natal' }
];

// Nomes das datas comerciais que entram automaticamente (fixas + móveis calculadas) — exibido
// em Minha Conta pra deixar claro o que já vem pronto, sem a consultora precisar cadastrar.
// Feriados nacionais (via BrasilAPI) entram à parte, variam de ano a ano e não têm lista fixa aqui.
export const NOMES_DATAS_AUTOMATICAS = [
  ...DATAS_FIXAS.map(d => d.nome),
  'Páscoa', 'Dia das Mães', 'Dia dos Pais', 'Black Friday'
];

// Páscoa (feriado móvel) pelo algoritmo de Gauss/Meeus — usada como referência de época de
// "presente de chocolate/beleza" no comércio.
function calcularPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

// N-ésima ocorrência de um dia da semana num mês (ex: 2º domingo de maio = Dia das Mães,
// 4ª sexta de novembro = Black Friday). diaSemana: 0=domingo ... 6=sábado.
function nEsimoDiaDaSemana(ano, mesIdx0, diaSemana, n) {
  const primeiro = new Date(ano, mesIdx0, 1);
  const offset = (diaSemana - primeiro.getDay() + 7) % 7;
  const dia = 1 + offset + (n - 1) * 7;
  return { mes: mesIdx0 + 1, dia };
}

// Black Friday não é "a 4ª sexta-feira do mês" isolada — é o dia seguinte à 4ª quinta-feira de
// novembro (Thanksgiving nos EUA), que às vezes cai na 5ª sexta-feira do mês (ex: 29/11/2024).
function calcularBlackFriday(ano) {
  const { mes, dia } = nEsimoDiaDaSemana(ano, 10, 4, 4); // novembro, quinta, 4ª
  const seguinte = new Date(ano, mes - 1, dia + 1);
  return { mes: seguinte.getMonth() + 1, dia: seguinte.getDate() };
}

// Cada data carrega o próprio ano em que foi calculada — nunca "rola" mês/dia de um ano pro
// outro genericamente, porque datas móveis (Mães, Pais, Páscoa, Black Friday) mudam de dia
// ano a ano. Gerar já o candidato do ano seguinte (em vez de tentar adivinhar) evita esse erro.
function datasComerciaisDoAno(ano) {
  return [
    ...DATAS_FIXAS.map(d => ({ ...d, ano })),
    { ...calcularPascoa(ano), nome: 'Páscoa', ano },
    { ...nEsimoDiaDaSemana(ano, 4, 0, 2), nome: 'Dia das Mães', ano },  // maio, domingo, 2ª
    { ...nEsimoDiaDaSemana(ano, 7, 0, 2), nome: 'Dia dos Pais', ano },  // agosto, domingo, 2ª
    { ...calcularBlackFriday(ano), nome: 'Black Friday', ano }
  ];
}

// Datas cadastradas manualmente pela consultora (Minha Conta). Sem "ano" definido, repete todo
// ano (igual às comerciais fixas); com "ano" definido, só entra no ano informado (data única,
// ex: uma promoção específica que não deve voltar a aparecer nos anos seguintes).
function datasCustomDoAno(ano) {
  const custom = state.profile?.datasComemorativasCustom || [];
  return custom.filter(d => !d.ano || d.ano === ano).map(d => ({ mes: d.mes, dia: d.dia, nome: d.nome, ano }));
}

// null = ainda não carregado nesta sessão; array = resultado (pode ser vazio).
let cache = null;

export function datasComemorativasResumo() {
  return cache;
}

// Junta feriados nacionais (BrasilAPI, sem chave) + datas comerciais fixas/móveis calculadas
// localmente, e filtra os próximos 30 dias. Chamado uma vez por sessão pelo dashboard — se a
// BrasilAPI falhar (sem internet, fora do ar), segue só com as datas comerciais, sem quebrar nada.
export async function carregarDatasComemorativas() {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  let feriados = [];
  try {
    const anos = [anoAtual, anoAtual + 1];
    const resultados = await Promise.all(anos.map(a =>
      fetch(`https://brasilapi.com.br/api/feriados/v1/${a}`).then(r => r.ok ? r.json() : [])
    ));
    feriados = resultados.flat().map(f => {
      const [y, m, d] = f.date.split('-').map(Number);
      return { mes: m, dia: d, ano: y, nome: f.name };
    });
  } catch (e) { /* sem internet ou API fora do ar — segue só com as datas comerciais */ }

  const comerciais = [
    ...datasComerciaisDoAno(anoAtual), ...datasComerciaisDoAno(anoAtual + 1),
    ...datasCustomDoAno(anoAtual), ...datasCustomDoAno(anoAtual + 1)
  ];
  const todas = [...feriados, ...comerciais];

  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const comDistancia = todas
    .map(d => {
      const alvo = new Date(d.ano, d.mes - 1, d.dia);
      const dias = Math.round((alvo - hojeSemHora) / 86400000);
      return { nome: d.nome, dias, dataStr: String(d.dia).padStart(2, '0') + '/' + String(d.mes).padStart(2, '0') };
    })
    .filter(d => d.dias >= 0); // só datas ainda por vir (ou hoje)

  // Uma entrada por nome — mantém só a ocorrência mais próxima (o candidato do ano seguinte de
  // cada data comercial só importa se a deste ano já passou; feriados nacionais não repetem nome
  // de ano a ano, então isso não afeta eles).
  const porNome = new Map();
  for (const d of comDistancia) {
    const atual = porNome.get(d.nome);
    if (!atual || d.dias < atual.dias) porNome.set(d.nome, d);
  }

  cache = Array.from(porNome.values()).filter(d => d.dias <= 30).sort((a, b) => a.dias - b.dias).slice(0, 8);
  window.App.renderDatasComemorativas?.();
}
