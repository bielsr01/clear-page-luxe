UPDATE public.loyalty_settings
SET 
  loyalty_description = 'Acumule pontos em todas as suas compras e troque por benefícios exclusivos. Quanto mais você consome, mais vantagens recebe.',
  loyalty_rules = '• Acumule pontos em cada pedido: Ganhe pontos em todas as suas compras, seja pelo delivery, retirada ou PDV.
• Troque por benefícios: Use seus pontos para resgatar produtos exclusivos ou descontos especiais em seus próximos pedidos.
• Consulta Simples: Acompanhe seu saldo e histórico de pontos em tempo real através deste link oficial.
• Validação por WhatsApp: Para sua segurança, o acesso ao seu extrato é validado através de um código enviado para seu WhatsApp.
• Exclusividade: Os benefícios são exclusivos para cada loja e não podem ser transferidos entre diferentes unidades.'
WHERE loyalty_description IS NULL OR loyalty_description = 'Acumule pontos em todas as suas compras e troque por benefícios exclusivos.';
