import "dotenv/config";
import { criarApp } from "./app";

const app = criarApp();
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});

//Alteração
