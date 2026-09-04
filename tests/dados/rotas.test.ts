import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../../src/app";
import { dependenciasDados } from "../../src/routes/dados";
import { TOKEN_TESTE, chamar, subirServidor } from "../helpers/http";
import { ErroValidacao as ErroValidacaoPaciente } from "../../src/database/pacientes/adicionarPaciente";
import {
    ErroValidacao as ErroValidacaoAtualizacaoPacientes,
    ErroNaoEncontrado as ErroNaoEncontradoPacientes,
} from "../../src/database/pacientes/atualizarPacientes";
import { ErroValidacao as ErroValidacaoPatientsExists } from "../../src/database/pacientes/patientsExists";
import { ErroValidacao as ErroValidacaoDoctorsExists } from "../../src/database/medicos/doctorsExists";
import { ErroValidacao as ErroValidacaoBusca } from "../../src/database/agendamentos/buscarAgendamento";
import { ErroValidacao as ErroValidacaoBuscaAgendamentos } from "../../src/database/agendamentos/buscarAgendamentos";
import { ErroValidacao as ErroValidacaoBuscaAgendamentoPorId } from "../../src/database/agendamentos/buscarAgendamentoPorId";
import { ErroValidacao as ErroValidacaoAgendamento } from "../../src/database/agendamentos/adicionarAgendamento";
import {
    ErroValidacao as ErroValidacaoAtualizacao,
    ErroNaoEncontrado,
} from "../../src/database/agendamentos/atualizarStatusAgendamento";
import {
    ErroValidacao as ErroValidacaoAtualizacaoAgendamentos,
    ErroNaoEncontrado as ErroNaoEncontradoAgendamentos,
} from "../../src/database/agendamentos/atualizarAgendamentos";
import { ErroValidacao as ErroValidacaoMedico } from "../../src/database/medicos/adicionarMedico";
import { ErroValidacao as ErroValidacaoMedicos } from "../../src/database/medicos/adicionarMedicos";
import {
    ErroValidacao as ErroValidacaoAtualizacaoMedicos,
    ErroNaoEncontrado as ErroNaoEncontradoMedicos,
} from "../../src/database/medicos/atualizarMedicos";
import { ErroValidacao as ErroValidacaoAgenda } from "../../src/database/agendas/adicionarAgenda";
import {
    ErroValidacao as ErroValidacaoAtualizacaoAgendas,
    ErroNaoEncontrado as ErroNaoEncontradoAgendas,
} from "../../src/database/agendas/atualizarAgendas";
import { ErroValidacao as ErroValidacaoReversao } from "../../src/database/sincronizacao/reverterSincronizacao";
import { ErroValidacaoClinica } from "../../src/database/config/clinicas/buscarClinica";

process.env.AUTH_TOKEN = TOKEN_TESTE;

const paciente = {
    nome: "Ana Silva",
    cpf: "12345678901",
    id_unico: "p1",
    data_nascimento: "1990-01-01",
    email: "ana@example.com",
    telefone: "11999999999",
};

const medico = { id_unico: "m1", nome: "Dr. Yuri" };
const agenda = { id_unico: "ag1", nome: "Agenda 1" };
const agendamento = {
    id_agenda: "ag1",
    id_unico: "a1",
    data_hora_inicio: "2026-09-03T10:00:00",
    data_hora_fim: "2026-09-03T10:30:00",
    id_medico: "m1",
    id_paciente: "p1",
    nome_paciente: "Ana Silva",
    id_tipo_procedimento: "t1",
    status: "SCHEDULED",
    guia_assinada: false,
    insurance_id: "i1",
};
const clinica = { id: "c1", nome: "Salus" };
const integracao = { integracao: { name: "totem" }, chave_segura: "segredo" };
const originais = { ...dependenciasDados };

function stub(parciais: Partial<typeof dependenciasDados>) {
    Object.assign(dependenciasDados, parciais);
}

