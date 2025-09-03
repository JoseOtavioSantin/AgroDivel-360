from http.server import BaseHTTPRequestHandler
import json
import pandas as pd
from io import BytesIO
import cgi

class handler(BaseHTTPRequestHandler ):
    def do_POST(self):
        try:
            # 1. Parse dos arquivos enviados
            ctype, pdict = cgi.parse_header(self.headers.get('content-type'))
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            file_pdi_bytes = fields.get('pdi')[0]
            file_etim_bytes = fields.get('etim')[0]
            
            # O nome da coluna pode ser fixo ou vir do frontend
            coluna_chassi = 'Chassi'

            # 2. Ler os arquivos Excel com Pandas
            df_pdi = pd.read_excel(BytesIO(file_pdi_bytes))
            df_etim = pd.read_excel(BytesIO(file_etim_bytes))

            # Validação: Verificar se a coluna 'Chassi' existe
            if coluna_chassi not in df_pdi.columns:
                raise ValueError(f"A coluna '{coluna_chassi}' não foi encontrada no arquivo PDI.")
            if coluna_chassi not in df_etim.columns:
                raise ValueError(f"A coluna '{coluna_chassi}' não foi encontrada no arquivo ETIM.")

            # 3. Lógica de comparação
            # Garante que os chassis sejam tratados como texto para evitar erros de tipo (ex: 123 vs '123')
            df_pdi[coluna_chassi] = df_pdi[coluna_chassi].astype(str).str.strip()
            df_etim[coluna_chassi] = df_etim[coluna_chassi].astype(str).str.strip()
            
            # Filtra as linhas do PDI cujo chassi NÃO está na lista de chassis do ETIM
            chassis_faltantes_df = df_pdi[~df_pdi[coluna_chassi].isin(df_etim[coluna_chassi])]
            
            # 4. Preparar a resposta como JSON
            # 'records' cria uma lista de dicionários, ideal para o frontend
            resultado_json = chassis_faltantes_df.to_dict(orient='records')

            # 5. Enviar resposta de sucesso
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'data': resultado_json}).encode('utf-8'))

        except Exception as e:
            # Enviar resposta de erro
            self.send_response(400) # Bad Request ou 500 Internal Server Error
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        
        return
