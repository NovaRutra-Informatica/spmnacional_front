export const CONTACT_RESPONSE_MESSAGE = 'Responderemos o mais breve possível.';
export const NATIONAL_OFFICE_ADDRESS = 'Rua Caiambé, 126, Ipiranga, São Paulo, SP, CEP 04264-060';

/** O mapa só é acessado por uma ação explícita; nenhum iframe ou rastreador é carregado. */
export function directionsUrl(address: string): string {
    const query = new URLSearchParams({ api: '1', destination: address });
    return `https://www.google.com/maps/dir/?${query}`;
}

export interface ContactFaq {
    question: string;
    answer: string;
}

export const CONTACT_FAQS: readonly ContactFaq[] = [
    {
        question: 'Sou migrante e preciso de orientação. Como entro em contato?',
        answer: 'Conte sua necessidade no formulário desta página ou consulte os contatos publicados em “Onde estamos”. A equipe poderá orientar o encaminhamento na sua região. Não inclua documentos pessoais na primeira mensagem.',
    },
    {
        question: 'Como procuro acolhimento na minha região?',
        answer: 'Escreva informando sua cidade e o tipo de apoio de que precisa. A disponibilidade dos serviços varia por local e momento; o contato permite consultar a equipe regional.',
    },
    {
        question: 'Preciso de orientação sobre documentação. Qual assunto escolho?',
        answer: 'Escolha o assunto que melhor descreve sua necessidade e explique sua dúvida. Para localizar uma equipe, consulte também “Onde estamos”. O envio da mensagem não garante vaga ou atendimento imediato.',
    },
    {
        question: 'Quero ser voluntário. Como começo?',
        answer: 'Escreva contando sua cidade, o que sabe fazer e sua disponibilidade. Você também pode conhecer as formas de apoio na página “Como ajudar”.',
    },
    {
        question: 'Minha comunidade quer iniciar um trabalho com migrantes.',
        answer: 'Use o formulário para apresentar sua comunidade, cidade e proposta. Consulte “O que fazemos” para conhecer as frentes de atuação do SPM.',
    },
    {
        question: 'Como solicito uma entrevista ou apresento uma parceria?',
        answer: 'Escolha o assunto correspondente e informe sua instituição, proposta e contato. Para uma entrevista, inclua a pauta e o prazo da sua solicitação.',
    },
];
