export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

export class ErroNaoEncontrado extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroNaoEncontrado";
    }
}

export class ErroSaldoInsuficiente extends Error {
    faltas: { material: string; necessario: number; disponivel: number }[];

    constructor(faltas: { material: string; necessario: number; disponivel: number }[]) {
        const detalhe = faltas
            .map((f) => `material ${f.material} precisa ${f.necessario}, disponível ${f.disponivel}`)
            .join("; ");
        super(`Saldo insuficiente: ${detalhe}`);
        this.name = "ErroSaldoInsuficiente";
        this.faltas = faltas;
    }
}

export class ErroOperacaoNaoConcluida extends Error {
    constructor(mensagem = "Não foi possível concluir a operação. O estado foi revertido.") {
        super(mensagem);
        this.name = "ErroOperacaoNaoConcluida";
    }
}

export class ErroCompensacaoPendente extends Error {
    pendencias: { tabela: string; id: string }[];

    constructor(pendencias: { tabela: string; id: string }[], mensagem = "Falha ao concluir a operação e a compensação ficou pendente.") {
        super(mensagem);
        this.name = "ErroCompensacaoPendente";
        this.pendencias = pendencias;
    }
}
