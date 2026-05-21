Matchmaking design — estilo Pokémon United

Objetivo
- Emparelhar jogadores por skill/elo quando possível, com filas que alargam a tolerância ao tempo.
- Suportar partidas 1v1 (2) e 1v1v1 (3) conforme `maxPlayers`.
- Auto-fill com bots após Xs de espera.
- Suportar grupos/parties: aceitar convite antes de criar a sala.

Componentes principais
1) Rating/Skill
- Cada jogador tem `rating` numérico (inicial: 1200).
- Ao terminar partidas competitivas, atualiza-se ELO simples (K = 32 / adaptável).
- Para casual, ignore rating por default (só usaremos espera/auto-fill).

2) Filas
- Filas separadas por mode+maxPlayers: `competitive:2`, `competitive:3`, `casual:2`, `casual:3`.
- Cada entrada: { userId, displayName, rating, queuedAt, partyId? }
- Tolerância inicial de rating = 50.
- A cada 5s de espera, aumentar tolerância (p.ex. +25) até um máximo (p.ex. 500).
- Também permitir emparelhar por diferença de rating <= tolerance

3) Agrupamento e parties
- Se o jogador estiver em `party` (grupo), emparelhar todos juntos (se houver espaço), com prioridade baixa (espera maior).
- Oferecer mecanismo de `invite`/`accept` no cliente: anfitrião convida, convidado aceita para entrar na fila como party.

4) Auto-fill com bots
- Após N segundos (p.ex. 12s) sem encontrar adversário adequado, completar com bots.
- Bots têm rating médio da fila ou do host; bots devem usar `BOT_...` ids e serem adicionados à sala normalmente.

5) Match formation
- Periodicamente (cada 1s) tentar formar matches:
  - Para competitive:
    - Ordenar por rating
    - Tentar encontrar conjunto de players (2 ou 3) cuja diferença máxima de rating entre participantes <= min(tolerance_i)
    - Priorizar jogadores com maior tempo na fila
  - Para casual: preferir preencher por ordem de chegada, menos restritivo

6) Notificações e confirmações
- Quando um match é formado, enviar `matchmaking:found` com `roomPreview` e `expiresAt` (p.ex. 12s para aceitar).
- Cliente responde `matchmaking:accept` ou `matchmaking:decline`.
- Se todos aceitarem, criar sala/socket room; se um rejeitar ou expirar, voltar a colocar no topo da fila com penalidade pequena.
- Para simplicidade inicial, podemos pular a confirmação e criar a sala imediatamente (opção configurável).

7) APIs/socket events (proposta)
- Client -> Server:
  - `matchmaking:join` { userId, displayName, mode, maxPlayers, rating?, partyId? }
  - `matchmaking:leave` { userId, mode, maxPlayers }
  - `matchmaking:accept` / `matchmaking:decline` { matchId }
  - `matchmaking:status` (get)
- Server -> Client:
  - `matchmaking:joined` { queuePosition }
  - `matchmaking:update` { queueLength }
  - `matchmaking:found` { matchId, players, preview, expiresAt }
  - `matchmaking:matched` { roomId }

8) Persistência e métricas
- Manter filas em memória no `socket-server.js` inicialmente.
- Expor endpoints de debug: `GET /matchmaking/status` para ver tamanho das filas.

Implementação incremental sugerida
1) Implementar filas em memória e `matchmaking:join/leave`.
2) Formar matches simples imediatos (sem accept), criar room e notificar `multiplayer:room:create` flows.
3) Adicionar tolerância dinâmica (tempo -> widening window).
4) Adicionar accepts/declines e party handling.
5) Integrar bots e balanceamento.

Pontos a confirmar contigo
- Confirma que queres ELO/skill para competitivo (sugestão: sim por defeito).
- Aceitação automática vs confirmação manual (preferes confirmar antes de criar sala?).

Próximo passo
- Implemento as filas no `server/socket-server.js` e os eventos `matchmaking:join/leave`.

