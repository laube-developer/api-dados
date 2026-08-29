import "dotenv/config";
import express from 'express';
import { buscarTabelasBanco } from './database/notion';
import { buscarPaciente } from './database/pacientes/buscarPaciente';
import { buscarPacientes } from './database/pacientes/buscarPacientes';
import { adicionarPaciente, ErroValidacao as ErroValidacaoPaciente } from './database/pacientes/adicionarPaciente';
import {
    atualizarPacientes,
    ErroValidacao as ErroValidacaoAtualizacaoPacientes,
    ErroNaoEncontrado as ErroNaoEncontradoPacientes
} from './database/pacientes/atualizarPacientes';
import {
    patientsExists,
    ErroValidacao as ErroValidacaoPatientsExists
} from './database/pacientes/patientsExists';
import {
    doctorsExists,
    ErroValidacao as ErroValidacaoDoctorsExists
} from './database/medicos/doctorsExists';
import { buscarAgendamento, ErroValidacao as ErroValidacaoBusca } from './database/agendamentos/buscarAgendamento';
import { buscarAgendamentos, ErroValidacao as ErroValidacaoBuscaAgendamentos } from './database/agendamentos/buscarAgendamentos';
import {
    buscarAgendamentoPorId,
    ErroValidacao as ErroValidacaoBuscaAgendamentoPorId
} from './database/agendamentos/buscarAgendamentoPorId';
import {
    reverterSincronizacao,
    ErroValidacao as ErroValidacaoReversao
} from './database/sincronizacao/reverterSincronizacao';
import { adicionarAgendamento, ErroValidacao } from './database/agendamentos/adicionarAgendamento';
import { adicionarAgendamentos } from './database/agendamentos/adicionarAgendamentos';
import {
    atualizarStatusAgendamento,
    ErroValidacao as ErroValidacaoAtualizacao,
    ErroNaoEncontrado
} from './database/agendamentos/atualizarStatusAgendamento';
import {
    atualizarAgendamentos,
    ErroValidacao as ErroValidacaoAtualizacaoAgendamentos,
    ErroNaoEncontrado as ErroNaoEncontradoAgendamentos
} from './database/agendamentos/atualizarAgendamentos';
import { adicionarMedico, ErroValidacao as ErroValidacaoMedico } from './database/medicos/adicionarMedico';
import { adicionarMedicos, ErroValidacao as ErroValidacaoMedicos } from './database/medicos/adicionarMedicos';
import {
    atualizarMedicos,
    ErroValidacao as ErroValidacaoAtualizacaoMedicos,
    ErroNaoEncontrado as ErroNaoEncontradoMedicos
} from './database/medicos/atualizarMedicos';
import { buscarMedicos } from './database/medicos/buscarMedicos';
import { adicionarAgenda, ErroValidacao as ErroValidacaoAgenda } from './database/agendas/adicionarAgenda';
import {
    atualizarAgendas,
    ErroValidacao as ErroValidacaoAtualizacaoAgendas,
    ErroNaoEncontrado as ErroNaoEncontradoAgendas
} from './database/agendas/atualizarAgendas';
import { buscarAgendas } from './database/agendas/buscarAgendas';
import { responderErro, responderSucesso } from './utils/respostas';
import { bearerAuth } from './middlewares/auth';
import { buscarTableCron } from "./database/config/cron/buscarTableCron";


const app = express();

app.use(express.json());
app.use(bearerAuth);

app.get('/tabelas', async (req: express.Request, res: express.Response) => {
    try {
        const tabelas = await buscarTabelasBanco();
        return responderSucesso(res, tabelas);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar tabelas";
        console.error(error);
        return responderErro(res, mensagem);
    }
});

app.get('/pacientes', async (req: express.Request, res: express.Response) => {
    try {
        const pacientes = await buscarPacientes();
        return responderSucesso(res, pacientes);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar pacientes";
        console.error(error);
        return responderErro(res, mensagem);
    }
});

app.get('/paciente', async (req: express.Request, res: express.Response) => {
    try {
        const cpfOrName = req.query.cpf_or_name as string;
        const pacientes = await buscarPaciente(cpfOrName);

        if (!pacientes || pacientes.length === 0) {
            return responderErro(res, "Paciente não encontrado", 404);
        }

        return responderSucesso(res, pacientes);
    } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar paciente";
        console.error(error);
        return responderErro(res, mensagem);
    }
});

/**
 * Verifica quais id_unico de pacientes já estão cadastrados.
 * Body: [12345, 12346] ou { "id_unicos": [12345, 12346] }
 * Resposta: lista dos id_unico encontrados na base.
 */
app.post('/patients_exists', async (req: express.Request, res: express.Response) => {
    try {
        const idsCadastrados = await patientsExists(req.body);
        return responderSucesso(res, idsCadastrados);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoPatientsExists) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao verificar pacientes existentes";
        return responderErro(res, mensagem);
    }
});

/**
 * Verifica quais id_unico de médicos já estão cadastrados.
 * Body: [12345, 12346] ou { "id_unicos": [12345, 12346] }
 * Resposta: lista dos id_unico encontrados na base.
 */
