# Controle de Viagens — versão 1.4.4 (dados só no telefone)

App de diário de bordo para motoristas: viagens, fretes, despesas, abastecimentos, pneus, troca de óleo, OS, controle diário/mensal de KM e relatórios PDF/CSV. Feito com Expo / React Native.

## O que mudou na 1.1.0
- **Sem servidor e sem conta.** Todos os dados ficam guardados no próprio telefone (`src/local/db.ts`). O app abre direto no Resumo, depois da splash e da trava opcional por biometria/senha.
- **Removidos:** login/cadastro de conta, período de teste, ativação/licença, comprovantes de pagamento, painel do administrador e mensagens do admin.
- **Assistente IA mantido.** Usa a chave do próprio utilizador, configurada na engrenagem da tela do assistente: Google Gemini (tem faixa grátis) ou OpenAI. As perguntas vão direto do telefone para o serviço escolhido.
  - Desde a **1.4.2**, quando o Gemini responde "high demand" / sobrecarregado (erro 500/502/503/504), o app tenta de novo sozinho e passa para outro modelo (`gemini-flash-latest` → `gemini-flash-lite-latest` → `gemini-2.5-flash`; no OpenAI `gpt-5-mini` → `gpt-5-nano`). Se a cota grátis de um modelo acabar (429), também tenta o próximo, porque no Gemini a cota é separada por modelo. Se nada responder, aparece no idioma do app: "O serviço de IA está muito ocupado agora. Tente de novo daqui a alguns minutos." (antes aparecia a mensagem em inglês do Google).
- **Backup e restauração** (Cadastros → Backup e restauração): um arquivo `.json` com todos os dados e fotos, que pode ser guardado no Drive, WhatsApp ou e-mail.
  - Desde a **1.4.4**, o assistente responde em **português do Brasil de verdade** quando o idioma do app é Português (Brasil): as instruções da IA (`systemPrompt` em `frontend/src/api/ai.ts`) foram reescritas em pt-BR e ganharam regras de vocabulário por idioma (`LANG_RULES`): "acesse", "arquivo", "celular", "salvar", "pedágio" — antes saía "aceda", "ficheiro", "telemóvel". Com o idioma em Português (Portugal) continua em pt-PT. A tela do assistente também não mostra mais asteriscos soltos (`*Nota…*`): só o **negrito** é desenhado.
- **Migração automática dos utilizadores atuais.** Na primeira abertura da 1.1.0, o app baixa da conta online todos os dados do utilizador (registros, fotos, logo, idioma/moeda, conversa da IA) e grava no telefone (`src/local/migrate.ts`):
  - se a sessão antiga ainda estiver salva no aparelho, a importação acontece sozinha;
  - se não estiver, o app pede e-mail/senha ou Google **uma única vez**;
  - quem nunca teve conta toca em "Não, começar do zero";
  - a importação pode ser repetida em Cadastros → Backup ("Trazer dados da conta online") e nunca duplica registros.

## Coordenadas GPS
Ao tocar num campo de local, o app grava as coordenadas do GPS e mostra a linha 📍 logo abaixo:
- **Viagem:** Local de carregamento e Local de descarga (nova viagem e editar/fechar viagem)
- **Abastecimento:** Local do abastecimento
- **Controle diário:** Local de início, Local de fim e cada parada (a parada pode ter só as coordenadas, sem nome)

Em cada linha: tocar nas coordenadas abre o Google Maps e 🗑 apaga (com confirmação). Enquanto houver coordenadas, a setinha ↻ fica escondida (não dá para atualizar); ela só aparece quando o local está sem coordenadas — por exemplo, depois de apagar — e aí busca o GPS de novo. O componente é `frontend/src/components/PlaceCoords.tsx`.

**Distância até você** (nova na 1.4.0): embaixo das coordenadas de cada local (carregamento, descarga, início/fim do controle diário, paradas e abastecimento) aparece a linha laranja ➤ **"12,4 km de você"**. É a distância **em linha reta** (não pela estrada) e se atualiza sozinha conforme você anda (a cada ~50 m). O GPS só fica ligado enquanto a tela está aberta. Sem GPS ou sem coordenadas, a linha não aparece. O cálculo está em `frontend/src/utils/distancia.ts`. Nos relatórios do controle diário (tela, PDF e CSV), início, fim e paradas mostram as coordenadas ao lado do local; campos vazios não aparecem.

Nos relatórios PDF por período, o separador **•** entre itens sai maior e em negrito.

## Média de consumo (km/L)
Calculada pelo **KM do Diesel** gravado em cada abastecimento (método do tanque cheio), em `frontend/src/utils/fuel.ts` (`computeConsumption`): km rodados = maior KM − menor KM dos abastecimentos do período/selecionados; litros = diesel de todos, **menos o primeiro** (esse diesel foi gasto antes). Vale para a tela Abastecimentos (mês), o Relatório de Abastecimentos (só os marcados) e o Relatório geral. Se houver menos de dois abastecimentos com KM, usa os km das viagens do período ÷ litros, como antes. Antes (até 1.2.0) a média dependia só dos km das viagens e ficava em 0,00 quando a viagem estava em aberto ou sem KM final.

## Fechar viagem em aberto
Ao fechar uma viagem em aberto, **só a data final é obrigatória**. **KM final** e **Local de descarga** são opcionais, porque a viagem pode ser aberta num lugar e fechada em outro. A viagem fechada pelo botão **Fechar viagem** fica marcada como fechada (campo `closed`) e não volta a aparecer como "em aberto", mesmo sem KM final nem descarga. Editar uma viagem fechada não a reabre.

Na tela **Fechar viagem em aberto** há dois botões:
- **Salvar** — grava as alterações (observações, carregamento, veículo etc.) e a viagem **continua em aberto**.
- **Fechar viagem** — grava e encerra a viagem.

