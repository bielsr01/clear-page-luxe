Vou ajustar a qualidade das imagens em dois pontos: upload e exibição.

## Plano

1. **Upload das imagens dos produtos**
   - Redimensionar antes do envio para R2 com qualidade alta, em vez de subir exatamente o arquivo bruto.
   - Usar um tamanho maior que o da logo, adequado para cardápio: cerca de **1200px no maior lado** e WebP com qualidade alta.
   - Isso melhora a nitidez no item pequeno e também quando o cliente abre o produto.

2. **Upload das imagens dos itens de grupos de opções**
   - Aplicar o mesmo tratamento nas fotos dos subitens/opções do cardápio.
   - Manter resolução suficiente para aparecer bem no modal do produto.

3. **Exibição no cardápio público**
   - Melhorar o visual das miniaturas dos produtos na lista, usando dimensões um pouco mais generosas e estáveis.
   - No modal do produto aberto, aumentar a área da imagem e usar proporção mais apropriada para comida/produtos.
   - Melhorar as imagens dos itens de opções/submenus para ficarem mais nítidas e visualmente destacadas.

4. **Ajustes técnicos de imagem**
   - Reaproveitar o utilitário `resizeImage` já criado.
   - Adicionar `decoding="async"` nas imagens relevantes.
   - Usar tamanhos CSS estáveis para evitar imagens pequenas demais sendo percebidas como baixa qualidade.

## Resultado esperado

- Fotos dos produtos mais bonitas na lista do cardápio.
- Foto principal mais nítida quando abre um item.
- Fotos dos itens de grupos/opções com melhor presença visual.
- Uploads futuros já otimizados em qualidade melhor.