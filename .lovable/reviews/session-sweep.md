# Revisão de permanência na conta

Regra: uma falha temporária de conexão não deve tirar o usuário da conta. Saída voluntária, sessão realmente encerrada e permissões continuam válidas.

## Telas e fluxos revisados por leitura
- Entrada e roteamento: Auth, Index, RequireRole, App e router-compat. Aguardam sessão e acesso confirmados antes de encaminhar; as entradas protegidas são /admin, /links, /curriculos, /dashboard e /ticket/:orderId. Landing não está montada e não encerra sessão.
- AuthContext: corrigidos resposta inicial atrasada, erro consultando papéis, respostas de usuário anterior, reinicialização da assinatura e erro na solicitação de saída. Eventos reais de saída continuam removendo a sessão.
- MasterAdmin e ManagerDashboard: botões Sair são explícitos; usam o controle comum. As abas internas herdam a mesma proteção.
- usePermissions: corrigidos erros nas consultas de proprietário e grupo que antes eram tratados como respostas sem acesso. Nenhum valor de permissão foi alterado.
- Consumidores de identidade: AdminImplantacaoChecklistPanel, AdminOwnExpensesPanel, AuditPanel, AccessManagementPanel, CrmTasksPanel, ExpensesPanel, PdvDialog, SoundPicker, StoreOpenToggle, SupplyOrderPanel, SupportPanel, CashMovementDialog, OpenSessionDialog, PayMotoboyDialog, TicketThread e useNewOrderNotifications. Não encerram a sessão por erro de consulta.
- Arquivos e currículos: r2Upload e bio apenas retornam erro da operação. Integrações: IntegrationsPanel, IntegrationStatusCard, IhubIntegrationCard, QueroIntegrationCard, EvolutionIntegrationCard, AdminBioLinksPanel e IfoodWidgetMount não removem a sessão do sistema por falha de operação.

## Serviços revisados por leitura
- Administração: admin-create-restaurant, admin-create-sub-user, admin-delete-restaurant, admin-update-restaurant e admin-update-sub-user. Criação desfaz apenas contas novas em caso de falha; alterações e exclusões de contas são explícitas. Corrigidos os dois caminhos de exclusão que confundiam consulta falha com ausência de outros vínculos, inclusive consulta de propriedade anterior à alteração de subusuário.
- Integrações: ihub-link, ihub-webhook, ifood-action, quero-action, quero-poll, evolution-instance, evolution-send, evolution-webhook e evolution-dispatch. Não encerram sessão Supabase por falha de requisição; logout do Evolution refere-se ao WhatsApp.
- Arquivos: r2-upload, r2-delete, r2-download, r2-signed-download, r2-migrate, r2-purge-supabase e _shared/r2. Retornam falhas sem encerrar a conta do navegador.
- Demais: job-application-submit, job-application-download, job-application-delete, audit-external, loyalty-otp, geocode, maps-key, auto-store-hours e bulk-campaign-worker. Nenhuma saída automática do usuário encontrada.

## Banco e tarefas
- Funções de papéis/vínculos e criação de perfil consultam ou criam dados de acesso, sem apagar sessões de autenticação.
- Migrações de Evolution, horários e Quero não mutam auth.sessions ou auth.refresh_tokens.
- Catálogo ativo consultado: evolution-dispatch-30s-a, evolution-dispatch-30s-b, auto-store-hours-every-minute e quero-poll-5s. Nenhum comando toca sessões de autenticação. Não foi encontrada rotina pública que toque essas sessões.
- Registros de pedidos, caixa, contas já removidas e demais dados existentes não foram alterados.

## Verificação
- 20 testes aprovados: sessão, entradas protegidas, consultas de acesso e guarda compartilhada de exclusão.
- Navegador em 430×786: /, /admin, /links, /curriculos, /dashboard e /ticket/test exigem login quando não há conta aberta; sem erros de execução.
- Prévia compilou sem erros.
- Não foi possível testar dentro da conta real do cliente nem confirmar configurações hospedadas de duração de sessão. Os testes de conta aberta são automatizados com respostas controladas, não uma sessão real em produção. Serviços foram revisados por leitura, não por operações destrutivas em produção.