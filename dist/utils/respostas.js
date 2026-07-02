export function responderSucesso(res, dados, status = 200) {
    return res.status(status).json({ sucesso: true, dados });
}
export function responderErro(res, erro, status = 500) {
    return res.status(status).json({ sucesso: false, erro });
}
//# sourceMappingURL=respostas.js.map