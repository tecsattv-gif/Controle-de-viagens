// Conteúdo da Central de Ajuda (offline).
// Títulos e introduções passam por t() para localização (PT/ES/EN/FR).
// Os passos ficam em português e servem de fallback — a busca funciona offline
// sobre título + introdução + passos.

export type HelpArticle = {
  id: string;
  title: string;   // chave PT (traduzida via t())
  intro: string;   // chave PT (traduzida via t())
  steps: string[]; // passos em PT
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    intro: "Configure o essencial para começar a usar o aplicativo.",
    steps: [
      "Abra Cadastros e preencha os Dados da empresa (nome e logo) — eles aparecem nos relatórios em PDF.",
      "Cadastre pelo menos um Veículo na aba Veículos.",
      "Cadastre pelo menos um Motorista na aba Motoristas.",
      "Escolha o idioma e as cores do aplicativo em Cadastros.",
      "Pronto! Agora você já pode registrar viagens, despesas e muito mais.",
    ],
  },
  {
    id: "dados-empresa",
    title: "Dados da empresa (relatórios)",
    intro: "Nome e logo que aparecem no cabeçalho de todos os PDFs.",
    steps: [
      "Vá em Cadastros e role até 'Dados da empresa (relatórios)'.",
      "Digite o Nome da empresa.",
      "Toque em 'Logo da empresa' para escolher uma imagem da galeria.",
      "Toque em 'Salvar empresa'.",
      "Os próximos relatórios usarão automaticamente esses dados.",
    ],
  },
  {
    id: "veiculos",
    title: "Cadastro de veículos",
    intro: "Cadastre o cavalo, reboques e dolly da composição.",
    steps: [
      "Em Cadastros, aba Veículos, toque em '+'.",
      "Informe a placa, marca e modelo do cavalo.",
      "Adicione as placas dos reboques da composição, se houver.",
      "Marque se usa dolly e informe a placa, quando aplicável.",
      "Salve. O veículo ficará disponível em viagens, despesas e pneus.",
    ],
  },
  {
    id: "viagens",
    title: "Controle de Viagens",
    intro: "Registre viagens com KM inicial e final.",
    steps: [
      "Na aba Nova, selecione o veículo e o motorista.",
      "Informe o KM inicial; o KM final pode ficar em branco (viagem em aberto).",
      "Preencha locais de carga/descarga e observações, se quiser.",
      "Salve. Se houver viagem em aberto, 'Nova Viagem' abre para concluir.",
      "Consulte e edite tudo no Histórico.",
    ],
  },
  {
    id: "fretes",
    title: "Fretes",
    intro: "Registre os fretes separadamente das viagens.",
    steps: [
      "Acesse Fretes e toque em adicionar.",
      "Informe valor, origem/destino e demais dados.",
      "Valores podem ficar sem preenchimento e assumem 0 quando necessário.",
      "Salve e acompanhe no histórico/relatórios.",
    ],
  },
  {
    id: "despesas",
    title: "Despesas",
    intro: "Abastecimento, pedágios, manutenção, óleo, pneus e OS.",
    steps: [
      "Abra a aba Despesas.",
      "Escolha a categoria: Abastecimento, Pedágios, Manutenção, Troca de Óleo, Controle de Pneus ou Ordem de Serviço.",
      "Preencha os dados e salve.",
      "Veja os totais no Relatório de Despesas e no Relatório Geral.",
    ],
  },
  {
    id: "abastecimento",
    title: "Abastecimento",
    intro: "Registre litros e valores de Diesel e ARLA 32.",
    steps: [
      "Em Despesas, abra Abastecimento.",
      "Informe litros e preço do Diesel e do ARLA 32 (opcionais).",
      "Salve. Os litros e valores aparecem separados nos relatórios.",
    ],
  },
  {
    id: "troca-oleo",
    title: "Troca de Óleo e Filtros",
    intro: "Controle trocas e a próxima troca por KM ou tempo.",
    steps: [
      "Em Despesas, abra Troca de Óleo e Filtros.",
      "Toque em Cadastrar Troca e selecione o veículo.",
      "Informe óleos, filtros, mão de obra e a próxima troca (KM e/ou tempo).",
      "Salve. Veja vencimentos e PDF no Histórico.",
    ],
  },
  {
    id: "pneus",
    title: "Controle de Pneus",
    intro: "Mapa dos eixos, cadastro, medições e trocas de posição.",
    steps: [
      "Em Despesas, abra Controle de Pneus.",
      "Em Mapa dos Pneus, selecione o veículo e confirme a configuração dos eixos.",
      "Toque numa posição vazia para cadastrar um pneu.",
      "Toque num pneu para ver detalhes, medir o sulco ou trocar de posição.",
      "Gere relatórios em PDF por veículo ou por pneu, e no Histórico.",
    ],
  },
  {
    id: "os",
    title: "Ordem de Serviço (OS)",
    intro: "Crie OS com descrições numeradas e PDF.",
    steps: [
      "Em Despesas, abra OS – Ordem de Serviço.",
      "Em Nova OS, informe data, KM e matrículas.",
      "Adicione quantas descrições precisar com 'Nova inserção'.",
      "Salve. Cada OS recebe um número automático (OS Nº 0001).",
      "No Histórico, edite ou gere o PDF da OS.",
    ],
  },
  {
    id: "controle-diario-mensal",
    title: "Controle Diário e Mensal de KM",
    intro: "Acompanhe os KM rodados por dia e por mês.",
    steps: [
      "No Controle Diário, informe o KM inicial e final do dia (o final pode ficar em branco).",
      "No Controle Mensal, abra o mês com o KM inicial e feche com o KM final.",
      "O Resumo mostra 'KM de hoje' e 'KM rodados no mês' conforme o mês selecionado.",
    ],
  },
  {
    id: "relatorios",
    title: "Relatórios e PDF",
    intro: "Gere, imprima e compartilhe relatórios em PDF.",
    steps: [
      "Abra o relatório desejado e escolha o período (dia/mês/ano/personalizado).",
      "Toque em Gerar PDF para visualizar, imprimir ou compartilhar.",
      "Os PDFs usam o logo e o nome da empresa cadastrados.",
      "Os botões de editar/excluir não aparecem no PDF.",
    ],
  },
  {
    id: "backup",
    title: "Backup e restauração",
    intro: "Os dados ficam só no telefone. Faça backup para não perder nada.",
    steps: [
      "Abra Cadastros → Backup e restauração.",
      "Toque em Fazer backup e guarde o arquivo no Google Drive, e-mail ou WhatsApp.",
      "Para recuperar (por exemplo num telefone novo), toque em Restaurar backup e escolha o arquivo.",
      "Atenção: restaurar substitui os dados atuais do telefone pelos do backup.",
      "Se usava o app com uma conta online, use 'Trazer dados da conta online' para copiar os dados antigos.",
    ],
  },
  {
    id: "assistente-ia",
    title: "Assistente IA",
    intro: "Pergunte sobre o app e os seus dados usando a sua própria chave de IA.",
    steps: [
      "Abra Cadastros → Assistente IA e toque na engrenagem.",
      "Escolha Google Gemini (tem uso grátis) ou OpenAI (ChatGPT, pago por uso).",
      "Toque em Obter chave, crie a chave com a sua conta e cole no campo.",
      "Toque em Salvar. A chave fica guardada só neste telefone.",
      "O assistente precisa de internet; o resto do app funciona sem internet.",
    ],
  },
];

export function searchArticles(articles: HelpArticle[], query: string, translate: (s: string) => string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter((a) => {
    const hay = [translate(a.title), translate(a.intro), a.title, a.intro, ...a.steps].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