A barra de botões respeita a área das teclas de navegação do Android (não fica por baixo delas).

Código: `handleSave`/`doSave` em `frontend/app/editar-viagem.tsx` e `findOpenTrip` em `frontend/src/api/trips.ts`.

## KM no Resumo
- **KM de [dia]** (cartão com setas): KM rodado só naquele dia, pelo controle diário (KM final − KM inicial). Viagens de vários dias não entram nesse cartão — antes o KM da viagem inteira caía no dia em que ela começou (ex.: 3.025 km num dia). Uma viagem só conta ali se começar e terminar no mesmo dia e não houver controle diário desse dia.
- **KM rodados no mês** e **Distância total registrada** continuam como antes.

Código: cálculo de `todayKm` em `frontend/app/(tabs)/index.tsx`.

## Backup no telefone (Android)
Em Cadastros → Backup e restauração:
- **Salvar backup no telefone**: na primeira vez o app pede para escolher uma pasta do telefone (ex.: Download ou Documentos). Depois, cada backup é gravado nela como `controle-viagens-backup.json`, **apagando o backup anterior** (inclusive os antigos com data no nome), para não acumular arquivos. **Trocar pasta** escolhe outra.
- **Enviar backup**: cria o arquivo e abre o Compartilhar (Drive, WhatsApp, e-mail). O Google Drive **não deixa o app substituir** o arquivo enviado pelo Compartilhar: cada envio vira uma cópia nova no Drive, e as antigas precisam ser apagadas lá. Por isso a tela recomenda salvar no telefone (que substitui) e usar o Drive só como cópia extra.
- **Restaurar backup**: escolhe o arquivo `.json`.

Código: `saveBackupToFolder` em `frontend/src/local/backup.ts` (a pasta fica salva com a chave `backup_folder_uri_v1`).

## Atualização pelo próprio app
Cada build do GitHub publica o APK numa **Release** (`build-<número>`; o número também vai para o app em `extra.buildNumber` e no `versionCode`). Ao abrir o app (no máximo a cada 6 h) ele pergunta ao GitHub qual é o último build; se houver um mais novo aparece **"Nova versão do Controle de Viagens — Atualizar / Agora não"**. **Atualizar** baixa o APK e abre o instalador do Android (na 1ª vez o Android pede para liberar **Instalar apps desconhecidos**). "Agora não" não pergunta de novo pelo mesmo build. Em **Cadastros → Procurar atualização do app** dá para verificar na hora e ver o build instalado. Os dados ficam no telefone e continuam depois da atualização.

A versão mostrada no app (abertura e **Cadastros → Sobre o aplicativo**) é automática: só a **versão** do `app.json` (`expo.version`), ex.: **Versão: 1.2.0** — sem número de build. A versão é subida à mão a cada mudança (1.2.0 → 1.3.0…) e vai também no título da Release, que o app mostra no aviso de atualização. O número do build continua sendo usado só por dentro (tag `build-<número>` e `versionCode`) para saber se há atualização, e muda sozinha a cada atualização.

**Importante:** o repositório precisa ser **público**. O app consulta o GitHub sem login; com o repositório privado ele não enxerga as Releases e sempre responde "você já está na versão mais nova".

O primeiro APK com essa função precisa ser instalado à mão (Releases ou Actions).

Código: `frontend/src/components/UpdateChecker.tsx` (usa `expo-intent-launcher` e a permissão `REQUEST_INSTALL_PACKAGES`).

## Assinatura do APK (chave de release)
Desde a **1.4.1** o APK é assinado com uma **chave de release própria** (a mesma do Empresas e Parks), e não mais com a chave de teste pública do Expo. Com a chave de teste, o Google Play Protect pode bloquear a instalação ("App nocivo bloqueado"), porque o app tem permissão para instalar atualizações.

- A chave fica nos **Secrets** do GitHub (Settings → Secrets and variables → Actions):
  - `ANDROID_KEYSTORE_BASE64`: o arquivo `empresasparks-release.jks` em Base64
  - `ANDROID_KEYSTORE_PASSWORD`: a senha da chave (alias `empresasparks`)
- Sem esses Secrets o build **para com erro** de propósito, para nunca publicar um APK com outra assinatura. O build também confere se o APK saiu assinado com a chave certa.
- ⚠️ Guarde uma cópia do `.jks` e da senha fora do GitHub. Sem a chave, as próximas versões não instalam por cima.
- **Mudança para a 1.4.1:** como a assinatura mudou, ela não instala por cima das versões anteriores (nem pela atualização do app). Faça **Backup**, desinstale o "Viagens TESTE", instale a 1.4.1 e restaure o backup. Só uma vez.
- O app oficial (Emergent/EAS) não muda: ele tem a assinatura própria dele.

## APK
O GitHub Actions (`.github/workflows/build.yml`) gera a cada envio para `main` o APK. Baixe em **Releases** (o mais novo é o "Latest") ou em **Actions → artefato `controle-viagens-apk`**. O arquivo se chama `ControleViagens-<versão>.apk` (ex.: `ControleViagens-1.4.4.apk`).

Desde a **1.4.3** o nome no celular é **"Controle de Viagens"** (antes "Viagens TESTE"), e o artefato/arquivo não têm mais "teste" no nome (antes `controle-viagens-teste-apk` com `app-release.apk`). O **pacote** continua `com.emergent.appbuilderdemo.chwn0a.teste` de propósito: é o que já está instalado, e trocar o pacote impediria a atualização por cima (seria outro app). Por isso ele ainda instala ao lado do app antigo da Emergent; se os dois estiverem no celular, os dois aparecem com nome parecido.

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
