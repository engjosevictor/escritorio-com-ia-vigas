---
name: vigas
description: Dimensiona a armadura de uma viga de concreto armado (flexão, cortante e torção, NBR 6118) a partir de um DXF ou imagem/print do diagrama de momento fletor, identificando os valores nas seções críticas (meio de vão, apoio esquerdo, apoio direito) e devolvendo uma tabela com o resultado de cada uma. Usa o mesmo motor de cálculo validado da calculadora Viga Completa. Use quando o usuário mandar um DXF ou print de diagrama de momento fletor pedindo pra dimensionar viga, "calcula essa viga", "dimensiona essa seção" ou pedir o resultado de flexão/cortante/torção de uma viga.
---

# Vigas

Dimensiona a armadura de uma viga de concreto armado (flexão simples/dupla, flexo
compressão/tração, cortante e torção), usando o mesmo motor de cálculo validado da
calculadora "Viga Completa" da Plataforma (NBR 6118). A entrada principal é um DXF ou uma
imagem/print com o diagrama de momento fletor (e cortante, se houver) da viga.

## Fase 0 — Vãos e seção de cada um

Uma viga pode ter mais de um vão, e cada vão pode ter uma seção diferente (isso é normal
em TQS e Eberick, cada mudança de seção aparece como um trecho/numeração própria no
desenho, mesmo sendo a mesma viga). Nunca assumir vão único por padrão.

- Perguntar quantos vãos a viga tem, se não for óbvio pelo desenho
- Pra cada vão, os dados de seção: bw e h (retangular), ou bw, h, bf e hf (seção T),
  cobrimento ou d', fck, fyk, modelo de cálculo do cortante (I ou II, com θ se for Modelo
  II) e número de ramos do estribo, se for relevante pro detalhamento
- **Se o arquivo for DXF do TQS:** esses dados costumam já estar desenhados na própria
  prancha, geralmente com uma seção (ex. "14/50") perto de cada trecho. **Atenção:** um
  rótulo de viga (ex. "V6") perto de uma seção não é garantia de que aquele trecho
  pertence a essa viga, pode ser um elemento vizinho (apoio, viga que cruza) desenhado
  junto como referência. Nunca assumir qual rótulo é o nome da própria viga sendo
  calculada, confirmar com o usuário qual é o nome dela e quantos vãos ela tem antes de
  associar seção a vão
- **Se for print, imagem, ou DXF do Eberick:** esses programas nem sempre desenham a seção
  e o material junto do diagrama. Conferir se aparece em algum lugar da imagem/arquivo
  mandado e, se não aparecer, perguntar ao usuário
- Mostrar o que foi encontrado automaticamente (e de onde veio, e de qual vão) antes de
  seguir. Nunca assumir qual seção vale pra qual vão sem confirmar

## Fase 1 — Ler o diagrama, vão por vão

- Se vier DXF: abrir o arquivo como texto e procurar as entidades de texto (TEXT/MTEXT)
  perto do diagrama de momento fletor, que normalmente já trazem os valores escritos. O
  TQS, por exemplo, escreve uma série de valores por vão (tipicamente 13 pontos, o vão
  dividido em 12 partes), uma série pra cada diagrama (Mk, Vk, Tk, Nk), repetidas pra cada
  vão/trecho da viga
- Se vier imagem ou print: ler os valores escritos no diagrama, se estiverem legíveis
- **Com mais de um vão no mesmo DXF, usar a posição de cada texto na prancha (grupos 10 e
  20 da entidade, X e Y) pra agrupar os valores automaticamente**, em vez de pedir pro
  usuário decorar número de bloco. A lógica é sempre relativa a esse desenho específico,
  nunca uma coordenada fixa decorada de outro arquivo: o TQS desenha os valores de cada
  vão fisicamente próximos (no eixo horizontal) da seção/trecho daquele vão, então agrupar
  por proximidade em X e casar cada grupo com o rótulo de seção mais próximo dele separa
  os vãos sem precisar que o usuário aponte na mão
