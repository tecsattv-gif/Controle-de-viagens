# Controle de Viagens — versão 1.1.0 (dados só no telefone)

App de diário de bordo para motoristas: viagens, fretes, despesas, abastecimentos, pneus, troca de óleo, OS, controle diário/mensal de KM e relatórios PDF/CSV. Feito com Expo / React Native.

## O que mudou na 1.1.0
- **Sem servidor e sem conta.** Todos os dados ficam guardados no próprio telefone (`src/local/db.ts`). O app abre direto no Resumo, depois da splash e da trava opcional por biometria/senha.
- **Removidos:** login/cadastro de conta, período de teste, ativação/licença, comprovantes de pagamento, painel do administrador e mensagens do admin.
- **Assistente IA mantido.** Usa a chave do próprio utilizador, configurada na engrenagem da tela do assistente: Google Gemini (tem faixa grátis) ou OpenAI. As perguntas vão direto do telefone para o serviço escolhido.
- **Backup e restauração** (Cadastros → Backup e restauração): um arquivo `.json` com todos os dados e fotos, que pode ser guardado no Drive, WhatsApp ou e-mail.
- **Migração automática dos utilizadores atuais.** Na primeira abertura da 1.1.0, o app baixa da conta online todos os dados do utilizador (registros, fotos, logo, idioma/moeda, conversa da IA) e grava no telefone (`src/local/migrate.ts`):
  - se a sessão antiga ainda estiver salva no aparelho, a importação acontece sozinha;
  - se não estiver, o app pede e-mail/senha ou Google **uma única vez**;
  - quem nunca teve conta toca em "Não, começar do zero";
  - a importação pode ser repetida em Cadastros → Backup ("Trazer dados da conta online") e nunca duplica registros.

## ⚠️ Antes de publicar
1. **Mantenha o servidor antigo (pasta `backend/`) ligado** durante a transição (sugestão: 2 a 3 meses), até todos atualizarem. Depois pode desligá-lo: o app não usa mais o servidor.
2. **Endereço do servidor:** o app usa `EXPO_PUBLIC_BACKEND_URL` (o mesmo de antes). Se o build não definir essa variável, usa `LEGACY_BACKEND_URL` em `frontend/src/local/migrate.ts`. Confira se é o endereço que os utilizadores usam hoje: `<endereço>/api/` deve responder `{"message":"Controle de Viagens API"}`.
3. **Publique como atualização do mesmo app:** mesmo pacote (`com.emergent.appbuilderdemo.chwn0a`), mesma chave de assinatura e mesmo projeto EAS. Assim a sessão salva no telefone é reaproveitada e a migração é automática. Se for instalado como app novo, o utilizador só vai precisar entrar uma vez com e-mail/senha.

## Estrutura nova
| Arquivo | Função |
|---|---|
| `frontend/src/local/db.ts` | Banco local (um arquivo JSON por coleção, com escrita segura) |
| `frontend/src/local/server.ts` | As regras do antigo backend (validações, limite de 2 motoristas, numeração da OS, pneus...) com as mesmas rotas |
| `frontend/src/local/migrate.ts` | Importação única da conta online |
| `frontend/src/local/backup.ts` | Exportar/restaurar backup |
| `frontend/src/components/MigrationGate.tsx` | Tela da migração na primeira abertura |
| `frontend/app/backup.tsx` | Tela de Backup e restauração |
| `frontend/src/api/ai.ts` | Assistente IA direto do telefone (Gemini/OpenAI) |
| `frontend/src/context/AuthContext.tsx` | Agora só guarda idioma, moeda e empresa no telefone |

Os módulos em `frontend/src/api/*` continuam com as mesmas funções e hooks. Só trocaram o `fetch` ao servidor por `localRequest` (banco local), por isso as telas não mudaram.

## Rodar
```bash
cd frontend
npm install
npx expo start
```
