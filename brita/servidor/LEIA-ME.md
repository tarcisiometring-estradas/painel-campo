# Servidor da Entrega de Brita (Google) – como ligar

Leva uns 10 minutos, uma vez só. Faça no computador, logado no seu Gmail.

1. Abra https://sheets.new — cria uma planilha nova. Dê o nome **Entregas de Brita**.
2. Na planilha: menu **Extensões › Apps Script**.
3. Apague o que estiver no editor e cole todo o conteúdo do arquivo `Codigo.gs`.
4. Na linha `var CHAVE_GESTAO = "troque-esta-senha";` troque pela senha da gestão (a que você e os técnicos vão digitar no app). Salve (💾).
5. No topo, escolha a função **instalar** e clique **▶ Executar**. O Google vai pedir autorização: **Revisar permissões › sua conta › Avançado › Acessar (não seguro) › Permitir**. (Aparece "não seguro" porque o script é seu e não passou pela loja do Google.)
6. Clique **Implantar › Nova implantação**. Em "Tipo", escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique **Implantar** e copie o link que termina em **/exec**.
7. Mande esse link para o Claude, que liga os apps nele.

## Onde fica cada coisa
- Planilha, aba **Depositos**: D1, D2… com projeto, referência, coordenada, previsto e extensões.
- Planilha, aba **Entregas**: uma linha por carga (motorista, placa, NF, toneladas, coordenada, alerta, conferência).
- Drive, pasta **Entregas de brita – fotos**: fotos da nota e da carga, separadas por mês.

## Se mudar o código depois
**Implantar › Gerenciar implantações › ✏️ › Versão: Nova versão › Implantar**. O link /exec continua o mesmo.