- Essa técnica é uma heurística baseada no layout típico do TQS, não uma garantia (desenho
  de outra versão, escala diferente ou texto sobreposto pode confundir o agrupamento).
  **Por isso, mostrar sempre o resultado do agrupamento pro usuário conferir antes de
  calcular** ("achei esses valores pro vão 1, seção 14/50, e esses pro vão 2, seção
  14/35, confere?"), nunca seguir calculando sem essa confirmação
- Se o desenho vier sem coordenada aproveitável (ex. imagem/print, não DXF) ou se o
  agrupamento automático não for possível, aí sim perguntar diretamente ao usuário qual
  valor é de qual vão
- Depois de confirmado o vão, identificar os três pontos de interesse dentro da série
  daquele vão:
  - **Meio de vão:** o pico do diagrama, geralmente momento positivo, tração na face
    inferior (no padrão de 13 pontos do TQS, é por volta do 6º/7º ponto, mas vale o maior
    valor positivo da série, não a posição fixa)
  - **Apoios nas duas extremidades do vão:** os dois extremos da série daquele vão (1º e
    13º ponto no padrão TQS), geralmente momento negativo (tração na face superior) se for
    viga contínua, podendo ser zero ou pequeno numa viga biapoiada isolada. **Usar o nome
    do próprio apoio (ex. P7, P8, P9), não "apoio esquerdo/apoio direito"**, sempre que o
    desenho trouxer esse nome perto da extremidade do vão (pilares costumam vir
    identificados assim no DXF do TQS). Só usar "apoio esquerdo"/"apoio direito" como
    genérico quando não houver nome nenhum pra pegar (ex. print sem identificação). Um
    apoio compartilhado entre dois vãos (ex. P8 entre o vão 1 e o vão 2) tem valor
    diferente de cada lado, então identificar de qual vão é cada leitura mesmo usando o
    mesmo nome de apoio nas duas tabelas
- Se houver diagrama de cortante (Vk), torção (Tk) ou normal (Nk) junto, extrair os
  valores nessas mesmas três posições, do mesmo vão
- **Nunca estimar um valor de momento, cortante, torção ou normal que não esteja escrito
  ou claramente legível no diagrama.** Se a imagem ou o DXF não trouxer o número exato
  numa posição, perguntar ao usuário em vez de medir visualmente a régua do desenho ou
  interpolar pela forma da curva
- Mostrar os três valores lidos de cada vão (e os de cortante/torção/normal, se houver) e
  pedir confirmação antes de calcular. Essa etapa é crítica: errar a leitura do diagrama
  propaga o erro pro dimensionamento inteiro
- Repetir Fase 1 e Fase 2 pra cada vão da viga, com a seção confirmada daquele vão

## Fase 2 — Calcular

Usar o motor de cálculo em `scripts/completa-motor.js` (mesma lógica validada da
calculadora "Viga Completa" da Plataforma, NBR 6118: flexão simples/dupla, flexo
compressão/tração, cortante Modelos I e II, torção). Rodar via Node, uma chamada por
seção:

```js
const motor = require('./scripts/completa-motor.js');
const resultado = motor.calcular({
  fck, fyk, bw, h, dl, bf, hf,     // geometria e material, da Fase 0
  Mk, Nk, Vk, Tk,                  // valores lidos na Fase 1, um conjunto por seção
  modelo, theta, c1, ramos,
});
```

Convenção do motor, já embutida, não precisa adaptar: Mk positivo traciona a face
inferior (típico do meio de vão), Mk negativo traciona a face superior (típico do apoio).

Rodar uma vez pra cada uma das seções confirmadas (meio de vão e os dois apoios, pelo
nome deles), guardando o `resultado.resumo` de cada uma.

Se o motor devolver `erro` nalguma seção (ex. esmagamento da biela), mostrar o erro
exatamente como ele vier, nunca tentar contornar, arredondar ou esconder o problema.

## Fase 3 — Sugestão de barras (otimização de detalhamento)

Depois de calcular o As necessário de cada seção, sugerir a bitola e a quantidade de
barras, não só o número de cm². Antes de montar a sugestão, **perguntar ao usuário qual
prioridade ele quer** (só na primeira vez de cada viga, não precisa perguntar de novo
dentro da mesma conversa):

- **Facilitar a execução:** menos bitola diferente na viga (idealmente uma só, variando
  só a quantidade de barra por seção), mesmo que sobre mais aço. Trocar de bitola a cada
  seção confunde o armador e aumenta a chance de erro na obra
- **Economizar aço:** menor sobra possível em cada seção, mesmo que isso signifique mais
  bitolas diferentes na mesma viga

Se o usuário não responder ou disser "tanto faz", usar "facilitar a execução" como
padrão, avisando que foi esse o critério escolhido.

Critério de otimização quando for **facilitar a execução**:

1. **Minimizar o número de bitolas diferentes usadas na viga inteira**, idealmente uma só
   bitola pra todas as seções, no máximo duas se o vão de maior As exigir uma bitola bem
   maior que o de menor As. Variar a **quantidade** de barras de seção pra seção, não a
   bitola
2. Dentro da bitola escolhida, cobrir o As necessário de cada seção arredondando pra cima
   (nunca ficar abaixo do As calculado nem do As,mín), aceitando a sobra que resultar
   disso. Sobra de aço não é motivo pra trocar de bitola
3. Só usar uma segunda bitola quando a primeira sozinha não resolver de jeito nenhum (ex.
   precisaria de tantas barras que não cabe nem em duas camadas), não pra "economizar"
   aço numa seção específica

Critério de otimização quando for **economizar aço**: pra cada seção, escolher a
combinação de bitola e quantidade (podendo misturar até duas bitolas por seção) que cobre
o As necessário com a menor sobra possível, sem se preocupar em repetir a mesma bitola
nas outras seções da viga.

Bitolas comerciais CA-50 padrão: 6,3 / 8 / 10 / 12,5 / 16 / 20 / 25 mm.

- Mínimo de 2 barras por seção, sempre
- **Checar se cabe numa só camada**, usando a largura livre disponível: bw menos duas vezes
  (cobrimento + diâmetro do estribo), com espaçamento livre mínimo entre barras de 2 cm
  (NBR 18.3.2.2, valor conservador padrão quando o diâmetro do agregado não for
  informado). Se a quantidade necessária não couber numa camada só, redistribuir em duas
  camadas (geralmente metade em cada, mantendo simetria), e avisar que são 2 camadas
- Mostrar sempre: a bitola única escolhida pra viga, a quantidade de cada seção, o As
  fornecido, e a sobra em % frente ao As necessário, além de avisar se entrou em 2 camadas
- Essa sugestão depende de uma suposição (diâmetro do estribo e espaçamento mínimo usados).
  Deixar isso explícito pro usuário, e se ele informar esses dados diferente, refazer a
  sugestão

## Fase 4 — Tabela de resultado

Montar uma tabela (texto ou HTML, conforme o que o usuário pedir) com uma coluna por
seção, usando o nome real de cada apoio (ex. P7, P8) no lugar de "apoio esquerdo/direito"
sempre que ele tiver sido identificado na Fase 1. Com um vão só, três colunas (apoio 1,
meio de vão, apoio 2). Com mais de um vão, uma tabela por vão (ou colunas agrupadas por
vão, se o usuário preferir tudo junto), deixando claro em cada coluna a qual vão e a qual
seção ela se refere:

```
Vão 1 (P7 a P8, seção 14/50)    P7    Meio de vão    P8
Mk (kN.m)
As (cm2)
As' (cm2)
Barras sugeridas (As fornecido)
Asw (cm2/m)
Td (kN.m), se houver
AsCost (cm2/m), se houver
Observações

Vão 2 (P8 a P9, seção 14/35)    P8    Meio de vão    P9
...
```

Sempre incluir os avisos que o motor devolver (`avisos`), não só o número final, na linha
de Observações. Se alguma seção tiver torção ou flexo compressão relevante, incluir Td,
Nk e AsCost/pele na tabela também, não só flexão simples.

## Regras

1. Nunca inventar valor de M, V, T, geometria ou material. Confirmar sempre antes de
   calcular
2. O cálculo roda sempre pelo motor (`scripts/completa-motor.js`), nunca refazer a
   fórmula na mão ou por aproximação
3. Mostrar erro e aviso do motor exatamente como ele devolve, sem suavizar
4. Uma tabela por viga calculada, clara o bastante pra copiar direto pro memorial de
   cálculo
5. Vão com mais de uma seção ou mais de um bloco de valores no mesmo desenho: nunca
   escolher sozinho qual bloco pertence a qual vão. Sempre confirmar com o usuário
6. Barra sugerida nunca pode dar As fornecido menor que o As calculado (nem menor que o
   As,mín). Arredondar sempre pra cima
