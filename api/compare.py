from http.server import BaseHTTPRequestHandler
import json
import pandas as pd
from io import BytesIO
import cgi

class handler(BaseHTTPRequestHandler ):
    def do_POST(self):
        try:
            # Define os nomes das colunas que vamos usar
            coluna_pdi = 'Número de identificação do produto'
            coluna_etim = 'PIN'

            # 1. Parse dos arquivos enviados
            ctype, pdict = cgi.parse_header(self.headers.get('content-type'))
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            file_pdi_bytes = fields.get('pdi')[0]
            file_etim_bytes = fields.get('etim')[0]

            # 2. Ler os arquivos Excel com Pandas
            df_pdi = pd.read_excel(BytesIO(file_pdi_bytes))
            df_etim = pd.read_excel(BytesIO(file_etim_bytes))

            # 3. Validação: Verificar se as colunas corretas existem em cada arquivo
            if coluna_pdi not in df_pdi.columns:
                raise ValueError(f"A coluna '{coluna_pdi}' não foi encontrada no arquivo PDI.")
            if coluna_etim not in df_etim.columns:
                raise ValueError(f"A coluna '{coluna_etim}' não foi encontrada no arquivo ETIM.")

            # 4. Lógica de comparação com as colunas corretas
            # Garante que os identificadores sejam tratados como texto para evitar erros
            df_pdi[coluna_pdi] = df_pdi[coluna_pdi].astype(str).str.strip()
            df_etim[coluna_etim] = df_etim[coluna_etim].astype(str).str.strip()
            
            # Filtra as linhas do PDI cujo 'Número de identificação do produto' NÃO está na lista de 'PIN' do ETIM
            chassis_faltantes_df = df_pdi[~df_pdi[coluna_pdi].isin(df_etim[coluna_etim])]
            
            # 5. Preparar a resposta como JSON
            resultado_json = chassis_faltantes_df.to_dict(orient='records')

            # 6. Enviar resposta de sucesso
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'data': resultado_json}).encode('utf-8'))

        except Exception as e:
            # Enviar resposta de erro detalhada
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        
        return
