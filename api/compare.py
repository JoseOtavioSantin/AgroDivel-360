from http.server import BaseHTTPRequestHandler
import json
import pandas as pd
from io import BytesIO
import cgi

class handler(BaseHTTPRequestHandler ):
    def do_POST(self):
        # Bloco try/except principal para capturar qualquer erro e retornar um JSON válido
        try:
            # Define os nomes das colunas que vamos usar
            coluna_pdi = 'Número de identificação do produto'
            coluna_etim = 'PIN'

            # 1. Parse dos arquivos enviados
            ctype, pdict = cgi.parse_header(self.headers.get('content-type'))
            if not ctype or ctype.lower() != 'multipart/form-data':
                 raise ValueError("Requisição precisa ser do tipo multipart/form-data.")
            
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            if 'pdi' not in fields or 'etim' not in fields:
                raise ValueError("Arquivos 'pdi' e 'etim' são obrigatórios.")

            file_pdi_bytes = fields.get('pdi')[0]
            file_etim_bytes = fields.get('etim')[0]

            # 2. Ler os arquivos Excel e verificar colunas
            try:
                df_pdi = pd.read_excel(BytesIO(file_pdi_bytes))
            except Exception as e:
                raise ValueError(f"Erro ao ler o arquivo PDI. Verifique se é um Excel válido. Detalhe: {e}")

            try:
                df_etim = pd.read_excel(BytesIO(file_etim_bytes))
            except Exception as e:
                raise ValueError(f"Erro ao ler o arquivo ETIM. Verifique se é um Excel válido. Detalhe: {e}")

            # 3. Validação das colunas (com mensagem de erro útil!)
            if coluna_pdi not in df_pdi.columns:
                # Se a coluna não for encontrada, informa quais colunas foram encontradas
                available_cols = ', '.join(df_pdi.columns)
                raise ValueError(f"A coluna '{coluna_pdi}' não foi encontrada no arquivo PDI. Colunas disponíveis: [{available_cols}]")
            
            if coluna_etim not in df_etim.columns:
                available_cols = ', '.join(df_etim.columns)
                raise ValueError(f"A coluna '{coluna_etim}' não foi encontrada no arquivo ETIM. Colunas disponíveis: [{available_cols}]")

            # 4. Lógica de comparação
            df_pdi[coluna_pdi] = df_pdi[coluna_pdi].astype(str).str.strip()
            df_etim[coluna_etim] = df_etim[coluna_etim].astype(str).str.strip()
            
            chassis_faltantes_df = df_pdi[~df_pdi[coluna_pdi].isin(df_etim[coluna_etim])]
            
            resultado_json = chassis_faltantes_df.to_dict(orient='records')

            # 5. Enviar resposta de sucesso
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'data': resultado_json}).encode('utf-8'))

        except Exception as e:
            # ESTE É O PONTO CRÍTICO: Garantir que qualquer erro seja enviado como JSON
            self.send_response(400) # Usar 400 para erros de input do cliente
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            # A mensagem de erro agora será exibida no frontend!
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        
        return