describe("rotas de dados /*", () => {
    let url = "";
    let fechar: () => Promise<void> = async () => undefined;

    before(async () => {
        const servidor = await subirServidor(criarApp());
        url = servidor.url;
        fechar = servidor.fechar;
    });

    after(async () => {
        await fechar();
    });

    beforeEach(() => {
        stub({
            buscarTabelasBanco: async () => [{ id: "db1", nome: "pacientes" }],
            buscarPacientes: async () => [paciente],
            buscarPaciente: async () => [paciente],
            patientsExists: async () => ["p1"],
            doctorsExists: async () => ["m1"],
            adicionarPaciente: async () => paciente,
            atualizarPacientes: async () => [paciente],
            buscarAgendamentoPorId: async () => agendamento,
            buscarAgendamentos: async () => [agendamento],
            buscarAgendamento: async () => [agendamento],
            atualizarStatusAgendamento: async () => agendamento,
            adicionarAgendamentos: async () => [agendamento],
            adicionarAgendamento: async () => agendamento,
            atualizarAgendamentos: async () => [agendamento],
            adicionarMedico: async () => medico,
            adicionarMedicos: async () => [medico],
            atualizarMedicos: async () => [medico],
            buscarMedicos: async () => [medico],
            adicionarAgenda: async () => agenda,
            buscarAgendas: async () => [agenda],
            atualizarAgendas: async () => [agenda],
            reverterSincronizacao: async () => undefined,
            buscarTableCron: async () => [{ nome: "cron" }],
            listarClinicas: async () => [clinica],
            buscarClinicaPorId: async () => clinica,
            buscarIntegracaoClinica: async () => integracao,
        });
    });

    afterEach(() => {
        Object.assign(dependenciasDados, originais);
    });

    describe("autenticacao", () => {
        test("GET /tabelas sem token retorna 401", async () => {
            const res = await chamar(url, "GET", "/tabelas", { token: null });
            assert.equal(res.status, 401);
            assert.equal(res.json.sucesso, false);
        });

        test("GET /tabelas com token invalido retorna 403", async () => {
            const res = await chamar(url, "GET", "/tabelas", { token: "errado" });
            assert.equal(res.status, 403);
            assert.equal(res.json.sucesso, false);
        });
    });

    describe("tabelas", () => {
        test("GET /tabelas retorna 200", async () => {
            const res = await chamar(url, "GET", "/tabelas");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json, { sucesso: true, dados: [{ id: "db1", nome: "pacientes" }] });
        });

        test("GET /tabelas retorna 500 quando o banco falha", async () => {
            stub({ buscarTabelasBanco: async () => { throw new Error("falha notion"); } });
            const res = await chamar(url, "GET", "/tabelas");
            assert.equal(res.status, 500);
            assert.equal(res.json.sucesso, false);
            assert.equal(res.json.erro, "falha notion");
        });
    });

    describe("pacientes", () => {
        test("GET /pacientes retorna 200", async () => {
            const res = await chamar(url, "GET", "/pacientes");
            assert.equal(res.status, 200);
            assert.equal(res.json.sucesso, true);
            assert.deepEqual(res.json.dados, [paciente]);
        });

        test("GET /paciente retorna 200 quando encontra", async () => {
            const res = await chamar(url, "GET", "/paciente?cpf_or_name=Ana");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [paciente]);
        });

        test("GET /paciente retorna 404 quando vazio", async () => {
            stub({ buscarPaciente: async () => [] });
            const res = await chamar(url, "GET", "/paciente?cpf_or_name=x");
            assert.equal(res.status, 404);
            assert.equal(res.json.erro, "Paciente não encontrado");
        });

        test("POST /patients_exists retorna 200", async () => {
            const res = await chamar(url, "POST", "/patients_exists", { body: ["p1"] });
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, ["p1"]);
        });

        test("POST /patients_exists retorna 400 em validacao", async () => {
            stub({
                patientsExists: async () => {
                    throw new ErroValidacaoPatientsExists("ids invalidos");
                },
            });
            const res = await chamar(url, "POST", "/patients_exists", { body: {} });
            assert.equal(res.status, 400);
            assert.equal(res.json.erro, "ids invalidos");
        });

        test("POST /adicionarPaciente retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarPaciente", { body: paciente });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, paciente);
        });

        test("POST /adicionarPaciente retorna 400 em validacao", async () => {
            stub({
                adicionarPaciente: async () => {
                    throw new ErroValidacaoPaciente("O campo 'nome' é obrigatório.");
                },
            });
            const res = await chamar(url, "POST", "/adicionarPaciente", { body: {} });
            assert.equal(res.status, 400);
            assert.match(res.json.erro, /nome/);
        });

        test("PATCH /atualizarPacientes retorna 200", async () => {
            const res = await chamar(url, "PATCH", "/atualizarPacientes", {
                body: { pacientes: [paciente] },
            });
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [paciente]);
        });

        test("PATCH /atualizarPacientes retorna 400 em validacao", async () => {
            stub({
                atualizarPacientes: async () => {
                    throw new ErroValidacaoAtualizacaoPacientes("lista invalida");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarPacientes", { body: { pacientes: [] } });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarPacientes retorna 404 quando nao encontra", async () => {
            stub({
                atualizarPacientes: async () => {
                    throw new ErroNaoEncontradoPacientes("Paciente não encontrado");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarPacientes", {
                body: { pacientes: [paciente] },
            });
            assert.equal(res.status, 404);
        });
    });

    describe("medicos", () => {
        test("POST /doctors_exists retorna 200", async () => {
            const res = await chamar(url, "POST", "/doctors_exists", { body: ["m1"] });
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, ["m1"]);
        });

        test("POST /doctors_exists retorna 400 em validacao", async () => {
            stub({
                doctorsExists: async () => {
                    throw new ErroValidacaoDoctorsExists("ids invalidos");
                },
            });
            const res = await chamar(url, "POST", "/doctors_exists", { body: {} });
            assert.equal(res.status, 400);
        });

        test("GET /medicos retorna 200", async () => {
            const res = await chamar(url, "GET", "/medicos");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [medico]);
        });

        test("POST /adicionarMedico retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarMedico", { body: medico });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, medico);
        });

        test("POST /adicionarMedico retorna 400 em validacao", async () => {
            stub({
                adicionarMedico: async () => {
                    throw new ErroValidacaoMedico("nome obrigatorio");
                },
            });
            const res = await chamar(url, "POST", "/adicionarMedico", { body: {} });
            assert.equal(res.status, 400);
        });

        test("POST /adicionarMedicos retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarMedicos", { body: { medicos: [medico] } });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, [medico]);
        });

        test("POST /adicionarMedicos retorna 400 em validacao", async () => {
            stub({
                adicionarMedicos: async () => {
                    throw new ErroValidacaoMedicos("lista invalida");
                },
            });
            const res = await chamar(url, "POST", "/adicionarMedicos", { body: { medicos: [] } });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarMedicos retorna 200", async () => {
            const res = await chamar(url, "PATCH", "/atualizarMedicos", { body: { medicos: [medico] } });
            assert.equal(res.status, 200);
        });

        test("PATCH /atualizarMedicos retorna 400 em validacao", async () => {
            stub({
                atualizarMedicos: async () => {
                    throw new ErroValidacaoAtualizacaoMedicos("lista invalida");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarMedicos", { body: { medicos: [] } });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarMedicos retorna 404 quando nao encontra", async () => {
            stub({
                atualizarMedicos: async () => {
                    throw new ErroNaoEncontradoMedicos("Médico não encontrado");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarMedicos", { body: { medicos: [medico] } });
            assert.equal(res.status, 404);
        });
    });

    describe("agendamentos", () => {
        test("GET /agendamentoPorId retorna 200", async () => {
            const res = await chamar(url, "GET", "/agendamentoPorId?id_unico=a1");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, agendamento);
        });

        test("GET /agendamentoPorId retorna 404 quando nao encontra", async () => {
            stub({ buscarAgendamentoPorId: async () => null });
            const res = await chamar(url, "GET", "/agendamentoPorId?id_unico=x");
            assert.equal(res.status, 404);
        });

        test("GET /agendamentoPorId retorna 400 em validacao", async () => {
            stub({
                buscarAgendamentoPorId: async () => {
                    throw new ErroValidacaoBuscaAgendamentoPorId("id_unico obrigatorio");
                },
            });
            const res = await chamar(url, "GET", "/agendamentoPorId");
            assert.equal(res.status, 400);
        });

        test("GET /agendamentos retorna 200", async () => {
            const res = await chamar(url, "GET", "/agendamentos?start_date=2026-09-01&end_date=2026-09-30");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [agendamento]);
        });

        test("GET /agendamentos retorna 400 em validacao", async () => {
            stub({
                buscarAgendamentos: async () => {
                    throw new ErroValidacaoBuscaAgendamentos("periodo invalido");
                },
            });
            const res = await chamar(url, "GET", "/agendamentos");
            assert.equal(res.status, 400);
        });

        test("GET /agendamento retorna 200", async () => {
            const res = await chamar(url, "GET", "/agendamento?id_paciente=p1");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [agendamento]);
        });

        test("GET /agendamento retorna 404 quando vazio", async () => {
            stub({ buscarAgendamento: async () => [] });
            const res = await chamar(url, "GET", "/agendamento?id_paciente=p1");
            assert.equal(res.status, 404);
        });

        test("GET /agendamento retorna 400 em validacao", async () => {
            stub({
                buscarAgendamento: async () => {
                    throw new ErroValidacaoBusca("id_paciente obrigatorio");
                },
            });
            const res = await chamar(url, "GET", "/agendamento");
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarStatusAgendamento retorna 200", async () => {
            const res = await chamar(url, "PATCH", "/atualizarStatusAgendamento", {
                body: { id_unico: "a1", status: "DONE" },
            });
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, agendamento);
        });

        test("PATCH /atualizarStatusAgendamento retorna 400 em validacao", async () => {
            stub({
                atualizarStatusAgendamento: async () => {
                    throw new ErroValidacaoAtualizacao("status invalido");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarStatusAgendamento", {
                body: { id_unico: "a1", status: "X" },
            });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarStatusAgendamento retorna 404 quando nao encontra", async () => {
            stub({
                atualizarStatusAgendamento: async () => {
                    throw new ErroNaoEncontrado("Agendamento não encontrado");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarStatusAgendamento", {
                body: { id_unico: "x", status: "DONE" },
            });
            assert.equal(res.status, 404);
        });

        test("POST /adicionarAgendamentos retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarAgendamentos", {
                body: { agendamentos: [agendamento] },
            });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, [agendamento]);
        });

        test("POST /adicionarAgendamentos retorna 400 em validacao", async () => {
            stub({
                adicionarAgendamentos: async () => {
                    throw new ErroValidacaoAgendamento("lista invalida");
                },
            });
            const res = await chamar(url, "POST", "/adicionarAgendamentos", { body: { agendamentos: [] } });
            assert.equal(res.status, 400);
        });

        test("POST /adicionarAgendamento retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarAgendamento", { body: agendamento });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, agendamento);
        });

        test("POST /adicionarAgendamento retorna 400 em validacao", async () => {
            stub({
                adicionarAgendamento: async () => {
                    throw new ErroValidacaoAgendamento("dados invalidos");
                },
            });
            const res = await chamar(url, "POST", "/adicionarAgendamento", { body: {} });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarAgendamentos retorna 200", async () => {
            const res = await chamar(url, "PATCH", "/atualizarAgendamentos", {
                body: { agendamentos: [agendamento] },
            });
            assert.equal(res.status, 200);
        });

        test("PATCH /atualizarAgendamentos retorna 400 em validacao", async () => {
            stub({
                atualizarAgendamentos: async () => {
                    throw new ErroValidacaoAtualizacaoAgendamentos("lista invalida");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarAgendamentos", { body: { agendamentos: [] } });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarAgendamentos retorna 404 quando nao encontra", async () => {
            stub({
                atualizarAgendamentos: async () => {
                    throw new ErroNaoEncontradoAgendamentos("Agendamento não encontrado");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarAgendamentos", {
                body: { agendamentos: [agendamento] },
            });
            assert.equal(res.status, 404);
        });
    });

    describe("agendas", () => {
        test("GET /agendas retorna 200", async () => {
            const res = await chamar(url, "GET", "/agendas");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [agenda]);
        });

        test("POST /adicionarAgenda retorna 201", async () => {
            const res = await chamar(url, "POST", "/adicionarAgenda", { body: agenda });
            assert.equal(res.status, 201);
            assert.deepEqual(res.json.dados, agenda);
        });

        test("POST /adicionarAgenda retorna 400 em validacao", async () => {
            stub({
                adicionarAgenda: async () => {
                    throw new ErroValidacaoAgenda("nome obrigatorio");
                },
            });
            const res = await chamar(url, "POST", "/adicionarAgenda", { body: {} });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarAgendas retorna 200", async () => {
            const res = await chamar(url, "PATCH", "/atualizarAgendas", { body: { agendas: [agenda] } });
            assert.equal(res.status, 200);
        });

        test("PATCH /atualizarAgendas retorna 400 em validacao", async () => {
            stub({
                atualizarAgendas: async () => {
                    throw new ErroValidacaoAtualizacaoAgendas("lista invalida");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarAgendas", { body: { agendas: [] } });
            assert.equal(res.status, 400);
        });

        test("PATCH /atualizarAgendas retorna 404 quando nao encontra", async () => {
            stub({
                atualizarAgendas: async () => {
                    throw new ErroNaoEncontradoAgendas("Agenda não encontrada");
                },
            });
            const res = await chamar(url, "PATCH", "/atualizarAgendas", { body: { agendas: [agenda] } });
            assert.equal(res.status, 404);
        });
    });

    describe("sincronizacao", () => {
        test("POST /reverterSincronizacao retorna 200", async () => {
            const res = await chamar(url, "POST", "/reverterSincronizacao", { body: {} });
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, { revertido: true });
        });

        test("POST /reverterSincronizacao retorna 400 em validacao", async () => {
            stub({
                reverterSincronizacao: async () => {
                    throw new ErroValidacaoReversao("payload invalido");
                },
            });
            const res = await chamar(url, "POST", "/reverterSincronizacao", { body: {} });
            assert.equal(res.status, 400);
        });
    });

    describe("cron e clinicas", () => {
        test("GET /buscarTableCron retorna 200", async () => {
            const res = await chamar(url, "GET", "/buscarTableCron");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [{ nome: "cron" }]);
        });

        test("GET /clinicas retorna 200", async () => {
            const res = await chamar(url, "GET", "/clinicas");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, [clinica]);
        });

        test("GET /clinica retorna 200", async () => {
            const res = await chamar(url, "GET", "/clinica?id=c1");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, clinica);
        });

        test("GET /clinica retorna 404 quando nao encontra", async () => {
            stub({ buscarClinicaPorId: async () => null });
            const res = await chamar(url, "GET", "/clinica?id=x");
            assert.equal(res.status, 404);
        });

        test("GET /clinica retorna 400 em validacao", async () => {
            stub({
                buscarClinicaPorId: async () => {
                    throw new ErroValidacaoClinica("id obrigatorio");
                },
            });
            const res = await chamar(url, "GET", "/clinica");
            assert.equal(res.status, 400);
        });

        test("GET /integracaoClinica retorna 200", async () => {
            const res = await chamar(url, "GET", "/integracaoClinica?clinicaId=c1");
            assert.equal(res.status, 200);
            assert.deepEqual(res.json.dados, integracao);
        });

        test("GET /integracaoClinica retorna 404 sem chave_segura", async () => {
            stub({ buscarIntegracaoClinica: async () => ({ integracao: { name: "x" }, chave_segura: "" }) });
            const res = await chamar(url, "GET", "/integracaoClinica?clinicaId=c1");
            assert.equal(res.status, 404);
        });

        test("GET /integracaoClinica retorna 400 em validacao", async () => {
            stub({
                buscarIntegracaoClinica: async () => {
                    throw new ErroValidacaoClinica("clinicaId obrigatorio");
                },
            });
            const res = await chamar(url, "GET", "/integracaoClinica");
            assert.equal(res.status, 400);
        });
    });
});
