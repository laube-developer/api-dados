import express from 'express';
import { buscarTabelasBanco } from '../database/notion.js';
import { buscarPaciente } from '../database/pacientes/buscarPaciente.js';
import { buscarAgendamento, ErroValidacao as ErroValidacaoBusca } from '../database/agendamentos/buscarAgendamento.js';
import { buscarAgendamentos, ErroValidacao as ErroValidacaoBuscaAgendamentos } from '../database/agendamentos/buscarAgendamentos.js';
import { adicionarAgendamento, ErroValidacao } from '../database/agendamentos/adicionarAgendamento.js';
import {
    atualizarStatusAgendamento,
    ErroValidacao as ErroValidacaoAtualizacao,
    ErroNaoEncontrado
} from '../database/agendamentos/atualizarStatusAgendamento.js';
import { adicionarMedico, ErroValidacao as ErroValidacaoMedico } from '../database/medicos/adicionarMedico.js';
import { adicionarMedicos, ErroValidacao as ErroValidacaoMedicos } from '../database/medicos/adicionarMedicos.js';
import { buscarMedicos } from '../database/medicos/buscarMedicos.js';
import { adicionarAgenda, ErroValidacao as ErroValidacaoAgenda } from '../database/agendas/adicionarAgenda.js';
import { buscarAgendas } from '../database/agendas/buscarAgendas.js';
import { responderErro, responderSucesso } from '../utils/respostas.js';

const app = express();

app.use(express.json());

app.get('/tabelas', async (req: express.Request, res: express.Response) => {
    try {
        const tabelas = await buscarTabelasBanco();
        return responderSucesso(res, tabelas);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar tabelas";
        return responderErro(res, mensagem);
    }
});

app.get('/paciente', async (req: express.Request, res: express.Response) => {
    try {
        const cpf = req.query.cpf as string;
        const pacientes = await buscarPaciente(cpf);

        if (!pacientes || pacientes.length === 0) {
            return responderErro(res, "Paciente não encontrado", 404);
        }

        return responderSucesso(res, pacientes);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar paciente";
        return responderErro(res, mensagem);
    }
});

app.get('/agendamentos', async (req: express.Request, res: express.Response) => {
    try {
        const start_date = req.query.start_date as string;
        const end_date = req.query.end_date as string;
        const agendamentos = await buscarAgendamentos(start_date, end_date);
        return responderSucesso(res, agendamentos);
    } catch (error) {
        if (error instanceof ErroValidacaoBuscaAgendamentos) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendamentos";
        return responderErro(res, mensagem);
    }
});

app.get('/agendamento', async (req: express.Request, res: express.Response) => {
    try {
        const cpf = req.query.cpf as string;
        const start_date = req.query.start_date as string;
        const end_date = req.query.end_date as string;
        const agendamentos = await buscarAgendamento(cpf, start_date, end_date);

        if (!agendamentos || agendamentos.length === 0) {
            return responderErro(res, "Agendamento não encontrado", 404);
        }

        return responderSucesso(res, agendamentos);
    } catch (error) {
        if (error instanceof ErroValidacaoBusca) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendamentos";
        return responderErro(res, mensagem);
    }
});

app.patch('/atualizarStatusAgendamento', async (req: express.Request, res: express.Response) => {
    try {
        const { id_unico, status } = req.body;
        const agendamento = await atualizarStatusAgendamento(id_unico, status);
        return responderSucesso(res, agendamento);
    } catch (error) {
        if (error instanceof ErroValidacaoAtualizacao) {
            return responderErro(res, error.message, 400);
        }

        if (error instanceof ErroNaoEncontrado) {
            return responderErro(res, error.message, 404);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao atualizar status do agendamento";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarAgendamento', async (req: express.Request, res: express.Response) => {
    try {
        const agendamento = await adicionarAgendamento(req.body);
        return responderSucesso(res, agendamento, 201);
    } catch (error) {
        if (error instanceof ErroValidacao) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar agendamento";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarMedico', async (req: express.Request, res: express.Response) => {
    try {
        const medico = await adicionarMedico(req.body);
        return responderSucesso(res, medico, 201);
    } catch (error) {
        if (error instanceof ErroValidacaoMedico) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar médico";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarMedicos', async (req: express.Request, res: express.Response) => {
    try {
        const medicos = await adicionarMedicos(req.body.medicos);
        return responderSucesso(res, medicos, 201);
    } catch (error) {
        if (error instanceof ErroValidacaoMedicos) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar médicos";
        return responderErro(res, mensagem);
    }
});

app.get('/medicos', async (req: express.Request, res: express.Response) => {
    try {
        const medicos = await buscarMedicos();
        return responderSucesso(res, medicos);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar médicos";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarAgenda', async (req: express.Request, res: express.Response) => {
    try {
        const agenda = await adicionarAgenda(req.body);
        return responderSucesso(res, agenda, 201);
    } catch (error) {
        if (error instanceof ErroValidacaoAgenda) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar agenda";
        return responderErro(res, mensagem);
    }
});

app.get('/agendas', async (req: express.Request, res: express.Response) => {
    try {
        const agendas = await buscarAgendas();
        return responderSucesso(res, agendas);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendas";
        return responderErro(res, mensagem);
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Servidor rodando na porta ${process.env.PORT}`);
});