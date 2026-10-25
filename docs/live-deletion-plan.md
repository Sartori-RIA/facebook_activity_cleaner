# Plano: apagar de verdade depois do HTML

O HTML escolhe o que apagar. O clique no Facebook é outra etapa, e ela continua desligada até alguém anotar os controles da tela logada. Este arquivo descreve essa etapa. Não liga a automação.

## O que já está pronto

1. O HTML oficial é importado. Publicações, comentários e reações ficam neste computador.
2. O filtro de família roda em cada item: pessoa protegida, palavra protegida, compartilhamento de alguém protegido, item marcado à mão. Data desconhecida, dono incerto ou tipo incerto fica de fora.
3. O ano entra inteiro, no fuso `America/Sao_Paulo`. Um período vazio não é alargado.
4. A simulação lista posts e comentários que entrariam. Reações ainda ficam de fora dessa conta. Fotos e reels continuam em revisão.

Nada disso abre o Facebook. `LIVE_FACEBOOK_AUTOMATION_ENABLED` e `FACEBOOK_SELECTORS_VALIDATED` permanecem `false`. Não inventar seletores.

## Um item exportado abre o próprio link

A busca no registro de atividades não faz parte da exclusão. Cada linha importada já traz o endereço que estava no HTML. O leitor prefere um link público de `facebook.com`. Se a seção só tiver o redirecionamento `facebook.com/dyi/l/` do rodapé do arquivo, esse é o endereço guardado. Item sem endereço https do Facebook fica em revisão e o navegador não abre para ele.

O programa abre um Chromium neste computador, com perfil persistente em `~/.fb-cleaner/browser-profile`. Na primeira vez, a pessoa entra na própria conta nessa janela e digita a senha e o código, se o Facebook pedir. O programa não vê nem guarda senha, cookie ou token. Nas levas seguintes a mesma janela reaproveita essa sessão.

Para cada item que passou no filtro de família, no ano e no tipo, o Playwright faz isto, um por vez:

1. Ler de novo a linha no banco. Conferir proteção, tipo, data e se o item é da pessoa. Se a proteção mudou, pular.
2. Abrir exatamente o `sourceUrl` dessa linha. Não procurar outro post, não rolar o registro de atividades, não trocar o endereço por um parecido.
3. Esperar a página daquele endereço. Comparar o texto visível com o texto guardado na importação. Se o texto não for o do item, marcar `requires_review` e passar ao próximo. Se a página pedir login de novo, verificação ou disser que a conta está limitada, parar a leva.
4. Na página aberta, clicar no menu de excluir e na confirmação anotados para aquele tipo.
5. Esperar o aviso visível de que aquele item sumiu. Gravar a observação com esse texto. Só então marcar `deleted`.
6. Se o clique acontecer e o aviso não aparecer, marcar `requires_review` e não tentar esse item de novo.
7. Fechar ou sair dessa página e passar ao próximo `sourceUrl`.

Há uma pausa entre um endereço e o outro. Há um teto por leva. A primeira leva real abre um único post.

## O que falta anotar na tela logada

Sem estes nomes, o Playwright não tem o que clicar.

| Item | O que anotar, em português, como aparece na tela |
| --- | --- |
| Post | menu de excluir, botão de confirmar, aviso de que foi removido |
| Comentário | os mesmos três, se forem diferentes |
| Reação | os mesmos três, se forem diferentes |
| Bloqueio | o texto de verificação, captcha ou limite da conta |

Um de cada tipo basta: um post, um comentário e uma reação da própria conta. Os nomes observados entram em `src/facebook/selectors`. Seletores chutados não entram.

## Ordem

1. Anotar os três controles de um post.
2. Ligar só o apagador de posts, ainda pedindo a frase exata de confirmação e com limite 1.
3. Se esse post sumir e a tela mostrar o aviso, o mesmo caminho vale para um ano inteiro de posts.
4. Comentários entram depois, com o `comments.html` importado.
5. Reações entram por último, com os HTML de curtidas e reações importados. O arquivo de publicações não traz todas as reações.
6. Fotos e reels permanecem em revisão.

A página local continua só mostrando o conjunto filtrado. A leva que clica no Facebook começa com a frase de confirmação e o navegador visível, para poder ser interrompida.

## Fora deste plano

- Chamar `graph.facebook.com`, GraphQL privado ou outro endpoint não oficial.
- Apagar foto ou reel por classificação automática.
- Desligar a proteção.
- Marcar `deleted` sem uma observação de resultado `deleted` e detalhe preenchido.
- Repetir uma exclusão de resultado incerto.
- Guardar senha, cookie, `c_user`, `xs` ou token.
- Testar a exclusão real contra a conta usada no dia a dia. O primeiro post real sai com limite 1, em conta descartável quando houver uma.
