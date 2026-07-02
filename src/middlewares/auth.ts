import { Request, Response, NextFunction } from "express";

export function bearerAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ sucesso: false, erro: "Token de autenticação ausente ou inválido" });
    }

    const token = authHeader.split(" ")[1];

    const validToken = process.env.AUTH_TOKEN;

    if (token !== validToken) {
        return res.status(403).json({ sucesso: false, erro: "Token de autenticação ausente ou inválido" });
    }

    next();
}