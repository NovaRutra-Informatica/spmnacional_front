import { GET as ready } from './ready/route';

/**
 * Sonda de saúde usada pelo HEALTHCHECK do contêiner e pelo balanceador.
 *
 * O `force-dynamic` é obrigatório: sem ele o Next tentaria pré-renderizar esta
 * rota durante o `docker build`, quando não existe banco algum para responder.
 */
export const dynamic = 'force-dynamic';

export const GET = ready;
