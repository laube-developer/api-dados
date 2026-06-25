import express from 'express';
import type interfaces = require('../utils/interfaces');
import { buscarPacientesPorCpf, buscarTabelasBanco } from '../database/notion.js';

const app = express();

app.use(express.json());

let usuarios: interfaces.Paciente[] = [
    {nome: "Rafael", cpf: "12345678900", id_unico: "1", data_nascimento: "1990-01-01", email: "rafael@example.com", telefone: "1234567890"},
    {nome: "Maria", cpf: "98765432100", id_unico: "2", data_nascimento: "1992-02-02", email: "maria@example.com", telefone: "0987654321"}
];

app.get('/tabelas', async (req: express.Request, res: express.Response) => {
    const tabelas = await buscarTabelasBanco();
    res.json(tabelas);
})

app.get('/paciente', async (req: express.Request, res: express.Response) => {
    const cpf = req.query.cpf as string;
    const paciente = await buscarPacientesPorCpf(cpf);

    if (!paciente || paciente.length === 0) {
        return res.status(404).json({ error: "Paciente não encontrado" });
    }

    res.json(paciente);
});

app.listen(process.env.PORT, () => {
    console.log(`Servidor rodando na porta ${process.env.PORT}`);
});