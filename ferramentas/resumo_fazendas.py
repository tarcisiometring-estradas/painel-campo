# Gera a planilha "Resumo por fazenda" (m³, km a construir primária/secundária, ha) a partir da base do painel.
# Uso: python3 ferramentas/resumo_fazendas.py <pasta base> <saida.xlsx>  -> imprime a impressão digital dos mapas
import json,glob,sys
from openpyxl import Workbook
from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
from openpyxl.comments import Comment
B=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else "Estradas_Sucuriu_resumo_fazendas.xlsx"
rows={}
for f in glob.glob(B+'/mapas/*.json'):
    d=json.load(open(f)); cod=d['codigo']
    r=rows.setdefault(cod,dict(cod=cod,nome=d['nome'],fin='Implantação' if d.get('fin')=='implantacao' else 'Abastecimento',ha=None,vol=None,ap=0,as_=0,ac=0,mp=0,ms=0,acs=0))
    for t in d.get('trechos',[]):
        tp=t.get('tipo') or ''; m=t.get('m') or 0; ab=(t.get('plan') or {}).get('abertura') or 0
        if tp.startswith('Prim'): r['ap']+=ab; r['mp']+=m
        elif tp.startswith('Secund'): r['as_']+=ab; r['ms']+=m
        elif tp.startswith('Aceiro'): r['ac']+=ab
        elif tp=='Acesso': r['acs']+=m
    if not d.get('acesso'):
        r['ha']=d.get('areaHa'); r['vol']=(d.get('colheita') or {}).get('volTotal')
data=sorted(rows.values(),key=lambda r:(r['fin'],r['nome']))
wb=Workbook(); ws=wb.active; ws.title='Resumo por fazenda'
F='Arial'; hf=Font(name=F,bold=True,color='FFFFFF'); fill=PatternFill('solid',fgColor='1F4E3D')
thin=Side(style='thin',color='BFBFBF'); bd=Border(top=thin,bottom=thin,left=thin,right=thin)
ws['A1']='Estradas Sucuriú — volume, estradas a construir e área por fazenda'; ws['A1'].font=Font(name=F,bold=True,size=13)
ws['A2']='Fonte: banco do Painel de Campo (mapas Geoplant cadastrados), consulta de '+__import__('datetime').datetime.now(__import__('zoneinfo').ZoneInfo('America/Cuiaba')).strftime('%d/%m/%Y %H:%M')+''; ws['A2'].font=Font(name=F,italic=True,size=9,color='595959')
H=['Fazenda','Código','Contrato','Volume marcado (m³)','A construir – primária (km)','A construir – secundária (km)','A construir – aceiro (km)','Área (ha)','Malha total primária (km)','Malha total secundária (km)','Acesso externo (km)']
for i,h in enumerate(H,1):
    c=ws.cell(4,i,h); c.font=hf; c.fill=fill; c.alignment=Alignment(wrap_text=True,horizontal='center',vertical='center'); c.border=bd
ws.row_dimensions[4].height=45
km=lambda v: round(v/1000,2)
for j,r in enumerate(data,5):
    vals=[r['nome'],r['cod'],r['fin'],r['vol'],km(r['ap']),km(r['as_']),km(r['ac']),r['ha'],km(r['mp']),km(r['ms']),km(r['acs'])]
    for i,v in enumerate(vals,1):
        c=ws.cell(j,i,v); c.font=Font(name=F); c.border=bd
        if i==4: c.number_format='#,##0;-#,##0;"-"'
        elif i>=5: c.number_format='#,##0.00;-#,##0.00;"-"'
    if r['vol'] is None: ws.cell(j,4).comment=Comment('Sem mapa de colheita cadastrado (fazenda de implantação).','Claude')
t=5+len(data)
ws.cell(t,1,'TOTAL').font=Font(name=F,bold=True)
for i in range(4,12):
    L=ws.cell(4,i).column_letter
    c=ws.cell(t,i,f'=SUM({L}5:{L}{t-1})'); c.font=Font(name=F,bold=True); c.border=bd
    c.number_format=ws.cell(5,i).number_format; c.fill=PatternFill('solid',fgColor='E2EFDA')
ws.cell(t,1).fill=PatternFill('solid',fgColor='E2EFDA')
n=t+2
notas=['Notas:',
'• Volume marcado = volume total do Mapa de colheita (soma dos talhões) cadastrado no mapa da fazenda. Implantação não tem mapa de colheita.',
'• "A construir" = trechos marcados com a atividade Abertura de estrada no mapa de estradas, separados por tipo (Primária / Secundária / Aceiro).',
'• Malha total = comprimento de todos os trechos daquele tipo no mapa da fazenda (inclui os que só recebem patrolamento/cascalho).',
'• Acesso externo = trechos do mapa de acesso (cascalho/patrol), fora da fazenda.',
'• Área = área da fazenda informada no mapa (ha).']
for k,s in enumerate(notas): ws.cell(n+k,1,s).font=Font(name=F,size=9,bold=(k==0))
for col,w in zip('ABCDEFGHIJK',[24,9,14,14,14,14,13,11,13,13,12]): ws.column_dimensions[col].width=w
ws.freeze_panes='B5'
wb.calculation.fullCalcOnLoad=True
wb.save(OUT)
import hashlib
h=hashlib.sha256()
for f in sorted(glob.glob(B+'/mapas/*.json')): h.update(open(f,'rb').read())
print(h.hexdigest())