app.post('/doctors_exists', async (req: express.Request, res: express.Response) => {
    try {
        const idsCadastrados = await doctorsExists(req.body);
        return responderSucesso(res, idsCadastrados);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoDoctorsExists) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao verificar médicos existentes";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarPaciente', async (req: express.Request, res: express.Response) => {
    try {
        const paciente = await adicionarPaciente(req.body);
        return responderSucesso(res, paciente, 201);
    } catch (error) {
        if (error instanceof ErroValidacaoPaciente) {
            console.error(error);
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar paciente";
        console.error(error);
        return responderErro(res, mensagem);
    }
});

app.patch('/atualizarPacientes', async (req: express.Request, res: express.Response) => {
    try {
        const pacientes = await atualizarPacientes(req.body.pacientes);
        return responderSucesso(res, pacientes);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoAtualizacaoPacientes) {
            return responderErro(res, error.message, 400);
        }

        if (error instanceof ErroNaoEncontradoPacientes) {
            return responderErro(res, error.message, 404);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao atualizar pacientes";
        return responderErro(res, mensagem);
    }
});

app.get('/agendamentoPorId', async (req: express.Request, res: express.Response) => {
    try {
        const id_unico = req.query.id_unico as string;
        const agendamento = await buscarAgendamentoPorId(id_unico);

        if (!agendamento) {
            return responderErro(res, "Agendamento não encontrado", 404);
        }

        return responderSucesso(res, agendamento);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoBuscaAgendamentoPorId) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendamento";
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
        console.error(error);
        if (error instanceof ErroValidacaoBuscaAgendamentos) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendamentos";
        return responderErro(res, mensagem);
    }
});

app.get('/agendamento', async (req: express.Request, res: express.Response) => {
    try {
        // Preferência: id_paciente (id_unico do paciente). cpf mantido só por compatibilidade legada.
        const id_paciente = (req.query.id_paciente as string) || "";
        const start_date = req.query.start_date as string;
        const end_date = req.query.end_date as string;
        const agendamentos = await buscarAgendamento(id_paciente, start_date, end_date);

        if (!agendamentos || agendamentos.length === 0) {
            return responderErro(res, "Agendamento não encontrado", 404);
        }

        return responderSucesso(res, agendamentos);
    } catch (error) {
        console.error(error);
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
        console.error(error);
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

app.post('/adicionarAgendamentos', async (req: express.Request, res: express.Response) => {
    try {
        const agendamentos = await adicionarAgendamentos(req.body.agendamentos);
        return responderSucesso(res, agendamentos, 201);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacao) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar agendamentos";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarAgendamento', async (req: express.Request, res: express.Response) => {
    try {
        const agendamento = await adicionarAgendamento(req.body);
        return responderSucesso(res, agendamento, 201);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacao) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar agendamento";
        return responderErro(res, mensagem);
    }
});

app.patch('/atualizarAgendamentos', async (req: express.Request, res: express.Response) => {
    try {
        const agendamentos = await atualizarAgendamentos(req.body.agendamentos);
        return responderSucesso(res, agendamentos);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoAtualizacaoAgendamentos) {
            return responderErro(res, error.message, 400);
        }

        if (error instanceof ErroNaoEncontradoAgendamentos) {
            return responderErro(res, error.message, 404);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao atualizar agendamentos";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarMedico', async (req: express.Request, res: express.Response) => {
    try {
        const medico = await adicionarMedico(req.body);
        return responderSucesso(res, medico, 201);
    } catch (error) {
        console.error(error);
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
        console.error(error);
        if (error instanceof ErroValidacaoMedicos) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao adicionar médicos";
        return responderErro(res, mensagem);
    }
});

app.patch('/atualizarMedicos', async (req: express.Request, res: express.Response) => {
    try {
        const medicos = await atualizarMedicos(req.body.medicos);
        return responderSucesso(res, medicos);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoAtualizacaoMedicos) {
            return responderErro(res, error.message, 400);
        }

        if (error instanceof ErroNaoEncontradoMedicos) {
            return responderErro(res, error.message, 404);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao atualizar médicos";
        return responderErro(res, mensagem);
    }
});

app.get('/medicos', async (req: express.Request, res: express.Response) => {
    try {
        const medicos = await buscarMedicos();
        return responderSucesso(res, medicos);
    } catch (error) {
        console.error(error);
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar médicos";
        return responderErro(res, mensagem);
    }
});

app.post('/adicionarAgenda', async (req: express.Request, res: express.Response) => {
    try {
        const agenda = await adicionarAgenda(req.body);
        return responderSucesso(res, agenda, 201);
    } catch (error) {
        console.error(error);
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
        console.error(error);
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar agendas";
        return responderErro(res, mensagem);
    }
});

app.patch('/atualizarAgendas', async (req: express.Request, res: express.Response) => {
    try {
        const agendas = await atualizarAgendas(req.body.agendas);
        return responderSucesso(res, agendas);
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoAtualizacaoAgendas) {
            return responderErro(res, error.message, 400);
        }

        if (error instanceof ErroNaoEncontradoAgendas) {
            return responderErro(res, error.message, 404);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao atualizar agendas";
        return responderErro(res, mensagem);
    }
});

app.post('/reverterSincronizacao', async (req: express.Request, res: express.Response) => {
    try {
        await reverterSincronizacao(req.body);
        return responderSucesso(res, { revertido: true });
    } catch (error) {
        console.error(error);
        if (error instanceof ErroValidacaoReversao) {
            return responderErro(res, error.message, 400);
        }

        const mensagem = error instanceof Error ? error.message : "Erro ao reverter sincronização";
        return responderErro(res, mensagem);
    }
});

app.get('/buscarTableCron', async (req: express.Request, res: express.Response) => {
    try {
        const cronTables = await buscarTableCron();

        return responderSucesso(res, cronTables);
    } catch (error) {
        console.error(error);
        const mensagem = error instanceof Error ? error.message : "Erro ao buscar cron tables";
        return responderErro(res, mensagem);
    }
});

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
        return next(error);
    }

    console.error(`[${new Date().toISOString()}] Erro não tratado em ${req.method} ${req.path}:`, error);
    const mensagem = error instanceof Error ? error.message : "Erro interno do servidor";
    return responderErro(res, mensagem);
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});

//Alteração