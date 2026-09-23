# Matriz de fluxos e subfluxos

Legenda: M mapeado, D diagnosticado, R redesenhado, P planejado, I implementado, V validado. `—` significa pendente, não ausência. Evidência por módulo em `portal/apps/api/src/modules/` e páginas em `portal/apps/web/src/app/`.

| ID | Perfil / objetivo e entrada → saída | Dados, regra, exceção e continuidade | Cobertura |
|---|---|---|---|
| PUB-01 | visitante: home → conteúdo | homepage/sections, posts, market; vazio e API indisponível → descoberta | M D R P I; V — |
| PUB-02 | visitante: menu/busca → resultados | search, sugestões, termo curto, sem resultado, paginação | M D R P I parcial (entrada e erro); V — |
| PUB-03 | visitante: artigo → leitura/relacionados | posts, view idempotente por janela, mídia, SEO, erro 404 | M D P; R I V parcial (renderização publicada 390/1280) |
| PUB-04 | visitante: categoria/tag/autor → listagem | slugs, posts, paginação, 404 e vazio | M D P; R I V parcial (uma rota de cada 390/1280) |
| PUB-05 | visitante: vídeos → plataforma/post | videos, thumbnail, link externo, paginação | M D P; R I V parcial (grade publicada 390/1280) |
| PUB-06 | visitante: newsletter → confirmação | e-mail, consentimento, duplicidade, unsubscribe, export restrito | M D R P I parcial (aceite explícito); V — |
| PUB-07 | visitante: anúncio → destino | ads, posições home/artigo/lateral/rodapé, período/alvo, impressão/clique, ausência de campanha | M D R P I; V — |
| PUB-08 | visitante: Sobre/Contato → informação institucional | settings públicos, e-mail opcional, ausência de canal | M D R P I; V parcial (renderização publicada 390/1280) |
| ADM-01 | equipe: login/refresh/logout/troca/recuperação → sessão | auth, cookies, senha temporária, expiração, papel | M D P; R I V — |
| ADM-02 | equipe: painel → prioridade | contagens posts/newsletter, falha parcial, atalho | M D R P I parcial (falha ≠ zero); V — |
| ADM-03a | autor: criar/editar/autosave → rascunho | posts, mídia, categorias, validação, concorrência, retomada | M D P; R I V — |
| ADM-03b | editor: revisar/agendar/publicar/arquivar → estado | status, permissões, auditoria, falha e duplicidade | M D P; R I V — |
| ADM-03c | editor: revisão/duplicação/exclusão → versão | revisions, soft delete, confirmação, recuperação | M D P; R I V — |
| ADM-04 | autor: upload/recorte/alt/exclusão → mídia | media/storage/processor, limites, erro parcial | M D P; R I V — |
| ADM-05 | autor: vídeo → publicação/ordem | videos, plataforma/url/thumbnail, duplicidade | M D R P I parcial (rascunho/agendamento/erro); V — |
| ADM-06 | editor: montar home → seção visível | homepage, nove tipos, posição, seleção, exclusão | M D R P I parcial; V — |
| ADM-07 | editor: categoria/tag/autor → taxonomia | slugs, relacionamentos, duplicidade, ordem | M D P; R I V — |
| ADM-08 | admin: anúncio → veiculação/métrica | ads, alvo, data, prioridade, medição | M D R P I parcial (validação/erro); V — |
| ADM-09 | editor/admin: newsletter → inscritos/exportação | consentimento, privacidade, acesso por papel | M D P; R I V — |
| ADM-10 | admin: usuário/permissão → acesso | users, reset, papéis, auditoria, bloqueio | M D P; R I V — |
| ADM-11 | admin: configuração/mercado → portal | settings/social/market sync, falha de fonte | M D P; R I V — |
| ADM-12 | admin: auditoria → rastrear ação | audit log, filtro, paginação | M D P; R I V — |
| STU-01 | criador: entrar/projetos → projeto | auth, workspace, lista/retomada | M D; R P I V fora do escopo visual |
| STU-02 | criador: roteiro → gravação | blocos, tempo, sugestões, versão | M D; R P I V fora do escopo visual |
| STU-03 | criador: gravar/upload → mídia | permissão câmera, arquivo, fila, retry | M D; R P I V fora do escopo visual |
| STU-04 | criador: editor/IA/legenda → EditPlan | contratos, timestamps, original, preview | M D; R P I V fora do escopo visual |
| STU-05 | criador: render/exportação → arquivo | workers, fila, falha, retry, preservação semântica | M D; R P I V fora do escopo visual |
| STU-06 | gestor: marca/cota/ajuda → configuração | workspace, credenciais, uso IA, suporte | M D; R P I V fora do escopo visual |

Em todos os fluxos: compreender objetivo/estado; concluir com validação antecipada; confirmar resultado, erro recuperável e próximo passo. Detalhe de sequência e oportunidades em 05–06.
