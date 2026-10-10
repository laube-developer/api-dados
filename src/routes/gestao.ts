import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { catalogoGestao, ErroGestao, gravarGestao, listarGestao, prepararGestao, reconciliarGestao, tabelaPublica } from "../database/gestao.js";
import { invalidarCacheConfiguracao } from "../database/redisCache.js";
import { invalidarCacheEstoque } from "../database/config/estoque/buscarEstoquePorDominio.js";

export function rotasGestao() {
    const router = Router();
    router.use((req, res, next) => {
        const expected = (process.env.GESTAO_API_TOKEN ?? "").trim() || (process.env.AUTH_TOKEN ?? "").trim();
        const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
        const a = Buffer.from(token), b = Buffer.from(expected ?? "");
        if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
            res.status(403).json({ sucesso: false, erro: "Acesso administrativo não autorizado." }); return;
        }
        next();
    });
    const handler = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
        try { res.json({ sucesso: true, dados: await fn(req) }); }
        catch (e) { res.status(e instanceof ErroGestao ? e.status : 500).json({ sucesso: false, erro: e instanceof ErroGestao ? e.message : "Falha na operação de gestão." }); }
    };
    router.get("/tabelas", handler(async () => (await catalogoGestao()).map(tabelaPublica)));
    router.get("/tabelas/:chave/registros", handler(req => listarGestao(req.params.chave, req.query.cursor)));
    router.post("/validar", handler(async req => { const p = await prepararGestao(req.body); return { tabela: p.tabela, valores: p.valores }; }));
    router.post("/gravar", handler(req => gravarGestao(req.body)));
    router.post("/reconciliar", handler(req => reconciliarGestao(req.body)));
    router.post("/invalidar", handler(async () => { await invalidarCacheConfiguracao(); invalidarCacheEstoque(); return { invalidado: true }; }));
    return router;
}
